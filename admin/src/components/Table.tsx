import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";
import { EmptyState } from "./EmptyState";

export interface TableProps {
  children: ReactNode;
  /** True while the rows are still loading — the table announces itself busy. */
  busy?: boolean;
  /** Accessible name of the table. */
  label?: string;
  className?: string;
}

export function Table({ children, busy, label, className }: TableProps) {
  return (
    <div className={cn("table-wrap", className)}>
      <table className="data" aria-busy={busy || undefined} aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export interface TableRowProps {
  children: ReactNode;
  className?: string;
}

export function TableRow({ children, className }: TableRowProps) {
  return <tr className={className}>{children}</tr>;
}

export type SortDirection = "asc" | "desc";

export interface ThProps {
  children?: ReactNode;
  /** Right-aligned numeric column. */
  num?: boolean;
  sortable?: boolean;
  sorted?: SortDirection | false;
  onSort?: () => void;
  width?: number;
  className?: string;
}

export function Th({ children, num, sortable, sorted = false, onSort, width, className }: ThProps) {
  const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : sortable ? "none" : undefined;
  const style = width !== undefined ? { width } : undefined;
  if (!sortable) {
    return (
      <th scope="col" className={cn(num && "col-num", className)} style={style}>
        {children}
      </th>
    );
  }
  return (
    <th scope="col" aria-sort={ariaSort} className={cn(num && "col-num", className)} style={style}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onSort}>
        {children}
        {sorted === "asc" ? (
          <ChevronUpIcon width={16} height={16} />
        ) : sorted === "desc" ? (
          <ChevronDownIcon width={16} height={16} />
        ) : (
          <span className="muted">
            <ChevronUpIcon width={16} height={16} />
          </span>
        )}
      </button>
    </th>
  );
}

export interface TdProps {
  children?: ReactNode;
  /** Right-aligned numeric cell. */
  num?: boolean;
  className?: string;
}

export function Td({ children, num, className }: TdProps) {
  return <td className={cn(num && "col-num tabular", className)}>{children}</td>;
}

export interface TableLoadingRowsProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** Number of columns of the table. */
  columns: number;
}

const LINE_WIDTHS = ["72%", "50%", "86%", "40%", "62%", "54%"];

export function TableLoadingRows({ rows = 5, columns }: TableLoadingRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <td key={column}>
              <span
                className="skeleton sk-line"
                style={{ display: "block", width: LINE_WIDTHS[column % LINE_WIDTHS.length] }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export interface TableEmptyProps {
  columns: number;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function TableEmpty({ columns, title, description, action }: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={columns}>
        <EmptyState title={title} description={description} action={action} />
      </td>
    </tr>
  );
}
