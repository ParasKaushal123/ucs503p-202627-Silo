import tempfile
from pathlib import Path

from silo_api.services.inference.detect_language import detect_language
from silo_api.services.inference.detect_runtime import detect_python_version


def test_detects_python_by_extension():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "app.py").write_text("from flask import Flask")
        assert detect_language(Path(d)) == "python"


def test_detects_python_by_requirements():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "requirements.txt").write_text("flask==3.0")
        assert detect_language(Path(d)) == "python"


def test_detects_python_by_pyproject():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "pyproject.toml").write_text('[project]\nname = "x"')
        assert detect_language(Path(d)) == "python"


def test_detects_node():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "package.json").write_text('{"name": "app"}')
        assert detect_language(Path(d)) == "node"


def test_returns_none_for_empty():
    with tempfile.TemporaryDirectory() as d:
        assert detect_language(Path(d)) is None


def test_version_310_match_case():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "main.py").write_text(
            'match command:\n    case "quit":\n        exit()\n'
        )
        assert detect_python_version(Path(d)) == "3.10"


def test_version_312_type_statement():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "main.py").write_text("type Vector = list[float]\n")
        assert detect_python_version(Path(d)) == "3.12"


def test_version_default():
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "main.py").write_text("print('hello')")
        assert detect_python_version(Path(d)) == "3.10"
