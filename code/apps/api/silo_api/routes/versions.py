import json
import shutil
import subprocess
import sys
import tempfile
import uuid
import zipfile
from datetime import datetime
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import App, BuildLog, Draft, Release, Version
from ..routes.apps import get_current_user_id
from ..services import builder
from ..services.access import app_access
from ..services.workspace import capabilities, import_directory, source_hash

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
    created_at: datetime


class BuildLogOut(BaseModel):
    id: str
    phase: str
    level: str
    message: str
    created_at: datetime


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
    app_obj, _ = app_access(db, app_id, user_id, "owner")

    max_ver = db.scalar(select(func.max(Version.version_no)).where(Version.app_id == app_id))
    version_no = (max_ver or 0) + 1

    try:
        bundle_dir = Path(settings.bundle_storage_path).resolve() / app_obj.slug / str(uuid.uuid4())
        bundle_dir.mkdir(parents=True, exist_ok=False)

        content = await file.read(8_000_001)
        if len(content) > 8_000_000:
            raise HTTPException(413, "Upload exceeds 8 MB")
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=Path(file.filename or ".tmp").suffix)
        try:
            with open(tmp_fd, "wb") as tmp_file:
                tmp_file.write(content)

            if file.filename and file.filename.lower().endswith(".zip"):
                with zipfile.ZipFile(tmp_path) as zf:
                    _safe_extract(zf, bundle_dir)
            else:
                shutil.copy2(tmp_path, bundle_dir / Path(file.filename or "app.py").name)
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
    db.flush()
    files, draft = _upload_snapshot(db, app_obj, bundle_dir, version_no)
    if any(bundle_dir.rglob("index.html")) and not any(bundle_dir.rglob("*.py")):
        if not files:
            raise HTTPException(422, "Static app exceeds the 150 file / 3 MB text limit")
        release = Release(
            app_id=app_id,
            draft_id=draft.id,
            actor_id=user_id,
            label=f"Uploaded v{version_no}",
            version_id=version.id,
            version_no=version_no,
            source_hash=source_hash(files),
            files_json=json.dumps(files),
            capabilities_json=json.dumps(capabilities(files)),
            status="published",
        )
        for previous in db.scalars(
            select(Release).where(Release.app_id == app_id, Release.status == "published")
        ):
            previous.status = "superseded"
        db.add(release)
        db.flush()
        version.status = "live"
        app_obj.approved_version_id = release.id
        db.add(
            BuildLog(
                version_id=version.id,
                phase="detect",
                message="Detected static HTML/CSS/JavaScript application",
            )
        )
        db.add(
            BuildLog(
                version_id=version.id,
                phase="deploy",
                message="Saved immutable source snapshot and published the static application",
            )
        )
        db.commit()
        db.refresh(version)
        return version
    # An owner's upload replaces the live app once its build is healthy; the
    # builder promotes this release (see builder._settle_upload_release).
    db.add(
        Release(
            app_id=app_id,
            draft_id=draft.id,
            actor_id=user_id,
            label=f"Uploaded v{version_no}",
            version_id=version.id,
            version_no=version_no,
            source_hash=source_hash(files),
            files_json=json.dumps(files),
            capabilities_json=json.dumps(capabilities(files)),
            status="deploying",
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Another version was uploaded. Retry this upload.")
    db.refresh(version)

    _launch_build(version.id, f"{app_obj.slug}-{version.id[:8]}", str(bundle_dir), background_tasks)
    return version


def _upload_snapshot(db: Session, app_obj: App, bundle_dir: Path, version_no: int):
    """Return the upload's source files and the app's shared draft, creating it if needed.

    Python projects may exceed Workbench limits; they still build from the bundle,
    so their release simply carries no editable source.
    """
    try:
        files = import_directory(bundle_dir)
    except HTTPException:
        files = {}
    draft = db.scalar(select(Draft).where(Draft.app_id == app_obj.id))
    if not draft:
        seed = files or {
            str(uuid.uuid4()): {
                "path": "README.md",
                "content": f"# {app_obj.name}\n\nUpload your source files to begin.\n",
            }
        }
        draft = Draft(
            app_id=app_obj.id,
            files_json=json.dumps(seed),
            base_files_json=json.dumps(seed),
            base_version_no=version_no,
        )
        db.add(draft)
        db.flush()
    return files, draft


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
            [sys.executable, "-m", "silo_api.build_worker", version_id, app_slug, bundle_path],
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
    if len(zf.infolist()) > 400 or sum(e.file_size for e in zf.infolist()) > 8_000_000:
        raise HTTPException(413, "Archive exceeds extraction limits")
    for member in zf.infolist():
        name = member.filename
        if name.startswith("__MACOSX/") or name.endswith(".DS_Store"):
            continue
        target = (dest / name).resolve()
        if not target.is_relative_to(dest):
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
    app_access(db, app_id, user_id)
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
    app_access(db, v.app_id, user_id)
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
    app_access(db, v.app_id, user_id)
    return list(
        db.scalars(
            select(BuildLog)
            .where(BuildLog.version_id == version_id)
            .order_by(BuildLog.created_at, BuildLog.id)
        )
    )
