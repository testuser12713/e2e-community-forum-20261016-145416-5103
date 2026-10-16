"""Tests of thread creation, reading, editing and soft deletion (#32).

Covers the contract of ``/api/threads`` and ``/api/threads/{id}``: who may
create, which category must exist, the sanitised ``body_html``, the ``notify``
job a mention enqueues, the edited marker, the soft delete that keeps the
thread's comments, and the error cases (401/403/404/422).
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import Ban, Category, Comment, Job, Thread, User


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


def _make_category(db: Session, name: str = "General", slug: str = "general") -> Category:
    category = Category(name=name, slug=slug, description="Everything", position=0)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _create_thread(
    client: TestClient,
    user: User,
    category: Category,
    *,
    title: str = "A brand new thread",
    body: str = "Hello **world**",
    tags: list[str] | None = None,
) -> dict:
    response = client.post(
        "/api/threads",
        json={
            "category_id": category.id,
            "title": title,
            "body_markdown": body,
            "tags": tags if tags is not None else ["intro"],
        },
        headers=_auth(user),
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_requires_authentication(client: TestClient, db_session: Session) -> None:
    category = _make_category(db_session)

    response = client.post(
        "/api/threads",
        json={"category_id": category.id, "title": "No auth", "body_markdown": "body"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_create_rejects_an_unknown_category(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "alice")

    response = client.post(
        "/api/threads",
        json={"category_id": 999999, "title": "Nowhere", "body_markdown": "body"},
        headers=_auth(user),
    )
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert "category_id" in body["error"]["fields"]


def test_create_returns_the_rendered_detail(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "alice", role="user")
    category = _make_category(db_session, "General", "general")

    detail = _create_thread(
        client,
        user,
        category,
        title="My first thread",
        body="Hello **world**",
        tags=["intro", "  hello  ", "intro", ""],
    )

    assert detail["title"] == "My first thread"
    assert detail["category_id"] == category.id
    assert detail["category_slug"] == "general"
    assert detail["category_name"] == "General"
    assert detail["tags"] == ["intro", "hello"], "tags are trimmed, de-duplicated and blank-free"
    assert "<strong>world</strong>" in detail["body_html"]
    assert detail["body_markdown"] == "Hello **world**"
    assert detail["score"] == 0
    assert detail["comment_count"] == 0
    assert detail["deleted"] is False
    assert detail["edited_at"] is None
    assert detail["author"] == {"id": user.id, "username": "alice", "karma": 0}


def test_create_strips_scripts_and_html_from_body_html(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "alice")
    category = _make_category(db_session)

    detail = _create_thread(
        client,
        user,
        category,
        body=(
            "**bold** and *italic*\n\n"
            "<script>alert('xss')</script>\n"
            "<img src=x onerror=\"alert('xss')\">\n"
            "<a href=\"javascript:alert('xss')\">click</a>"
        ),
    )

    html = detail["body_html"]
    assert "<strong>bold</strong>" in html
    assert "<em>italic</em>" in html
    assert "<script" not in html.lower()
    assert "<img" not in html.lower()
    assert '<a href="javascript' not in html.lower()
    assert "&lt;script&gt;" in html, "raw HTML is escaped and shown as text, never as an element"


def test_create_validation_error_uses_the_contract_shape(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "alice")
    category = _make_category(db_session)

    response = client.post(
        "/api/threads",
        json={"category_id": category.id, "title": "ab", "body_markdown": ""},
        headers=_auth(user),
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "title" in body["error"]["fields"]
    assert "body_markdown" in body["error"]["fields"]


def test_banned_user_cannot_create(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "alice")
    category = _make_category(db_session)
    db_session.add(Ban(user_id=user.id, reason="spam"))
    db_session.commit()

    response = client.post(
        "/api/threads",
        json={"category_id": category.id, "title": "Spam thread", "body_markdown": "body"},
        headers=_auth(user),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "banned"


def test_create_with_a_mention_enqueues_one_notify_job(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "alice")
    mentioned = _make_user(db_session, "bob")
    category = _make_category(db_session)

    detail = _create_thread(client, author, category, body=f"hello @{mentioned.username}!")

    jobs = db_session.scalars(select(Job).where(Job.kind == "notify")).all()
    assert len(jobs) == 1
    payload = jobs[0].payload
    assert payload["thread_id"] == detail["id"]
    assert payload["comment_id"] is None
    assert payload["actor_id"] == author.id
    assert payload["mentions"] == [mentioned.username]


def test_create_without_a_mention_enqueues_no_job(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    category = _make_category(db_session)

    _create_thread(client, author, category, body="no mention here")

    assert db_session.scalars(select(Job).where(Job.kind == "notify")).all() == []


def test_read_returns_the_thread_detail(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "alice")
    category = _make_category(db_session)
    created = _create_thread(client, user, category, body="## Heading")

    response = client.get(f"/api/threads/{created['id']}")
    assert response.status_code == 200
    detail = response.json()
    assert detail["id"] == created["id"]
    assert detail["body_markdown"] == "## Heading"
    assert "<h2>Heading</h2>" in detail["body_html"]


def test_read_unknown_thread_answers_404(client: TestClient) -> None:
    response = client.get("/api/threads/999999")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_edit_own_thread_sets_edited_at_and_rerenders(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "alice")
    category = _make_category(db_session)
    created = _create_thread(client, user, category, body="before")
    assert created["edited_at"] is None

    response = client.patch(
        f"/api/threads/{created['id']}",
        json={"title": "Renamed", "body_markdown": "*after*"},
        headers=_auth(user),
    )
    assert response.status_code == 200
    detail = response.json()
    assert detail["title"] == "Renamed"
    assert detail["body_markdown"] == "*after*"
    assert "<em>after</em>" in detail["body_html"]
    assert detail["edited_at"] is not None

    stored = db_session.get(Thread, created["id"])
    assert stored is not None and stored.edited_at is not None


def test_edit_someone_elses_thread_is_forbidden(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    intruder = _make_user(db_session, "bob")
    category = _make_category(db_session)
    created = _create_thread(client, author, category)

    response = client.patch(
        f"/api/threads/{created['id']}",
        json={"body_markdown": "hijacked"},
        headers=_auth(intruder),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_edit_unknown_thread_answers_404(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "alice")

    response = client.patch(
        "/api/threads/999999",
        json={"body_markdown": "nope"},
        headers=_auth(user),
    )
    assert response.status_code == 404


def test_edit_with_a_new_mention_enqueues_a_notify_job(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "alice")
    mentioned = _make_user(db_session, "bob")
    category = _make_category(db_session)
    created = _create_thread(client, author, category, body="no mention")

    response = client.patch(
        f"/api/threads/{created['id']}",
        json={"body_markdown": f"now mentioning @{mentioned.username}"},
        headers=_auth(author),
    )
    assert response.status_code == 200

    jobs = db_session.scalars(select(Job).where(Job.kind == "notify")).all()
    assert len(jobs) == 1
    assert jobs[0].payload["mentions"] == [mentioned.username]


def test_delete_own_thread_is_soft_and_removes_it_from_the_list(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "alice")
    category = _make_category(db_session)
    created = _create_thread(client, author, category, title="Doomed thread")
    db_session.add(
        Comment(
            thread_id=created["id"],
            author_id=author.id,
            body_markdown="a reply that must survive",
            depth=1,
        )
    )
    db_session.commit()

    response = client.delete(f"/api/threads/{created['id']}", headers=_auth(author))
    assert response.status_code == 204

    stored = db_session.get(Thread, created["id"])
    assert stored is not None and stored.deleted is True
    assert client.get(f"/api/threads/{created['id']}").status_code == 404

    listing = client.get("/api/threads")
    assert created["id"] not in [item["id"] for item in listing.json()["items"]]

    replies = db_session.scalars(select(Comment).where(Comment.thread_id == created["id"])).all()
    assert len(replies) == 1
    assert replies[0].deleted is False


def test_delete_someone_elses_thread_is_forbidden(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    intruder = _make_user(db_session, "bob")
    category = _make_category(db_session)
    created = _create_thread(client, author, category)

    response = client.delete(f"/api/threads/{created['id']}", headers=_auth(intruder))
    assert response.status_code == 403

    stored = db_session.get(Thread, created["id"])
    assert stored is not None and stored.deleted is False


def test_delete_requires_authentication(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, f"user-{uuid4().hex[:8]}")
    category = _make_category(db_session)
    created = _create_thread(client, user, category)

    response = client.delete(f"/api/threads/{created['id']}")
    assert response.status_code == 401
