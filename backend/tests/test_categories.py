"""Tests of the categories API: ordering, administration, roles and error shapes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import AuditLog, Category, Thread, User


def _make_user(db: Session, username: str, role: str = "user") -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _make_category(db: Session, name: str, slug: str, position: int) -> Category:
    category = Category(name=name, slug=slug, description=None, position=position)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _make_thread(db: Session, category: Category, author: User, title: str) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title=title,
        body_markdown="body",
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def test_categories_are_ordered_by_position_and_count_threads(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "writer")
    _make_category(db_session, "Third", "third", 3)
    first = _make_category(db_session, "First", "first", 1)
    _make_category(db_session, "Second", "second", 2)
    _make_thread(db_session, first, author, "A first thread")

    response = client.get("/api/categories")
    assert response.status_code == 200
    body = response.json()
    assert [category["name"] for category in body] == ["First", "Second", "Third"]
    assert [category["position"] for category in body] == [1, 2, 3]
    counts = {category["slug"]: category["thread_count"] for category in body}
    assert counts == {"first": 1, "second": 0, "third": 0}


def test_admin_creates_a_category_and_writes_an_audit_entry(
    client: TestClient, db_session: Session
) -> None:
    admin = _make_user(db_session, "boss", role="admin")

    response = client.post(
        "/api/admin/categories",
        json={"name": "Announcements", "slug": "announcements", "description": "News"},
        headers=_auth(admin),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["slug"] == "announcements"
    assert body["description"] == "News"
    assert body["thread_count"] == 0

    audit = db_session.scalars(select(AuditLog).where(AuditLog.action == "category.create")).all()
    assert len(audit) == 1
    assert audit[0].actor_id == admin.id
    assert audit[0].target_type == "category"
    assert audit[0].target_id == body["id"]


def test_duplicate_slug_answers_409_with_the_field_named(
    client: TestClient, db_session: Session
) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    _make_category(db_session, "General", "general", 1)

    response = client.post(
        "/api/admin/categories",
        json={"name": "Other", "slug": "general"},
        headers=_auth(admin),
    )
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "conflict"
    assert "slug" in error["fields"]


def test_update_missing_category_answers_404(client: TestClient, db_session: Session) -> None:
    admin = _make_user(db_session, "boss", role="admin")

    response = client.patch(
        "/api/admin/categories/9999",
        json={"name": "Nope"},
        headers=_auth(admin),
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_deleting_a_category_with_threads_answers_409(
    client: TestClient, db_session: Session
) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    author = _make_user(db_session, "writer")
    category = _make_category(db_session, "General", "general", 1)
    _make_thread(db_session, category, author, "A thread")

    response = client.delete(f"/api/admin/categories/{category.id}", headers=_auth(admin))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"
    assert db_session.get(Category, category.id) is not None


def test_deleting_an_empty_category_succeeds(client: TestClient, db_session: Session) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    category = _make_category(db_session, "General", "general", 1)

    response = client.delete(f"/api/admin/categories/{category.id}", headers=_auth(admin))
    assert response.status_code == 204
    remaining = db_session.execute(select(Category.id).where(Category.id == category.id)).first()
    assert remaining is None


def test_reorder_and_edit_change_the_public_order(client: TestClient, db_session: Session) -> None:
    admin = _make_user(db_session, "boss", role="admin")
    first = _make_category(db_session, "First", "first", 1)
    second = _make_category(db_session, "Second", "second", 2)
    third = _make_category(db_session, "Third", "third", 3)

    response = client.put(
        "/api/admin/categories/order",
        json={"ids": [third.id, first.id, second.id]},
        headers=_auth(admin),
    )
    assert response.status_code == 200
    assert [category["slug"] for category in response.json()] == ["third", "first", "second"]

    response = client.patch(
        f"/api/admin/categories/{second.id}",
        json={"name": "Renamed"},
        headers=_auth(admin),
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"

    public = client.get("/api/categories").json()
    assert [category["slug"] for category in public] == ["third", "first", "second"]
    assert public[-1]["name"] == "Renamed"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/api/admin/categories", {"name": "X", "slug": "x"}),
        ("PATCH", "/api/admin/categories/1", {"name": "X"}),
        ("DELETE", "/api/admin/categories/1", None),
        ("PUT", "/api/admin/categories/order", {"ids": [1]}),
    ],
)
def test_normal_user_is_forbidden_on_every_write(
    client: TestClient, db_session: Session, method: str, path: str, body: dict | None
) -> None:
    user = _make_user(db_session, "plain")

    response = client.request(method, path, json=body, headers=_auth(user))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_writes_require_authentication(client: TestClient, db_session: Session) -> None:
    _make_category(db_session, "General", "general", 1)

    response = client.delete("/api/admin/categories/1")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_create_validation_error_uses_the_contract_shape(
    client: TestClient, db_session: Session
) -> None:
    admin = _make_user(db_session, "boss", role="admin")

    response = client.post(
        "/api/admin/categories",
        json={"name": "", "slug": "Not A Slug"},
        headers=_auth(admin),
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["fields"]
