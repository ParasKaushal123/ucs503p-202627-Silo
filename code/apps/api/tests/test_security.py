"""Security track: rule findings, capability labels, build comparison and its API."""

import io
import zipfile

import pytest
from jose import jwt

from silo_api.config import settings
from silo_api.models import Membership, User
from silo_api.routes import versions
from silo_api.services import security

CLEAN_PY = {
    "app.py": "from flask import Flask\napp = Flask(__name__)\n\n@app.get('/')\ndef home():\n"
    "    return 'hi'\n",
    "requirements.txt": "flask==3.0.0\n",
}
RISKY_PY = {
    "app.py": (
        "import subprocess, requests, os, sqlite3\nfrom flask import Flask, request\n"
        "app = Flask(__name__)\nAPI_KEY = 'super-secret-value-123'\n\n@app.get('/run')\n"
        "def run():\n    subprocess.run(request.args['cmd'], shell=True)\n"
        "    requests.get('https://api.example.com/data', verify=False)\n"
        "    db = sqlite3.connect('app.db')\n"
        "    db.execute(f\"SELECT * FROM users WHERE id = {request.args['id']}\")\n"
        "    return os.environ.get('HOME')\n\napp.run(debug=True)\n"
    ),
    "requirements.txt": "flask==3.0.1\nrequests\n",
}


def rule_ids(files):
    return {f["rule_id"] for f in security.analyze(files)["findings"]}


def test_python_rules_flag_real_risks():
    found = rule_ids(RISKY_PY)
    assert {
        "silo.python.subprocess-shell",
        "silo.python.tls-verify-off",
        "silo.python.sql-injection",
        "silo.python.debug-mode",
        "silo.python.hardcoded-secret",
    } <= found
    assert not rule_ids(CLEAN_PY)


HIDDEN_COMMANDS_PY = {
    "app.py": (
        "import importlib\nimport subprocess as sp\nfrom os import popen\n"  # 1-3
        "from flask import Flask, request\napp = Flask(__name__)\n\n"  # 4-6
        "@app.get('/admin/run')\ndef admin_run():\n"  # 7-8
        "    cmd = request.args['cmd']\n"  # 9
        "    mod = importlib.import_module('sub' + 'process')\n"  # 10
        "    getattr(mod, 'run')(cmd, shell=True)\n"  # 11
        "    __import__('os').system(cmd)\n"  # 12
        "    sp.Popen(cmd, shell=True)\n"  # 13
        "    popen(cmd)\n"  # 14
        "    importlib.import_module(request.args['m'])\n"  # 15
        "    importlib.import_module('json')\n"  # 16
        "    return {'ok': True}\n"
    ),
}


def test_commands_hidden_behind_aliases_and_dynamic_imports_are_found():
    """TC-04: the same shell call reached through four disguises is still a shell call."""
    result = security.analyze(HIDDEN_COMMANDS_PY)
    by_line = {}
    for f in result["findings"]:
        by_line.setdefault(f["line"], []).append(f)
    for line in (11, 12, 13, 14):
        assert any(f["cwe"] == "CWE-78" and f["severity"] == "high" for f in by_line[line]), line
    assert by_line[10][0]["rule_id"] == "silo.python.dynamic-import"
    assert "(subprocess)" in by_line[10][0]["title"]
    assert by_line[15][0]["rule_id"] == "silo.python.dynamic-import"
    assert 16 not in by_line  # importing a module by its literal name is ordinary
    process = next(c for c in result["capabilities"] if c["kind"] == "process")
    assert process["uncertain"] is False  # the known calls make it certain
    assert {"line": 11, "file": "app.py"} in process["evidence"]


def test_ordinary_names_are_not_rewritten_by_imports():
    """`from flask import request` must not turn request.args.get into an outside call."""
    found = security.analyze(
        CLEAN_PY
        | {
            "extra.py": "from flask import request\nfrom os import path\n\n"
            "def f():\n    return request.args.get('q'), path.join('a', 'b')\n",
        }
    )
    assert found["findings"] == []
    assert {c["kind"] for c in found["capabilities"]} == {"serve"}


def test_secret_value_is_never_shown():
    secret = next(
        f
        for f in security.analyze(RISKY_PY)["findings"]
        if f["rule_id"] == "silo.python.hardcoded-secret"
    )
    assert "super-secret-value-123" not in secret["snippet"]
    key = "AIza" + "B" * 35
    leaked = security.analyze({"config.js": f"const key = '{key}';"})["findings"]
    assert leaked and key not in leaked[0]["snippet"]


def test_web_rules_and_browser_capabilities():
    files = {
        "index.html": "<script src='https://cdn.example.net/lib.js'></script>"
        "<script>out.innerHTML = location.hash; eval(code);"
        "localStorage.setItem('token', t); fetch('https://api.example.org/x')</script>",
    }
    analysis = security.analyze(files)
    found = {f["rule_id"] for f in analysis["findings"]}
    assert {
        "silo.js.eval",
        "silo.js.html-injection",
        "silo.js.token-in-storage",
        "silo.html.script-without-integrity",
    } <= found
    keys = {c["key"] for c in analysis["capabilities"]}
    assert {"remote-script:cdn.example.net", "network:api.example.org", "storage"} <= keys
    assert any(d["name"] == "cdn.example.net" for d in analysis["dependencies"])


