import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export interface PopoverProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
}

/** Raised panel anchored under a trigger (notification list, account menu). */
export function Popover({ open, children, className, label }: PopoverProps) {
  if (!open) return null;
  return (
    <div className={cn("popover", className)} role="dialog" aria-label={label}>
      {children}
    </div>
  );
}

export interface MenuProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  label?: string;
}

export function Menu({ open, children, className, label }: MenuProps) {
  if (!open) return null;
  return (
    <div className={cn("menu", className)} role="menu" aria-label={label}>
      {children}
    </div>
  );
}

export interface MenuItemProps {
  children: ReactNode;
  /** Navigation target; rendered as a link when given. */
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Extra hint, e.g. why the entry is unavailable. */
  title?: string;
}

export function MenuItem({ children, to, onClick, disabled = false, title }: MenuItemProps) {
  if (to !== undefined && !disabled) {
    return (
      <Link className="menu-item" role="menuitem" to={to} onClick={onClick} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button
      className="menu-item"
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />;
}
