import type { CSSProperties } from "react";
import { cn } from "../lib/cn";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  /** Renders the line variant (`sk-line`) instead of a block. */
  line?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Placeholder block shown while real content is on its way. */
export function Skeleton({ width, height, line = false, className, style }: SkeletonProps) {
  return (
    <span
      className={cn("skeleton", line && "sk-line", className)}
      style={{ display: "block", width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** A run of shimmering lines for text that has not arrived yet. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("stack gap-1", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} line style={{ width: index === lines - 1 ? "60%" : "100%" }} />
      ))}
    </div>
  );
}
