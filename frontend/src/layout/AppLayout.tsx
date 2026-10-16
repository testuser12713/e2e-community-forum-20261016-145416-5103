import type { ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "../chrome/Header";

export interface AppLayoutProps {
  /**
   * Slot for the application header; the forum chrome fills it. Pass `null` to
   * render a screen without header (the auth shell of the design does that).
   */
  header?: ReactNode;
  children?: ReactNode;
}

/**
 * Frame around every forum route: the shared header chrome above the routed
 * page. The sign-in and registration screens are the design's standalone auth
 * shell (design/mockups/login.html) and carry their own brand row, so they
 * render without the forum header.
 */
const HEADERLESS_ROUTES = ["/login", "/register"];

export function AppLayout({ header, children }: AppLayoutProps) {
  const { pathname } = useLocation();
  const chrome =
    header !== undefined ? header : HEADERLESS_ROUTES.includes(pathname) ? null : <Header />;

  return (
    <>
      {chrome}
      <main className="container page">{children ?? <Outlet />}</main>
    </>
  );
}
