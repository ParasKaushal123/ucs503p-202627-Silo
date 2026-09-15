"""Reverse proxy – serves running Docker containers through the backend.

GET/POST /proxy/{app_id}
GET/POST /proxy/{app_id}/{path:path}

Looks up the app's live version, finds its internal_port (the host port Docker
assigned), and forwards the request to http://localhost:{port}/{path}.
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import App, Version
from ..routes.apps import get_current_user_id

router = APIRouter(tags=["proxy"])

_http = httpx.AsyncClient(timeout=30.0)


async def _proxy(request: Request, app_id: str, path: str, db: Session):
    """Forward request to the Docker container for the given app."""
    app = db.get(App, app_id)
    if not app:
        raise HTTPException(404, "App not found")

    # Find the latest live version
    version = db.scalar(
        select(Version)
        .where(Version.app_id == app_id, Version.status == "live")
        .order_by(Version.version_no.desc())
    )
    if not version or not version.internal_port:
        raise HTTPException(404, "No live version running")

    target = f"http://localhost:{version.internal_port}/{path}"

    # Forward query string
    if request.url.query:
        target += f"?{request.url.query}"

    # Forward headers (strip host)
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("cookie", None)  # Don't leak session to user app

    try:
        body = await request.body()
        resp = await _http.request(
            method=request.method,
            url=target,
            headers=headers,
            content=body if body else None,
        )
    except httpx.ConnectError:
        raise HTTPException(502, "App container is not responding")
    except httpx.TimeoutException:
        raise HTTPException(504, "App container timed out")

    # Build response headers — skip hop-by-hop headers
    skip = {"transfer-encoding", "connection", "keep-alive"}
    resp_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in skip
    }

    return StreamingResponse(
        content=iter([resp.content]),
        status_code=resp.status_code,
        headers=resp_headers,
        media_type=resp.headers.get("content-type"),
    )


@router.api_route("/proxy/{app_id}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_root(
    request: Request,
    app_id: str,
    db: Session = Depends(get_db),
):
    return await _proxy(request, app_id, "", db)


@router.api_route("/proxy/{app_id}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_path(
    request: Request,
    app_id: str,
    path: str,
    db: Session = Depends(get_db),
):
    return await _proxy(request, app_id, path, db)
