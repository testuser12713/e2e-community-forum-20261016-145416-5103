import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { AlertIcon, CheckIcon, InfoIcon } from "./icons";

export type ToastTone = "success" | "danger" | "warning" | "info";

const TONE_CLASS: Record<Exclude<ToastTone, "info">, string> = {
  success: "toast--success",
  danger: "toast--danger",
  warning: "toast--warning",
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") return <CheckIcon />;
  if (tone === "info") return <InfoIcon />;
  return <AlertIcon />;
}

export interface ToastProps {
  children: ReactNode;
  tone?: ToastTone;
  onDismiss?: () => void;
  className?: string;
}

export function Toast({ children, tone = "info", onDismiss, className }: ToastProps) {
  return (
    <div className={cn("toast", tone !== "info" && TONE_CLASS[tone], className)} role="status">
      <ToneIcon tone={tone} />
      <div className="grow">{children}</div>
      {onDismiss !== undefined ? (
        <button type="button" aria-label="Schließen" onClick={onDismiss}>
          ×
        </button>
      ) : null}
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
