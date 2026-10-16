import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import "./kit.css";

export interface MenuProps {
  children: ReactNode;
  /** Accessible name of the menu. */
  label?: string;
  className?: string;
}

export function Menu({ children, label, className }: MenuProps) {
  return (
    <div className={cn("menu", className)} role="menu" aria-label={label}>
      {children}
    </div>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  to?: string;
  disabled?: boolean;
  className?: string;
}

export function MenuItem({ children, onClick, href, to, disabled, className }: MenuItemProps) {
  const classes = cn("menu-item", className);
  if (to && !disabled) {
    return (
      <Link className={classes} to={to} role="menuitem" onClick={onClick}>
        {children}
      </Link>
    );
  }
  if (href && !disabled) {
    return (
      <a className={classes} href={href} role="menuitem" onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />;
}
