"""Packaging: turn an arbitrary uploaded Python project into a build plan.

This replaces the naive top-level-only detection that assumed every upload
was a single `app.py` sitting at the root of the bundle.

Real projects are not shaped like that. They look like:

    bundle/
      my-project/                 <- zip wrapper folder
        services/
          backend/                <- the actual app root
            requirements.txt
            app/
              main.py             <- FastAPI instance, NO __main__ guard
          frontend/               <- not Python, ignore

The job of this module is to answer five questions:

    1. Where does the project actually start?       -> find_project_root
    2. Which directory is the Python app root?      -> pick_app_root
    3. Which file is the entry point?               -> detect_entry
    4. How do you *run* it?                         -> run mode
    5. What does it need installed?                 -> resolve_packages

Question 4 is the one the old code got wrong in a way that silently
produced dead containers: a module that does `app = FastAPI()` and has no
`if __name__ == "__main__"` block cannot be started with `python main.py`.
That command exits 0 immediately and the container dies. Such a project
must be started with `uvicorn app.main:app`.
"""

from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PORT = 8000

# Directories that are never the app and must never be scanned or copied.
IGNORE_DIRS = {
    "__pycache__", ".git", ".hg", ".svn", ".idea", ".vscode",
    "node_modules", ".next", "dist", "build", ".turbo",
    "venv", ".venv", "env", ".env.d", "virtualenv", "site-packages",
    "__MACOSX", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    "migrations", "alembic", "tests", "test", "docs", ".github",
    "htmlcov", ".tox", "data", "static", "media",
}

# Directories excluded from *entry point* search but still installed/copied.
NON_ENTRY_DIRS = {"tests", "test", "migrations", "alembic", "docs", "scripts", "examples"}

# Files that mark a directory as a Python project root.
PROJECT_MARKERS = (
    "requirements.txt", "pyproject.toml", "Pipfile",
    "setup.py", "setup.cfg", "Procfile", "environment.yml",
)

# Directory names that commonly hold the deployable service in a monorepo.
PREFERRED_ROOT_NAMES = ("backend", "api", "server", "service", "app", "src", "web")

ENTRY_NAMES = ("main.py", "app.py", "server.py", "run.py", "wsgi.py", "asgi.py", "manage.py")

# import name -> pip package name (only where they differ or need extras)
IMPORT_TO_PACKAGE = {
    "fastapi": "fastapi", "flask": "flask", "django": "django",
    "starlette": "starlette", "uvicorn": "uvicorn[standard]",
    "gunicorn": "gunicorn", "hypercorn": "hypercorn",
    "streamlit": "streamlit", "gradio": "gradio", "dash": "dash",
    "numpy": "numpy", "pandas": "pandas", "scipy": "scipy",
    "sklearn": "scikit-learn", "torch": "torch", "tensorflow": "tensorflow",
    "matplotlib": "matplotlib", "seaborn": "seaborn", "plotly": "plotly",
    "PIL": "pillow", "cv2": "opencv-python-headless", "skimage": "scikit-image",
    "requests": "requests", "httpx": "httpx", "aiohttp": "aiohttp",
    "bs4": "beautifulsoup4", "lxml": "lxml", "selenium": "selenium",
    "pydantic": "pydantic", "pydantic_settings": "pydantic-settings",
    "sqlalchemy": "sqlalchemy", "alembic": "alembic",
    "psycopg2": "psycopg2-binary", "psycopg": "psycopg[binary]",
    "pymysql": "pymysql", "sqlite3": None, "pymongo": "pymongo",
    "redis": "redis", "celery": "celery", "kombu": "kombu",
    "jinja2": "jinja2", "markupsafe": "markupsafe",
    "dotenv": "python-dotenv", "yaml": "pyyaml", "toml": "toml",
    "jose": "python-jose[cryptography]", "jwt": "pyjwt",
    "passlib": "passlib", "bcrypt": "bcrypt", "cryptography": "cryptography",
    "authlib": "authlib", "multipart": "python-multipart",
    "boto3": "boto3", "botocore": "botocore", "google": "google-cloud-storage",
    "openai": "openai", "anthropic": "anthropic", "tiktoken": "tiktoken",
    "langchain": "langchain", "transformers": "transformers",
    "docker": "docker", "click": "click", "typer": "typer", "rich": "rich",
    "pytest": None, "dateutil": "python-dateutil", "pytz": "pytz",
    "orjson": "orjson", "ujson": "ujson", "websockets": "websockets",
    "socketio": "python-socketio", "graphene": "graphene", "strawberry": "strawberry-graphql",
    "tqdm": "tqdm", "joblib": "joblib", "statsmodels": "statsmodels",
    "openpyxl": "openpyxl", "xlsxwriter": "xlsxwriter", "docx": "python-docx",
    "fitz": "pymupdf", "pypdf": "pypdf", "reportlab": "reportlab",
    "magic": "python-magic", "slugify": "python-slugify",
    "email_validator": "email-validator", "httptools": "httptools",
    "aiofiles": "aiofiles", "asyncpg": "asyncpg", "motor": "motor",
    "apscheduler": "apscheduler", "schedule": "schedule",
    "loguru": "loguru", "structlog": "structlog", "sentry_sdk": "sentry-sdk",
    "prometheus_client": "prometheus-client",
}

