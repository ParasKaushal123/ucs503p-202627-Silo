import json
import re
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data"


def _load_import_map() -> dict[str, str]:
    path = _DATA_DIR / "import_map.json"
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _load_stdlib() -> set[str]:
    path = _DATA_DIR / "stdlib_modules.json"
    if path.exists():
        return set(json.loads(path.read_text()))
    return set()


_IMPORT_MAP: dict[str, str] = _load_import_map()
_STDLIB: set[str] = _load_stdlib()


def resolve_dependencies(app_dir: Path) -> list[str]:
    """Return a deduplicated list of PyPI package names the app needs."""
    declared = _parse_requirements_txt(app_dir)
    scanned = _scan_imports(app_dir)

    # Merge: declared packages take priority (they may pin versions).
    # Scanned packages fill gaps for undeclared imports.
    declared_names = {
        _normalize(p.split("=")[0].split(">")[0].split("<")[0].split("[")[0]) for p in declared
    }
    result = list(declared)

    for imp in scanned:
        pkg = _IMPORT_MAP.get(imp)
        if pkg and _normalize(pkg) not in declared_names:
            result.append(pkg)

    return result


def _parse_requirements_txt(app_dir: Path) -> list[str]:
    req_file = app_dir / "requirements.txt"
    if not req_file.exists():
        return []
    lines = []
    for line in req_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and not line.startswith("-"):
            lines.append(line)
    return lines


def _scan_imports(app_dir: Path) -> list[str]:
    """Extract top-level import names from all .py files."""
    imports: set[str] = set()
    for py_file in app_dir.rglob("*.py"):
        try:
            source = py_file.read_text(errors="ignore")
        except Exception:
            continue
        # Match: import foo / from foo import bar / from foo.bar import baz
        for match in re.finditer(r"^(?:import|from)\s+([\w]+)", source, re.MULTILINE):
            top_level = match.group(1)
            if top_level not in _STDLIB and top_level != "__future__":
                imports.add(top_level)
    return sorted(imports)


def _normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower().strip()
