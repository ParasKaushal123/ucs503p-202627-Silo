"""One authorization policy for HTTP resources and the collaboration coordinator."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import App, Membership

ROLES = {"viewer": 0, "commenter": 1, "editor": 2, "owner": 3}


def app_access(db: Session, app_id: str, user_id: str, minimum: str = "viewer"):
    query = select(App).where(App.id == app_id)
    if minimum != "viewer":
        query = query.with_for_update()
    app = db.scalar(query)
    if not app:
        raise HTTPException(404, "App not found")
    role = (
        "owner"
        if app.owner_id == user_id
        else db.scalar(
            select(Membership.role).where(
                Membership.app_id == app_id, Membership.user_id == user_id
            )
        )
    )
    if role not in ROLES:
        raise HTTPException(404, "App not found")
    if ROLES[role] < ROLES[minimum]:
        raise HTTPException(403, f"Requires {minimum} access")
    return app, role
