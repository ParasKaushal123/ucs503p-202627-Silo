import re
from pathlib import Path

# (regex pattern, minimum Python version required)
# Ordered from newest to oldest for clarity.
VERSION_MARKERS = [
    (r"type\s+\w+\s*=", "3.12"),  # type statement (PEP 695)
    (r"^\s*match\s+\w+[^=]*:\s*$", "3.10"),  # match/case
    (r":=", "3.8"),  # walrus operator
    (r'f["\']', "3.6"),  # f-strings
]

# The lowest version we consider safe. If no feature markers are found,
# we default to this — it covers the vast majority of Python 3 code.
DEFAULT_VERSION = "3.10"


def detect_python_version(app_dir: Path) -> str:
    """Scan .py files for syntax features and return the minimum
    Python version required. Default: 3.10."""
    max_version = DEFAULT_VERSION

    for py_file in app_dir.rglob("*.py"):
        try:
            source = py_file.read_text(errors="ignore")
        except Exception:
            continue
        for pattern, version in VERSION_MARKERS:
            if re.search(pattern, source, re.MULTILINE):
                if _version_tuple(version) > _version_tuple(max_version):
                    max_version = version

    return max_version


def _version_tuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in v.split("."))
