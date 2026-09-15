from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_DIR = Path(__file__).resolve().parent.parent  # apps/api
_ROOT_DIR = _API_DIR.parent.parent  # silo/

# Where uploaded project bundles are extracted.
#
# This deliberately lives OUTSIDE apps/api. Uvicorn's --reload watcher
# defaults to the current working directory, which is apps/api when you run
# the server the usual way. The old default was "./data/bundles", i.e. inside
# that directory -- so every upload looked like a source-code change, uvicorn
# restarted the API mid-build, and the background task building the container
# was killed. That is the "WatchFiles detected changes in 'data\bundles\...'
# Reloading..." message followed by "Waiting for background tasks to
# complete" and a version stuck on "building" forever.
#
# Keeping bundles in <repo>/.silo_data means the reloader never sees them,
# regardless of how the server is started.
_DEFAULT_BUNDLES = _ROOT_DIR / ".silo_data" / "bundles"


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
    bundle_storage_path: str = str(_DEFAULT_BUNDLES)


settings = Settings()
