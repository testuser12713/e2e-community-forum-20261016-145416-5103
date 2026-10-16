"""Authentication request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from shared.schemas.users import UserOut

PASSWORD_MIN_LENGTH = 8


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_]+$")
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
