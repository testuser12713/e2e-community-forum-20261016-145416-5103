import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LinkButton,
  Pagination,
  SegmentedTabs,
  SkeletonText,
} from "../components";
import { refreshUnreadCount, setUnreadCount, useUnreadCount } from "../features/notifications/useUnreadCount";
import { ApiError, apiFetch } from "../lib/api";

/** Notification row of GET /api/notifications (shared.schemas.NotificationOut). */
interface NotificationOut {
  id: number;
  kind: string;
  thread_id: number | null;
  comment_id: number | null;
  actor_username: string | null;
  created_at: string;
  read_at: string | null;
}

interface NotificationPage {
  items: NotificationOut[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

type Filter = "unread" | "all";

const PAGE_SIZE = 20;

function avatarColor(username: string): number {
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = (hash + username.charCodeAt(index)) % 8;
  }
  return hash;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
}

/** Target of a notification: the thread, anchored at the comment when there is one. */
function notificationHref(notification: NotificationOut): string {
  if (notification.thread_id === null) return "/notifications";
  const base = `/threads/${notification.thread_id}`;
  return notification.comment_id === null ? base : `${base}#comment-${notification.comment_id}`;
}

function notificationMessage(notification: NotificationOut): ReactNode {
  const actor =
    notification.actor_username === null ? null : <strong>@{notification.actor_username}</strong>;
  switch (notification.kind) {
    case "reply":
      return actor === null ? (
        <>Jemand hat auf deinen Beitrag geantwortet</>
      ) : (
        <>
          {actor} hat auf deinen Beitrag geantwortet
        </>
      );
    case "mention":
      return <>Du wurdest in einem Kommentar erwähnt</>;
    case "subscription":
      return <>Neuer Kommentar in einem abonnierten Thread</>;
    default:
      return <>Neue Benachrichtigung</>;
  }
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: NotificationOut;
  onOpen: (id: number) => void;
}) {
  const unread = notification.read_at === null;
  return (
    <Link
      className={unread ? "notif-item notif-item--unread" : "notif-item"}
      to={notificationHref(notification)}
      onClick={() => {
        if (unread) onOpen(notification.id);
      }}
    >
      <Avatar
        name={notification.actor_username ?? undefined}
        size={24}
        color={notification.actor_username === null ? 0 : avatarColor(notification.actor_username)}
      />
      <p>
        {notificationMessage(notification)}
        <br />
        <span className="muted small">{formatRelativeTime(notification.created_at)}</span>
      </p>
      {unread && <span className="notif-dot" aria-hidden="true" />}
    </Link>
  );
}

/**
 * The signed-in user's notification inbox (design/mockups/notifications.html):
 * the unread counter, the Ungelesen/Alle filter, the list whose entries link to
 * the thread or comment they refer to, mark-all-read and the pagination that
 * follows GET /api/notifications.
 */
export default function Notifications() {
  const unreadCount = useUnreadCount();
  const [filter, setFilter] = useState<Filter>("unread");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
      unread_only: String(filter === "unread"),
    });
    apiFetch<NotificationPage>(`/api/notifications?${query.toString()}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof ApiError ? cause : new ApiError(0, "network_error", "Netzwerkfehler"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, page, reloadToken]);

  const markRead = useCallback(
    async (ids?: number[]) => {
      try {
        await apiFetch<void>("/api/notifications/read", {
          method: "POST",
          body: JSON.stringify(ids === undefined ? {} : { ids }),
        });
      } catch {
        // The badge is refreshed against the server either way, so a failed
        // write does not silently claim the entries are read.
        await refreshUnreadCount();
        return;
      }
      if (ids === undefined) {
        setUnreadCount(0);
      }
      await refreshUnreadCount();
      setReloadToken((token) => token + 1);
    },
    [],
  );

  const handleFilter = useCallback((next: Filter) => {
    setFilter(next);
    setPage(1);
  }, []);

  const markAllRead = useCallback(() => {
    void markRead();
  }, [markRead]);

  const openNotification = useCallback(
    (id: number) => {
      void markRead([id]);
    },
    [markRead],
  );

  return (
    <div className="reading-col" style={{ margin: "0 auto" }}>
      <div className="between gap-3 wrap" style={{ marginBottom: 16 }}>
        <div className="row gap-2">
          <h2>Benachrichtigungen</h2>
          <Badge variant="new">{unreadCount} ungelesen</Badge>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={unreadCount === 0}
          title={unreadCount === 0 ? "Keine ungelesenen Benachrichtigungen" : undefined}
          onClick={markAllRead}
        >
          Alle als gelesen markieren
        </Button>
      </div>

      <SegmentedTabs<Filter>
        items={[
          { value: "unread", label: "Ungelesen" },
          { value: "all", label: "Alle" },
        ]}
        value={filter}
        onChange={handleFilter}
        label="Filter"
      />

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <SkeletonText lines={4} />
        ) : error !== null ? (
          error.status === 401 ? (
            <EmptyState title="Anmeldung erforderlich" action={<LinkButton to="/login">Anmelden</LinkButton>}>
              Melde dich an, um deine Benachrichtigungen zu sehen.
            </EmptyState>
          ) : (
            <EmptyState title="Benachrichtigungen konnten nicht geladen werden">
              {error.message}
            </EmptyState>
          )
        ) : data === null || data.items.length === 0 ? (
          <EmptyState title={filter === "unread" ? "Keine ungelesenen Benachrichtigungen" : "Noch keine Benachrichtigungen"}>
            {filter === "unread"
              ? "Du bist auf dem neuesten Stand."
              : "Hier erscheinen Antworten, Erwähnungen und neue Kommentare abonnierter Threads."}
          </EmptyState>
        ) : (
          data.items.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onOpen={openNotification}
            />
          ))
        )}
      </div>

      {data !== null && (
        <Pagination
          page={data.page}
          pages={data.pages}
          totalItems={data.total}
          itemLabel="Benachrichtigungen"
          onPageChange={setPage}
        />
      )}

      <div style={{ marginTop: "var(--space-4)" }}>
        <Card>
          <p className="muted small">
            Benachrichtigungen erscheinen nur in der Anwendung. E-Mails versenden wir bewusst nicht.
          </p>
        </Card>
      </div>
    </div>
  );
}
