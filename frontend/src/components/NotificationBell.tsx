import { useCallback, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { Popover } from "./Popover";
import { useDismissable } from "./useDismissable";
import { BellIcon } from "./icons";

export interface NotificationItemData {
  id: number;
  actor?: { username: string; color?: number };
  /** Main line; the design bolds the actor's name inside it. */
  message: ReactNode;
  /** Secondary line (thread title, excerpt, time). */
  detail?: ReactNode;
  unread?: boolean;
  href: string;
}

export interface NotificationBellProps {
  unreadCount?: number;
  items?: NotificationItemData[];
  /** Marks every unread notification as read; without it the control is dimmed. */
  onMarkAllRead?: () => void;
  /** Target of the "Alle anzeigen" link at the bottom of the panel. */
  viewAllHref?: string;
  /** Opens the panel on first render (used by the gallery and tests). */
  defaultOpen?: boolean;
  label?: string;
  emptyText?: string;
  className?: string;
}

function countLabel(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * Header bell with the unread badge and the notification popover of the design.
 * Everything it shows is passed in — the notification slice owns the data.
 */
export function NotificationBell({
  unreadCount = 0,
  items = [],
  onMarkAllRead,
  viewAllHref,
  defaultOpen = false,
  label = "Benachrichtigungen",
  emptyText = "Noch keine Benachrichtigungen.",
  className,
}: NotificationBellProps) {
  const [open, setOpen] = useState(defaultOpen);
  const close = useCallback(() => setOpen(false), []);
  const wrapperRef = useDismissable(open, close);

  return (
    <div className={cn("popwrap", className)} ref={wrapperRef}>
      <IconButton
        label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon />
      </IconButton>
      {unreadCount > 0 && (
        <span className="bell-badge" aria-hidden="true">
          {countLabel(unreadCount)}
        </span>
      )}

      <Popover open={open} label={label}>
        <div className="popover-head">
          <strong>{label}</strong>
          <Button
            variant="ghost"
            size="sm"
            disabled={onMarkAllRead === undefined}
            title={onMarkAllRead === undefined ? "Bald verfügbar" : undefined}
            onClick={onMarkAllRead}
          >
            Alle als gelesen markieren
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="muted small" style={{ padding: "8px 12px" }}>
            {emptyText}
          </p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              className={cn("notif-item", item.unread === true && "notif-item--unread")}
              to={item.href}
              onClick={() => setOpen(false)}
            >
              <Avatar name={item.actor?.username} size={24} color={item.actor?.color} />
              <p>
                {item.message}
                {item.detail !== undefined && (
                  <>
                    <br />
                    <span className="muted">{item.detail}</span>
                  </>
                )}
              </p>
              {item.unread === true && <span className="notif-dot" aria-hidden="true" />}
            </Link>
          ))
        )}

        {viewAllHref !== undefined && (
          <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
            <Link className="btn btn-ghost btn-sm" to={viewAllHref} onClick={() => setOpen(false)}>
              Alle anzeigen
            </Link>
          </div>
        )}
      </Popover>
    </div>
  );
}
