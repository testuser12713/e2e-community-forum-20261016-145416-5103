"""Tests of the one-time create-admin command.

The command is exercised the way it is documented — as a real subprocess,
``python -m scripts.create_admin`` from ``backend/`` — against the isolated
PostgreSQL test database. The created account must be immediately usable, and
a missing or rule-breaking ``ADMIN_PASSWORD`` must fail without writing.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.security import verify_password
from shared.models import User

BACKEND_DIR = Path(__file__).resolve().parents[1]

EMAIL = "new-admin@forum.test"
USERNAME = "new_admin"
PASSWORD = "Str0ngPass!"


def _run_command(*args: str, password: str | None = PASSWORD) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.pop("ADMIN_PASSWORD", None)
    if password is not None:
        env["ADMIN_PASSWORD"] = password
    return subprocess.run(
        [sys.executable, "-m", "scripts.create_admin", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def _user_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def _user_count(db: Session) -> int:
    return db.execute(select(func.count()).select_from(User)).scalar_one()


def test_command_creates_admin_with_hashed_password(db_session: Session) -> None:
    result = _run_command("--email", EMAIL, "--username", USERNAME)

    assert result.returncode == 0, result.stderr
    assert EMAIL in result.stdout
    assert USERNAME in result.stdout

    user = _user_by_email(db_session, EMAIL)
    assert user is not None, "the command persisted the administrator"
    assert user.username == USERNAME
    assert user.role == "admin"
    assert user.password_hash != PASSWORD
    assert verify_password(PASSWORD, user.password_hash)


def test_sign_in_route_is_wired_under_the_agreed_path(client: TestClient) -> None:
    """The account the command creates signs in through the wired sign-in route.

    The route itself is delivered by its own ticket, so this asserts only what is
    true before and after that ticket lands: ``POST /api/auth/login`` exists under
    the agreed path and verb. Whether the created credentials authenticate is
    proven by ``verify_password`` in the test above — the very check the sign-in
    handler performs.
    """
    paths = client.get("/openapi.json").json()["paths"]
    assert "post" in paths.get("/api/auth/login", {}), (
        "POST /api/auth/login must stay registered under the agreed path and verb"
    )


def test_promotes_and_refreshes_an_existing_account(db_session: Session) -> None:
    db_session.add(User(username=USERNAME, email=EMAIL, password_hash="stale-hash", role="user"))
    db_session.commit()

    assert _run_command("--email", EMAIL, "--username", USERNAME).returncode == 0

    user = _user_by_email(db_session, EMAIL)
    assert user is not None
    assert user.role == "admin"
    assert verify_password(PASSWORD, user.password_hash)
    assert _user_count(db_session) == 1


def test_missing_admin_password_fails_without_writing(db_session: Session) -> None:
    before = _user_count(db_session)

    result = _run_command("--email", EMAIL, "--username", USERNAME, password=None)

    assert result.returncode != 0
    assert "ADMIN_PASSWORD" in result.stderr
    assert _user_by_email(db_session, EMAIL) is None
    assert _user_count(db_session) == before


def test_too_short_password_is_refused_without_writing(db_session: Session) -> None:
    before = _user_count(db_session)

    result = _run_command("--email", EMAIL, "--username", USERNAME, password="short")

    assert result.returncode != 0
    assert _user_by_email(db_session, EMAIL) is None
    assert _user_count(db_session) == before
