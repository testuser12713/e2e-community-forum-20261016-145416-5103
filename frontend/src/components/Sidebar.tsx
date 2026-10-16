import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface SidebarProps {
  children: ReactNode;
  className?: string;
}

/** Fixed-width rail beside the thread feed. */
export function Sidebar({ children, className }: SidebarProps) {
  return <aside className={cn("sidebar", className)}>{children}</aside>;
}

export interface SidebarCardProps {
  heading?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SidebarCard({ heading, children, className }: SidebarCardProps) {
  return (
    <div className={cn("sidebar-card", className)}>
      {heading !== undefined && <div className="sidebar-heading">{heading}</div>}
      {children}
    </div>
  );
}

export interface StatListProps {
  items: { label: ReactNode; value: ReactNode }[];
  className?: string;
}

/** Label/value rows used by the statistics cards ("Kommentare 12"). */
export function StatList({ items, className }: StatListProps) {
  return (
    <dl className={cn("stack gap-1 small", className)}>
      {items.map((item, index) => (
        <div className="between" key={index}>
          <dt className="muted">{item.label}</dt>
          <dd className="tabular" style={{ margin: 0 }}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
