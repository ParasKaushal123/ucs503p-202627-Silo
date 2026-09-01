from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parent.parent  # apps/api
_ROOT_DIR = _API_DIR.parent.parent  # silo/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[_API_DIR / ".env", _ROOT_DIR / ".env"],
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://silo:silo@localhost:5432/silo"
    session_secret: str = "dev-only-change-me"
    google_client_id: str = ""
    google_client_secret: str = ""
    oauth_redirect_uri: str = "http://localhost:8000/auth/callback"
    web_origin: str = "http://localhost:3000"
    bundle_storage_path: str = "./data/bundles"


settings = Settings()
