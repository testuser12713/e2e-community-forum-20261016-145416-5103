"""Tests of the worker's ``notify`` job: reply, mention, subscription and their rules.

Everything runs against the worker's own isolated PostgreSQL database
(``conftest.py``); each test creates the rows it needs. The handler is the
product's only producer of notifications, so the tests drive it directly with the
contract's payload shape and check the rows it writes — the reply target, the
subscribers, the mentioned users, the unknown mention that notifies nobody, the
actor's own action and the one-notification-per-user rule.
"""

from __future__ import annotations

from jobs.notifications import handle_notify
from sqlalchemy import select
from sqlalchemy.orm import Session

from shared.models import Category, Comment, Notification, Subscription, Thread, User


def make_user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash="not-a-real-hash",
    )
    db.add(user)
    db.flush()
    return user


def make_category(db: Session, slug: str = "general") -> Category:
    category = Category(name=slug.title(), slug=slug)
    db.add(category)
    db.flush()
    return category


def make_thread(db: Session, author: User, category: Category, body: str = "body") -> Thread:
    thread = Thread(
        category_id=category.id,
        author_id=author.id,
        title="A thread",
        body_markdown=body,
    )
    db.add(thread)
    db.flush()
    return thread


def make_comment(
    db: Session,
    thread: Thread,
    author: User,
    *,
    body: str = "a comment",
    parent: Comment | None = None,
    depth: int = 1,
) -> Comment:
    comment = Comment(
        thread_id=thread.id,
        parent_id=parent.id if parent is not None else None,
        author_id=author.id,
        body_markdown=body,
        depth=depth,
    )
    db.add(comment)
    db.flush()
    return comment


def subscribe(db: Session, user: User, thread: Thread) -> None:
    db.add(Subscription(user_id=user.id, thread_id=thread.id))
    db.flush()


def notifications_for(db: Session, user: User) -> list[Notification]:
    return list(db.scalars(select(Notification).where(Notification.user_id == user.id)).all())


def test_top_level_comment_notifies_the_thread_author(db_session: Session) -> None:
    category = make_category(db_session)
    thread_author = make_user(db_session, "threadauthor")
    actor = make_user(db_session, "commenter")
    thread = make_thread(db_session, thread_author, category)
    comment = make_comment(db_session, thread, actor)

    handle_notify(
        db_session,
        {
            "thread_id": thread.id,
            "comment_id": comment.id,
            "actor_id": actor.id,
            "mentions": [],
        },
    )
    db_session.commit()

    rows = notifications_for(db_session, thread_author)
    assert len(rows) == 1
    assert rows[0].kind == "reply"
    assert rows[0].thread_id == thread.id
    assert rows[0].comment_id == comment.id
    assert rows[0].actor_id == actor.id
    assert rows[0].read_at is None


def test_reply_to_a_comment_notifies_the_parent_author(db_session: Session) -> None:
    category = make_category(db_session)
    thread_author = make_user(db_session, "threadauthor")
    parent_author = make_user(db_session, "parentauthor")
    actor = make_user(db_session, "replier")
    thread = make_thread(db_session, thread_author, category)
    parent = make_comment(db_session, thread, parent_author, body="original")
    reply = make_comment(db_session, thread, actor, body="a reply", parent=parent, depth=2)

    handle_notify(
        db_session,
        {
            "thread_id": thread.id,
            "comment_id": reply.id,
            "actor_id": actor.id,
            "mentions": [],
        },
    )
    db_session.commit()

    parent_rows = notifications_for(db_session, parent_author)
    assert len(parent_rows) == 1
    assert parent_rows[0].kind == "reply"
    assert parent_rows[0].comment_id == reply.id

    # The nested reply notifies the comment's author, not the thread's author.
    assert notifications_for(db_session, thread_author) == []


def test_mention_notifies_the_named_user(db_session: Session) -> None:
    category = make_category(db_session)
    thread_author = make_user(db_session, "threadauthor")
    mentioned = make_user(db_session, "heidi")
    actor = make_user(db_session, "author")
    thread = make_thread(db_session, thread_author, category)
    comment = make_comment(db_session, thread, actor, body="hello @heidi")

    handle_notify(
        db_session,
        {
            "thread_id": thread.id,
            "comment_id": comment.id,
            "actor_id": actor.id,
            "mentions": ["heidi"],
        },
    )
    db_session.commit()

    rows = notifications_for(db_session, mentioned)
    assert len(rows) == 1
    assert rows[0].kind == "mention"
    assert rows[0].actor_id == actor.id
    assert rows[0].comment_id == comment.id


