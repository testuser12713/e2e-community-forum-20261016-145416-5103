import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { CheckIcon, InfoIcon, WarningIcon } from "./icons";

export type ToastVariant = "info" | "success" | "warning" | "danger";

export interface ToastProps {
  children: ReactNode;
  variant?: ToastVariant;
  onClose?: () => void;
  closeLabel?: string;
  className?: string;
}

const ICONS: Record<ToastVariant, ReactNode> = {
  info: <InfoIcon />,
  success: <CheckIcon />,
  warning: <WarningIcon />,
  danger: <WarningIcon />,
};

/**
 * Transient notice (saved, failed, rate-limited). The design pins the region to
 * the corner of the viewport; on phones it becomes a strip under the header.
 */
export function Toast({
  children,
  variant = "info",
  onClose,
  closeLabel = "Schließen",
  className,
}: ToastProps) {
  return (
    <div
      className={cn("toast", variant !== "info" && `toast--${variant}`, className)}
      role={variant === "danger" ? "alert" : "status"}
    >
      {ICONS[variant]}
      <div className="grow">{children}</div>
      {onClose !== undefined && (
        <button type="button" onClick={onClose} aria-label={closeLabel}>
          ×
        </button>
      )}
    </div>
  );
}

export interface ToastRegionProps {
  children: ReactNode;
  className?: string;
}

export function ToastRegion({ children, className }: ToastRegionProps) {
  return (
    <div className={cn("toast-region", className)} aria-live="polite">
      {children}
    </div>
  );
}
