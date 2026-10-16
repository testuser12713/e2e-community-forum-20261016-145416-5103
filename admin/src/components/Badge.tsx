import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type BadgeVariant =
  | "role"
  | "moderator"
  | "admin"
  | "pin"
  | "lock"
  | "removed"
  | "new"
  | "danger"
  | "count"
  | "open"
  | "progress"
  | "done";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  role: "badge--role",
  moderator: "badge--moderator",
  admin: "badge--admin",
  pin: "badge--pin",
  lock: "badge--lock",
  removed: "badge--removed",
  new: "badge--new",
  danger: "badge--danger",
  count: "badge--count",
  open: "badge--open",
  progress: "badge--progress",
  done: "badge--done",
};

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  /** Decorative badges (a count beside a label) stay out of the accessible name. */
  decorative?: boolean;
  className?: string;
  title?: string;
}

export function Badge({ children, variant = "role", decorative, className, title }: BadgeProps) {
  return (
    <span
      className={cn("badge", VARIANT_CLASS[variant], className)}
      aria-hidden={decorative || undefined}
      title={title}
    >
      {children}
    </span>
  );
}
