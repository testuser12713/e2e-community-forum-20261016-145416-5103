import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface FieldProps {
  /** Visible field label. */
  label?: ReactNode;
  /** id of the control the label belongs to. */
  htmlFor?: string;
  /** Muted help line under the control. */
  hint?: ReactNode;
  /** Error message; marks the field and replaces the hint (design's error state). */
  error?: string | null;
  /** Right-aligned counter ("52/120"). */
  counter?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Form field shell: label, control slot, counter and helper/error line.
 * The error state only appears when an error is passed in — an untouched form
 * starts neutral.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  counter,
  children,
  className,
}: FieldProps) {
  const showError = error !== undefined && error !== null && error !== "";
  return (
    <div className={cn("field", showError && "field--error", className)}>
      {label !== undefined && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {counter !== undefined && <span className="field-counter">{counter}</span>}
      {showError ? (
        <span className="helper helper--error" role="alert">
          {error}
        </span>
      ) : (
        hint !== undefined && <span className="helper">{hint}</span>
      )}
    </div>
  );
}

export interface HelperProps {
  children: ReactNode;
  error?: boolean;
  className?: string;
  id?: string;
}

export function Helper({ children, error = false, className, id }: HelperProps) {
  return (
    <span id={id} className={cn("helper", error && "helper--error", className)}>
      {children}
    </span>
  );
}

export interface RuleListProps {
  items: { label: ReactNode; status?: "ok" | "bad" | "pending" }[];
  className?: string;
  id?: string;
}

/** Password rule checklist (register/settings): fulfilled, violated, open. */
export function RuleList({ items, className, id }: RuleListProps) {
  return (
    <ul className={cn("rule-list", className)} id={id}>
      {items.map((item, index) => (
        <li
          key={index}
          className={item.status === "ok" ? "ok" : item.status === "bad" ? "bad" : undefined}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}
