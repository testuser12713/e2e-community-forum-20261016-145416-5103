import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type DeltaDirection = "up" | "down";

export interface DeltaProps {
  direction: DeltaDirection;
  children: ReactNode;
  className?: string;
}

export function Delta({ direction, children, className }: DeltaProps) {
  return (
    <span className={cn("delta", direction === "up" ? "delta--up" : "delta--down", className)}>
      {children}
    </span>
  );
}
