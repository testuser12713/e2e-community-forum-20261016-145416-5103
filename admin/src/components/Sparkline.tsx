import { cn } from "../lib/cn";

export interface SparklineProps {
  /** The y values of the series, in reading order. */
  points: number[];
  /** Accessible description of the trend. */
  label: string;
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ points, label, width = 300, height = 40, className }: SparklineProps) {
  const values = points.length > 0 ? points : [0, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const padding = 4;
  const usable = height - padding * 2;
  const coords = values.map((value, index) => {
    const x = Math.round(index * step);
    const y = Math.round(padding + (1 - (value - min) / span) * usable);
    return `${x},${y}`;
  });

  return (
    <svg
      className={cn("spark", className)}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <polyline
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(" ")}
      />
    </svg>
  );
}