STDLIB = set(getattr(sys, "stdlib_module_names", set())) | {
    "__future__", "typing_extensions",
}


@dataclass
class BuildPlan:
    """Everything the Dockerfile generator needs."""
    app_root: Path                      # directory used as the Docker build context
    mode: str                           # script | uvicorn | gunicorn | streamlit | django | dockerfile
    entry_file: str | None = None       # e.g. "app/main.py" (relative to app_root)
    module_path: str | None = None      # e.g. "app.main"
    app_var: str | None = None          # e.g. "app"
    port: int = DEFAULT_PORT
    python_version: str = "3.11"
    packages: list[str] = field(default_factory=list)
    requirements: str | None = None     # relative path to requirements.txt
    notes: list[str] = field(default_factory=list)

    @property
    def start_command(self) -> list[str]:
        if self.mode == "uvicorn":
            return ["uvicorn", f"{self.module_path}:{self.app_var}",
                    "--host", "0.0.0.0", "--port", str(self.port)]
        if self.mode == "gunicorn":
            return ["gunicorn", f"{self.module_path}:{self.app_var}",
                    "--bind", f"0.0.0.0:{self.port}", "--workers", "2",
                    "--timeout", "120"]
        if self.mode == "streamlit":
            return ["streamlit", "run", self.entry_file or "app.py",
                    "--server.port", str(self.port),
                    "--server.address", "0.0.0.0",
                    "--server.headless", "true"]
        if self.mode == "django":
            return ["python", self.entry_file or "manage.py", "runserver",
                    f"0.0.0.0:{self.port}"]
        return ["python", self.entry_file or "app.py"]


# ---------------------------------------------------------------------------
# Step 1 — unwrap the zip
# ---------------------------------------------------------------------------

def find_project_root(bundle_dir: Path) -> Path:
    """Descend through pointless wrapper folders created by zipping a folder.

    `zip -r proj.zip myproject/` produces a single top-level `myproject/`.
    Some tools nest twice. Keep descending while the current directory holds
    exactly one real subdirectory and no files that matter.
    """
    current = bundle_dir
    for _ in range(5):
        entries = [p for p in current.iterdir() if p.name not in {"__MACOSX", ".DS_Store"}]
        dirs = [p for p in entries if p.is_dir()]
        files = [p for p in entries if p.is_file()]
        meaningful = [f for f in files if f.suffix in {".py", ".txt", ".toml", ".cfg"}
                      or f.name in PROJECT_MARKERS or f.name == "Dockerfile"]
        if len(dirs) == 1 and not meaningful:
            current = dirs[0]
        else:
            break
    return current


# ---------------------------------------------------------------------------
# Step 2 — find the directory that is actually the Python service
# ---------------------------------------------------------------------------

def _walk(root: Path):
    """Yield files under root, skipping ignored directories."""
    for p in root.rglob("*"):
        if any(part in IGNORE_DIRS for part in p.parts[len(root.parts):]):
            continue
        yield p


def _score_root(candidate: Path, project_root: Path) -> int:
    score = 0
    for marker in PROJECT_MARKERS:
        if (candidate / marker).exists():
            score += 40
    if (candidate / "Dockerfile").exists():
        score += 25
    for name in ENTRY_NAMES:
        if (candidate / name).exists():
            score += 30
    # A package dir holding an entry file, e.g. backend/app/main.py
    for sub in candidate.iterdir() if candidate.is_dir() else []:
        if sub.is_dir() and sub.name not in IGNORE_DIRS:
            if any((sub / n).exists() for n in ENTRY_NAMES):
                score += 20
                break
    if candidate.name.lower() in PREFERRED_ROOT_NAMES:
        score += 10
    # Shallower is better
    depth = len(candidate.relative_to(project_root).parts)
    score -= depth * 6
    # Reward actual Python content
    py_count = sum(1 for p in candidate.rglob("*.py")
                   if not any(x in IGNORE_DIRS for x in p.parts))
    score += min(py_count, 20)
    return score


