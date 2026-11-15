"""Shared test fixtures for the Silo API test suite."""

import sys

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from silo_api.config import settings
from silo_api.db import Base, get_db
from silo_api.main import app
from silo_api.models import User
from silo_api.services import compose

# Use an in-memory SQLite database for tests so we don't need Postgres running.
TEST_DB_URL = "sqlite://"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

TEST_USER_ID = "test-user-id"
TEST_EMAIL = "test@example.com"


# SQLite doesn't enforce FK constraints by default — turn them on.
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def db_session(monkeypatch):
    """Create tables before each test and drop them after."""
    # Ordinary tests must never discover or mutate a developer's Docker daemon.
    monkeypatch.setitem(sys.modules, "docker", None)
    monkeypatch.setattr(compose, "down", lambda *args, **kwargs: None)
    # Never call a real AI provider with a key from the developer's .env.
    for name in ("gemini_api_key", "ai_api_url", "ai_api_key", "ai_model", "ai_fallback_models"):
        monkeypatch.setattr(settings, name, "")
    # Tests use Silo's built-in rules; the Semgrep CLI is slow and may not be installed.
    monkeypatch.setattr(settings, "security_semgrep", False)
    Base.metadata.create_all(bind=engine)
    session = TestSession()

    # Seed a test user so FK constraints pass.
    test_user = User(
        id=TEST_USER_ID,
        email=TEST_EMAIL,
        name="Test User",
        google_sub="google-test-sub",
    )
    session.add(test_user)
    session.commit()

    def _override():
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_cookies() -> dict:
    """Return kwargs to pass to TestClient methods for an authenticated request."""
    token = jwt.encode(
        {"sub": TEST_USER_ID, "email": TEST_EMAIL, "exp": 9999999999},
        settings.session_secret,
        algorithm="HS256",
    )
    return {"cookies": {"silo_session": token}}
