"""Nested comments on threads.

A comment tree is at most ``MAX_DEPTH`` levels deep: a top-level comment sits at
depth 1, its replies at depth 2, and so on down to depth 5. A reply that would
create depth 6 is rejected with 422. Deleting a comment is a soft delete: the
row stays, is returned with ``deleted: true`` and keeps its replies.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.errors import api_error
from app.pagination import paginate
from app.ratelimit import enforce_write_limit
from app.routers.moderation import require_active_user
from app.security import get_optional_user
from shared.db import get_db
from shared.jobs import enqueue_job
from shared.markdown import render_markdown
from shared.models import Comment, Thread, User, Vote
from shared.schemas.comments import CommentCreate, CommentNode, CommentUpdate
from shared.schemas.common import Page, UserBrief

router = APIRouter(tags=["comments"])

MAX_DEPTH = 5

_MENTION_RE = re.compile(r"@([A-Za-z0-9_]{1,32})")


def _extract_mentions(text: str, actor_username: str) -> list[str]:
    """The unique @-mentions of a body, in order, without the author's own name."""
    mentions: list[str] = []
    for name in _MENTION_RE.findall(text or ""):
        if name == actor_username or name in mentions:
            continue
        mentions.append(name)
    return mentions


def _brief(author: User | None) -> UserBrief | None:
    if author is None:
        return None
    return UserBrief(id=author.id, username=author.username, karma=author.karma)


def _node(
    comment: Comment,
    author: User | None,
    my_vote: int,
    children: list[CommentNode],
) -> CommentNode:
    return CommentNode(
        id=comment.id,
        thread_id=comment.thread_id,
        parent_id=comment.parent_id,
        depth=comment.depth,
        body_markdown=comment.body_markdown,
        body_html=render_markdown(comment.body_markdown),
        score=comment.score,
        my_vote=my_vote,
        deleted=comment.deleted,
        edited_at=comment.edited_at,
        created_at=comment.created_at,
        author=_brief(author),
        children=children,
    )


def _my_votes(db: Session, comment_ids: list[int], user: User | None) -> dict[int, int]:
    """The signed-in user's vote per comment of a thread (empty when anonymous)."""
    if user is None or not comment_ids:
        return {}
    rows = db.scalars(
        select(Vote).where(
            Vote.comment_id.in_(comment_ids),
            Vote.user_id == user.id,
        )
    ).all()
    return {vote.comment_id: vote.value for vote in rows if vote.comment_id is not None}


@router.get("/api/threads/{id}/comments", response_model=Page[CommentNode])
def list_comments(
    id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> Page[CommentNode]:
    thread = db.get(Thread, id)
    if thread is None or thread.deleted:
        raise api_error("not_found", "Thread not found", 404)

    top_level_stmt = (
        select(Comment)
        .where(Comment.thread_id == id, Comment.parent_id.is_(None))
        .order_by(Comment.created_at.asc(), Comment.id.asc())
    )
    page_data = paginate(db, top_level_stmt, page, page_size)

    rows = db.scalars(
        select(Comment)
        .options(joinedload(Comment.author))
        .where(Comment.thread_id == id)
        .order_by(Comment.created_at.asc(), Comment.id.asc())
    ).all()

    children_by_parent: dict[int, list[Comment]] = {}
    for row in rows:
        if row.parent_id is not None:
            children_by_parent.setdefault(row.parent_id, []).append(row)

    my_votes = _my_votes(db, [row.id for row in rows], user)

    def build(comment: Comment) -> CommentNode:
        children = [build(child) for child in children_by_parent.get(comment.id, [])]
        return _node(comment, comment.author, my_votes.get(comment.id, 0), children)

    items = [build(item) for item in page_data["items"]]
    return Page[CommentNode](
        items=items,
        total=page_data["total"],
        page=page_data["page"],
        page_size=page_data["page_size"],
        pages=page_data["pages"],
    )


@router.post("/api/threads/{id}/comments", response_model=CommentNode, status_code=201)
def create_comment(
    id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("comment_create"),
) -> CommentNode:
    thread = db.get(Thread, id)
    if thread is None or thread.deleted:
        raise api_error("not_found", "Thread not found", 404)
    if thread.locked:
        raise api_error("locked", "This thread is locked — commenting is disabled", 403)

    depth = 1
    if payload.parent_id is not None:
        parent = db.get(Comment, payload.parent_id)
        if parent is None:
            raise api_error("not_found", "Parent comment not found", 404)
        if parent.thread_id != id:
            raise api_error("parent_mismatch", "The parent comment belongs to another thread", 403)
        if parent.depth >= MAX_DEPTH:
            raise api_error(
                "max_depth",
                f"Comments are nested at most {MAX_DEPTH} levels deep",
                422,
                {"parent_id": f"a reply to this comment would be level {MAX_DEPTH + 1}"},
            )
        depth = parent.depth + 1

    comment = Comment(
        thread_id=id,
        parent_id=payload.parent_id,
        author_id=user.id,
        body_markdown=payload.body_markdown,
        depth=depth,
    )
    db.add(comment)
    thread.comment_count = thread.comment_count + 1
    db.flush()

    enqueue_job(
        db,
        "notify",
        {
            "thread_id": id,
            "comment_id": comment.id,
            "actor_id": user.id,
            "mentions": _extract_mentions(payload.body_markdown, user.username),
        },
    )
    db.commit()
    db.refresh(comment)
    return _node(comment, user, 0, [])


@router.patch("/api/comments/{id}", response_model=CommentNode)
def update_comment(
    id: int,
    payload: CommentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
    _rate_limit: None = enforce_write_limit("comment_update"),
) -> CommentNode:
    comment = db.get(Comment, id)
    if comment is None or comment.deleted:
        raise api_error("not_found", "Comment not found", 404)
    if comment.author_id != user.id:
        raise api_error("forbidden", "You can only edit your own comments", 403)

    comment.body_markdown = payload.body_markdown
    comment.edited_at = datetime.now(UTC)
    db.commit()
    db.refresh(comment)
    return _node(comment, comment.author, 0, [])


@router.delete("/api/comments/{id}", status_code=204)
def delete_comment(
    id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
) -> None:
    comment = db.get(Comment, id)
    if comment is None or comment.deleted:
        raise api_error("not_found", "Comment not found", 404)
    if comment.author_id != user.id:
        raise api_error("forbidden", "You can only delete your own comments", 403)

    comment.deleted = True
    db.commit()
    return None
