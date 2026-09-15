import shutil
import subprocess
import sys
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
from sqlalchemy import select
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import App, BuildLog, Version
from ..routes.apps import get_current_user_id
from ..services import builder

router = APIRouter(tags=["versions"])

# apps/api — the directory that contains the `silo_api` package. The build
# worker is launched from here so that `-m silo_api.build_worker` resolves.
_API_DIR = Path(__file__).resolve().parents[2]


class VersionOut(BaseModel):
    id: str
    app_id: str
    version_no: int
    status: str
    container_id: str | None
    internal_port: int | None


class BuildLogOut(BaseModel):
    id: str
    phase: str
    level: str
    message: str


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

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

    max_ver = db.scalar(select(func.max(Version.version_no)).where(Version.app_id == app_id))
    version_no = (max_ver or 0) + 1

    try:
        bundle_dir = Path(settings.bundle_storage_path).resolve() / app_obj.slug / str(version_no)
        if bundle_dir.exists():
            shutil.rmtree(bundle_dir, ignore_errors=True)
        bundle_dir.mkdir(parents=True, exist_ok=True)

        content = await file.read()
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=file.filename or ".tmp")
        try:
            with open(tmp_fd, "wb") as tmp_file:
                tmp_file.write(content)

            if file.filename and file.filename.lower().endswith(".zip"):
                with zipfile.ZipFile(tmp_path) as zf:
                    _safe_extract(zf, bundle_dir)
            else:
                shutil.copy2(tmp_path, bundle_dir / (file.filename or "app.py"))
        finally:
            Path(tmp_path).unlink(missing_ok=True)
    except zipfile.BadZipFile:
        raise HTTPException(400, "That .zip file is corrupt or not a zip archive.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Failed to save upload: {exc}")

    version = Version(
        app_id=app_id,
        version_no=version_no,
        bundle_path=str(bundle_dir),
        status="building",
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    _launch_build(version.id, app_obj.slug, str(bundle_dir), background_tasks)
    return version


def _launch_build(
    version_id: str,
    app_slug: str,
    bundle_path: str,
    background_tasks: BackgroundTasks,
) -> None:
    """Start the build in a detached child process.

    A FastAPI background task would run inside the server process, so a
    --reload restart (or Ctrl+C, or a crash) would kill the build halfway
    and leave the version stuck on "building". A detached process survives
    all of that.

    If spawning fails for any reason we fall back to a background task, so
    uploads still work rather than failing outright.
    """
    log_dir = Path(settings.bundle_storage_path).parent / "worker-logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{version_id}.log"

    creationflags = 0
    start_new_session = False
    if sys.platform == "win32":
        DETACHED_PROCESS = 0x00000008
        CREATE_NEW_PROCESS_GROUP = 0x00000200
        creationflags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        start_new_session = True

    try:
        handle = open(log_file, "wb")
        subprocess.Popen(
            [sys.executable, "-m", "silo_api.build_worker",
             version_id, app_slug, bundle_path],
            cwd=str(_API_DIR),
            stdout=handle,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=creationflags,
            start_new_session=start_new_session,
            close_fds=True,
        )
    except Exception:
        background_tasks.add_task(builder.run_build, version_id, app_slug, bundle_path)


def _safe_extract(zf: zipfile.ZipFile, dest: Path) -> None:
    """Extract a zip, refusing entries that escape the destination folder.

    A crafted archive can contain paths like `../../etc/passwd`. This makes
    the check explicit and also skips macOS resource-fork noise.
    """
    dest = dest.resolve()
    for member in zf.infolist():
        name = member.filename
        if name.startswith("__MACOSX/") or name.endswith(".DS_Store"):
            continue
        target = (dest / name).resolve()
        if not str(target).startswith(str(dest)):
            raise HTTPException(400, f"Unsafe path in archive: {name}")
        zf.extract(member, dest)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

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


@router.get("/versions/{version_id}/logs", response_model=list[BuildLogOut])
def get_version_logs(
    version_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """The real build logs for a version — what actually happened."""
    v = db.get(Version, version_id)
    if not v:
        raise HTTPException(404, "Version not found")
    return list(
        db.scalars(
            select(BuildLog)
            .where(BuildLog.version_id == version_id)
            .order_by(BuildLog.created_at, BuildLog.id)
        )
    )
