import re

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import App

router = APIRouter(prefix="/apps", tags=["apps"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AppCreate(BaseModel):
    name: str
    description: str | None = None


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
        db.scalars(select(App).where(App.owner_id == user_id).order_by(App.created_at.desc()))
    )


@router.get("/{app_id}", response_model=AppOut)
def get_app(
    app_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    app = db.get(App, app_id)
    if not app:
        raise HTTPException(404, "App not found")
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
    db.delete(app)
    db.commit()
