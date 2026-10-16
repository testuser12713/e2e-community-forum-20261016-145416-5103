"""Create (or promote) the first administrator account.

One-time, documented command (AC-35): run it from ``backend/`` as

    python -m scripts.create_admin --email admin@forum.test --username admin

The start password is read from the ``ADMIN_PASSWORD`` environment variable —
never from a literal default in the repository. The command refuses to run
without it and refuses a password that breaks the product's password rules.
It stores the password with the API's own Argon2 ``hash_password`` and prints
the resulting login.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Sequence

from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.security import hash_password
from shared.db import session_scope
from shared.models import User
from shared.schemas.auth import PASSWORD_MIN_LENGTH, RegisterRequest

EXIT_OK = 0
EXIT_USAGE = 2


class CreateAdminError(Exception):
    """A refusal: the command must not touch the database."""


def _read_password() -> str:
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not password:
        raise CreateAdminError(
            "ADMIN_PASSWORD is not set. Export it (see README) and run the command "
            "again — the administrator's start password is never stored in the repository."
        )
    return password


def _validate_credentials(email: str, username: str, password: str) -> None:
    """Reject input that breaks the product's own account rules.

    ``RegisterRequest`` is the single source of truth for those rules (username
    shape, e-mail shape, password length), so the command and the API agree.
    """
    try:
        RegisterRequest(username=username, email=email, password=password)
    except ValidationError as exc:
        messages = "; ".join(
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
            for error in exc.errors()
        )
        raise CreateAdminError(f"Invalid account data — {messages}") from exc


def _upsert_admin(db: Session, email: str, username: str, password: str) -> User:
    """Create the admin, or promote and refresh the matching existing account."""
    existing = db.execute(
        select(User).where(or_(User.email == email, User.username == username))
    ).scalar_one_or_none()
    if existing is not None:
        existing.email = email
        existing.username = username
        existing.password_hash = hash_password(password)
        existing.role = "admin"
        db.flush()
        return existing
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        role="admin",
    )
    db.add(user)
    db.flush()
    return user


def create_admin(email: str, username: str, password: str) -> User:
    """Persist the administrator and return the stored row."""
    _validate_credentials(email, username, password)
    with session_scope() as db:
        return _upsert_admin(db, email, username, password)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.create_admin",
        description="Create the first administrator account (start password from ADMIN_PASSWORD).",
    )
    parser.add_argument("--email", required=True, help="the administrator's e-mail address")
    parser.add_argument("--username", required=True, help="the administrator's user name")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        password = _read_password()
        # Bring a fresh database up to schema before writing, so the documented
        # one-time command works on a cloned repository without a manual migration.
        from app.main import run_migrations

        run_migrations()
        user = create_admin(args.email, args.username, password)
    except CreateAdminError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return EXIT_USAGE
    print(
        "Administrator ready: "
        f"username={user.username} email={user.email} role={user.role} "
        f"(password length {PASSWORD_MIN_LENGTH}+, from ADMIN_PASSWORD)"
    )
    return EXIT_OK


if __name__ == "__main__":
    raise SystemExit(main())
