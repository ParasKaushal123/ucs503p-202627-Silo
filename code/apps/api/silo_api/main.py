from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .routes.apps import router as apps_router
from .routes.auth import router as auth_router
from .routes.health import router as health_router
from .routes.versions import router as versions_router

app = FastAPI(title="Silo API")

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
