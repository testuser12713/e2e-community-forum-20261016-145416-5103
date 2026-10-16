import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  removable?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  href?: string;
  to?: string;
  title?: string;
  className?: string;
}

export function Chip({
  children,
  selected = false,
  removable = false,
  onClick,
  onRemove,
  href,
  to,
  title,
  className,
}: ChipProps) {
  const classes = cn("chip", selected && "chip--selected", removable && "chip--removable", className);
  const content = (
    <>
      {children}
      {removable ? (
        <span className="x" aria-hidden="true">
          ×
        </span>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link className={classes} to={to} title={title}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a className={classes} href={href} title={title}>
        {content}
      </a>
    );
  }
  if (onClick || removable || onRemove) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onRemove ?? onClick}
        aria-pressed={selected || undefined}
        title={title}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={classes} title={title}>
      {content}
    </span>
  );
}
