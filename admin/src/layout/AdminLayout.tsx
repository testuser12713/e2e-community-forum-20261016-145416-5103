import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { FORUM_URL } from "../lib/api";
import { cn } from "../lib/cn";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CategoriesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" />
      <path d="M8 6H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
      <path d="M8 11h8M8 15h5" />
    </svg>
  );
}

function ForumIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function LoginIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function ThemeMoonIcon() {
  return (
    <svg className="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function ThemeSunIcon() {
  return (
    <svg className="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <DashboardIcon />, end: true },
  { to: "/users", label: "Nutzer", icon: <UsersIcon /> },
  { to: "/categories", label: "Kategorien", icon: <CategoriesIcon /> },
  { to: "/moderation", label: "Meldungen", icon: <ReportsIcon /> },
  { to: "/audit", label: "Audit-Log", icon: <AuditIcon /> },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  moderator: "Moderator",
  user: "Nutzer",
};

function AdminNav({ label, onNavigate }: { label: string; onNavigate?: () => void }) {
  return (
    <nav className="admin-nav" aria-label={label}>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) => cn("admin-nav-item", isActive && "admin-nav-item--active")}
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const account = (
    <div className="admin-account">
      {user ? (
        <>
          <span className="avatar avatar--24 av-5">{user.username.slice(0, 1)}</span>
          <div className="grow">
            <div style={{ fontSize: 13, fontWeight: 600 }}>@{user.username}</div>
            <div className="xs muted">{ROLE_LABELS[user.role] ?? user.role}</div>
          </div>
          <button
            className="icon-btn icon-btn--sm"
            type="button"
            onClick={() => void logout()}
            aria-label="Abmelden"
            title="Abmelden"
          >
            <LogoutIcon />
          </button>
        </>
      ) : (
        <NavLink to="/login" className="admin-nav-item">
          <LoginIcon />
          Anmelden
        </NavLink>
      )}
    </div>
  );

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="brand admin-planelogo" to="/">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          Forum-Admin
        </Link>

        <AdminNav label="Admin-Navigation" />

        <div className="admin-side-foot">
          <a className="admin-nav-item" href={FORUM_URL}>
            <ForumIcon />
            Zum Forum
          </a>
          <button className="admin-nav-item" type="button" onClick={toggleTheme}>
            <ThemeMoonIcon />
            <ThemeSunIcon />
            Darstellung
          </button>
          {account}
        </div>
      </aside>

      <div className="admin-topbar">
        <button
          className="icon-btn"
          type="button"
          aria-label="Navigation öffnen"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon />
        </button>
        <span style={{ fontWeight: 600 }}>Forum-Admin</span>
      </div>

      {drawerOpen ? (
        <div className="admin-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="drawer-panel">
            <Link className="brand admin-planelogo" to="/" style={{ marginBottom: 16 }} onClick={() => setDrawerOpen(false)}>
              <span className="brand-mark" aria-hidden="true">
                A
              </span>
              Forum-Admin
            </Link>
            <AdminNav label="Admin-Navigation (mobil)" onNavigate={() => setDrawerOpen(false)} />
            <div className="admin-side-foot">
              <a className="admin-nav-item" href={FORUM_URL}>
                <ForumIcon />
                Zum Forum
              </a>
              <button className="admin-nav-item" type="button" onClick={toggleTheme}>
                <ThemeMoonIcon />
                <ThemeSunIcon />
                Darstellung
              </button>
            </div>
          </div>
          <div className="drawer-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
        </div>
      ) : null}

      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}
