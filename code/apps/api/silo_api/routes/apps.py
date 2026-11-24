import re

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import jwt
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import App, Membership, Version
from ..services import compose
from ..services.access import app_access

router = APIRouter(prefix="/apps", tags=["apps"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class AppCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class AppOut(BaseModel):
    id: str
    slug: str
    name: str
    description: str | None
    owner_id: str
    approved_version_id: str | None


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------


def get_current_user_id(request: Request) -> str:
    """Extract user ID from session cookie. Reusable as a FastAPI dependency."""
    raw = request.cookies.get("silo_session")
    if not raw:
        raise HTTPException(401, "Not authenticated")
    try:
        claims = jwt.decode(raw, settings.session_secret, algorithms=["HS256"])
        return claims["sub"]
    except Exception:
        raise HTTPException(401, "Invalid session")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:48] or "app"


def _teardown(slug: str) -> None:
    """Stop whatever this app left running.

    An app may have been deployed either as a single container named
    `silo-<slug>` or as a Compose project named `silo-<slug>`. Both are
    attempted; neither existing is fine.
    """
    try:
        compose.down(compose.project_name(slug))
    except Exception:
        pass

    try:
        import docker

        client = docker.from_env()
        try:
            client.containers.get(f"silo-{slug}").remove(force=True)
        except Exception:
            pass
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("", response_model=AppOut, status_code=201)
def create_app(
    body: AppCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    slug = slugify(body.name)
    base_slug = slug
    counter = 1
    while db.scalar(select(App).where(App.slug == slug)):
        slug = f"{base_slug}-{counter}"
        counter += 1

    app = App(
        slug=slug,
        name=body.name,
        description=body.description,
        owner_id=user_id,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return app


@router.get("", response_model=list[AppOut])
def list_apps(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return list(
        db.scalars(
            select(App)
            .where(
                or_(
                    App.owner_id == user_id,
                    App.id.in_(select(Membership.app_id).where(Membership.user_id == user_id)),
                )
            )
            .order_by(App.created_at.desc())
        )
    )


@router.get("/{app_id}", response_model=AppOut)
def get_app(
    app_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    app, _ = app_access(db, app_id, user_id)
    return app


@router.patch("/{app_id}", response_model=AppOut)
def update_app(
    app_id: str,
    body: AppCreate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    app, _ = app_access(db, app_id, user_id, "owner")
    app.name = body.name.strip()
    app.description = body.description
    db.commit()
    return app


@router.delete("/{app_id}", status_code=204)
def delete_app(
    app_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    app = db.get(App, app_id)
    if not app or app.owner_id != user_id:
        raise HTTPException(404, "App not found")

    _teardown(app.slug)
    _teardown_versions(db, app.id)
    db.delete(app)
    db.commit()


@router.delete("", status_code=204)
def delete_all_apps(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Delete every app belonging to the current user, stopping what they run."""
    apps = list(db.scalars(select(App).where(App.owner_id == user_id)))
    for app in apps:
        _teardown(app.slug)
        _teardown_versions(db, app.id)
        db.delete(app)
    db.commit()


def _teardown_versions(db, app_id):
    try:
        import docker

        client = docker.from_env()
        for version in db.scalars(select(Version).where(Version.app_id == app_id)):
            if version.container_id:
                if version.container_id.startswith("silo-"):
                    for container in client.containers.list(
                        all=True,
                        filters={
                            "label": f"com.docker.compose.project={version.container_id}",
                        },
                    ):
                        container.remove(force=True)
                else:
                    try:
                        client.containers.get(version.container_id).remove(force=True)
                    except docker.errors.NotFound:
                        pass
    except Exception:
        pass
