"""Integration tests that run all 5 evaluation apps through the inference pipeline.

These tests verify the full pipeline end-to-end (without Docker) using
copies of the evaluation apps so originals aren't mutated.
"""

import shutil
import tempfile
from pathlib import Path

from silo_api.services.build_orchestrator import build_and_deploy

EVAL_DIR = Path(__file__).resolve().parent.parent.parent.parent / "testapps" / "runtime-samples"


def _copy_eval_app(name: str) -> Path:
    """Copy an evaluation app to a temp directory so tests don't mutate originals."""
    src = EVAL_DIR / name
    tmp = Path(tempfile.mkdtemp())
    dst = tmp / name
    shutil.copytree(src, dst)
    return dst


class TestFlaskHello:
    def test_pipeline(self):
        app_dir = _copy_eval_app("01-flask-hello")
        result = build_and_deploy("flask-hello", app_dir)

        assert result.success is True
        assert result.port == 5000

        dockerfile = (app_dir / "Dockerfile").read_text()
        assert "FROM python:3.10-slim" in dockerfile
        assert "COPY requirements.txt" in dockerfile
        assert "EXPOSE 5000" in dockerfile
        assert 'CMD ["python", "app.py"]' in dockerfile


class TestFastAPICalc:
    def test_pipeline(self):
        app_dir = _copy_eval_app("02-fastapi-calc")
        result = build_and_deploy("fastapi-calc", app_dir)

        assert result.success is True
        assert result.port == 8000

        dockerfile = (app_dir / "Dockerfile").read_text()
        assert "EXPOSE 8000" in dockerfile
        assert 'CMD ["python", "main.py"]' in dockerfile


class TestPandasCSV:
    def test_pipeline(self):
        app_dir = _copy_eval_app("03-pandas-csv")
        result = build_and_deploy("pandas-csv", app_dir)

        assert result.success is True
        assert result.port == 5000

        # No requirements.txt — deps should come from import scan
        dockerfile = (app_dir / "Dockerfile").read_text()
        assert "pip install" in dockerfile
        assert "pandas" in dockerfile
        assert "numpy" in dockerfile
        assert "flask" in dockerfile


class TestStreamlitDashboard:
    def test_pipeline(self):
        app_dir = _copy_eval_app("04-streamlit-dashboard")
        result = build_and_deploy("streamlit-dash", app_dir)

        assert result.success is True

        dockerfile = (app_dir / "Dockerfile").read_text()
        assert "COPY requirements.txt" in dockerfile
        assert 'CMD ["python", "app.py"]' in dockerfile


class TestFlaskLocalhost:
    def test_pipeline_repairs_localhost(self):
        app_dir = _copy_eval_app("05-flask-localhost")

        # Verify the original has 127.0.0.1
        original = (app_dir / "app.py").read_text()
        assert "127.0.0.1" in original

        result = build_and_deploy("flask-localhost", app_dir)

        assert result.success is True
        assert result.port == 5000

        # Verify repair happened
        repaired = (app_dir / "app.py").read_text()
        assert "0.0.0.0" in repaired
        assert "127.0.0.1" not in repaired

        # Check log says repair happened
        port_logs = [log for log in result.logs if log["phase"] == "port"]
        assert any("Repaired" in log["message"] for log in port_logs)
