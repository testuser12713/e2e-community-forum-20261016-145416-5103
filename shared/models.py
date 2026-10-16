"""SQLAlchemy 2.0 models for the community forum.

The schema carries everything the API's data shapes need: users and their
roles, bans, refresh tokens, categories, threads with a PostgreSQL full-text
column, nested comments, votes, subscriptions, notifications, reports, the job
queue the worker claims from, the audit log and the rate limiter's counters.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

USER_ROLES = ("user", "moderator", "admin")
REPORT_STATUSES = ("open", "resolved", "dismissed")
JOB_STATUSES = ("pending", "running", "done", "failed")

THREAD_SEARCH_EXPRESSION = (
    "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body_markdown, ''))"
)


class Base(DeclarativeBase):
    """Declarative base of every model in the product."""


def _created_at_column() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'moderator', 'admin')", name="ck_users_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False, server_default="user", index=True)
    karma: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", index=True)
    created_at: Mapped[datetime] = _created_at_column()

    bans: Mapped[list[Ban]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Ban(Base):
    __tablename__ = "bans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _created_at_column()

    user: Mapped[User] = relationship(back_populates="bans")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _created_at_column()


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", index=True)
    created_at: Mapped[datetime] = _created_at_column()


class Thread(Base):
    __tablename__ = "threads"
    __table_args__ = (
        Index("ix_threads_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_threads_tags", "tags", postgresql_using="gin"),
        Index("ix_threads_category_pinned_hot", "category_id", "pinned", "hot_score"),
        CheckConstraint("comment_count >= 0", name="ck_threads_comment_count"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(32)), nullable=False, server_default="{}")
    score: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", index=True)
    comment_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", index=True
    )
    hot_score: Mapped[float] = mapped_column(Float, nullable=False, server_default="0", index=True)
    pinned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", index=True
    )
    locked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", index=True
    )
    deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", index=True
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _created_at_column()
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed(THREAD_SEARCH_EXPRESSION, persisted=True),
        nullable=True,
    )

    category: Mapped[Category] = relationship()
    author: Mapped[User] = relationship()


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (
        CheckConstraint("depth >= 1", name="ck_comments_depth"),
        Index("ix_comments_thread_created", "thread_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    body_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    score: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", index=True)
    deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false", index=True
    )
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _created_at_column()

    thread: Mapped[Thread] = relationship()
    author: Mapped[User] = relationship()
    parent: Mapped[Comment | None] = relationship(remote_side="Comment.id")


class Vote(Base):
    __tablename__ = "votes"
    __table_args__ = (
        CheckConstraint("value IN (-1, 1)", name="ck_votes_value"),
        CheckConstraint(
            "(thread_id IS NOT NULL) <> (comment_id IS NOT NULL)", name="ck_votes_one_target"
        ),
        UniqueConstraint("user_id", "thread_id", name="uq_votes_user_thread"),
        UniqueConstraint("user_id", "comment_id", name="uq_votes_user_comment"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    thread_id: Mapped[int | None] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), nullable=True, index=True
    )
    comment_id: Mapped[int | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = _created_at_column()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "thread_id", name="uq_subscriptions_user_thread"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = _created_at_column()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    thread_id: Mapped[int | None] = mapped_column(
        ForeignKey("threads.id", ondelete="CASCADE"), nullable=True, index=True
    )
    comment_id: Mapped[int | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = _created_at_column()
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    actor: Mapped[User | None] = relationship(foreign_keys=[actor_id])


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint("content_type IN ('thread', 'comment')", name="ck_reports_content_type"),
        CheckConstraint("status IN ('open', 'resolved', 'dismissed')", name="ck_reports_status"),
        UniqueConstraint(
            "reporter_id", "content_type", "content_id", name="uq_reports_reporter_content"
        ),
        Index("ix_reports_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content_type: Mapped[str] = mapped_column(String(16), nullable=False)
    content_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="open", index=True
    )
    resolved_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = _created_at_column()

    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id])
    resolved_by: Mapped[User | None] = relationship(foreign_keys=[resolved_by_id])


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'done', 'failed')", name="ck_jobs_status"
        ),
        Index("ix_jobs_claim", "status", "run_after"),
        Index("ix_jobs_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="pending", index=True
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    run_after: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _created_at_column()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_target", "target_type", "target_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = _created_at_column()

    actor: Mapped[User | None] = relationship()


class RateLimit(Base):
    __tablename__ = "rate_limits"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "action", "window_start", name="uq_rate_limits_user_action_window"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    window_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
