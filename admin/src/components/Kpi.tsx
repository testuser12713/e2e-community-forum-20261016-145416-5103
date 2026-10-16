import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Delta, type DeltaDirection } from "./Delta";

export interface KpiTrend {
  delta: ReactNode;
  direction: DeltaDirection;
  note?: string;
}

export interface KpiProps {
  label: string;
  value: ReactNode;
  /** Highlights the value in the danger colour (e.g. open reports). */
  tone?: "default" | "danger";
  trend?: KpiTrend;
  className?: string;
}

export function Kpi({ label, value, tone = "default", trend, className }: KpiProps) {
  return (
    <div className={cn("kpi", className)}>
      <span className="kpi-label">{label}</span>
      <span className={cn("kpi-value", tone === "danger" && "kpi-value--danger", "tabular")}>
        {value}
      </span>
      {trend !== undefined ? (
        <span className="kpi-trend">
          <Delta direction={trend.direction}>{trend.delta}</Delta>
          {trend.note !== undefined ? <span>{trend.note}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

export interface KpiGridProps {
  children: ReactNode;
  label?: string;
  className?: string;
}

export function KpiGrid({ children, label = "Kennzahlen", className }: KpiGridProps) {
  return (
    <section className={cn("kpi-grid", className)} aria-label={label}>
      {children}
    </section>
  );
}
