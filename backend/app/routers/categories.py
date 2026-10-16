"""The forum's categories: public listing plus administration.

``GET /api/categories`` is public and returns the categories in the order an
administrator set; the admin endpoints (guarded by ``require_role``) create,
edit, reorder and delete categories and write an audit entry for each action.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import api_error
from app.security import require_role
from app.services.audit import record_audit
from shared.db import get_db
from shared.models import Category, Thread, User
from shared.schemas.categories import CategoryCreate, CategoryOrder, CategoryOut, CategoryUpdate

router = APIRouter(tags=["categories"])


def _thread_counts(db: Session) -> dict[int, int]:
    """Threads per category, counted over every row (deleted ones included)."""
    rows = db.execute(
        select(Thread.category_id, func.count(Thread.id)).group_by(Thread.category_id)
    ).all()
    return dict(rows)


def _category_out(category: Category, thread_count: int) -> CategoryOut:
    return CategoryOut(
        id=category.id,
        name=category.name,
        slug=category.slug,
        description=category.description,
        position=category.position,
        thread_count=thread_count,
    )


def _ordered_categories(db: Session) -> list[Category]:
    return list(db.scalars(select(Category).order_by(Category.position, Category.id)).all())


def _get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise api_error("not_found", "The category does not exist", 404)
    return category


def _ensure_unique_slug(db: Session, slug: str, exclude_id: int | None = None) -> None:
    stmt = select(Category.id).where(Category.slug == slug)
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise api_error(
            "conflict",
            "A category with this slug already exists",
            409,
            {"slug": "This slug is already in use"},
        )


def _ensure_unique_name(db: Session, name: str, exclude_id: int | None = None) -> None:
    stmt = select(Category.id).where(Category.name == name)
    if exclude_id is not None:
        stmt = stmt.where(Category.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise api_error(
            "conflict",
            "A category with this name already exists",
            409,
            {"name": "This name is already in use"},
        )


@router.get("/api/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)) -> list[CategoryOut]:
    counts = _thread_counts(db)
    return [
        _category_out(category, counts.get(category.id, 0)) for category in _ordered_categories(db)
    ]


@router.post("/api/admin/categories", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role("moderator", "admin")),
) -> CategoryOut:
    _ensure_unique_slug(db, payload.slug)
    _ensure_unique_name(db, payload.name)

    position = payload.position
    if position is None:
        position = (db.scalar(select(func.max(Category.position))) or 0) + 1

    category = Category(
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        position=position,
    )
    db.add(category)
    db.flush()
    record_audit(
        db,
        actor.id,
        "category.create",
        "category",
        category.id,
        {"name": category.name, "slug": category.slug, "position": category.position},
    )
    db.commit()
    return _category_out(category, 0)


@router.patch("/api/admin/categories/{id}", response_model=CategoryOut)
def update_category(
    id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role("moderator", "admin")),
) -> CategoryOut:
    category = _get_category(db, id)
    changes = payload.model_dump(exclude_unset=True)

    if "name" in changes and changes["name"] != category.name:
        _ensure_unique_name(db, changes["name"], exclude_id=id)
        category.name = changes["name"]
    if "description" in changes:
        category.description = changes["description"]
    if "position" in changes and changes["position"] is not None:
        category.position = changes["position"]

    record_audit(db, actor.id, "category.update", "category", category.id, changes)
    db.commit()

    thread_count = (
        db.scalar(select(func.count(Thread.id)).where(Thread.category_id == category.id)) or 0
    )
    return _category_out(category, thread_count)


@router.delete("/api/admin/categories/{id}", status_code=204)
def delete_category(
    id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role("moderator", "admin")),
) -> None:
    category = _get_category(db, id)
    thread_count = (
        db.scalar(select(func.count(Thread.id)).where(Thread.category_id == category.id)) or 0
    )
    if thread_count:
        raise api_error("conflict", "The category still contains threads", 409)

    record_audit(
        db,
        actor.id,
        "category.delete",
        "category",
        category.id,
        {"name": category.name, "slug": category.slug},
    )
    db.delete(category)
    db.commit()


@router.put("/api/admin/categories/order", response_model=list[CategoryOut])
def reorder_categories(
    payload: CategoryOrder,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role("moderator", "admin")),
) -> list[CategoryOut]:
    categories = _ordered_categories(db)
    by_id = {category.id: category for category in categories}

    missing = [category_id for category_id in payload.ids if category_id not in by_id]
    if missing:
        raise api_error("not_found", "The category does not exist", 404)

    ordered: list[Category] = []
    seen: set[int] = set()
    for category_id in payload.ids:
        if category_id not in seen:
            ordered.append(by_id[category_id])
            seen.add(category_id)
    ordered.extend(category for category in categories if category.id not in seen)

    for index, category in enumerate(ordered, start=1):
        category.position = index

    record_audit(db, actor.id, "category.reorder", "category", None, {"ids": payload.ids})
    db.commit()

    counts = _thread_counts(db)
    return [
        _category_out(category, counts.get(category.id, 0)) for category in _ordered_categories(db)
    ]
