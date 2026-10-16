"""The forum's categories: public listing plus administration."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.errors import not_implemented
from app.security import require_role
from shared.schemas.categories import CategoryCreate, CategoryOrder, CategoryOut, CategoryUpdate

router = APIRouter(tags=["categories"])

admin_only = [Depends(require_role("moderator", "admin"))]


@router.get("/api/categories", response_model=list[CategoryOut])
def list_categories() -> list[CategoryOut]:
    raise not_implemented("the category list (#7)")


@router.post(
    "/api/admin/categories",
    response_model=CategoryOut,
    status_code=201,
    dependencies=admin_only,
)
def create_category(payload: CategoryCreate) -> CategoryOut:
    raise not_implemented("category management (#7)")


@router.patch(
    "/api/admin/categories/{id}",
    response_model=CategoryOut,
    dependencies=admin_only,
)
def update_category(id: int, payload: CategoryUpdate) -> CategoryOut:
    raise not_implemented("category management (#7)")


@router.delete("/api/admin/categories/{id}", status_code=204, dependencies=admin_only)
def delete_category(id: int) -> None:
    raise not_implemented("category management (#7)")


@router.put(
    "/api/admin/categories/order",
    response_model=list[CategoryOut],
    dependencies=admin_only,
)
def reorder_categories(payload: CategoryOrder) -> list[CategoryOut]:
    raise not_implemented("category management (#7)")
