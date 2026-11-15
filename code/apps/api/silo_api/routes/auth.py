import hashlib
import hmac
import secrets
import time

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from jose import jwt
from pydantic import BaseModel, Field
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


def issue_session(response: Response, user: User):
    token = jwt.encode(
        {"sub": user.id, "email": user.email, "exp": int(time.time()) + 604800},
        settings.session_secret,
        algorithm="HS256",
    )
    response.set_cookie(
        "silo_session",
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=604800,
    )
    return {"authenticated": True, "id": user.id, "email": user.email, "name": user.name}


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)
    name: str = Field(default="", max_length=80)


def password_digest(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 310000).hex()


@router.get("/config")
def auth_config():
    return {"local": settings.local_auth_enabled, "google": bool(settings.google_client_id)}


@router.post("/register", status_code=201)
def register(body: Credentials, response: Response, db: Session = Depends(get_db)):
    if not settings.local_auth_enabled:
        raise HTTPException(403, "Local accounts are disabled; use Google sign-in")
    email = body.email.strip().lower()
    if "@" not in email or any(c.isspace() for c in email):
        raise HTTPException(422, "Enter a valid email address")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    salt = secrets.token_hex(16)
    user = User(
        email=email,
        name=body.name.strip() or email.split("@")[0],
        google_sub=f"local:{secrets.token_hex(20)}",
        password_hash=f"{salt}${password_digest(body.password, salt)}",
    )
    db.add(user)
    db.commit()
    return issue_session(response, user)


@router.post("/password")
def password_login(body: Credentials, response: Response, db: Session = Depends(get_db)):
    if not settings.local_auth_enabled:
        raise HTTPException(403, "Local accounts are disabled")
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    encoded = user.password_hash if user else None
    salt, digest = encoded.split("$", 1) if encoded else ("missing", "0" * 64)
    valid = hmac.compare_digest(password_digest(body.password, salt), digest)
    if not user or not encoded or not valid:
        raise HTTPException(401, "Incorrect email or password")
    return issue_session(response, user)


@router.get("/login")
async def login(request: Request):
    next_path = request.query_params.get("next", "/dashboard")
    request.session["login_next"] = (
        next_path if next_path.startswith("/") and not next_path.startswith("//") else "/dashboard"
    )
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

    destination = request.session.pop("login_next", "/dashboard")
    resp = RedirectResponse(f"{settings.web_origin}{destination}")
    resp.set_cookie(
        "silo_session",
        session_jwt,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
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
