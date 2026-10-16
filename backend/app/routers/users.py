"""The signed-in user's account and public profiles."""

from __future__ import annotations

from fastapi import APIRouter

from app.errors import not_implemented
from shared.schemas.users import MeUpdate, PublicProfile, UserOut

router = APIRouter(tags=["users"])


@router.get("/api/me", response_model=UserOut)
def read_me() -> UserOut:
    raise not_implemented("the own profile (#10)")


@router.patch("/api/me", response_model=UserOut)
def update_me(payload: MeUpdate) -> UserOut:
    raise not_implemented("profile editing (#10)")


@router.get("/api/users/{username}", response_model=PublicProfile)
def read_profile(username: str) -> PublicProfile:
    raise not_implemented("public profiles (#10)")
