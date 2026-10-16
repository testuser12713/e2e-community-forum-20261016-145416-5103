import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../lib/cn";

export interface SideNavItemProps {
  children: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  /** Router link target. */
  to?: string;
  /** Plain link target (e.g. the forum). */
  href?: string;
  end?: boolean;
  /** Forces the active state for presentational use. */
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export function SideNavItem({
  children,
  icon,
  badge,
  to,
  href,
  end,
  active,
  onClick,
  className,
}: SideNavItemProps) {
  const classes = cn("admin-nav-item", active && "admin-nav-item--active", className);
  const content = (
    <>
      {icon}
      {children}
      {badge}
    </>
  );

  if (to !== undefined) {
    return (
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        className={({ isActive }) =>
          cn("admin-nav-item", (active ?? isActive) && "admin-nav-item--active")
        }
      >
        {content}
      </NavLink>
    );
  }
  if (href !== undefined) {
    return (
      <a
        className={classes}
        href={href}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={cn("admin-nav-item", className)} onClick={onClick}>
      {content}
    </button>
  );
}
