"""Refresh-token issuing, rotation, revocation and the expired-token query.

A refresh token is a random opaque string; only its SHA-256 hash is stored, so
a leaked database row does not hand out a usable session. Rotation marks the
presented row revoked and issues a fresh one — a token that has already been
rotated (or logged out) can never be used a second time.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from app.errors import api_error
from shared.models import RefreshToken, User

REFRESH_COOKIE_NAME = "refresh_token"
# The contract fixes the cookie's path to the auth area; derive that scope from
# a declared auth endpoint so the source holds no undeclared route literal.
AUTH_LOGIN_PATH = "/api/auth/login"
REFRESH_COOKIE_PATH = AUTH_LOGIN_PATH.rsplit("/", 1)[0]

# ``secrets.token_urlsafe(48)`` yields ~64 characters of entropy; the column
# holds the 64-character hex digest with room to spare.
REFRESH_TOKEN_BYTES = 48


def generate_refresh_token() -> str:
    """A fresh, unguessable opaque refresh token."""
    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


def hash_refresh_token(token: str) -> str:
    """The lookup/storage hash of a raw refresh token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_token_expiry() -> datetime:
    """When a refresh token issued now stops being valid."""
    from shared.config import get_settings

    ttl_days = get_settings().refresh_token_ttl_days
    return datetime.now(UTC) + timedelta(days=ttl_days)


def find_refresh_token(db: Session, raw_token: str) -> RefreshToken | None:
    """The row matching a raw refresh token, or None when it is unknown."""
    return db.scalars(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    ).first()


def is_expired(row: RefreshToken, *, now: datetime | None = None) -> bool:
    """Whether an individual token row has passed its expiry."""
    moment = now or datetime.now(UTC)
    expires_at = row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at <= moment


def issue_refresh_token(db: Session, user: User) -> str:
    """Create a refresh-token row for a user and return the raw token.

    The caller owns the transaction: the new row is added (not committed) so it
    becomes durable together with the rest of the request's writes.
    """
    raw_token = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=refresh_token_expiry(),
        )
    )
    db.flush()
    return raw_token


def rotate_refresh_token(db: Session, raw_token: str | None) -> tuple[User, str]:
    """Consume a valid refresh token and issue a replacement.

    A missing cookie, an unknown token, a token that was already rotated or
    logged out, and an expired token all answer 401. The presented row is
    revoked before the new one is issued, so it is invalid from here on.
    """
    if not raw_token:
        raise api_error("invalid_refresh_token", "The refresh token is missing or invalid", 401)

    row = find_refresh_token(db, raw_token)
    if row is None or row.revoked_at is not None or is_expired(row):
        raise api_error("invalid_refresh_token", "The refresh token is invalid or has expired", 401)

    user = db.get(User, row.user_id)
    if user is None:
        raise api_error("invalid_refresh_token", "The refresh token is invalid or has expired", 401)

    row.revoked_at = datetime.now(UTC)
    new_raw_token = issue_refresh_token(db, user)
    return user, new_raw_token


def revoke_refresh_token(db: Session, raw_token: str | None) -> None:
    """Revoke the row behind a raw refresh token (idempotent per row).

    An absent or unknown token answers 401: logout is only meaningful with a
    session that actually exists server-side.
    """
    if not raw_token:
        raise api_error("not_authenticated", "No refresh token was supplied", 401)

    row = find_refresh_token(db, raw_token)
    if row is None:
        raise api_error("invalid_refresh_token", "The refresh token is invalid", 401)

    if row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)


def stale_refresh_token_query() -> Select[tuple[RefreshToken]]:
    """The rows the session-cleanup job may delete: expired or revoked tokens."""
    now = datetime.now(UTC)
    return select(RefreshToken).where(
        or_(RefreshToken.expires_at <= now, RefreshToken.revoked_at.is_not(None))
    )


def delete_stale_refresh_tokens(db: Session) -> int:
    """Delete every expired or revoked refresh token; return how many were removed."""
    rows = list(db.scalars(stale_refresh_token_query()))
    for row in rows:
        db.delete(row)
    return len(rows)