def pick_app_root(project_root: Path) -> Path:
    """Choose which directory becomes the Docker build context."""
    candidates = [project_root]
    for p in project_root.rglob("*"):
        if not p.is_dir():
            continue
        rel = p.relative_to(project_root).parts
        if any(part in IGNORE_DIRS for part in rel):
            continue
        if len(rel) > 3:
            continue
        # only consider dirs that contain Python somewhere
        if not any(f.suffix == ".py" for f in p.rglob("*.py")):
            continue
        candidates.append(p)

    best = max(candidates, key=lambda c: _score_root(c, project_root))
    return best


# ---------------------------------------------------------------------------
# Step 3 + 4 — entry point AND how to run it
# ---------------------------------------------------------------------------

_ASGI_FRAMEWORKS = {"FastAPI", "Starlette"}
_WSGI_FRAMEWORKS = {"Flask", "Quart"}


def _analyse_module(path: Path) -> dict:
    """Parse one .py file and report what kind of program it is.

    Uses the `ast` module rather than regex so that a mention inside a
    string or comment does not produce a false positive.
    """
    info = {
        "has_main_guard": False,
        "asgi_var": None,
        "wsgi_var": None,
        "runs_server": False,
        "is_streamlit": False,
        "port": None,
    }
    try:
        source = path.read_text(encoding="utf-8", errors="ignore")
        tree = ast.parse(source)
    except Exception:
        return info

    if re.search(r"^\s*import\s+streamlit|^\s*from\s+streamlit", source, re.M):
        info["is_streamlit"] = True

    for node in ast.walk(tree):
        # if __name__ == "__main__":
        if isinstance(node, ast.If):
            test = node.test
            if (isinstance(test, ast.Compare)
                    and isinstance(test.left, ast.Name)
                    and test.left.id == "__name__"):
                info["has_main_guard"] = True

        # app = FastAPI(...) / app = Flask(__name__)
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            fn = node.value.func
            name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", None)
            if name in _ASGI_FRAMEWORKS or name in _WSGI_FRAMEWORKS:
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        key = "asgi_var" if name in _ASGI_FRAMEWORKS else "wsgi_var"
                        if info[key] is None:
                            info[key] = target.id

        # app.run(...) / uvicorn.run(...) — and pull the port out
        if isinstance(node, ast.Call):
            fn = node.func
            fname = getattr(fn, "attr", None) or getattr(fn, "id", None)
            if fname in {"run", "serve"}:
                info["runs_server"] = True
                for kw in node.keywords:
                    if kw.arg == "port" and isinstance(kw.value, ast.Constant):
                        if isinstance(kw.value.value, int):
                            info["port"] = kw.value.value

    return info


def _entry_candidates(app_root: Path, strict: bool = True) -> list[Path]:
    """Python files that could plausibly be the entry point.

    `strict` applies the filters that help on real projects: skip tests,
    migrations, docs and very deep files. Those filters are wrong for a
    single-file upload that happens to be called test_app.py, so when strict
    filtering finds nothing the caller retries with strict=False and takes
    whatever Python is actually there.
    """
    out = []
    for p in app_root.rglob("*.py"):
        rel = p.relative_to(app_root).parts
        if any(part in IGNORE_DIRS for part in rel):
            continue
        if strict:
            if any(part in NON_ENTRY_DIRS for part in rel):
                continue
            if p.name.startswith("test_") or p.name == "conftest.py":
                continue
            if len(rel) > 4:
                continue
        out.append(p)
    return out


