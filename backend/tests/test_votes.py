"""Tests of voting on threads and comments and of the karma it maintains.

Covers the up/down vote, the withdraw (same value again), the switch between
up and down (a score move of two), the rejection of self-votes, the banned-user
guard and the karma that the author's public profile reports.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.security import create_access_token
from shared.models import Ban, Category, Comment, Thread, User


def _make_user(db: Session, username: str, role: str = "user", karma: int = 0) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
        role=role,
        karma=karma,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_thread(db: Session, author: User, *, deleted: bool = False) -> Thread:
    category = Category(name=f"cat-{uuid4().hex[:8]}", slug=f"cat-{uuid4().hex[:8]}")
    db.add(category)
    db.commit()
    db.refresh(category)
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="A thread to vote on",
        body_markdown="body",
        deleted=deleted,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def _make_comment(db: Session, thread: Thread, author: User, *, deleted: bool = False) -> Comment:
    comment = Comment(
        thread_id=thread.id,
        author_id=author.id,
        body_markdown="a comment",
        depth=1,
        deleted=deleted,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user)}"}


def _vote_thread(client: TestClient, thread_id: int, user: User, value: int):
    return client.put(f"/api/threads/{thread_id}/vote", json={"value": value}, headers=_auth(user))


def _vote_comment(client: TestClient, comment_id: int, user: User, value: int):
    return client.put(
        f"/api/comments/{comment_id}/vote", json={"value": value}, headers=_auth(user)
    )


def test_upvote_raises_score_and_reports_the_vote(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    voter = _make_user(db_session, "bob")
    thread = _make_thread(db_session, author)

    response = _vote_thread(client, thread.id, voter, 1)
    assert response.status_code == 200
    assert response.json() == {"score": 1, "my_vote": 1}

    db_session.refresh(thread)
    assert thread.score == 1


def test_second_click_withdraws_the_vote(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    voter = _make_user(db_session, "bob")
    thread = _make_thread(db_session, author)

    assert _vote_thread(client, thread.id, voter, 1).json() == {"score": 1, "my_vote": 1}
    response = _vote_thread(client, thread.id, voter, 1)
    assert response.status_code == 200
    assert response.json() == {"score": 0, "my_vote": 0}

    db_session.refresh(thread)
    assert thread.score == 0


def test_switching_from_up_to_down_moves_score_by_two(
    client: TestClient, db_session: Session
) -> None:
    author = _make_user(db_session, "alice")
    voter = _make_user(db_session, "bob")
    thread = _make_thread(db_session, author)

    assert _vote_thread(client, thread.id, voter, 1).json()["score"] == 1
    response = _vote_thread(client, thread.id, voter, -1)
    assert response.status_code == 200
    assert response.json() == {"score": -1, "my_vote": -1}

    db_session.refresh(thread)
    assert thread.score == -1


def test_voting_on_own_thread_is_forbidden(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    thread = _make_thread(db_session, author)

    response = _vote_thread(client, thread.id, author, 1)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"

    db_session.refresh(thread)
    assert thread.score == 0


def test_voting_on_own_comment_is_forbidden(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, thread, author)

    response = _vote_comment(client, comment.id, author, -1)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_comment_vote_toggles_and_switches(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    voter = _make_user(db_session, "bob")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, thread, author)

    assert _vote_comment(client, comment.id, voter, 1).json() == {"score": 1, "my_vote": 1}
    assert _vote_comment(client, comment.id, voter, -1).json() == {"score": -1, "my_vote": -1}
    assert _vote_comment(client, comment.id, voter, -1).json() == {"score": 0, "my_vote": 0}

    db_session.refresh(comment)
    assert comment.score == 0


def test_karma_tracks_the_votes_on_a_users_content(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    voter = _make_user(db_session, "bob")
    thread = _make_thread(db_session, author)
    comment = _make_comment(db_session, thread, author)

    _vote_thread(client, thread.id, voter, 1)
    _vote_comment(client, comment.id, voter, 1)

    profile = client.get("/api/users/alice")
    assert profile.status_code == 200
    assert profile.json()["karma"] == 2

    _vote_thread(client, thread.id, voter, -1)
    profile = client.get("/api/users/alice")
    assert profile.json()["karma"] == 0


def test_unknown_thread_vote_answers_404(client: TestClient, db_session: Session) -> None:
    voter = _make_user(db_session, "bob")
    response = _vote_thread(client, 999999, voter, 1)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_deleted_thread_vote_answers_404(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    voter = _make_user(db_session, "bob")
    thread = _make_thread(db_session, author, deleted=True)

    response = _vote_thread(client, thread.id, voter, 1)
    assert response.status_code == 404


def test_banned_user_cannot_vote(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    voter = _make_user(db_session, "bob")
    thread = _make_thread(db_session, author)
    db_session.add(Ban(user_id=voter.id, reason="spam"))
    db_session.commit()

    response = _vote_thread(client, thread.id, voter, 1)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "banned"


def test_vote_requires_authentication(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    thread = _make_thread(db_session, author)

    response = client.put(f"/api/threads/{thread.id}/vote", json={"value": 1})
    assert response.status_code == 401


def test_invalid_value_answers_422(client: TestClient, db_session: Session) -> None:
    author = _make_user(db_session, "alice")
    voter = _make_user(db_session, "bob")
    thread = _make_thread(db_session, author)

    response = _vote_thread(client, thread.id, voter, 2)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
