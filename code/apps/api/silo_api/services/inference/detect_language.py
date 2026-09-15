from pathlib import Path


def detect_language(app_dir: Path) -> str | None:
    """Detect the primary language of the app bundle.

    Returns 'python', 'node' (stretch goal), or None.
    """
    files = list(app_dir.rglob("*"))
    extensions = {f.suffix.lower() for f in files if f.is_file()}
    names = {f.name.lower() for f in files if f.is_file()}

    # Python signals
    python_signals = (
        ".py" in extensions
        or "requirements.txt" in names
        or "pyproject.toml" in names
        or "pipfile" in names
        or "setup.py" in names
    )
    if python_signals:
        return "python"

    # Node.js (stretch goal — Week 15)
    if "package.json" in names:
        return "node"

    return None