def detect_entry(app_root: Path) -> tuple[Path | None, dict, str]:
    """Return (entry_path, module_info, reason)."""
    # 1. Procfile wins — the author told us explicitly.
    procfile = app_root / "Procfile"
    if procfile.exists():
        for line in procfile.read_text(errors="ignore").splitlines():
            if line.lower().startswith("web:"):
                cmd = line.split(":", 1)[1].strip()
                m = re.search(r"([\w./]+\.py)", cmd)
                if m and (app_root / m.group(1)).exists():
                    p = app_root / m.group(1)
                    return p, _analyse_module(p), "Procfile web: directive"
                m = re.search(r"([\w.]+):(\w+)", cmd)
                if m:
                    mod = m.group(1).replace(".", "/") + ".py"
                    if (app_root / mod).exists():
                        p = app_root / mod
                        return p, _analyse_module(p), "Procfile ASGI/WSGI target"

    candidates = _entry_candidates(app_root, strict=True)
    if not candidates:
        # Nothing survived the filters. A lone test_app.py or a script inside
        # scripts/ is still a perfectly good entry point when it is all there
        # is, so fall back to every Python file in the project.
        candidates = _entry_candidates(app_root, strict=False)
    if not candidates:
        return None, {}, "no Python files found"

    analysed = [(p, _analyse_module(p)) for p in candidates]

    def rank(item):
        p, info = item
        rel = p.relative_to(app_root)
        s = 0
        if p.name in ENTRY_NAMES:
            s += 100 - ENTRY_NAMES.index(p.name) * 5
        if info["asgi_var"] or info["wsgi_var"]:
            s += 80
        if info["has_main_guard"]:
            s += 40
        if info["runs_server"]:
            s += 30
        if info["is_streamlit"]:
            s += 60
        # prefer shallow files, but a package's main.py is fine
        s -= (len(rel.parts) - 1) * 8
        # a file named after a worker/cli is usually not the web entry
        if any(x in rel.parts for x in ("worker", "cli", "jobs", "tasks")):
            s -= 70
        return s

    analysed.sort(key=rank, reverse=True)
    best, info = analysed[0]
    rel = best.relative_to(app_root)
    reason = f"{rel} (framework instance)" if (info["asgi_var"] or info["wsgi_var"]) \
        else f"{rel} (standard name / __main__ guard)"
    return best, info, reason


def choose_mode(entry: Path, info: dict, app_root: Path) -> str:
    if (app_root / "manage.py").exists() and entry.name == "manage.py":
        return "django"
    if info.get("is_streamlit"):
        return "streamlit"
    # THE IMPORTANT CASE: a framework instance with no way to start itself.
    if info.get("asgi_var") and not (info.get("has_main_guard") and info.get("runs_server")):
        return "uvicorn"
    if info.get("wsgi_var") and not (info.get("has_main_guard") and info.get("runs_server")):
        return "gunicorn"
    return "script"


# ---------------------------------------------------------------------------
# Step 5 — dependencies
# ---------------------------------------------------------------------------

def _local_module_names(app_root: Path) -> set[str]:
    """Top-level names that resolve to files/packages inside the project.

    Without this, a project that does `from app.config import settings`
    makes Silo try to `pip install app`, which fails or installs something
    unrelated from PyPI.
    """
    names = set()
    for p in app_root.iterdir():
        if p.is_dir() and p.name not in IGNORE_DIRS:
            names.add(p.name)
        elif p.suffix == ".py":
            names.add(p.stem)
    return names


