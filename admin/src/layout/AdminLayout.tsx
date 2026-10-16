import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { AdminBrand, AdminNav } from "../chrome/AdminNav";
import { IconButton, MenuIcon } from "../components";
import { useAuth } from "../context/AuthContext";
import "../components/kit.css";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const signOut = () => {
    void logout();
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <AdminBrand />
        <AdminNav user={user} onSignOut={signOut} />
      </aside>

      <header className="admin-topbar">
        <IconButton
          label="Navigation öffnen"
          expanded={drawerOpen}
          controls="admin-drawer"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon />
        </IconButton>
        <span className="admin-topbar-title">Forum-Admin</span>
      </header>

      {drawerOpen ? (
        <div className="admin-drawer" id="admin-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="drawer-panel">
            <AdminBrand className="admin-planelogo--drawer" onNavigate={() => setDrawerOpen(false)} />
            <AdminNav
              label="Admin-Navigation (mobil)"
              compact
              user={user}
              onSignOut={signOut}
              onNavigate={() => setDrawerOpen(false)}
            />
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
