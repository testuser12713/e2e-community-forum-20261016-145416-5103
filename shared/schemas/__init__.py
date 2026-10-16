"""All Pydantic schemas of the community forum, re-exported for convenience."""

from shared.schemas.admin import (
    AdminStats,
    AuditEntry,
    BanRequest,
    RoleUpdate,
    UserAdmin,
)
from shared.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    RegisterRequest,
    TokenResponse,
)
from shared.schemas.categories import CategoryCreate, CategoryOrder, CategoryOut, CategoryUpdate
from shared.schemas.comments import CommentCreate, CommentNode, CommentSummary, CommentUpdate
from shared.schemas.common import ErrorDetail, ErrorOut, Page, UserBrief
from shared.schemas.notifications import (
    NotificationOut,
    NotificationReadRequest,
    SubscriptionState,
    UnreadCount,
)
from shared.schemas.reports import ReportAction, ReportCreate, ReportOut, ReportResolve
from shared.schemas.threads import (
    ThreadCreate,
    ThreadDetail,
    ThreadLock,
    ThreadMove,
    ThreadPin,
    ThreadSummary,
    ThreadUpdate,
)
from shared.schemas.users import MeUpdate, PublicProfile, UserOut
from shared.schemas.votes import VoteRequest, VoteResult

__all__ = [
    "AdminStats",
    "AuditEntry",
    "BanRequest",
    "CategoryCreate",
    "CategoryOrder",
    "CategoryOut",
    "CategoryUpdate",
    "CommentCreate",
    "CommentNode",
    "CommentSummary",
    "CommentUpdate",
    "ErrorDetail",
    "ErrorOut",
    "LoginRequest",
    "MeUpdate",
    "NotificationOut",
    "NotificationReadRequest",
    "Page",
    "PasswordChangeRequest",
    "PublicProfile",
    "RegisterRequest",
    "ReportAction",
    "ReportCreate",
    "ReportOut",
    "ReportResolve",
    "RoleUpdate",
    "SubscriptionState",
    "ThreadCreate",
    "ThreadDetail",
    "ThreadLock",
    "ThreadMove",
    "ThreadPin",
    "ThreadSummary",
    "ThreadUpdate",
    "TokenResponse",
    "UnreadCount",
    "UserAdmin",
    "UserBrief",
    "UserOut",
    "VoteRequest",
    "VoteResult",
]