def scan_imports(app_root: Path) -> set[str]:
    found = set()
    for p in app_root.rglob("*.py"):
        rel = p.relative_to(app_root).parts
        if any(part in IGNORE_DIRS for part in rel):
            continue
        try:
            tree = ast.parse(p.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    found.add(a.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom):
                if node.level == 0 and node.module:
                    found.add(node.module.split(".")[0])
    return found


def find_requirements(app_root: Path) -> str | None:
    direct = app_root / "requirements.txt"
    if direct.exists():
        return "requirements.txt"
    for p in sorted(app_root.rglob("requirements*.txt"),
                    key=lambda x: len(x.relative_to(app_root).parts)):
        rel = p.relative_to(app_root)
        if any(part in IGNORE_DIRS for part in rel.parts):
            continue
        if "dev" in p.name or "test" in p.name:
            continue
        return str(rel).replace("\\", "/")
    return None


def resolve_packages(app_root: Path, mode: str, has_requirements: bool) -> list[str]:
    local = _local_module_names(app_root)
    imports = scan_imports(app_root)
    pkgs: set[str] = set()

    for name in sorted(imports):
        if name in STDLIB or name in local:
            continue
        mapped = IMPORT_TO_PACKAGE.get(name, name)
        if mapped:
            pkgs.add(mapped)

    # The server we are going to launch must itself be installed.
    if mode == "uvicorn":
        pkgs.add("uvicorn[standard]")
    if mode == "gunicorn":
        pkgs.add("gunicorn")
    if mode == "streamlit":
        pkgs.add("streamlit")

    if has_requirements:
        # requirements.txt is authoritative; only add the server if missing.
        keep = {p for p in pkgs if p.split("[")[0] in {"uvicorn", "gunicorn", "streamlit"}}
        return sorted(keep)

    return sorted(pkgs)


def detect_python_version(app_root: Path) -> str:
    """Pick an image tag. Newer syntax needs a newer interpreter."""
    version = "3.11"
    for p in app_root.rglob("*.py"):
        if any(x in IGNORE_DIRS for x in p.relative_to(app_root).parts):
            continue
        try:
            src = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if re.search(r"^\s*type\s+\w+\s*=", src, re.M):
            return "3.12"
        if re.search(r"^\s*match\s+.+:\s*$", src, re.M):
            version = "3.12"
    # honour an explicit declaration
    pyproject = app_root / "pyproject.toml"
    if pyproject.exists():
        m = re.search(r'requires-python\s*=\s*"[^0-9]*(\d+)\.(\d+)', pyproject.read_text(errors="ignore"))
        if m:
            return f"{m.group(1)}.{m.group(2)}"
    return version


def detect_port(app_root: Path, entry: Path | None, info: dict) -> int:
    if info.get("port"):
        return int(info["port"])
    search_files = [entry] if entry else []
    search_files += [p for p in app_root.rglob("*.py")
                     if not any(x in IGNORE_DIRS for x in p.relative_to(app_root).parts)][:60]
    patterns = [
        r"\.run\([^)]*port\s*=\s*(\d{2,5})",
        r"uvicorn\.run\([^)]*port\s*=\s*(\d{2,5})",
        r'os\.environ\.get\(\s*["\']PORT["\']\s*,\s*["\']?(\d{2,5})',
        r'getenv\(\s*["\']PORT["\']\s*,\s*["\']?(\d{2,5})',
        r"(?:^|\s)PORT\s*[:=]\s*(\d{2,5})",
        r"\.listen\(\s*(\d{2,5})",
    ]
    for f in search_files:
        if not f or not f.exists():
            continue
        src = f.read_text(encoding="utf-8", errors="ignore")
        for pat in patterns:
            m = re.search(pat, src, re.M)
            if m:
                port = int(m.group(1))
                if 1 <= port <= 65535:
                    return port
    # Dockerfile / compose hints
    for name in ("Dockerfile", "docker-compose.yml", "docker-compose.yaml"):
        f = app_root / name
        if f.exists():
            m = re.search(r"EXPOSE\s+(\d{2,5})", f.read_text(errors="ignore"))
            if m:
                return int(m.group(1))
    return DEFAULT_PORT


def repair_host_binding(app_root: Path) -> list[str]:
    """Rewrite 127.0.0.1 / localhost bindings to 0.0.0.0.

    Inside a container, binding to localhost means the process is only
    reachable from within that container. Docker's published port then
    connects to nothing and the app looks dead.
    """
    changed = []
    pattern = re.compile(r'(host\s*=\s*["\'])(?:127\.0\.0\.1|localhost)(["\'])')
    for p in app_root.rglob("*.py"):
        rel = p.relative_to(app_root)
        if any(x in IGNORE_DIRS for x in rel.parts):
            continue
        try:
            src = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if pattern.search(src):
            p.write_text(pattern.sub(r"\g<1>0.0.0.0\g<2>", src), encoding="utf-8")
            changed.append(str(rel).replace("\\", "/"))
    return changed


# ---------------------------------------------------------------------------
# Put it all together
# ---------------------------------------------------------------------------

def make_plan(bundle_dir: Path) -> BuildPlan:
    project_root = find_project_root(bundle_dir)
    app_root = pick_app_root(project_root)
    notes: list[str] = []

    if project_root != bundle_dir:
        rel = project_root.relative_to(bundle_dir)
        notes.append(f"Unwrapped archive into: {rel}/")
    if app_root != project_root:
        rel = app_root.relative_to(project_root)
        notes.append(f"Selected app root: {rel}/")

    # If the project ships its own Dockerfile, trust it.
    if (app_root / "Dockerfile").exists():
        port = detect_port(app_root, None, {})
        notes.append("Project has its own Dockerfile — using it as-is")
        return BuildPlan(app_root=app_root, mode="dockerfile", port=port, notes=notes)

    repaired = repair_host_binding(app_root)
    if repaired:
        notes.append(f"Rewrote localhost binding to 0.0.0.0 in: {', '.join(repaired[:3])}")

    entry, info, reason = detect_entry(app_root)
    if entry is None:
        raise ValueError(
            "Could not find a Python entry point. Silo looked for main.py, app.py, "
            "server.py, run.py, a Procfile, or a file defining a FastAPI/Flask app."
        )

    mode = choose_mode(entry, info, app_root)
    rel_entry = str(entry.relative_to(app_root)).replace("\\", "/")
    module_path = rel_entry[:-3].replace("/", ".")
    app_var = info.get("asgi_var") or info.get("wsgi_var")

    port = detect_port(app_root, entry, info)
    requirements = find_requirements(app_root)
    packages = resolve_packages(app_root, mode, requirements is not None)
    python_version = detect_python_version(app_root)

    notes.append(f"Entry point: {rel_entry} — {reason}")
    if mode == "uvicorn":
        notes.append(
            f"'{rel_entry}' defines an ASGI app but never starts a server, "
            f"so Silo runs it with uvicorn {module_path}:{app_var}"
        )
    elif mode == "gunicorn":
        notes.append(
            f"'{rel_entry}' defines a WSGI app but never starts a server, "
            f"so Silo runs it with gunicorn {module_path}:{app_var}"
        )

    return BuildPlan(
        app_root=app_root,
        mode=mode,
        entry_file=rel_entry,
        module_path=module_path,
        app_var=app_var,
        port=port,
        python_version=python_version,
        packages=packages,
        requirements=requirements,
        notes=notes,
    )


DOCKERIGNORE = """\
__pycache__/
*.pyc
.venv/
venv/
env/
node_modules/
.git/
.pytest_cache/
.mypy_cache/
.ruff_cache/
*.sqlite3
.DS_Store
"""


# Packages that commonly have no prebuilt wheel and need a C compiler.
NEEDS_COMPILER = (
    "psycopg2", "mysqlclient", "lxml", "pyodbc", "uwsgi", "python-ldap",
    "pycurl", "cryptography", "pillow-simd", "numpy==", "scipy==",
    "cffi", "gevent", "confluent-kafka", "python-snappy", "pyarrow==",
)


def _needs_compiler(plan: "BuildPlan") -> bool:
    """True only when a dependency is likely to be built from source."""
    names = [p.lower() for p in plan.packages]
    if plan.requirements:
        try:
            text = (plan.app_root / plan.requirements).read_text(
                encoding="utf-8", errors="ignore")
            names += [ln.strip().lower() for ln in text.splitlines()
                      if ln.strip() and not ln.startswith("#")]
        except Exception:
            pass
    return any(marker in n for n in names for marker in NEEDS_COMPILER)


def render_dockerfile(plan: BuildPlan) -> str:
    lines = [
        f"FROM python:{plan.python_version}-slim",
        "ENV PYTHONUNBUFFERED=1 \\",
        "    PYTHONDONTWRITEBYTECODE=1 \\",
        "    PIP_DISABLE_PIP_VERSION_CHECK=1 \\",
        "    PIP_NO_CACHE_DIR=1",
        "WORKDIR /app",
        "",
    ]

    # A C toolchain is only installed when something actually needs to compile.
    # Installing build-essential unconditionally adds ~200MB and several
    # minutes to EVERY build, and almost nothing needs it: the vast majority
    # of PyPI packages ship prebuilt wheels for linux/amd64.
    if _needs_compiler(plan):
        lines += [
            "# One of the dependencies has no prebuilt wheel and must compile.",
            "RUN apt-get update && apt-get install -y --no-install-recommends \\",
            "        build-essential \\",
            "    && rm -rf /var/lib/apt/lists/*",
            "",
        ]

    # Install dependencies before copying source so Docker can cache the layer.
    if plan.requirements:
        lines += [
            f"COPY {plan.requirements} ./{plan.requirements}",
            f"RUN pip install --no-cache-dir -r {plan.requirements}",
            "",
        ]
    if plan.packages:
        quoted = " ".join(f'"{p}"' for p in plan.packages)
        lines += [f"RUN pip install --no-cache-dir {quoted}", ""]

    lines += [
        "COPY . .",
        "",
        f"ENV PORT={plan.port} PYTHONPATH=/app",
        f"EXPOSE {plan.port}",
        "",
        "CMD [" + ", ".join(f'"{c}"' for c in plan.start_command) + "]",
        "",
    ]
    return "\n".join(lines)
