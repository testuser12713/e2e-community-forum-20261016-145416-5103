import { cn } from "../lib/cn";

export interface PaginationProps {
  page: number;
  pages: number;
  total?: number;
  /** Noun of the counted items, e.g. "Nutzer" or "Einträge". */
  totalLabel?: string;
  label?: string;
  onPageChange: (page: number) => void;
  className?: string;
}

type PageSlot = number | "gap";

function pageSlots(page: number, pages: number): PageSlot[] {
  const slots: PageSlot[] = [];
  const push = (slot: PageSlot) => {
    if (slots[slots.length - 1] !== slot) slots.push(slot);
  };
  for (let current = 1; current <= pages; current += 1) {
    if (current === 1 || current === pages || Math.abs(current - page) <= 1) push(current);
    else push("gap");
  }
  return slots;
}

export function Pagination({
  page,
  pages,
  total,
  totalLabel = "Einträge",
  label = "Seitennavigation",
  onPageChange,
  className,
}: PaginationProps) {
  const safePages = Math.max(1, pages);
  const current = Math.min(Math.max(1, page), safePages);
  const info =
    total !== undefined
      ? `Seite ${current} von ${safePages} · ${total.toLocaleString("de-DE")} ${totalLabel}`
      : `Seite ${current} von ${safePages}`;

  return (
    <nav className={cn("pagination", className)} aria-label={label}>
      <div className="pagination-row">
        <button
          type="button"
          className="page-btn"
          disabled={current <= 1}
          aria-label="Zurück"
          onClick={() => onPageChange(current - 1)}
        >
          ‹
        </button>
        {pageSlots(current, safePages).map((slot, index) =>
          slot === "gap" ? (
            <span key={`gap-${index}`} className="page-btn" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={slot}
              type="button"
              className={cn("page-btn", slot === current && "page-btn--current")}
              aria-current={slot === current ? "page" : undefined}
              onClick={() => onPageChange(slot)}
            >
              {slot}
            </button>
          ),
        )}
        <button
          type="button"
          className="page-btn"
          disabled={current >= safePages}
          aria-label="Weiter"
          onClick={() => onPageChange(current + 1)}
        >
          ›
        </button>
      </div>
      <span className="pagination-info">{info}</span>
    </nav>
  );
}
