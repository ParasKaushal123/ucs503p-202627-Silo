"""Behavior and authorization regressions for the persistent Workbench."""

import base64
import io
import json
import uuid
import zipfile

import pytest
from jose import jwt

from silo_api.config import settings
from silo_api.models import Draft, Membership, User
from silo_api.services.workspace import render_static, source_hash, validate_files

STARTER_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Our shared space</title><link rel="stylesheet" href="style.css"></head>
<body><main><div class="eyebrow">MADE TOGETHER, IN SILO</div>
<h1>A little space.<br>A lot of possibility.</h1>
<p>Edit this page with a teammate. Your changes are saved together.
Your preview is a snapshot.</p>
<section><span id="count">0</span><button id="add">Make something happen ↗</button></section>
<footer>Your next idea starts here.</footer></main><script src="app.js"></script></body></html>"""
STARTER_CSS = """*{box-sizing:border-box}body{margin:0;background:#f8f7f2;color:#25251f;
font-family:system-ui,sans-serif}main{max-width:840px;padding:72px 44px;margin:auto}
.eyebrow{font-size:11px;letter-spacing:2px;font-weight:700;color:#6d735d}
h1{font-family:Georgia,serif;font-weight:400;font-size:clamp(38px,7vw,70px);line-height:1.08;
letter-spacing:-2px;margin:28px 0}p{max-width:440px;color:#737367;font-size:16px;line-height:1.8}
section{display:flex;align-items:center;gap:24px;margin-top:40px}#count{font-size:44px;
font-family:Georgia,serif;min-width:50px}button{border:0;border-radius:9px;padding:16px 23px;
background:#d4ed91;color:#29331e;font-weight:600;cursor:pointer}button:hover{background:#c2df79}
footer{margin-top:72px;border-top:1px solid #e3e2d8;padding-top:20px;
color:#949487;font-size:12px}"""
STARTER_JS = """let count = 0;
document.querySelector('#add').addEventListener('click', () => {
  document.querySelector('#count').textContent = String(++count);
});
"""


def starter_files():
    return {
        str(uuid.uuid4()): {"path": path, "content": content}
        for path, content in [
            ("index.html", STARTER_HTML),
            ("style.css", STARTER_CSS),
            ("app.js", STARTER_JS),
            ("README.md", "# Our shared app\n\nEdit together, then build a preview.\n"),
        ]
    }


@pytest.fixture
def space(client, auth_cookies, db_session, monkeypatch):
    monkeypatch.setattr(settings, "collab_service_secret", "test-coordinator-secret")
    db_session.add(User(id="other", email="other@example.test", google_sub="other"))
    db_session.commit()
    app = client.post("/apps", json={"name": "Shared space"}, **auth_cookies).json()
    draft = client.post(f"/apps/{app['id']}/draft", **auth_cookies).json()
    # Explicit test source: production drafts preserve uploaded apps or start empty.
    row = db_session.get(Draft, draft["id"])
    row.files_json = json.dumps(starter_files())
    row.base_files_json = row.files_json
    db_session.commit()
    draft = client.get(f"/drafts/{row.id}", **auth_cookies).json()
    other = jwt.encode(
        {"sub": "other", "email": "other@example.test", "exp": 9999999999},
        settings.session_secret,
        algorithm="HS256",
    )
    return app, draft, {"cookies": {"silo_session": other}}


def test_reads_require_app_access(client, auth_cookies, space):
    app, draft, other = space
    assert client.get(f"/apps/{app['id']}", **other).status_code == 404
    assert client.get(f"/apps/{app['id']}/versions", **other).status_code == 404
    assert client.get(f"/drafts/{draft['id']}", **other).status_code == 404


def test_original_upload_creates_real_preview_and_version(
    client, auth_cookies, tmp_path, monkeypatch
):
    monkeypatch.setattr(settings, "bundle_storage_path", str(tmp_path / "bundles"))
    app = client.post("/apps", json={"name": "Existing upload flow"}, **auth_cookies).json()
    content = io.BytesIO()
    with zipfile.ZipFile(content, "w") as archive:
        archive.writestr("index.html", "<h1>My original application</h1>")
    response = client.post(
        f"/apps/{app['id']}/versions",
        files={"file": ("original.zip", content.getvalue(), "application/zip")},
        **auth_cookies,
    )
    assert response.status_code == 201
    version = response.json()
    assert version["status"] == "live" and version["version_no"] == 1
    assert version["created_at"]
    draft = client.post(f"/apps/{app['id']}/draft", **auth_cookies).json()
    assert any("My original application" in f["content"] for f in draft["files"].values())
    preview = client.get(f"/apps/{app['id']}/preview", **auth_cookies).json()
    assert "My original application" in preview["html"]
    logs = client.get(f"/versions/{version['id']}/logs", **auth_cookies).json()
    assert logs[-1]["phase"] == "deploy" and logs[-1]["created_at"]


def test_messages_attachments_and_title_persist_with_access_checks(client, auth_cookies, space):
    _, draft, other = space
    url = f"/drafts/{draft['id']}"
    assert (
        client.patch(url, json={"title": "Original shared work"}, **auth_cookies).status_code == 200
    )
    assert client.get(url, **auth_cookies).json()["title"] == "Original shared work"
    response = client.post(
        url + "/attachments",
        files={"file": ("notes.txt", b"Preserve the original interface", "text/plain")},
        **auth_cookies,
    )
    assert response.status_code == 201
    attachment = response.json()
    assert client.get(f"/attachments/{attachment['id']}", **other).status_code == 404
    assert (
        client.get(f"/attachments/{attachment['id']}", **auth_cookies).content
        == b"Preserve the original interface"
    )
    assert (
        client.post(
            url + "/messages",
            json={"body": "Review these notes", "attachments": [attachment["id"]]},
            **auth_cookies,
        ).status_code
        == 201
    )
    messages = client.get(url + "/messages", **auth_cookies).json()
    assert messages[0]["body"] == "Review these notes"
    assert messages[0]["attachments"][0]["name"] == "notes.txt"
    assert client.get(url + "/messages", **other).status_code == 404


def test_invite_is_idempotent_and_shared_listing_works(client, auth_cookies, space):
    app, draft, other = space
    invite = client.post(
        f"/apps/{app['id']}/invites", json={"role": "editor"}, **auth_cookies
    ).json()
    token = invite["url"].rsplit("/", 1)[1]
    for _ in range(2):
        assert client.post(f"/invites/{token}/accept", **other).status_code == 200
    assert client.get("/apps", **other).json()[0]["id"] == app["id"]
    assert client.get(f"/drafts/{draft['id']}", **other).json()["role"] == "editor"
    assert len(client.get(f"/apps/{app['id']}/members", **other).json()) == 2


def test_viewer_cannot_write_or_publish(client, auth_cookies, space, db_session):
    app, draft, other = space
    db_session.add(Membership(app_id=app["id"], user_id="other", role="viewer"))
    db_session.commit()
    for suffix in ["checkpoints", "comments", "releases"]:
        data = {"body": "Hello"} if suffix == "comments" else {"label": "Denied"}
        assert client.post(f"/drafts/{draft['id']}/{suffix}", json=data, **other).status_code == 403


def test_commit_is_cas_and_duplicate_operation_is_durable(client, auth_cookies, space):
    _, draft, _ = space
    ticket = client.post(f"/drafts/{draft['id']}/ticket", **auth_cookies).json()["ticket"]
    body = {
        "ticket": ticket,
        "generation": 1,
        "revision": 0,
        "files": draft["files"],
        "state": base64.b64encode(b"test-state").decode(),
        "operation_id": "stable-operation",
        "payload_hash": "a" * 64,
    }
    headers = {"X-Silo-Service": "test-coordinator-secret"}
    first = client.post("/internal/collab/commit", json=body, headers=headers)
    assert first.status_code == 200
    assert first.json()["revision"] == 1
    again = client.post("/internal/collab/commit", json=body, headers=headers)
    assert again.json()["duplicate"] is True
    assert client.get(f"/drafts/{draft['id']}", **auth_cookies).json()["revision"] == 1
    body["operation_id"] = "different-operation"
    assert client.post("/internal/collab/commit", json=body, headers=headers).status_code == 409


def test_revoked_ticket_cannot_commit(client, auth_cookies, space, db_session):
    app, draft, other = space
    grant = Membership(app_id=app["id"], user_id="other", role="editor")
    db_session.add(grant)
    db_session.commit()
    ticket = client.post(f"/drafts/{draft['id']}/ticket", **other).json()["ticket"]
    db_session.delete(grant)
    db_session.commit()
    result = client.post(
        "/internal/collab/load",
        json={"ticket": ticket},
        headers={"X-Silo-Service": "test-coordinator-secret"},
    )
    assert result.status_code == 404


def test_checkpoint_restore_creates_generation_and_recovery(client, auth_cookies, space):
    _, draft, _ = space
    checkpoint = client.post(
        f"/drafts/{draft['id']}/checkpoints", json={"label": "Initial"}, **auth_cookies
    ).json()
    result = client.post(
        f"/drafts/{draft['id']}/restore",
        json={
            "checkpoint_id": checkpoint["id"],
            "expected_revision": 0,
        },
        **auth_cookies,
    )
    assert result.status_code == 200
    current = client.get(f"/drafts/{draft['id']}", **auth_cookies).json()
    assert current["generation"] == 2
    assert len(client.get(f"/drafts/{draft['id']}/checkpoints", **auth_cookies).json()) == 2
    assert (
        client.post(
            f"/drafts/{draft['id']}/restore",
            json={
                "checkpoint_id": checkpoint["id"],
                "expected_revision": 0,
            },
            **auth_cookies,
        ).status_code
        == 409
    )


def test_preview_and_publish_use_immutable_source(client, auth_cookies, space):
    app, draft, _ = space
    release = client.post(
        f"/drafts/{draft['id']}/releases", json={"label": "First"}, **auth_cookies
    ).json()
    ticket = client.post(f"/releases/{release['id']}/ticket", **auth_cookies).json()
    assert "preview-" in ticket["url"]
    assert "Make something happen" in ticket["html"]
    assert "<script>let count" in ticket["html"]
    assert 'src="app.js"' not in ticket["html"]
    assert client.post(f"/releases/{release['id']}/publish", **auth_cookies).status_code == 200
    assert (
        client.get(f"/apps/{app['id']}", **auth_cookies).json()["approved_version_id"]
        == release["id"]
    )


def test_comment_reply_and_author_policy(client, auth_cookies, space, db_session):
    app, draft, other = space
    db_session.add(Membership(app_id=app["id"], user_id="other", role="commenter"))
    db_session.commit()
    thread = client.post(
        f"/drafts/{draft['id']}/comments", json={"body": "Question"}, **auth_cookies
    ).json()
    assert (
        client.post(
            f"/drafts/{draft['id']}/comments",
            json={
                "body": "Reply",
                "parent_id": thread["id"],
            },
            **other,
        ).status_code
        == 201
    )
    assert client.post(f"/comments/{thread['id']}/resolve", **other).status_code == 403
    assert len(client.get(f"/drafts/{draft['id']}/comments", **other).json()) == 2


def test_import_rejects_traversal(client, auth_cookies, space):
    _, draft, _ = space
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("../escape.py", "print('unsafe')")
    result = client.post(
        f"/drafts/{draft['id']}/import",
        data={"expected_revision": 0},
        files={"file": ("bad.zip", stream.getvalue(), "application/zip")},
        **auth_cookies,
    )
    assert result.status_code == 422


def test_ai_is_honest_when_unconfigured(client, auth_cookies, space, monkeypatch):
    _, draft, _ = space
    monkeypatch.setattr(settings, "ai_api_url", "")
    result = client.post(
        f"/drafts/{draft['id']}/proposals",
        json={
            "prompt": "Add a button",
            "expected_hash": draft["source_hash"],
        },
        **auth_cookies,
    )
    assert result.status_code == 503


@pytest.mark.parametrize("path", ["../x.py", "/tmp/x.py", ".env", "a\\b.py", "a/../x"])
def test_unsafe_source_paths_are_refused(path):
    with pytest.raises(Exception):
        validate_files({"id": {"path": path, "content": ""}})


def test_source_digest_ignores_file_identity():
    assert source_hash({"a": {"path": "x.py", "content": "a"}}) == source_hash(
        {"b": {"path": "x.py", "content": "a"}}
    )
    assert render_static({"a": {"path": "app.py", "content": "print('hi')"}}) is None


def test_publish_conflict_preserves_current_version_and_live_route(client, auth_cookies, space):
    app, draft, _ = space
    first = client.post(
        f"/drafts/{draft['id']}/releases", json={"label": "First"}, **auth_cookies
    ).json()
    second = client.post(
        f"/drafts/{draft['id']}/releases", json={"label": "Second"}, **auth_cookies
    ).json()
    assert client.post(f"/releases/{first['id']}/publish", **auth_cookies).status_code == 200
    assert client.post(f"/releases/{second['id']}/publish", **auth_cookies).status_code == 409
    live = client.get(f"/apps/{app['id']}/live", **auth_cookies).json()
    assert live["id"] == first["id"]
    assert "Make something happen" in live["html"]
    assert (
        client.post(
            f"/releases/{second['id']}/publish",
            json={
                "expected_approved_version_id": first["id"],
            },
            **auth_cookies,
        ).status_code
        == 200
    )


def test_fork_and_export_are_independent(client, auth_cookies, space):
    app, draft, _ = space
    fork = client.post(f"/apps/{app['id']}/fork", **auth_cookies).json()
    forked = client.post(f"/apps/{fork['id']}/draft", **auth_cookies).json()
    assert forked["id"] != draft["id"]
    assert forked["source_hash"] == draft["source_hash"]
    exported = client.get(f"/drafts/{forked['id']}/export", **auth_cookies)
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        assert "index.html" in archive.namelist()


def test_invitation_revocation_stops_new_acceptances(client, auth_cookies, space):
    app, _, other = space
    invite = client.post(
        f"/apps/{app['id']}/invites", json={"role": "editor"}, **auth_cookies
    ).json()
    client.delete(f"/apps/{app['id']}/invites", **auth_cookies)
    token = invite["url"].rsplit("/", 1)[1]
    assert client.post(f"/invites/{token}/accept", **other).status_code == 404


def test_legacy_proxy_redirects_away_from_api_origin(client, auth_cookies, space):
    app, draft, _ = space
    release = client.post(
        f"/drafts/{draft['id']}/releases", json={"label": "Published"}, **auth_cookies
    ).json()
    client.post(f"/releases/{release['id']}/publish", **auth_cookies)
    response = client.get(f"/proxy/{app['id']}", follow_redirects=False, **auth_cookies)
    assert response.status_code == 307
    assert f"preview-{release['id']}.localhost:1234" in response.headers["location"]


def test_cross_origin_mutation_is_rejected(client, auth_cookies):
    response = client.post(
        "/apps",
        json={"name": "Cross-site"},
        headers={"Origin": "https://untrusted.example"},
        **auth_cookies,
    )
    assert response.status_code == 403


def _upload(client, auth_cookies, app_id, name, content):
    return client.post(
        f"/apps/{app_id}/versions",
        files={"file": (name, content, "application/octet-stream")},
        **auth_cookies,
    )


def test_python_upload_replaces_published_app_once_healthy(
    client, auth_cookies, db_session, tmp_path, monkeypatch
):
    from silo_api.models import Version
    from silo_api.routes import versions
    from silo_api.services.builder import _finish

    monkeypatch.setattr(settings, "bundle_storage_path", str(tmp_path / "bundles"))
    monkeypatch.setattr(versions, "_launch_build", lambda *args: None)
    app = client.post("/apps", json={"name": "Upload flow"}, **auth_cookies).json()
    static = io.BytesIO()
    with zipfile.ZipFile(static, "w") as archive:
        archive.writestr("index.html", "<h1>Static first</h1>")
    first = _upload(client, auth_cookies, app["id"], "site.zip", static.getvalue())
    assert first.status_code == 201

    second = _upload(client, auth_cookies, app["id"], "app.py", b"print('v2')\n").json()
    third = _upload(client, auth_cookies, app["id"], "app.py", b"print('v3')\n").json()
    # Building uploads do not replace the published app.
    assert "Static first" in client.get(f"/apps/{app['id']}/preview", **auth_cookies).json()["html"]

    def finish(version_id, success, port):
        _finish(db_session, db_session.get(Version, version_id), [], success, "c", port)

    finish(third["id"], True, 5003)
    live = client.get(f"/apps/{app['id']}/live", **auth_cookies).json()
    assert live["label"] == "Uploaded v3" and live["html"] is None
    # A slower, older build finishing later must not take over.
    finish(second["id"], True, 5002)
    assert client.get(f"/apps/{app['id']}/live", **auth_cookies).json()["label"] == "Uploaded v3"
    statuses = {
        r["label"]: r["status"]
        for r in client.get(f"/apps/{app['id']}/releases", **auth_cookies).json()
    }
    assert statuses == {
        "Uploaded v1": "superseded",
        "Uploaded v2": "superseded",
        "Uploaded v3": "published",
    }


def test_failed_python_upload_keeps_current_app(
    client, auth_cookies, db_session, tmp_path, monkeypatch
):
    from silo_api.models import Version
    from silo_api.routes import versions
    from silo_api.services.builder import _finish

    monkeypatch.setattr(settings, "bundle_storage_path", str(tmp_path / "bundles"))
    monkeypatch.setattr(versions, "_launch_build", lambda *args: None)
    app = client.post("/apps", json={"name": "Failing upload"}, **auth_cookies).json()
    good = _upload(client, auth_cookies, app["id"], "app.py", b"print('ok')\n").json()
    _finish(db_session, db_session.get(Version, good["id"]), [], True, "c", 5001)
    bad = _upload(client, auth_cookies, app["id"], "app.py", b"raise SystemExit\n").json()
    _finish(db_session, db_session.get(Version, bad["id"]), [], False)
    live = client.get(f"/apps/{app['id']}/live", **auth_cookies).json()
    assert live["label"] == "Uploaded v1"
    releases = client.get(f"/apps/{app['id']}/releases", **auth_cookies).json()
    assert [r["status"] for r in releases if r["label"] == "Uploaded v2"] == ["failed"]


def test_invited_editor_changes_code_and_publishes_for_owner(client, auth_cookies, space):
    app, draft, other = space
    invite = client.post(
        f"/apps/{app['id']}/invites", json={"role": "editor"}, **auth_cookies
    ).json()
    token = invite["url"].rsplit("/", 1)[1]
    assert client.post(f"/invites/{token}/accept", **other).json()["app_id"] == app["id"]

    # The editor's change, committed through the coordinator as live editing does.
    files = {k: dict(v) for k, v in draft["files"].items()}
    html_id = next(k for k, v in files.items() if v["path"] == "index.html")
    files[html_id]["content"] = files[html_id]["content"].replace(
        "A little space.", "Edited by a collaborator."
    )
    ticket = client.post(f"/drafts/{draft['id']}/ticket", **other).json()["ticket"]
    committed = client.post(
        "/internal/collab/commit",
        json={
            "ticket": ticket,
            "generation": draft["generation"],
            "revision": draft["revision"],
            "files": files,
            "state": base64.b64encode(b"editor-state").decode(),
        },
        headers={"X-Silo-Service": "test-coordinator-secret"},
    )
    assert committed.status_code == 200

    release = client.post(
        f"/drafts/{draft['id']}/releases",
        json={"label": "Collaborator change", "expected_hash": committed.json()["source_hash"]},
        **other,
    ).json()
    published = client.post(
        f"/releases/{release['id']}/publish",
        json={"expected_approved_version_id": None},
        **other,
    )
    assert published.status_code == 200

    owner_view = client.get(f"/apps/{app['id']}/live", **auth_cookies).json()
    assert owner_view["label"] == "Collaborator change"
    assert "Edited by a collaborator." in owner_view["html"]
    assert (
        client.get(f"/apps/{app['id']}", **auth_cookies).json()["approved_version_id"]
        == (release["id"])
    )


@pytest.mark.parametrize("role", ["viewer", "commenter"])
def test_non_editors_cannot_publish(client, auth_cookies, space, db_session, role):
    app, draft, other = space
    release = client.post(
        f"/drafts/{draft['id']}/releases", json={"label": "Owner snapshot"}, **auth_cookies
    ).json()
    db_session.add(Membership(app_id=app["id"], user_id="other", role=role))
    db_session.commit()
    assert client.post(f"/releases/{release['id']}/publish", **other).status_code == 403
