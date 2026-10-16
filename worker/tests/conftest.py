"""Test setup for the worker: its own isolated PostgreSQL test database and schema.

The worker's suite never shares a database with the API's tests: it provisions
``<name>_worker_test`` (dropped and recreated per session) and builds the schema
from ``shared.models`` — the same definitions the worker runs against in
production. The tables are truncated between tests, and a test only sees the
rows it created itself.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from shared.config import reset_settings_cache
from shared.db import get_session_factory
from shared.models import Base

WORKER_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = WORKER_DIR.parent
for path in (REPO_ROOT, WORKER_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

BASE_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
if not BASE_DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set — the worker test suite runs against PostgreSQL "
        "(declare it in RUN.json as ${service:db.url} or export it before pytest)."
    )


def _test_database_url(base: str) -> str:
    url = make_url(base)
    name = url.database or "app"
    return url.set(database=f"{name}_worker_test").render_as_string(hide_password=False)


# Point the shared configuration at the isolated test database before any test
# imports a module that builds its engine.
TEST_DATABASE_URL = _test_database_url(BASE_DATABASE_URL)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
reset_settings_cache()


@pytest.fixture(scope="session", autouse=True)
def _provision_test_database() -> Iterator[None]:
    """Drop and recreate the worker's test database, then build the schema."""
    test_name = make_url(TEST_DATABASE_URL).database or "app_worker_test"
    admin_url = make_url(BASE_DATABASE_URL).set(database="postgres")
    admin_engine = create_engine(
        admin_url.render_as_string(hide_password=False), isolation_level="AUTOCOMMIT"
    )
    with admin_engine.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{test_name}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{test_name}"'))
    admin_engine.dispose()

    schema_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    Base.metadata.create_all(schema_engine)
    schema_engine.dispose()
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
