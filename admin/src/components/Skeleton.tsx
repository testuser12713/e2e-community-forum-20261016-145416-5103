import { cn } from "../lib/cn";

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function Skeleton({ width, height, className }: SkeletonProps) {
  return (
    <span
      className={cn("skeleton", className)}
      aria-hidden="true"
      style={{ display: "block", width, height }}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("stack gap-1", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="skeleton sk-line"
          style={{ display: "block", width: index === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}
