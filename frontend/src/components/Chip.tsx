import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export interface ChipProps {
  children: ReactNode;
  /** Selected filter chip (accent-soft background). */
  selected?: boolean;
  /** Adds the trailing × affordance. */
  removable?: boolean;
  onRemove?: () => void;
  to?: string;
  className?: string;
  /** Accessible name for the removal control. */
  removeLabel?: string;
}

/**
 * Rounded filter/token chip. Renders a button when it can be removed or
 * clicked, a link when it navigates, a plain span otherwise.
 */
export function Chip({
  children,
  selected = false,
  removable = false,
  onRemove,
  to,
  className,
  removeLabel,
}: ChipProps) {
  const classes = cn(
    "chip",
    selected && "chip--selected",
    (removable || onRemove !== undefined) && "chip--removable",
    className,
  );
  const content = (
    <>
      {children}
      {removable && (
        <span className="x" aria-hidden="true">
          ×
        </span>
      )}
    </>
  );

  if (to !== undefined) {
    return (
      <Link className={classes} to={to}>
        {content}
      </Link>
    );
  }
  if (onRemove !== undefined) {
    return (
      <button
        className={classes}
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
      >
        {content}
      </button>
    );
  }
  return <span className={classes}>{content}</span>;
}
