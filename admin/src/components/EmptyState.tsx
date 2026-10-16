import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { InboxIcon } from "./icons";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      {icon ?? <InboxIcon />}
      <h4>{title}</h4>
      {description !== undefined ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
