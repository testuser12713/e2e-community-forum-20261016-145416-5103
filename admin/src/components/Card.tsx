import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface CardProps {
  children: ReactNode;
  compact?: boolean;
  className?: string;
}

export function Card({ children, compact = false, className }: CardProps) {
  return <div className={cn("card", compact && "card--compact", className)}>{children}</div>;
}

export interface CardHeadProps {
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function CardHead({ title, action, children, className }: CardHeadProps) {
  return (
    <div className={cn("card-head", className)}>
      {title !== undefined ? <span className="card-title">{title}</span> : null}
      {action}
      {children}
    </div>
  );
}

export interface ReportCardProps {
  children: ReactNode;
  className?: string;
}

/** The framed entry of the moderation queue. */
export function ReportCard({ children, className }: ReportCardProps) {
  return <article className={cn("report-card", className)}>{children}</article>;
}
