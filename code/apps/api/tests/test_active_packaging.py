import pytest

from silo_api.services.packaging import make_plan, resolve_packages


def test_asgi_module_without_server_gets_uvicorn(tmp_path):
    (tmp_path / "main.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n")
    plan = make_plan(tmp_path)
    assert plan.mode == "uvicorn"
    assert plan.start_command[:2] == ["uvicorn", "main:app"]
    assert "uvicorn[standard]" in plan.packages


def test_partial_requirements_preserve_pins_and_fill_gaps(tmp_path):
    (tmp_path / "app.py").write_text("import flask\nimport pandas\nimport typing_extensions\n")
    (tmp_path / "requirements.txt").write_text("flask==3.0.0\n")
    packages = resolve_packages(tmp_path, "script", True)
    assert "pandas" in packages
    assert "typing_extensions" in packages
    assert "flask" not in packages


def test_streamlit_uses_its_real_launcher(tmp_path):
    (tmp_path / "app.py").write_text("import streamlit as st\nst.title('Hi')\n")
    plan = make_plan(tmp_path)
    assert plan.mode == "streamlit"
    assert plan.start_command[:2] == ["streamlit", "run"]


def test_compose_privilege_request_is_refused(tmp_path):
    import pytest

    from silo_api.services.compose import prepare

    project = tmp_path / "compose.yml"
    project.write_text(
        "services:\n  web:\n    image: python:3.11\n"
        "    privileged: true\n    ports: ['8000:8000']\n"
    )
    with pytest.raises(RuntimeError, match="privileges"):
        prepare(project)


WEB = "services:\n  web:\n    image: python:3.11\n    ports: ['8000']\n"


def _compose(tmp_path, text, folder="."):
    path = tmp_path / folder / "compose.yml"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


@pytest.mark.parametrize(
    "extra",
    [
        # A named volume backed by a host bind would bypass the service mount check.
        "volumes:\n  data:\n    driver_opts: {type: none, o: bind, device: /}\n",
        "secrets:\n  key:\n    file: /etc/shadow\n",
        "configs:\n  cfg:\n    file: ../../outside.txt\n",
        "include:\n  - ../other.yml\n",
        "networks:\n  lan:\n    external: true\n",
    ],
)
def test_compose_top_level_host_access_is_refused(tmp_path, extra):
    from silo_api.services.compose import prepare

    path = _compose(tmp_path, WEB + extra)
    with pytest.raises(RuntimeError):
        prepare(path, tmp_path)


@pytest.mark.parametrize(
    "service",
    [
        "    build: ../..\n",
        "    build: {context: ., additional_contexts: {host: /}}\n",
        "    env_file: /etc/environment\n",
        "    volumes: [{type: bind, source: ../.., target: /host}]\n",
        "    uts: host\n",
    ],
)
def test_compose_service_host_access_is_refused(tmp_path, service):
    from silo_api.services.compose import prepare

    path = _compose(tmp_path, WEB + service)
    with pytest.raises(RuntimeError):
        prepare(path, tmp_path)


def test_compose_in_subfolder_may_build_sibling_inside_project(tmp_path):
    from silo_api.services.compose import prepare

    (tmp_path / "backend").mkdir()
    path = _compose(
        tmp_path,
        "services:\n  api:\n    build: ../backend\n    env_file: ../backend/.env.example\n"
        "    ports: ['8000:8000']\n",
        "infra",
    )
    assert prepare(path, tmp_path).service == "api"


def test_compose_ports_are_published_on_loopback_only(tmp_path):
    import yaml

    from silo_api.services.compose import prepare

    path = _compose(
        tmp_path,
        "services:\n  web:\n    image: python:3.11\n"
        "    ports:\n      - {target: 8000, published: 8000}\n      - '9000:9000/udp'\n",
    )
    plan = prepare(path, tmp_path)
    ports = yaml.safe_load(plan.compose_file.read_text())["services"]["web"]["ports"]
    assert ports == ["127.0.0.1::8000", "127.0.0.1::9000/udp"]
    assert plan.container_port == 8000


def test_compose_unparsable_port_is_refused(tmp_path):
    from silo_api.services.compose import prepare

    path = _compose(tmp_path, WEB.replace("'8000'", "'${PORT}:${PORT}'"))
    with pytest.raises(RuntimeError, match="port"):
        prepare(path, tmp_path)
