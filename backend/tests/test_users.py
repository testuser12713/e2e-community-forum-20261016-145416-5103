"""Tests for the public profile and the signed-in user's own account (#10)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import Category, Comment, Thread, User


def _make_user(db: Session, username: str, *, bio: str | None = None, karma: int = 0) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
        bio=bio,
        karma=karma,
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


def _make_thread(
    db: Session,
    category: Category,
    author: User,
    title: str,
    *,
    deleted: bool = False,
    created_at: datetime | None = None,
) -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title=title,
        body_markdown="The body of the thread.",
        tags=["demo"],
        deleted=deleted,
    )
    if created_at is not None:
        thread.created_at = created_at
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def _make_comment(
    db: Session,
    thread: Thread,
    author: User,
    body: str,
    *,
    deleted: bool = False,
    created_at: datetime | None = None,
) -> Comment:
    comment = Comment(
        thread_id=thread.id,
        author_id=author.id,
        body_markdown=body,
        depth=1,
        deleted=deleted,
    )
    if created_at is not None:
        comment.created_at = created_at
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def test_public_profile_shows_bio_karma_threads_and_comments(
    client: TestClient, db_session: Session
) -> None:
    category = _make_category(db_session)
    author = _make_user(db_session, "alice", bio="I like forums", karma=42)
    thread = _make_thread(db_session, category, author, "Hello world")
    _make_comment(db_session, thread, author, "A short reply")

    response = client.get("/api/users/alice")

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "alice"
    assert body["bio"] == "I like forums"
    assert body["karma"] == 42
    assert body["created_at"]
    assert [t["id"] for t in body["threads"]] == [thread.id]
    assert body["threads"][0]["category_slug"] == "general"
    assert body["threads"][0]["category_name"] == "General"
    assert body["threads"][0]["author"] == {"id": author.id, "username": "alice", "karma": 42}
    assert len(body["comments"]) == 1
    assert body["comments"][0]["thread_id"] == thread.id
    assert body["comments"][0]["thread_title"] == "Hello world"
    assert body["comments"][0]["excerpt"] == "A short reply"


def test_public_profile_unknown_user_answers_404_in_the_error_envelope(
    client: TestClient,
) -> None:
    response = client.get("/api/users/does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "not_found"
    assert body["error"]["message"]


def test_public_profile_omits_deleted_threads_and_comments(
    client: TestClient, db_session: Session
) -> None:
    category = _make_category(db_session)
    author = _make_user(db_session, "bob")
    kept = _make_thread(db_session, category, author, "Visible thread")
    hidden = _make_thread(db_session, category, author, "Removed thread", deleted=True)
    _make_comment(db_session, kept, author, "Visible comment")
    _make_comment(db_session, kept, author, "Removed comment", deleted=True)

    body = client.get("/api/users/bob").json()

    assert [t["id"] for t in body["threads"]] == [kept.id]
    assert hidden.id not in [t["id"] for t in body["threads"]]
    assert [c["excerpt"] for c in body["comments"]] == ["Visible comment"]


def test_public_profile_lists_content_newest_first(client: TestClient, db_session: Session) -> None:
    category = _make_category(db_session)
    author = _make_user(db_session, "carol")
    now = datetime.now(UTC)
    older = _make_thread(db_session, category, author, "Older", created_at=now - timedelta(days=2))
    newer = _make_thread(db_session, category, author, "Newer", created_at=now - timedelta(days=1))
    _make_comment(db_session, older, author, "Older comment", created_at=now - timedelta(days=3))
    _make_comment(db_session, older, author, "Newer comment", created_at=now - timedelta(days=1))

    body = client.get("/api/users/carol").json()

    assert [t["id"] for t in body["threads"]] == [newer.id, older.id]
    assert [c["excerpt"] for c in body["comments"]] == ["Newer comment", "Older comment"]


def test_public_profile_paginates_both_lists(client: TestClient, db_session: Session) -> None:
    category = _make_category(db_session)
    author = _make_user(db_session, "dave")
    now = datetime.now(UTC)
    for index in range(3):
        thread = _make_thread(
            db_session, category, author, f"Thread {index}", created_at=now - timedelta(hours=index)
        )
        _make_comment(
            db_session, thread, author, f"Comment {index}", created_at=now - timedelta(hours=index)
        )

    first = client.get("/api/users/dave", params={"page": 1, "page_size": 2}).json()
    second = client.get("/api/users/dave", params={"page": 2, "page_size": 2}).json()

    assert len(first["threads"]) == 2
    assert len(first["comments"]) == 2
    assert len(second["threads"]) == 1
    assert len(second["comments"]) == 1


def test_get_me_returns_the_authenticated_user(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "erin", bio="Hi", karma=7)

    response = client.get("/api/me", headers=_auth(user))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user.id
    assert body["username"] == "erin"
    assert body["email"] == "erin@example.test"
    assert body["bio"] == "Hi"
    assert body["karma"] == 7
    assert body["role"] == "user"


def test_get_me_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"]


def test_patch_me_updates_the_bio(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "frank", bio="old")

    response = client.patch("/api/me", json={"bio": "new bio"}, headers=_auth(user))

    assert response.status_code == 200
    assert response.json()["bio"] == "new bio"
    db_session.refresh(user)
    assert user.bio == "new bio"


def test_patch_me_without_bio_keeps_the_existing_one(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "gina", bio="keep me")

    response = client.patch("/api/me", json={}, headers=_auth(user))

    assert response.status_code == 200
    assert response.json()["bio"] == "keep me"


def test_patch_me_can_clear_the_bio(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "henry", bio="remove me")

    response = client.patch("/api/me", json={"bio": None}, headers=_auth(user))

    assert response.status_code == 200
    assert response.json()["bio"] is None


def test_patch_me_requires_authentication(client: TestClient) -> None:
    response = client.patch("/api/me", json={"bio": "nope"})

    assert response.status_code == 401
    assert response.json()["error"]["code"]


def test_patch_me_rejects_an_invalid_bio_with_422(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "iris")

    response = client.patch("/api/me", json={"bio": ["not", "a", "string"]}, headers=_auth(user))

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "bio" in body["error"]["fields"]
