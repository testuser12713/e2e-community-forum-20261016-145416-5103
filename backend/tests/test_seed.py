"""Tests of the seed command.

The seed is a manual command: these tests call :func:`seed_database` directly
against the isolated test database. They check that one run fills an empty
database with the promised demo content and that a second run adds nothing.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.security import verify_password
from scripts.seed import (
    DEMO_PASSWORD,
    compute_hot_score,
    main,
    seed_database,
)
from shared.models import Category, Comment, Thread, User, Vote

DEMO_LOGINS: dict[str, str] = {
    "admin@forum.test": "admin",
    "moderator@forum.test": "moderator",
    "demo@forum.test": "user",
}


def _count(session: Session, model: type) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def test_seed_fills_an_empty_database(db_session: Session) -> None:
    result = seed_database(db_session)

    assert result.seeded
    assert _count(db_session, Category) >= 3
    assert _count(db_session, Thread) >= 20
    assert _count(db_session, Comment) > 0
    assert _count(db_session, Vote) > 0


def test_seed_creates_one_demo_account_per_role(db_session: Session) -> None:
    seed_database(db_session)

    for email, role in DEMO_LOGINS.items():
        user = db_session.scalar(select(User).where(User.email == email))
        assert user is not None, f"missing demo account {email}"
        assert user.role == role
        assert verify_password(DEMO_PASSWORD, user.password_hash)


def test_seed_gives_content_non_zero_scores_and_karma(db_session: Session) -> None:
    seed_database(db_session)

    assert db_session.scalar(select(func.max(Thread.score))) != 0
    assert db_session.scalar(select(func.max(Comment.score))) != 0
    assert db_session.scalar(select(func.max(User.karma))) != 0


def test_seed_computes_hot_scores_for_its_threads(db_session: Session) -> None:
    seed_database(db_session)

    hot_scores = db_session.scalars(select(Thread.hot_score)).all()
    assert hot_scores
    assert any(score != 0 for score in hot_scores)


def test_hot_score_ranks_a_newer_thread_above_an_older_one() -> None:
    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    newer = compute_hot_score(5, now)
    older = compute_hot_score(5, now - timedelta(days=2))
    assert newer > older


def test_second_seed_run_adds_nothing(db_session: Session) -> None:
    seed_database(db_session)
    models = (User, Category, Thread, Comment, Vote)
    before = {model.__name__: _count(db_session, model) for model in models}

    second = seed_database(db_session)

    assert not second.seeded
    after = {model.__name__: _count(db_session, model) for model in models}
    assert after == before


def test_cli_refuses_to_run_inside_a_test(monkeypatch) -> None:
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/test_seed.py::test_cli_refuses")
    assert main([]) == 2
