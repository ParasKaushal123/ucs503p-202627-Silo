"""Compatibility redirects. User code is never served from the API origin."""

from urllib.parse import parse_qsl, quote, urlencode, urlsplit

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.access import app_access
from .apps import get_current_user_id
from .workbench import app_preview

router = APIRouter(tags=["proxy"])


def redirect_runtime(request: Request, app_id: str, path: str, db: Session):
    user_id = get_current_user_id(request)
    app, _ = app_access(db, app_id, user_id)
    ticket = urlsplit(app_preview(app.id, None, user_id, db)["url"])
    query = parse_qsl(request.url.query) + parse_qsl(ticket.query)
    target = f"{ticket.scheme}://{ticket.netloc}/{quote(path, safe='/')}?{urlencode(query)}"
    return RedirectResponse(target, status_code=307)


@router.get("/proxy/{app_id}")
def proxy_root(request: Request, app_id: str, db: Session = Depends(get_db)):
    return redirect_runtime(request, app_id, "", db)


@router.get("/proxy/{app_id}/{path:path}")
def proxy_path(request: Request, app_id: str, path: str, db: Session = Depends(get_db)):
    return redirect_runtime(request, app_id, path, db)
