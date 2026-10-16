import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import "./kit.css";

export type IconButtonSize = "md" | "sm";

export interface IconButtonProps {
  label: string;
  children: ReactNode;
  size?: IconButtonSize;
  to?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}

export function IconButton({
  label,
  children,
  size = "md",
  to,
  href,
  onClick,
  disabled = false,
  pressed,
  expanded,
  controls,
  type = "button",
  title,
  className,
}: IconButtonProps) {
  const classes = cn("icon-btn", size === "sm" && "icon-btn--sm", className);
  const tooltip = title ?? label;

  if (to && !disabled) {
    return (
      <Link className={classes} to={to} onClick={onClick} aria-label={label} title={tooltip}>
        {children}
      </Link>
    );
  }
  if (href && !disabled) {
    return (
      <a className={classes} href={href} onClick={onClick} aria-label={label} title={tooltip}>
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      title={tooltip}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
