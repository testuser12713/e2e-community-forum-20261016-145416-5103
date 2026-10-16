"""Tests of the ``cleanup_sessions`` job: expired and revoked refresh tokens go.

Everything runs against the worker's own isolated PostgreSQL database
(``conftest.py``). Each test creates the rows it needs and asserts the handler's
real contract: an expired and a revoked refresh token disappear, a live one
survives, work proceeds in bounded batches and it never touches other tables.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

import pytest
from jobs import cleanup
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shared.models import RefreshToken, User


def _make_user(db: Session, *, username: str = "cleanup-user") -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
    )
    db.add(user)
    db.flush()
    return user


def _add_token(
    db: Session,
    user_id: int,
    *,
    token_hash: str,
    expires_in_days: float = 14,
    revoked: bool = False,
) -> RefreshToken:
    now = datetime.now(UTC)
    token = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=now + timedelta(days=expires_in_days),
        revoked_at=now if revoked else None,
    )
    db.add(token)
    db.flush()
    return token


def test_removes_expired_and_revoked_but_keeps_the_live_token(db_session: Session) -> None:
    user = _make_user(db_session)
    live = _add_token(db_session, user.id, token_hash="live-token")
    exhausted = _add_token(db_session, user.id, token_hash="expired-token", expires_in_days=-1)
    revoked = _add_token(
        db_session, user.id, token_hash="revoked-token", expires_in_days=14, revoked=True
    )
    db_session.commit()
    live_id = live.id
    gone_ids = {exhausted.id, revoked.id}

    cleanup.handle_cleanup_sessions(db_session, {})

    remaining = set(db_session.execute(select(RefreshToken.id)).scalars())
    assert remaining == {live_id}
    assert gone_ids.isdisjoint(remaining)

    survivor = db_session.get(RefreshToken, live_id)
    assert survivor is not None
    assert survivor.revoked_at is None
    assert survivor.expires_at > datetime.now(UTC)


def test_removes_a_revoked_token_even_though_it_has_not_expired(db_session: Session) -> None:
    user = _make_user(db_session)
    revoked = _add_token(
        db_session, user.id, token_hash="revoked-fresh", expires_in_days=14, revoked=True
    )
    db_session.commit()
    revoked_id = revoked.id

    cleanup.handle_cleanup_sessions(db_session, {})

    still_there = db_session.execute(
        select(RefreshToken.id).where(RefreshToken.id == revoked_id)
    ).scalar_one_or_none()
    assert still_there is None


def test_deletes_in_batches_and_logs_the_number_removed(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(cleanup, "BATCH_SIZE", 2)
    user = _make_user(db_session)
    for index in range(5):
        _add_token(db_session, user.id, token_hash=f"expired-{index}", expires_in_days=-1)
    _add_token(db_session, user.id, token_hash="live-token", expires_in_days=14)
    db_session.commit()

    with caplog.at_level(logging.INFO, logger="jobs.cleanup"):
        cleanup.handle_cleanup_sessions(db_session, {})

    assert db_session.execute(select(func.count(RefreshToken.id))).scalar_one() == 1
    messages = [record.getMessage() for record in caplog.records]
    assert any("removed 5" in message for message in messages)


def test_is_a_noop_without_rows(db_session: Session, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="jobs.cleanup"):
        cleanup.handle_cleanup_sessions(db_session, {})

    assert db_session.execute(select(func.count(RefreshToken.id))).scalar_one() == 0
    assert any("removed 0" in record.getMessage() for record in caplog.records)


def test_never_touches_user_accounts(db_session: Session) -> None:
    user = _make_user(db_session)
    _add_token(db_session, user.id, token_hash="expired-token", expires_in_days=-1)
    _add_token(db_session, user.id, token_hash="revoked-token", revoked=True)
    db_session.commit()
    user_id = user.id

    cleanup.handle_cleanup_sessions(db_session, {})

    assert db_session.get(User, user_id) is not None
