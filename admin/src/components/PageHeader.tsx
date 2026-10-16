import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("admin-head", className)}>
      <div>
        <h1>{title}</h1>
        {description !== undefined ? <p>{description}</p> : null}
      </div>
      {actions !== undefined ? <div className="admin-head-actions">{actions}</div> : null}
    </div>
  );
}
