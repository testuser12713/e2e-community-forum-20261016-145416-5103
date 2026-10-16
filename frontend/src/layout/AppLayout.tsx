import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useUnreadCount } from "../features/notifications/useUnreadCount";

export interface AppLayoutProps {
  /**
   * Slot for the application header. The UI kit's header fills it; until then the
   * layout renders the shell header below so the forum is navigable.
   */
  header?: ReactNode;
  children?: ReactNode;
}

export function AppLayout({ header, children }: AppLayoutProps) {
  return (
    <>
      {header ?? <ShellHeader />}
      <main className="container page">{children ?? <Outlet />}</main>
    </>
  );
}

function ShellHeader() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toggleTheme } = useTheme();
  const unreadCount = useUnreadCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    navigate(term === "" ? "/search" : `/search?q=${encodeURIComponent(term)}`);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    navigate("/login");
  };

  return (
    <header className="app-header">
      <div className="container">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span className="txt">Community</span>
        </Link>

        <form className="search-bar" role="search" onSubmit={submitSearch}>
          <SearchIcon />
          <input
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Threads durchsuchen…"
            aria-label="Threads durchsuchen"
          />
        </form>

        <div className="header-actions">
          <Link className="btn btn-primary" to="/new-thread">
            Neuer Thread
          </Link>

          <div className="popwrap">
            <Link className="icon-btn" to="/notifications" aria-label="Benachrichtigungen">
              <BellIcon />
            </Link>
            {unreadCount > 0 && (
              <span className="bell-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </div>

          <div className="popwrap" ref={menuRef}>
            <button
              className="icon-btn"
              type="button"
              aria-label="Konto"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="avatar avatar--24 av-0">
                {user ? user.username.charAt(0).toUpperCase() : "?"}
              </span>
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                {user ? (
                  <>
                    <Link
                      className="menu-item"
                      role="menuitem"
                      to={`/users/${encodeURIComponent(user.username)}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      Profil
                    </Link>
                    <Link
                      className="menu-item"
                      role="menuitem"
                      to="/settings"
                      onClick={() => setMenuOpen(false)}
                    >
                      Einstellungen
                    </Link>
                    <Link
                      className="menu-item"
                      role="menuitem"
                      to="/notifications"
                      onClick={() => setMenuOpen(false)}
                    >
                      Benachrichtigungen
                    </Link>
                    <div className="menu-sep" />
                    <button
                      className="menu-item"
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void handleLogout();
                      }}
                    >
                      Abmelden
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      className="menu-item"
                      role="menuitem"
                      to="/login"
                      onClick={() => setMenuOpen(false)}
                    >
                      Anmelden
                    </Link>
                    <Link
                      className="menu-item"
                      role="menuitem"
                      to="/register"
                      onClick={() => setMenuOpen(false)}
                    >
                      Registrieren
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            className="icon-btn"
            type="button"
            onClick={toggleTheme}
            aria-label="Hell/Dunkel umschalten"
          >
            <MoonIcon />
            <SunIcon />
          </button>
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="theme-moon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      className="theme-sun"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
