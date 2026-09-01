import time

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import User

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login(request: Request):
    return await oauth.google.authorize_redirect(request, settings.oauth_redirect_uri)


@router.get("/callback")
async def callback(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    info = token["userinfo"]

    user = db.scalar(select(User).where(User.google_sub == info["sub"]))
    if user is None:
        user = User(
            email=info["email"],
            name=info.get("name"),
            google_sub=info["sub"],
        )
        db.add(user)
        db.commit()

    session_jwt = jwt.encode(
        {
            "sub": user.id,
            "email": user.email,
            "exp": int(time.time()) + 7 * 24 * 3600,
        },
        settings.session_secret,
        algorithm="HS256",
    )

    resp = RedirectResponse(f"{settings.web_origin}/dashboard")
    resp.set_cookie(
        "silo_session",
        session_jwt,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
    )
    return resp


@router.get("/me")
def me(request: Request):
    raw = request.cookies.get("silo_session")
    if not raw:
        return {"authenticated": False}
    try:
        claims = jwt.decode(raw, settings.session_secret, algorithms=["HS256"])
        return {"authenticated": True, "email": claims["email"], "id": claims["sub"]}
    except Exception:
        return {"authenticated": False}


@router.get("/logout")
def logout():
    resp = RedirectResponse(f"{settings.web_origin}/")
    resp.delete_cookie("silo_session")
    return resp