def test_unknown_mention_creates_no_notification(db_session: Session) -> None:
    category = make_category(db_session)
    # The actor owns the thread, so the only thing that could create a
    # notification here is the mention — and it names nobody.
    actor = make_user(db_session, "author")
    thread = make_thread(db_session, actor, category)
    comment = make_comment(db_session, thread, actor, body="hello @nobody")

    handle_notify(
        db_session,
        {
            "thread_id": thread.id,
            "comment_id": comment.id,
            "actor_id": actor.id,
            "mentions": ["nobody"],
        },
    )
    db_session.commit()

    total = db_session.scalar(select(Notification.id).limit(1))
    assert total is None


def test_subscriber_is_notified_about_a_new_comment(db_session: Session) -> None:
    category = make_category(db_session)
    thread_author = make_user(db_session, "threadauthor")
    subscriber = make_user(db_session, "follower")
    actor = make_user(db_session, "commenter")
    thread = make_thread(db_session, thread_author, category)
    subscribe(db_session, subscriber, thread)
    comment = make_comment(db_session, thread, actor)

    handle_notify(
        db_session,
        {
            "thread_id": thread.id,
            "comment_id": comment.id,
            "actor_id": actor.id,
            "mentions": [],
        },
    )
    db_session.commit()

    rows = notifications_for(db_session, subscriber)
    assert len(rows) == 1
    assert rows[0].kind == "subscription"
    assert rows[0].thread_id == thread.id
    assert rows[0].comment_id == comment.id


def test_actor_is_never_notified_about_their_own_action(db_session: Session) -> None:
    category = make_category(db_session)
    actor = make_user(db_session, "selfcommenter")
    thread = make_thread(db_session, actor, category)
    subscribe(db_session, actor, thread)
    comment = make_comment(db_session, thread, actor, body="mentioning @selfcommenter")

    handle_notify(
        db_session,
        {
            "thread_id": thread.id,
            "comment_id": comment.id,
            "actor_id": actor.id,
            "mentions": ["selfcommenter"],
        },
    )
    db_session.commit()

    assert notifications_for(db_session, actor) == []


def test_one_notification_per_user_per_comment(db_session: Session) -> None:
    category = make_category(db_session)
    # ``target`` is the parent comment's author, a subscriber AND mentioned.
    target = make_user(db_session, "target")
    actor = make_user(db_session, "author")
    thread = make_thread(db_session, actor, category)
    subscribe(db_session, target, thread)
    parent = make_comment(db_session, thread, target, body="original")
    reply = make_comment(db_session, thread, actor, body="thanks @target", parent=parent, depth=2)

    handle_notify(
        db_session,
        {
            "thread_id": thread.id,
            "comment_id": reply.id,
            "actor_id": actor.id,
            "mentions": ["target"],
        },
    )
    db_session.commit()

    rows = notifications_for(db_session, target)
    assert len(rows) == 1
    # The most specific reason wins.
    assert rows[0].kind == "reply"


def test_reprocessing_a_job_does_not_duplicate_notifications(db_session: Session) -> None:
    category = make_category(db_session)
    thread_author = make_user(db_session, "threadauthor")
    actor = make_user(db_session, "commenter")
    thread = make_thread(db_session, thread_author, category)
    comment = make_comment(db_session, thread, actor)
    payload = {
        "thread_id": thread.id,
        "comment_id": comment.id,
        "actor_id": actor.id,
        "mentions": [],
    }

    handle_notify(db_session, payload)
    db_session.commit()
    handle_notify(db_session, payload)
    db_session.commit()

    assert len(notifications_for(db_session, thread_author)) == 1


def test_mention_in_a_new_thread_body_notifies_without_a_comment(db_session: Session) -> None:
    category = make_category(db_session)
    author = make_user(db_session, "author")
    mentioned = make_user(db_session, "heidi")
    thread = make_thread(db_session, author, category, body="hello @heidi")

    handle_notify(
        db_session,
        {
            "thread_id": thread.id,
            "comment_id": None,
            "actor_id": author.id,
            "mentions": ["heidi"],
        },
    )
    db_session.commit()

    rows = notifications_for(db_session, mentioned)
    assert len(rows) == 1
    assert rows[0].kind == "mention"
    assert rows[0].comment_id is None
    assert rows[0].thread_id == thread.id
