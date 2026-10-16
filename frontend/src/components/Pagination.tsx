import { cn } from "../lib/cn";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  /** Total number of pages. */
  pages: number;
  /** Total number of rows, shown in the info line. */
  totalItems?: number;
  /** Noun for the info line ("Threads", "Treffer", "Benachrichtigungen"). */
  itemLabel?: string;
  onPageChange: (page: number) => void;
  className?: string;
  label?: string;
}

function pageWindow(page: number, pages: number): (number | "gap")[] {
  if (pages <= 5) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }
  const window: (number | "gap")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) window.push("gap");
  for (let index = from; index <= to; index += 1) window.push(index);
  if (to < pages - 1) window.push("gap");
  window.push(pages);
  return window;
}

/**
 * Page switcher under every list. Renders nothing when a single page exists —
 * an inactive control would be a dead element on the page.
 */
export function Pagination({
  page,
  pages,
  totalItems,
  itemLabel = "Einträge",
  onPageChange,
  className,
  label = "Seitennavigation",
}: PaginationProps) {
  if (pages <= 1) return null;

  const current = Math.min(Math.max(page, 1), pages);
  return (
    <nav className={cn("pagination", className)} aria-label={label}>
      <div className="pagination-row">
        <button
          className="page-btn"
          type="button"
          disabled={current <= 1}
          aria-label="Zurück"
          onClick={() => onPageChange(current - 1)}
        >
          <ChevronLeftIcon />
        </button>
        {pageWindow(current, pages).map((entry, index) =>
          entry === "gap" ? (
            <span className="page-btn" key={`gap-${index}`} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              className={cn("page-btn", entry === current && "page-btn--current")}
              key={entry}
              type="button"
              aria-current={entry === current ? "page" : undefined}
              onClick={() => onPageChange(entry)}
            >
              {entry}
            </button>
          ),
        )}
        <button
          className="page-btn"
          type="button"
          disabled={current >= pages}
          aria-label="Weiter"
          onClick={() => onPageChange(current + 1)}
        >
          <ChevronRightIcon />
        </button>
      </div>
      <span className="pagination-info">
        Seite {current} von {pages}
        {totalItems !== undefined ? ` · ${totalItems} ${itemLabel}` : ""}
      </span>
    </nav>
  );
}
