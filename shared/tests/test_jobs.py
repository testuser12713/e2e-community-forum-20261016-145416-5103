"""Tests for shared.jobs — the job queue helper used by API and worker."""

from __future__ import annotations

import pytest
from sqlalchemy import delete, select

from shared.db import get_engine, get_session_factory
from shared.jobs import JOB_KINDS, enqueue_job
from shared.models import Base, Job


@pytest.fixture()
def db():
    Base.metadata.create_all(get_engine())
    session = get_session_factory()()
    session.execute(delete(Job))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def test_job_kinds_are_the_three_planned_ones() -> None:
    assert JOB_KINDS == ("notify", "recompute_hot", "cleanup_sessions")


def test_enqueue_job_writes_a_pending_row(db) -> None:
    result = enqueue_job(db, "notify", {"thread_id": 1, "actor_id": 2, "mentions": []})
    assert result is None
    db.commit()
    job = db.scalars(select(Job)).one()
    assert job.kind == "notify"
    assert job.status == "pending"
    assert job.payload == {"thread_id": 1, "actor_id": 2, "mentions": []}


def test_enqueue_job_rejects_unknown_kind(db) -> None:
    with pytest.raises(ValueError):
        enqueue_job(db, "explode", {})
