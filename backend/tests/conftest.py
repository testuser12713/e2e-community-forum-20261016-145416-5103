"""Test setup: an isolated PostgreSQL test database, migrated and truncated
between tests, plus a TestClient that runs the app's real lifespan.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parents[1]

BASE_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not BASE_DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set — the test suite runs against PostgreSQL. "
        "Export it (or declare it in RUN.json as ${service:db.url}) before running pytest."
    )


def _test_database_url(base: str) -> str:
    url = make_url(base)
    name = url.database or "app"
    return url.set(database=f"{name}_test").render_as_string(hide_password=False)


# Point every module of the app at the isolated test database before anything
# imports shared.config or shared.db.
TEST_DATABASE_URL = _test_database_url(BASE_DATABASE_URL)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from shared.config import reset_settings_cache  # noqa: E402
from shared.db import get_session_factory  # noqa: E402

reset_settings_cache()


@pytest.fixture(scope="session", autouse=True)
def _provision_test_database() -> Iterator[None]:
    """Drop and recreate the test database, then migrate it to head."""
    test_name = make_url(TEST_DATABASE_URL).database
    admin_url = make_url(BASE_DATABASE_URL).set(database="postgres")
    admin_engine = create_engine(
        admin_url.render_as_string(hide_password=False), isolation_level="AUTOCOMMIT"
    )
    with admin_engine.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{test_name}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{test_name}"'))
    admin_engine.dispose()

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.attributes["sqlalchemy_url"] = TEST_DATABASE_URL
    command.upgrade(config, "head")
    yield


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_database(db_engine: Engine) -> Iterator[None]:
    """Leave every table empty for the next test."""
    yield
    with db_engine.begin() as connection:
        tables = (
            connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))
            .scalars()
            .all()
        )
        names = [name for name in tables if name != "alembic_version"]
        if names:
            quoted = ", ".join(f'"{name}"' for name in names)
            connection.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))


@pytest.fixture()
def db_session() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
