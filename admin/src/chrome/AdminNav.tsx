import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Avatar,
  Badge,
  IconButton,
  SideNavItem,
  ThemeToggle,
  AuditIcon,
  CategoriesIcon,
  DashboardIcon,
  ForumIcon,
  LoginIcon,
  LogoutIcon,
  ReportsIcon,
  UsersIcon,
} from "../components";
import { FORUM_URL, type UserOut } from "../lib/api";
import { cn } from "../lib/cn";
import "../components/kit.css";

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  moderator: "Moderator",
  user: "Nutzer",
};

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const NAV_ENTRIES: NavEntry[] = [
  { to: "/", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/users", label: "Nutzer", icon: <UsersIcon /> },
  { to: "/categories", label: "Kategorien", icon: <CategoriesIcon /> },
  { to: "/moderation", label: "Meldungen", icon: <ReportsIcon /> },
  { to: "/audit", label: "Audit-Log", icon: <AuditIcon /> },
];

export interface AdminBrandProps {
  onNavigate?: () => void;
  className?: string;
}

export function AdminBrand({ onNavigate, className }: AdminBrandProps) {
  return (
    <Link className={cn("brand admin-planelogo", className)} to="/" onClick={onNavigate}>
      <span className="brand-mark" aria-hidden="true">
        A
      </span>
      Forum-Admin
    </Link>
  );
}

export interface AdminNavProps {
  user?: UserOut | null;
  label?: string;
  /** The drawer omits the icons, like the approved screens do. */
  compact?: boolean;
  /** Number shown as a badge on "Meldungen"; omitted when unknown. */
  reportCount?: number;
  onSignOut?: () => void;
  onNavigate?: () => void;
}

export function AdminNav({
  user = null,
  label = "Admin-Navigation",
  compact = false,
  reportCount,
  onSignOut,
  onNavigate,
}: AdminNavProps) {
  return (
    <>
      <nav className="admin-nav" aria-label={label}>
        {NAV_ENTRIES.map((entry) => (
          <SideNavItem
            key={entry.to}
            to={entry.to}
            end={entry.end}
            icon={compact ? undefined : entry.icon}
            badge={
              entry.to === "/moderation" && reportCount !== undefined ? (
                <Badge variant="danger" decorative>
                  {reportCount}
                </Badge>
              ) : undefined
            }
            onClick={onNavigate}
          >
            {entry.label}
          </SideNavItem>
        ))}
      </nav>

      <div className="admin-side-foot">
        <SideNavItem
          href={FORUM_URL}
          icon={compact ? undefined : <ForumIcon />}
          onClick={onNavigate}
        >
          Zum Forum
        </SideNavItem>
        <ThemeToggle />
        {user ? (
          <div className="admin-account">
            <Avatar name={user.username} size="sm" />
            <div className="grow">
              <div className="admin-account-name">@{user.username}</div>
              <div className="xs muted">{ROLE_LABELS[user.role] ?? user.role}</div>
            </div>
            <IconButton size="sm" label="Abmelden" title="Abmelden" onClick={onSignOut}>
              <LogoutIcon />
            </IconButton>
          </div>
        ) : (
          <SideNavItem to="/login" icon={compact ? undefined : <LoginIcon />} onClick={onNavigate}>
            Anmelden
          </SideNavItem>
        )}
      </div>
    </>
  );
}
