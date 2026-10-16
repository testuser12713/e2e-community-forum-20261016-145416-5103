import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { InboxIcon } from "./icons";

export interface EmptyStateProps {
  /** Headline of the empty state. */
  title: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  /** Optional call to action below the text. */
  action?: ReactNode;
  className?: string;
}

/**
 * What a list shows when it has nothing to show. Also the placeholder for a
 * section another ticket still owes — never a blank page.
 */
export function EmptyState({ title, children, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      {icon ?? <InboxIcon />}
      <h4>{title}</h4>
      {children !== undefined && <p>{children}</p>}
      {action}
    </div>
  );
}