def test_requests_to_the_apps_own_server_are_not_outside_access():
    def keys(js):
        return {c["key"] for c in security.analyze({"app.js": js})["capabilities"]}

    assert keys('fetch("/api/items")') == set()
    assert keys("axios.get('./data.json')") == set()
    assert keys("fetch(url)") == {"network:dynamic destination"}
    assert keys('fetch("https://api.example.org/x")') == {"network:api.example.org"}


def test_label_lists_capabilities_hosts_and_dependencies():
    analysis = security.analyze(RISKY_PY)
    keys = {c["key"] for c in analysis["capabilities"]}
    assert {"serve:Flask", "network:api.example.com", "process", "env", "database:SQLite"} <= keys
    deps = {d["name"]: d for d in analysis["dependencies"]}
    assert (
        deps["flask"]["version"] == "==3.0.1" and deps["requests"]["source"] == "requirements.txt"
    )
    packages = security.analyze({"package.json": '{"dependencies": {"left-pad": "^1.3.0"}}'})
    assert packages["dependencies"][0] == {
        "name": "left-pad",
        "version": "^1.3.0",
        "ecosystem": "npm",
        "source": "package.json",
    }


def test_compare_classifies_expanding_reducing_and_neutral():
    clean, risky = security.analyze(CLEAN_PY), security.analyze(RISKY_PY)
    worse = security.compare(CLEAN_PY, RISKY_PY, clean, risky)
    assert worse["classification"] == "expanding"
    assert worse["risk_after"] > worse["risk_before"]
    assert {"flask"} == {d["name"] for d in worse["dependencies_changed"]}
    assert "can now" in worse["verdict"] and "Review before publishing" in worse["verdict"]
    assert worse["files"][0]["path"] == "app.py" and worse["files"][0]["added"] > 0
    better = security.compare(RISKY_PY, CLEAN_PY, risky, clean)
    assert better["classification"] == "reducing" and better["findings_fixed"]
    renamed = {**CLEAN_PY, "README.md": "# Notes\n"}
    same = security.compare(CLEAN_PY, renamed, clean, security.analyze(renamed))
    assert same["classification"] == "neutral" and len(same["files"]) == 1


def test_silo_generated_files_are_not_the_authors_code(tmp_path):
    (tmp_path / "app.py").write_text("print('hi')\n")
    (tmp_path / "Dockerfile").write_text("FROM python\nENV PIP_DISABLE_PIP_VERSION_CHECK=1\n")
    (tmp_path / ".dockerignore").write_text("*.pyc\n")
    (tmp_path / ".env").write_text("SECRET=1\n")
    assert security.files_from_directory(tmp_path) == {"app.py": "print('hi')\n"}


def test_semgrep_results_use_source_lines_not_cli_placeholders():
    result = {
        "check_id": "data.semgrep.python-eval-exec",
        "start": {"line": 2},
        "extra": {
            "severity": "ERROR",
            "message": "eval runs text as code.",
            "lines": "requires login",
            "metadata": {
                "title": "Runs text as Python code",
                "cwe": ["CWE-95: Eval"],
                "fix": "Parse it instead.",
            },
        },
    }
    finding = security.parse_semgrep_result(result, "app.py", {"app.py": "x = 1\neval(data)\n"})
    assert finding["snippet"] == "eval(data)" and finding["severity"] == "high"
    assert finding["cwe"] == "CWE-95" and finding["engine"] == "semgrep"


def test_semgrep_merge_prefers_semgrep_for_the_same_line():
    semgrep = [
        {
            **security._finding(
                "semgrep.python-eval-exec",
                "high",
                "CWE-95",
                "Eval",
                "app.py",
                1,
                "eval(x)",
                "",
                "",
                engine="semgrep",
            )
        }
    ]
    analysis = security.analyze({"app.py": "eval(x)\n"}, semgrep)
    assert [f["engine"] for f in analysis["findings"]] == ["semgrep"]
    assert analysis["engines"] == ["silo", "semgrep"]


# --- API -------------------------------------------------------------------


@pytest.fixture
def track(client, auth_cookies, tmp_path, monkeypatch):
    """An app with a clean static upload followed by a risky one."""
    monkeypatch.setattr(settings, "bundle_storage_path", str(tmp_path / "bundles"))
    monkeypatch.setattr(versions, "_launch_build", lambda *args: None)
    app = client.post("/apps", json={"name": "Tracked"}, **auth_cookies).json()

    def upload(html):
        content = io.BytesIO()
        with zipfile.ZipFile(content, "w") as archive:
            archive.writestr("index.html", html)
        response = client.post(
            f"/apps/{app['id']}/versions",
            files={"file": ("site.zip", content.getvalue(), "application/zip")},
            **auth_cookies,
        )
        assert response.status_code == 201
        return response.json()

    first = upload("<h1>Hello</h1>")
    second = upload(
        "<h1>Hello</h1><script src='https://cdn.example.net/x.js'></script>"
        "<script>out.innerHTML = location.hash</script>"
    )
    return app, first, second


