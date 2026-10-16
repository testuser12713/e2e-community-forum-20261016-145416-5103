import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface SegmentedTab<T extends string> {
  value: T;
  label: ReactNode;
  /** Additional hint such as "Nach Stimmen mit Zeitverfall sortiert". */
  title?: string;
}

export interface SegmentedTabsProps<T extends string> {
  items: SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab group ("Sortierung", "Filter", …). */
  label: string;
  className?: string;
}

/**
 * The design's segmented control (sort tabs, notification filter, profile
 * sections, theme choice). Selected state is `aria-selected` on the tab.
 */
export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: SegmentedTabsProps<T>) {
  return (
    <div className={cn("sort-tabs", className)} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.value}
          className="sort-tab"
          type="button"
          role="tab"
          aria-selected={item.value === value}
          title={item.title}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
