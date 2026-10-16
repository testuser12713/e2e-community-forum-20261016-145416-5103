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
  | "count";

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
  title?: string;
}

/**
 * Small uppercase label the screens use for roles, pinned/locked/removed
 * threads and counters.
 */
export function Badge({ variant = "role", children, className, title }: BadgeProps) {
  return (
    <span className={cn("badge", `badge--${variant}`, className)} title={title}>
      {children}
    </span>
  );
}
