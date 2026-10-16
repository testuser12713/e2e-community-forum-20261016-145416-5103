"""Database engine and sessions, shared by API and worker.

``engine`` and ``SessionLocal`` are module-level names (the shared contract),
but they are lazy: the connection string is only read from the environment the
first time one of them is actually used. Importing this module therefore never
requires a database to be configured or reachable.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any, cast

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """The process-wide engine, created on first use."""
    global _engine
    if _engine is None:
        from shared.config import get_settings

        _engine = create_engine(
            get_settings().database_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """The process-wide session factory, bound to the lazily created engine."""
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)
    return _session_factory


class _LazyEngine:
    """Attribute proxy so ``engine`` behaves like an Engine without importing one."""

    def __getattr__(self, item: str) -> Any:
        return getattr(get_engine(), item)


class _LazySessionFactory:
    """Call proxy so ``SessionLocal()`` returns a Session without an eager engine."""

    def __call__(self, *args: Any, **kwargs: Any) -> Session:
        return get_session_factory()(*args, **kwargs)

    def __getattr__(self, item: str) -> Any:
        return getattr(get_session_factory(), item)


engine: Engine = cast(Engine, _LazyEngine())
SessionLocal: sessionmaker[Session] = cast("sessionmaker[Session]", _LazySessionFactory())


@contextmanager
def session_scope() -> Iterator[Session]:
    """A transactional session: commit on success, roll back on any error."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


def dispose_engine() -> None:
    """Close the connection pool — called from the API's shutdown hook."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
        _engine = None
        _session_factory = None
