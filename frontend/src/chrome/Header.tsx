import { Link, useNavigate } from "react-router-dom";
import {
  AccountMenu,
  IconButton,
  LinkButton,
  MoonIcon,
  NotificationBell,
  SearchBar,
  SunIcon,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useUnreadCount } from "../features/notifications/useUnreadCount";

/**
 * Application header of the forum: brand, search, new-thread action, the
 * notification bell, the account menu and the theme toggle — the chrome every
 * forum screen of the design shares. At phone width the search bar and the
 * brand text give way (design/mockups/styles.css), the navigation stays.
 */
export function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toggleTheme } = useTheme();
  const unreadCount = useUnreadCount();

  const handleLogout = () => {
    void logout().then(() => navigate("/login"));
  };

  return (
    <header className="app-header" data-od-id="app-header">
      <div className="container">
        <Link className="brand" to="/" data-od-id="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span className="txt">Community</span>
        </Link>

        <SearchBar
          onSubmit={(query) => {
            navigate(query === "" ? "/search" : `/search?q=${encodeURIComponent(query)}`);
          }}
        />

        <div className="header-actions">
          <LinkButton to="/new-thread" variant="primary">
            Neuer Thread
          </LinkButton>

          <NotificationBell unreadCount={unreadCount} items={[]} viewAllHref="/notifications" />

          <AccountMenu
            user={user !== null ? { username: user.username } : null}
            onLogout={handleLogout}
            profileHref={user !== null ? `/users/${encodeURIComponent(user.username)}` : undefined}
            settingsHref="/settings"
            notificationsHref="/notifications"
            loginHref="/login"
            registerHref="/register"
          />

          <IconButton label="Hell/Dunkel umschalten" onClick={toggleTheme}>
            <MoonIcon />
            <SunIcon />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
