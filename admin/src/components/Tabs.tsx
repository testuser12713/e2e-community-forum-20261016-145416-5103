import type { KeyboardEvent } from "react";
import { cn } from "../lib/cn";
import "./kit.css";

export interface TabItem {
  value: string;
  label: string;
  count?: number;
  panelId?: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  className?: string;
}

export function Tabs({ items, value, onChange, label, className }: TabsProps) {
  const select = (offset: number) => {
    const index = items.findIndex((item) => item.value === value);
    if (index < 0) return;
    for (let step = 1; step <= items.length; step += 1) {
      const next = (index + offset * step + items.length * step) % items.length;
      const candidate = items[next];
      if (!candidate.disabled) {
        onChange(candidate.value);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      select(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      select(-1);
    }
  };

  return (
    <div className={cn("sort-tabs", className)} role="tablist" aria-label={label}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            className="sort-tab"
            aria-selected={selected}
            aria-controls={item.panelId}
            disabled={item.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={handleKeyDown}
          >
            <span>{item.label}</span>
            {item.count !== undefined ? <span className="tabular">{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
