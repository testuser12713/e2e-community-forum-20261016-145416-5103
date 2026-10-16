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
  children: ReactNode;
  /** Actions on the right edge of the head row. */
  actions?: ReactNode;
  className?: string;
}

export function CardHead({ children, actions, className }: CardHeadProps) {
  return (
    <div className={cn("card-head", className)}>
      {children}
      {actions}
    </div>
  );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("card-title", className)}>{children}</span>;
}
