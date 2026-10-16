"""Tests of the nested comment tree: creation, depth limit, editing, soft
deletion and the notify job every created comment enqueues.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import Ban, Category, Comment, Job, Thread, User, Vote


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


def _make_thread(db: Session, author: User, *, locked: bool = False) -> Thread:
    category = Category(name=f"cat-{uuid4().hex[:8]}", slug=f"cat-{uuid4().hex[:8]}")
    db.add(category)
    db.commit()
    db.refresh(category)
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="A thread about comments",
        body_markdown="body",
        locked=locked,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _post_comment(
    client: TestClient, thread_id: int, user: User, body: str, parent_id: int | None = None
) -> dict:
    payload: dict[str, object] = {"body_markdown": body}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    response = client.post(f"/api/threads/{thread_id}/comments", json=payload, headers=_auth(user))
    assert response.status_code == 201, response.text
    return response.json()


def test_reply_chain_reaches_depth_five_and_rejects_level_six(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "alice")
    thread = _make_thread(db_session, user)

    node = _post_comment(client, thread.id, user, "level 1")
    assert node["depth"] == 1

    for expected_depth in range(2, 6):
        node = _post_comment(client, thread.id, user, f"level {expected_depth}", node["id"])
        assert node["depth"] == expected_depth

    response = client.post(
        f"/api/threads/{thread.id}/comments",
        json={"body_markdown": "level 6", "parent_id": node["id"]},
        headers=_auth(user),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "max_depth"


def test_list_returns_paginated_top_level_rows_with_complete_children(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "bob")
    thread = _make_thread(db_session, user)

    first = _post_comment(client, thread.id, user, "first")
    _post_comment(client, thread.id, user, "first reply", first["id"])
    _post_comment(client, thread.id, user, "second")

    response = client.get(f"/api/threads/{thread.id}/comments?page=1&page_size=1")
    assert response.status_code == 200
    page = response.json()
    assert page["total"] == 2
    assert page["page"] == 1
    assert page["page_size"] == 1
    assert page["pages"] == 2
    assert len(page["items"]) == 1
    assert page["items"][0]["children"], "the first row carries its complete subtree"
    assert page["items"][0]["children"][0]["body_markdown"] == "first reply"
    assert page["items"][0]["children"][0]["depth"] == 2

    second_page = client.get(f"/api/threads/{thread.id}/comments?page=2&page_size=1").json()
    assert second_page["items"][0]["body_markdown"] == "second"


def test_list_unknown_thread_answers_404(client: TestClient) -> None:
    response = client.get("/api/threads/999999/comments")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_create_comment_requires_authentication(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "carol")
    thread = _make_thread(db_session, user)

    response = client.post(f"/api/threads/{thread.id}/comments", json={"body_markdown": "hi"})
    assert response.status_code == 401


def test_create_comment_on_locked_thread_is_forbidden(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "dave")
    thread = _make_thread(db_session, user, locked=True)

    response = client.post(
        f"/api/threads/{thread.id}/comments",
        json={"body_markdown": "hi"},
        headers=_auth(user),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "locked"


def test_create_comment_with_parent_from_another_thread_is_forbidden(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "erin")
    thread_a = _make_thread(db_session, user)
    thread_b = _make_thread(db_session, user)
    parent = _post_comment(client, thread_a.id, user, "in thread a")

    response = client.post(
        f"/api/threads/{thread_b.id}/comments",
        json={"body_markdown": "stray reply", "parent_id": parent["id"]},
        headers=_auth(user),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "parent_mismatch"


def test_create_comment_renders_sanitised_html(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "frank")
    thread = _make_thread(db_session, user)

    node = _post_comment(client, thread.id, user, "**bold** <script>alert('x')</script>")
    assert "<strong>bold</strong>" in node["body_html"]
    assert "<script" not in node["body_html"].lower()
    assert node["my_vote"] == 0
    assert node["author"]["username"] == "frank"


def test_create_comment_enqueues_a_notify_job(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "grace")
    mentioned = _make_user(db_session, "heidi")
    thread = _make_thread(db_session, author)

    node = _post_comment(client, thread.id, author, f"hello @{mentioned.username}")

    job = db_session.scalars(select(Job).where(Job.kind == "notify")).one()
    assert job.payload["thread_id"] == thread.id
    assert job.payload["comment_id"] == node["id"]
    assert job.payload["actor_id"] == author.id
    assert job.payload["mentions"] == [mentioned.username]


def test_edit_own_comment_sets_edited_at_and_rerenders(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "ivan")
    thread = _make_thread(db_session, user)
    node = _post_comment(client, thread.id, user, "before")
    assert node["edited_at"] is None

    response = client.patch(
        f"/api/comments/{node['id']}",
        json={"body_markdown": "*after*"},
        headers=_auth(user),
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["edited_at"] is not None
    assert updated["body_markdown"] == "*after*"
    assert "<em>after</em>" in updated["body_html"]


def test_edit_someone_elses_comment_is_forbidden(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "judy")
    intruder = _make_user(db_session, "mallory")
    thread = _make_thread(db_session, author)
    node = _post_comment(client, thread.id, author, "mine")

    response = client.patch(
        f"/api/comments/{node['id']}",
        json={"body_markdown": "hijacked"},
        headers=_auth(intruder),
    )
    assert response.status_code == 403


def test_delete_own_comment_is_soft_and_keeps_replies_visible(
    client: TestClient, db_session: Session
) -> None:
    user = _make_user(db_session, "kate")
    thread = _make_thread(db_session, user)
    parent = _post_comment(client, thread.id, user, "parent")
    child = _post_comment(client, thread.id, user, "child", parent["id"])

    response = client.delete(f"/api/comments/{parent['id']}", headers=_auth(user))
    assert response.status_code == 204

    stored = db_session.get(Comment, parent["id"])
    assert stored.deleted is True

    page = client.get(f"/api/threads/{thread.id}/comments").json()
    top = page["items"][0]
    assert top["deleted"] is True
    assert len(top["children"]) == 1
    assert top["children"][0]["id"] == child["id"]
    assert top["children"][0]["deleted"] is False


def test_delete_someone_elses_comment_is_forbidden(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "leo")
    intruder = _make_user(db_session, "nina")
    thread = _make_thread(db_session, author)
    node = _post_comment(client, thread.id, author, "mine")

    response = client.delete(f"/api/comments/{node['id']}", headers=_auth(intruder))
    assert response.status_code == 403


def test_banned_user_cannot_comment(client: TestClient, db_session: Session) -> None:
    user = _make_user(db_session, "olive")
    thread = _make_thread(db_session, user)
    db_session.add(Ban(user_id=user.id, reason="spam"))
    db_session.commit()

    response = client.post(
        f"/api/threads/{thread.id}/comments",
        json={"body_markdown": "still here?"},
        headers=_auth(user),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "banned"


def test_authenticated_reader_sees_their_own_vote(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "peggy")
    reader = _make_user(db_session, "quentin")
    thread = _make_thread(db_session, author)
    node = _post_comment(client, thread.id, author, "a comment")
    db_session.add(Vote(user_id=reader.id, comment_id=node["id"], value=1))
    db_session.commit()

    page = client.get(f"/api/threads/{thread.id}/comments", headers=_auth(reader)).json()
    assert page["items"][0]["my_vote"] == 1

    anonymous = client.get(f"/api/threads/{thread.id}/comments").json()
    assert anonymous["items"][0]["my_vote"] == 0
