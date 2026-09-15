import tempfile
from pathlib import Path

from silo_api.services.inference.detect_entrypoint import detect_entrypoint
from silo_api.services.inference.detect_port import detect_and_repair_port
from silo_api.services.inference.generate_dockerfile import generate_dockerfile


def test_finds_app_py():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "app.py").write_text("from flask import Flask\napp = Flask(__name__)")
        result = detect_entrypoint(Path(d))
        assert result is not None
        assert result.file == "app.py"
        assert result.confidence == "high"


def test_finds_main_py():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "main.py").write_text("print('hi')")
        result = detect_entrypoint(Path(d))
        assert result is not None
        assert result.file == "main.py"
        assert result.confidence == "high"


def test_finds_main_guard():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "dashboard.py").write_text(
            'if __name__ == "__main__":\n    print("hi")'
        )
        result = detect_entrypoint(Path(d))
        assert result is not None
        assert result.file == "dashboard.py"
        assert result.confidence == "medium"


def test_finds_procfile():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "Procfile").write_text("web: python serve.py")
        (Path(d) / "serve.py").write_text("print('serving')")
        result = detect_entrypoint(Path(d))
        assert result is not None
        assert result.file == "serve.py"
        assert result.confidence == "high"


def test_ambiguous_returns_none():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "a.py").write_text('if __name__ == "__main__": pass')
        (Path(d) / "b.py").write_text('if __name__ == "__main__": pass')
        result = detect_entrypoint(Path(d))
        # Two files with __main__ guard, neither is a priority name — ambiguous
        assert result is None


def test_detects_port():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "app.py").write_text('app.run(host="0.0.0.0", port=8080)')
        result = detect_and_repair_port(Path(d), "app.py")
        assert result.port == 8080
        assert result.was_repaired is False


def test_default_port_when_not_found():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "app.py").write_text("print('hello')")
        result = detect_and_repair_port(Path(d), "app.py")
        assert result.port == 5000  # DEFAULT_PORT


def test_repairs_localhost():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "app.py").write_text('app.run(host="127.0.0.1", port=5000)')
        result = detect_and_repair_port(Path(d), "app.py")
        assert result.was_repaired is True
        repaired = (Path(d) / "app.py").read_text()
        assert "0.0.0.0" in repaired
        assert "127.0.0.1" not in repaired


def test_repairs_localhost_string():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "app.py").write_text('app.run(host="localhost", port=3000)')
        result = detect_and_repair_port(Path(d), "app.py")
        assert result.was_repaired is True
        assert result.port == 3000
        repaired = (Path(d) / "app.py").read_text()
        assert "0.0.0.0" in repaired


def test_generate_dockerfile_with_requirements():
    result = generate_dockerfile(
        python_version="3.10",
        entrypoint="app.py",
        port=5000,
        packages=[],
        has_requirements_txt=True,
    )
    assert "FROM python:3.10-slim" in result
    assert "COPY requirements.txt" in result
    assert "EXPOSE 5000" in result
    assert 'CMD ["python", "app.py"]' in result


def test_generate_dockerfile_with_packages():
    result = generate_dockerfile(
        python_version="3.12",
        entrypoint="main.py",
        port=8000,
        packages=["flask", "pandas"],
        has_requirements_txt=False,
    )
    assert "FROM python:3.12-slim" in result
    assert "pip install --no-cache-dir flask pandas" in result
    assert "EXPOSE 8000" in result
