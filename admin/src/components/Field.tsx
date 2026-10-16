import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface FieldProps {
  children: ReactNode;
  label?: ReactNode;
  htmlFor?: string;
  helper?: ReactNode;
  error?: ReactNode;
  counter?: ReactNode;
  className?: string;
}

export function Field({ children, label, htmlFor, helper, error, counter, className }: FieldProps) {
  return (
    <div className={cn("field", error && "field--error", className)}>
      {label !== undefined ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {error !== undefined && error !== null ? (
        <span className="helper helper--error">{error}</span>
      ) : helper !== undefined ? (
        <span className="helper">{helper}</span>
      ) : null}
      {counter !== undefined ? <span className="field-counter">{counter}</span> : null}
    </div>
  );
}
