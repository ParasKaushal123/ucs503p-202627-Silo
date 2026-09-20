import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .db import SessionLocal
from .models import BuildLog, Proposal, Release, Version
from .routes.apps import router as apps_router
from .routes.auth import router as auth_router
from .routes.health import router as health_router
from .routes.proposals import router as proposals_router
from .routes.proxy import router as proxy_router
from .routes.security import router as security_router
from .routes.versions import router as versions_router
from .routes.workbench import router as workbench_router
from .services.builder import build_is_running

log = logging.getLogger("silo")


def _recover_interrupted_builds() -> None:
    """Fail any version left mid-build when the server last stopped.

    Builds run in a detached child process, so most restarts are harmless --
    the build carries on and updates the row when it finishes. But if the
    machine was rebooted, or the worker itself crashed, the row stays on
    "building" forever and the UI polls a spinner that never resolves.

    Each running build holds a PID lock file, so we can tell the two apart:
    a version whose worker is still alive is left completely alone.
    """
    db = SessionLocal()
    try:
        stale = list(db.scalars(select(Version).where(Version.status.in_(["building", "pending"]))))
        orphaned = [v for v in stale if not build_is_running(v.id)]
        for version in orphaned:
            version.status = "failed"
            for release in db.scalars(
                select(Release).where(
                    Release.version_id == version.id, Release.status == "deploying"
                )
            ):
                release.status = "failed"
            db.add(
                BuildLog(
                    version_id=version.id,
                    phase="build",
                    level="error",
                    message=(
                        "Build was interrupted before it finished (the server or "
                        "machine restarted). Upload this version again to retry."
                    ),
                )
            )
        if orphaned:
            db.commit()
            log.warning("Marked %d orphaned build(s) as failed", len(orphaned))
    except Exception as e:
        log.warning("Could not recover interrupted builds: %s", e)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _recover_interrupted_builds()
    with SessionLocal() as db:
        for proposal in db.scalars(select(Proposal).where(Proposal.status == "generating")):
            proposal.status = "failed"
            proposal.error = "Generation was interrupted. Regenerate the proposal to retry."
        db.commit()
    yield


app = FastAPI(title="Silo API", lifespan=lifespan)


@app.middleware("http")
async def origin_guard(request, call_next):
    origin = request.headers.get("origin")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
        if origin != settings.web_origin:
            return JSONResponse({"detail": "Request origin is not allowed"}, status_code=403)
    return await call_next(request)


app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(apps_router)
app.include_router(versions_router)
app.include_router(proxy_router)
app.include_router(workbench_router)
app.include_router(proposals_router)
app.include_router(security_router)
