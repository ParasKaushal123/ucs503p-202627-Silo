from pathlib import Path
from urllib.parse import urlsplit

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
    local_auth_enabled: bool = False
    cookie_secure: bool = False
    collab_url: str = "http://127.0.0.1:1234"
    collab_public_url: str = "ws://localhost:1234"
    runtime_port: int = 1234
    collab_service_secret: str = ""
    ai_api_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    # Setting only GEMINI_API_KEY uses Google's OpenAI-compatible endpoint below.
    gemini_api_key: str = ""
    # Comma-separated models tried in order when the main model is overloaded.
    ai_fallback_models: str = ""
    ai_reasoning_effort: str = ""
    ai_max_context_chars: int = 160_000
    # Run the Semgrep CLI (when installed) in addition to Silo's built-in rules.
    security_semgrep: bool = True


settings = Settings()

GEMINI_CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
GEMINI_DEFAULT_MODEL = "gemini-3.8-flash"
# Tried in order when Google reports the main model is under high demand or
# rate-limited; each is a separate capacity pool, so one is almost always free.
GEMINI_FALLBACK_MODELS = (
    "gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite,"
    "gemini-3.1-flash-lite,gemini-flash-lite-latest"
)


# A model on this machine (apps/local-ai) has a much smaller window than Gemini.
LOCAL_MAX_CONTEXT_CHARS = 24_000


def _is_local(url: str) -> bool:
    host = urlsplit(url).hostname or ""
    return host in {"localhost", "127.0.0.1", "::1"}


def _gemini() -> dict:
    model = GEMINI_DEFAULT_MODEL
    return {
        "url": GEMINI_CHAT_URL,
        "key": settings.gemini_api_key,
        "model": model,
        "gemini": True,
        "local": False,
        "reasoning_effort": settings.ai_reasoning_effort or "low",
        "max_chars": settings.ai_max_context_chars,
        "fallbacks": [m.strip() for m in GEMINI_FALLBACK_MODELS.split(",") if m.strip() != model],
    }


def ai_providers() -> list[dict]:
    """Chat-completions providers to try in order; empty when AI is off.

    AI_API_URL / AI_MODEL (and AI_API_KEY, unless the URL is on this machine)
    name the main provider, such as the local model. GEMINI_API_KEY on its own
    uses Gemini; next to another provider it becomes the backup used when that
    one cannot be reached.
    """
    providers = []
    url = settings.ai_api_url
    if url and url != GEMINI_CHAT_URL:
        local = _is_local(url)
        key = settings.ai_api_key or ("local" if local else "")
        if key and settings.ai_model:
            fallbacks = settings.ai_fallback_models
            providers.append(
                {
                    "url": url,
                    "key": key,
                    "model": settings.ai_model,
                    "gemini": False,
                    "local": local,
                    "reasoning_effort": "" if local else settings.ai_reasoning_effort,
                    "max_chars": min(settings.ai_max_context_chars, LOCAL_MAX_CONTEXT_CHARS)
                    if local
                    else settings.ai_max_context_chars,
                    "fallbacks": [
                        m.strip()
                        for m in fallbacks.split(",")
                        if m.strip() and m.strip() != settings.ai_model
                    ],
                }
            )
    key = settings.ai_api_key if url == GEMINI_CHAT_URL else settings.gemini_api_key
    if key:
        gemini = _gemini() | {"key": key}
        if url == GEMINI_CHAT_URL and settings.ai_model:
            gemini["model"] = settings.ai_model
        providers.append(gemini)
    return providers


def ai_provider() -> dict | None:
    """The first provider to try, or None when AI is off."""
    providers = ai_providers()
    return providers[0] if providers else None
