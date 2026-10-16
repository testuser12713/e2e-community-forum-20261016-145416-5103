import { cn } from "../lib/cn";

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Accessible name of the bar. */
  label?: string;
  className?: string;
}

export function ProgressBar({ value, max = 100, label, className }: ProgressBarProps) {
  const bounded = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (bounded / max) * 100 : 0;
  return (
    <div
      className={cn("bar", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={bounded}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}
