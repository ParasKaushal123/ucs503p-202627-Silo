import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import App, BuildLog, Version
from ..routes.apps import get_current_user_id

router = APIRouter(tags=["versions"])

import re

DEFAULT_PORT = 5000

# Common import-name → pip-package mappings
IMPORT_TO_PACKAGE = {
    "flask": "flask",
    "fastapi": "fastapi uvicorn",
    "django": "django",
    "streamlit": "streamlit",
    "gradio": "gradio",
    "numpy": "numpy",
    "pandas": "pandas",
    "requests": "requests",
    "httpx": "httpx",
    "pydantic": "pydantic",
    "sqlalchemy": "sqlalchemy",
    "uvicorn": "uvicorn",
    "gunicorn": "gunicorn",
    "starlette": "starlette",
    "jinja2": "jinja2",
    "aiohttp": "aiohttp",
    "boto3": "boto3",
    "PIL": "pillow",
    "sklearn": "scikit-learn",
    "cv2": "opencv-python-headless",
    "bs4": "beautifulsoup4",
    "dotenv": "python-dotenv",
    "yaml": "pyyaml",
    "redis": "redis",
    "celery": "celery",
    "pymongo": "pymongo",
    "psycopg2": "psycopg2-binary",
}

SIMPLE_DOCKERFILE = """FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir {packages}
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi
EXPOSE {port}
CMD ["python", "{entrypoint}"]
"""


def _detect_port(bundle_dir: Path) -> int:
    """Scan .py files for port numbers in common patterns."""
    for py_file in bundle_dir.glob("**/*.py"):
        try:
            source = py_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        # Match patterns like: port=8000, port=5000, .run(port=8080), --port 3000
        for match in re.findall(
            r"""(?:port\s*[=:]\s*(\d{4,5}))"""
            r"""|(?:\.run\([^)]*port\s*=\s*(\d{4,5}))"""
            r"""|(?:uvicorn\.run\([^)]*port\s*=\s*(\d{4,5}))""",
            source,
        ):
            for group in match:
                if group:
                    port = int(group)
                    if 1024 <= port <= 65535:
                        return port
        # Check for uvicorn default (if they use uvicorn.run without port arg)
        if "uvicorn.run" in source or "import uvicorn" in source:
            return 8000
    return DEFAULT_PORT


def _scan_imports(bundle_dir: Path) -> list[str]:
    """Scan .py files for import statements and return pip packages to install."""
    packages: set[str] = set()
    for py_file in bundle_dir.glob("**/*.py"):
        try:
            source = py_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        # Match "import X" and "from X import ..."
        for match in re.findall(r"^(?:from|import)\s+([\w]+)", source, re.MULTILINE):
            pkg = IMPORT_TO_PACKAGE.get(match)
            if pkg:
                packages.update(pkg.split())
    return sorted(packages) if packages else ["flask", "gunicorn"]


class VersionOut(BaseModel):
    id: str
    app_id: str
    version_no: int
    status: str
    container_id: str | None
    internal_port: int | None


