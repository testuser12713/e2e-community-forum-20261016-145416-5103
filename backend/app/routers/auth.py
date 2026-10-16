"""Registration, sign-in and session tokens."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from app.errors import not_implemented
from shared.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    RegisterRequest,
    TokenResponse,
)
from shared.schemas.users import UserOut

router = APIRouter(tags=["auth"])


@router.post("/api/auth/register", response_model=UserOut, status_code=201)
def register(payload: RegisterRequest) -> UserOut:
    raise not_implemented("registration (#35)")


@router.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, response: Response) -> TokenResponse:
    raise not_implemented("sign-in (#35)")


@router.post("/api/auth/refresh", response_model=TokenResponse)
def refresh(response: Response) -> TokenResponse:
    raise not_implemented("refresh rotation (#35)")


@router.post("/api/auth/logout", status_code=204)
def logout() -> None:
    raise not_implemented("logout (#35)")


@router.post("/api/auth/password", status_code=204)
def change_password(payload: PasswordChangeRequest) -> None:
    raise not_implemented("password change (#35)")
