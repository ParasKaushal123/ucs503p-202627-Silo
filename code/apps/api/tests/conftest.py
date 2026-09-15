"""Shared test fixtures for the Silo API test suite."""

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from silo_api.config import settings
from silo_api.db import Base, get_db
from silo_api.main import app
from silo_api.models import User

# Use an in-memory SQLite database for tests so we don't need Postgres running.
TEST_DB_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
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
def db_session():
    """Create tables before each test and drop them after."""
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
