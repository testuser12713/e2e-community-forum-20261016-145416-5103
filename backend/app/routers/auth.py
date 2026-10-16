"""Registration, sign-in, refresh rotation, logout and password change."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.services.tokens import (
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_PATH,
    issue_refresh_token,
    revoke_refresh_token,
    rotate_refresh_token,
)
from shared.config import get_settings
from shared.db import get_db
from shared.models import User
from shared.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    RegisterRequest,
    TokenResponse,
)
from shared.schemas.users import UserOut

router = APIRouter(tags=["auth"])

SECONDS_PER_DAY = 86_400


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Attach the rotating refresh token as the contract's httpOnly cookie."""
    settings = get_settings()
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        max_age=settings.refresh_token_ttl_days * SECONDS_PER_DAY,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response) -> None:
    """Remove the refresh cookie on logout."""
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH, httponly=True)


def _token_response(user: User) -> TokenResponse:
    """The contract's token body, built from a user row."""
    return TokenResponse(
        access_token=create_access_token(user),
        token_type="bearer",
        expires_in=get_settings().access_token_ttl_seconds,
        user=UserOut.model_validate(user),
    )


@router.post("/api/auth/register", response_model=UserOut, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> UserOut:
    """Create an account; duplicate username or e-mail answers 409 on the field."""
    username = payload.username
    email = payload.email.strip().lower()

    if db.scalar(select(User.id).where(User.username == username)) is not None:
        raise api_error(
            "conflict",
            "This username is already taken",
            409,
            {"username": "This username is already taken"},
        )
    if db.scalar(select(User.id).where(func.lower(User.email) == email)) is not None:
        raise api_error(
            "conflict",
            "This e-mail address is already registered",
            409,
            {"email": "This e-mail address is already registered"},
        )

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
        role="user",
        karma=0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/api/auth/login", response_model=TokenResponse)
def login(
    payload: LoginRequest, response: Response, db: Session = Depends(get_db)
) -> TokenResponse:
    """Verify credentials, issue an access token and set the refresh cookie.

    The contract keeps the body shape ``{email, password}``; its value may be
    either the e-mail address or the username, resolved case-insensitively.
    """
    identity = payload.email.strip().lower()
    user = db.scalars(
        select(User).where(
            or_(
                func.lower(User.email) == identity,
                func.lower(User.username) == identity,
            )
        )
    ).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise api_error("invalid_credentials", "E-mail or password is incorrect", 401)

    raw_token = issue_refresh_token(db, user)
    db.commit()
    _set_refresh_cookie(response, raw_token)
    return _token_response(user)


@router.post("/api/auth/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    """Rotate the refresh cookie: the old token is revoked, both tokens renewed."""
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    user, new_raw_token = rotate_refresh_token(db, raw_token)
    db.commit()
    _set_refresh_cookie(response, new_raw_token)
    return _token_response(user)


@router.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
    """Revoke the presented refresh token server-side and clear the cookie."""
    raw_token = request.cookies.get(REFRESH_COOKIE_NAME)
    revoke_refresh_token(db, raw_token)
    db.commit()
    _clear_refresh_cookie(response)


@router.post("/api/auth/password", status_code=204)
def change_password(
    payload: PasswordChangeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Change the signed-in user's password after verifying the current one."""
    if not verify_password(payload.current_password, user.password_hash):
        raise api_error(
            "wrong_password",
            "The current password is incorrect",
            400,
            {"current_password": "The current password is incorrect"},
        )
    user.password_hash = hash_password(payload.new_password)
    db.add(user)
    db.commit()