@router.post("/apps/{app_id}/versions", response_model=VersionOut, status_code=201)
async def upload_version(
    app_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    app_obj = db.get(App, app_id)
    if not app_obj or app_obj.owner_id != user_id:
        raise HTTPException(404, "App not found")

    # Determine version number
    max_ver = db.scalar(select(func.max(Version.version_no)).where(Version.app_id == app_id))
    version_no = (max_ver or 0) + 1

    # Save uploaded file
    try:
        bundle_dir = Path(settings.bundle_storage_path) / app_obj.slug / str(version_no)
        bundle_dir.mkdir(parents=True, exist_ok=True)

        content = await file.read()

        # Write to a temp file (close immediately for Windows compatibility)
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=file.filename or ".tmp")
        try:
            with open(tmp_fd, "wb") as tmp_file:
                tmp_file.write(content)

            # Extract if zip
            if file.filename and file.filename.endswith(".zip"):
                with zipfile.ZipFile(tmp_path) as zf:
                    zf.extractall(bundle_dir)
            else:
                # Single file upload
                target_name = file.filename or "app.py"
                shutil.copy2(tmp_path, bundle_dir / target_name)
        finally:
            Path(tmp_path).unlink(missing_ok=True)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Failed to save upload: {exc}")

    # Create version record
    version = Version(
        app_id=app_id,
        version_no=version_no,
        bundle_path=str(bundle_dir),
        status="building",
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    # Build in background
    background_tasks.add_task(_run_build, version.id, app_obj.slug, bundle_dir, db)

    return version


def _find_entrypoint(bundle_dir: Path) -> str:
    """Find the main Python file to run — simple heuristic, no inference engine."""
    # Prefer common names
    for name in ("main.py", "app.py", "server.py", "run.py"):
        if (bundle_dir / name).exists():
            return name
    # Fall back to the first .py file found
    py_files = list(bundle_dir.glob("*.py"))
    if py_files:
        return py_files[0].name
    return "app.py"


def _run_build(version_id: str, app_slug: str, bundle_dir: Path, db: Session):
    """Background task: build a Docker image and run the container."""
    version = db.get(Version, version_id)
    if not version:
        return

    logs: list[dict] = []

    def log(phase: str, message: str, level: str = "info"):
        logs.append({"phase": phase, "message": message, "level": level})

    try:
        import docker
    except ImportError:
        log("build", "Docker SDK not installed — run: pip install docker", "error")
        _save_logs_and_status(db, version, logs, success=False)
        return

    try:
        client = docker.from_env()
    except docker.errors.DockerException as e:
        log("build", f"Cannot connect to Docker — is Docker Desktop running? {e}", "error")
        _save_logs_and_status(db, version, logs, success=False)
        return

    # Find entrypoint
    entrypoint = _find_entrypoint(bundle_dir)
    log("setup", f"Entry point: {entrypoint}")

    # Scan imports to figure out what pip packages to install
    packages = _scan_imports(bundle_dir)
    log("setup", f"Detected packages: {', '.join(packages)}")

    # Detect the port the app listens on
    port = _detect_port(bundle_dir)
    log("setup", f"Detected port: {port}")

    # Generate a simple Dockerfile
    dockerfile = SIMPLE_DOCKERFILE.format(
        port=port, entrypoint=entrypoint, packages=" ".join(packages)
    )
    (bundle_dir / "Dockerfile").write_text(dockerfile)
    log("setup", "Generated Dockerfile")

    image_tag = f"silo-app-{app_slug}:v{version.version_no}"

    try:
        # Build image
        log("build", "Building Docker image...")
        _image, _build_logs = client.images.build(
            path=str(bundle_dir), tag=image_tag, rm=True
        )
        log("build", "Image built successfully")

        # Remove any existing container for this app
        try:
            old = client.containers.get(f"silo-{app_slug}")
            old.remove(force=True)
            log("deploy", "Removed previous container")
        except docker.errors.NotFound:
            pass

        # Run container
        container = client.containers.run(
            image_tag,
            detach=True,
            name=f"silo-{app_slug}",
            ports={f"{port}/tcp": None},
            mem_limit="256m",
            cpu_quota=50000,
        )
        log("deploy", f"Container started: {container.short_id}")

        # Get the assigned host port
        container.reload()
        host_port = container.ports.get(f"{port}/tcp", [{}])[0].get("HostPort")
        log("deploy", f"App running on http://localhost:{host_port}")

        _save_logs_and_status(
            db, version, logs, success=True,
            container_id=container.id,
            port=int(host_port) if host_port else DEFAULT_PORT,
        )

    except Exception as e:
        log("build", f"Build/deploy failed: {e}", "error")
        _save_logs_and_status(db, version, logs, success=False)


def _save_logs_and_status(
    db: Session,
    version: Version,
    logs: list[dict],
    success: bool,
    container_id: str | None = None,
    port: int | None = None,
):
    """Persist build logs and update version status."""
    from ..models import BuildLog

    for entry in logs:
        db.add(
            BuildLog(
                version_id=version.id,
                phase=entry["phase"],
                level=entry.get("level", "info"),
                message=entry["message"],
            )
        )

    if success:
        version.status = "live"
        version.container_id = container_id
        version.internal_port = port
    else:
        version.status = "failed"

    db.commit()


@router.get("/apps/{app_id}/versions", response_model=list[VersionOut])
def list_versions(
    app_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(Version).where(Version.app_id == app_id).order_by(Version.version_no.desc())
        )
    )


@router.get("/versions/{version_id}", response_model=VersionOut)
def get_version(
    version_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    v = db.get(Version, version_id)
    if not v:
        raise HTTPException(404, "Version not found")
    return v
