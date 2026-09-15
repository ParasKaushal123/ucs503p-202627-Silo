import tempfile
from pathlib import Path

from silo_api.services.inference.resolve_deps import resolve_dependencies


def test_reads_requirements_txt():
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "requirements.txt").write_text("flask==3.0.0\nrequests>=2.31")
        (p / "app.py").write_text("from flask import Flask")
        deps = resolve_dependencies(p)
        assert "flask==3.0.0" in deps
        assert "requests>=2.31" in deps


def test_discovers_undeclared_imports():
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "app.py").write_text("import pandas\nimport numpy\nimport os")
        deps = resolve_dependencies(p)
        assert "pandas" in deps
        assert "numpy" in deps
        # os is stdlib — should NOT appear
        assert not any("os" == dep for dep in deps)


def test_import_map_resolution():
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "app.py").write_text("from PIL import Image\nimport cv2")
        deps = resolve_dependencies(p)
        assert "Pillow" in deps
        assert "opencv-python" in deps


def test_no_duplicate_when_declared():
    """If requirements.txt already has flask, don't add it again from import scan."""
    with tempfile.TemporaryDirectory() as d:
        p = Path(d)
        (p / "requirements.txt").write_text("flask==3.0.0")
        (p / "app.py").write_text("import flask")
        deps = resolve_dependencies(p)
        flask_entries = [dep for dep in deps if "flask" in dep.lower()]
        assert len(flask_entries) == 1


def test_empty_project():
    with tempfile.TemporaryDirectory() as d:
        deps = resolve_dependencies(Path(d))
        assert deps == []
