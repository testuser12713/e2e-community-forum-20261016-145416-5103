"""Password hashing, access tokens and the role dependencies.

Argon2 hashes passwords; short-lived HS256 JWTs carry the identity. The token
payload rides in the ``Authorization: Bearer <token>`` header.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.errors import api_error
from shared.config import get_settings
from shared.db import get_db
from shared.models import User

TOKEN_TYPE_ACCESS = "access"

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash a plaintext password with Argon2."""
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Check a plaintext password against an Argon2 hash."""
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(user: User) -> str:
    """Issue a short-lived access token for a user."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "type": TOKEN_TYPE_ACCESS,
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an access token, or raise the 401 API error."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise api_error("invalid_token", "The access token is invalid or has expired", 401) from exc
    if payload.get("type") != TOKEN_TYPE_ACCESS or "sub" not in payload:
        raise api_error("invalid_token", "The access token is invalid or has expired", 401)
    return payload


def bearer_token(request: Request) -> str | None:
    """The bearer token of a request, or None when the header is absent."""
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def user_from_token(db: Session, token: str) -> User | None:
    payload = decode_access_token(token)
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise api_error("invalid_token", "The access token is invalid or has expired", 401) from exc
    return db.get(User, user_id)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """The authenticated user; 401 when the request carries no valid token."""
    token = bearer_token(request)
    if token is None:
        raise api_error("not_authenticated", "Authentication is required", 401)
    user = user_from_token(db, token)
    if user is None:
        raise api_error("not_authenticated", "Authentication is required", 401)
    return user


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """The authenticated user when a valid token is present, else None."""
    token = bearer_token(request)
    if token is None:
        return None
    try:
        return user_from_token(db, token)
    except Exception:
        return None


def require_role(*roles: str) -> Callable[..., User]:
    """Dependency factory: the caller must hold one of the given roles (else 403)."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise api_error("forbidden", "You do not have the required role for this action", 403)
        return user

    return dependency
