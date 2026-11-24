import tempfile
from pathlib import Path

from silo_api.services.build_orchestrator import build_and_deploy


def test_full_pipeline_flask_app():
    """End-to-end inference pipeline: Flask app with requirements.txt."""
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "app.py").write_text(
            "from flask import Flask\n"
            "app = Flask(__name__)\n"
            "\n"
            '@app.route("/")\n'
            "def hello():\n"
            '    return "Hello from Silo!"\n'
            "\n"
            'if __name__ == "__main__":\n'
            '    app.run(host="127.0.0.1", port=5000)\n'
        )
        (p / "requirements.txt").write_text("flask==3.0.0\n")

        result = build_and_deploy("test-flask", p)

        # Should succeed (Docker may not be available, but inference completes)
        assert result.success is True
        assert result.port == 5000

        # Check Dockerfile was generated
        dockerfile = (p / "Dockerfile").read_text()
        assert "FROM python:3.10-slim" in dockerfile
        assert "COPY requirements.txt" in dockerfile
        assert "EXPOSE 5000" in dockerfile

        # Check port auto-repair happened
        repaired = (p / "app.py").read_text()
        assert "0.0.0.0" in repaired
        assert "127.0.0.1" not in repaired

        # Check logs
        phases = [log["phase"] for log in result.logs]
        assert "detect" in phases
        assert "runtime" in phases
        assert "deps" in phases
        assert "entrypoint" in phases
        assert "port" in phases
        assert "dockerfile" in phases


def test_pipeline_no_python():
    """Should fail for non-Python apps."""
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "index.html").write_text("<html></html>")

        result = build_and_deploy("test-html", p)
        assert result.success is False
        assert "Unsupported language" in (result.error or "")


def test_pipeline_no_entrypoint():
    """Should fail when no entry point can be determined."""
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        # Two files with __main__ guards and no priority names → ambiguous
        (p / "service_a.py").write_text('if __name__ == "__main__": pass')
        (p / "service_b.py").write_text('if __name__ == "__main__": pass')

        result = build_and_deploy("test-ambiguous", p)
        assert result.success is False
        assert "entry point" in (result.error or "").lower()


def test_pipeline_import_scan():
    """Should discover deps from imports when no requirements.txt."""
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "app.py").write_text(
            "import pandas\n"
            "import numpy as np\n"
            "import os\n"
            "\n"
            "df = pandas.DataFrame()\n"
            'if __name__ == "__main__":\n'
            "    print(df)\n"
        )

        result = build_and_deploy("test-imports", p)
        assert result.success is True

        # Check Dockerfile has pip install with discovered packages
        dockerfile = (p / "Dockerfile").read_text()
        assert "pip install" in dockerfile
        assert "pandas" in dockerfile
        assert "numpy" in dockerfile
