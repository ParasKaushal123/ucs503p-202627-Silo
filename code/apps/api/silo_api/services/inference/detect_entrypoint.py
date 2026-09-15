import re
from dataclasses import dataclass
from pathlib import Path


@dataclass
class EntryPointResult:
    file: str
    confidence: str  # "high" | "medium" | "low"
    reason: str


PRIORITY_NAMES = ["main.py", "app.py", "server.py", "run.py", "wsgi.py"]


def detect_entrypoint(app_dir: Path) -> EntryPointResult | None:
    """Locate the entry point file.

    Returns None if ambiguous or not found.
    """
    # 1. Procfile
    procfile = app_dir / "Procfile"
    if procfile.exists():
        for line in procfile.read_text().splitlines():
            if line.startswith("web:"):
                parts = line.split(":", 1)[1].strip().split()
                for part in parts:
                    if part.endswith(".py"):
                        return EntryPointResult(part, "high", "Procfile web: directive")

    # 2. Priority filenames
    for name in PRIORITY_NAMES:
        candidate = app_dir / name
        if candidate.exists():
            return EntryPointResult(name, "high", f"Standard filename: {name}")

    # 3. Files with if __name__ == "__main__"
    main_guard_files: list[Path] = []
    for py_file in app_dir.rglob("*.py"):
        try:
            source = py_file.read_text(errors="ignore")
        except Exception:
            continue
        if re.search(r'if\s+__name__\s*==\s*["\']__main__["\']', source):
            main_guard_files.append(py_file.relative_to(app_dir))

    if len(main_guard_files) == 1:
        f = str(main_guard_files[0])
        return EntryPointResult(f, "medium", "Only file with __main__ guard")

    # 4. Files with Flask() or FastAPI()
    framework_files: list[Path] = []
    for py_file in app_dir.rglob("*.py"):
        try:
            source = py_file.read_text(errors="ignore")
        except Exception:
            continue
        if re.search(r"(?:Flask|FastAPI)\s*\(", source):
            framework_files.append(py_file.relative_to(app_dir))

    if len(framework_files) == 1:
        f = str(framework_files[0])
        return EntryPointResult(f, "medium", "Only file with Flask()/FastAPI() instance")

    # 5. If we found multiple candidates, return the first with a note
    all_candidates = list(set(main_guard_files + framework_files))
    if len(all_candidates) == 1:
        f = str(all_candidates[0])
        return EntryPointResult(f, "medium", "Single candidate from combined heuristics")

    if len(all_candidates) > 1:
        # Ambiguous — return None so the build reports a diagnostic
        return None

    return None
