import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../lib/cn";

export interface ModalProps {
  open: boolean;
  /** Dialog title, used as the accessible name. */
  title: string;
  /** Optional description under the title. */
  description?: ReactNode;
  /** Body content (fields, text). */
  children?: ReactNode;
  /** Action row, usually an Abbrechen button plus the confirming action. */
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}

/**
 * Dialog on the design's overlay. Closes on Escape and on a click beside the
 * panel; focus moves into the dialog when it opens.
 */
export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  className,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn("modal", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={panelRef}
      >
        <h3 id={titleId}>{title}</h3>
        {description !== undefined && <p className="muted small">{description}</p>}
        {children !== undefined && <div className="modal-body">{children}</div>}
        {footer !== undefined && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
