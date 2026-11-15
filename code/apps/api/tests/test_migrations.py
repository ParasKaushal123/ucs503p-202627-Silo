import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import Session

from silo_api.models import App, BuildLog, User, Version


def test_fresh_alembic_database_supports_cascading_app_delete(tmp_path):
    api_root = Path(__file__).resolve().parents[1]
    url = "sqlite:///" + (tmp_path / "migrated.db").as_posix()
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=api_root,
        env=dict(os.environ, DATABASE_URL=url),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    engine = create_engine(url)

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    assert inspect(engine).get_foreign_keys("versions")[0]["options"]["ondelete"] == "CASCADE"
    with Session(engine) as session:
        session.add(User(id="migration-user", email="migration@test.local", google_sub="migration"))
        session.commit()
        session.add(
            App(id="migration-app", slug="migration-app", name="App", owner_id="migration-user")
        )
        session.commit()
        session.add(Version(id="migration-version", app_id="migration-app", version_no=1))
        session.commit()
        session.add(BuildLog(version_id="migration-version", phase="test", message="A real log"))
        session.commit()
    with Session(engine) as session:
        session.delete(session.get(App, "migration-app"))
        session.commit()
        assert session.get(Version, "migration-version") is None
    engine.dispose()