def test_timeline_has_origin_and_expanding_build(client, auth_cookies, track):
    app, first, second = track
    data = client.get(f"/apps/{app['id']}/security", **auth_cookies).json()
    assert [n["version_no"] for n in data["nodes"]] == [1, 2]
    origin, latest = data["nodes"]
    assert origin["origin"] and origin["classification"] == "origin"
    assert latest["classification"] == "expanding" and latest["findings_new"] == 2
    assert data["summary"]["risk"] == latest["risk"] > origin["risk"]
    assert data["engine"]["label"] == "Silo rules"
    # Child nodes of the flow, and the capability matrix rows.
    items = {(i["type"], i["title"]) for i in latest["items"]}
    assert ("finding", "Writes raw HTML into the page") in items
    assert ("access", "Loads code from other websites") in items
    assert origin["items"] == [] and origin["capability_keys"] == []
    assert "remote-script:cdn.example.net" in latest["capability_keys"]
    assert any(c["key"] == "remote-script:cdn.example.net" for c in data["capabilities"])


def test_node_shows_what_changed_and_compare_any_two(client, auth_cookies, track):
    app, first, second = track
    node = client.get(f"/apps/{app['id']}/security/{second['id']}", **auth_cookies).json()
    assert node["diff"]["base"]["version_no"] == 1
    assert node["diff"]["files"][0]["path"] == "index.html"
    assert {f["rule_id"] for f in node["diff"]["findings_new"]} == {
        "silo.js.html-injection",
        "silo.html.script-without-integrity",
    }
    origin = client.get(f"/apps/{app['id']}/security/{first['id']}", **auth_cookies).json()
    assert origin["diff"] is None and origin["label"]["files"] == 1
    backwards = client.get(
        f"/apps/{app['id']}/security/{first['id']}?compare_to={second['id']}", **auth_cookies
    ).json()
    assert backwards["diff"]["classification"] == "reducing"


def test_security_track_requires_access(client, auth_cookies, track, db_session):
    app, first, _ = track
    db_session.add(User(id="outsider", email="out@example.test", google_sub="out"))
    db_session.commit()
    outsider = {
        "cookies": {
            "silo_session": jwt.encode(
                {"sub": "outsider", "email": "out@example.test", "exp": 9999999999},
                settings.session_secret,
                algorithm="HS256",
            )
        }
    }
    assert client.get(f"/apps/{app['id']}/security", **outsider).status_code == 404
    assert client.get(f"/apps/{app['id']}/security/{first['id']}", **outsider).status_code == 404
    db_session.add(Membership(app_id=app["id"], user_id="outsider", role="viewer"))
    db_session.commit()
    assert client.get(f"/apps/{app['id']}/security", **outsider).status_code == 200
    node = client.get(f"/apps/{app['id']}/security", **outsider).json()["nodes"][1]
    fix = client.post(
        f"/apps/{app['id']}/security/{node['version_id']}/fix",
        json={"fingerprint": "x"},
        **outsider,
    )
    assert fix.status_code == 403


def test_fix_with_ai_needs_a_real_finding_and_a_provider(client, auth_cookies, track):
    app, _, second = track
    node = client.get(f"/apps/{app['id']}/security/{second['id']}", **auth_cookies).json()
    url = f"/apps/{app['id']}/security/{second['id']}/fix"
    assert client.post(url, json={"fingerprint": "nope"}, **auth_cookies).status_code == 404
    fingerprint = node["findings"][0]["fingerprint"]
    unconfigured = client.post(url, json={"fingerprint": fingerprint}, **auth_cookies)
    assert unconfigured.status_code == 503 and "GEMINI_API_KEY" in unconfigured.json()["detail"]


def test_fix_with_ai_creates_reviewable_proposal(client, auth_cookies, track, monkeypatch):
    from silo_api.routes import proposals

    app, _, second = track
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    started = []
    monkeypatch.setattr(proposals, "generate_proposal", lambda *a, **k: started.append(a))
    node = client.get(f"/apps/{app['id']}/security/{second['id']}", **auth_cookies).json()
    finding = node["findings"][0]
    response = client.post(
        f"/apps/{app['id']}/security/{second['id']}/fix",
        json={"fingerprint": finding["fingerprint"]},
        **auth_cookies,
    )
    assert response.status_code == 201
    prompt = response.json()["proposal"]["prompt"]
    assert finding["rule_id"] in prompt and finding["file"] in prompt
    assert started, "AI generation was not queued"
