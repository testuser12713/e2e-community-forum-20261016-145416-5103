import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "../lib/cn";

export interface ModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}

export function Modal({ open, title, description, children, footer, onClose, className }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const onOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="overlay" role="presentation" onClick={onOverlayClick}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={cn("modal", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId}>{title}</h3>
        {description !== undefined ? <p className="muted small">{description}</p> : null}
        {children !== undefined ? <div className="modal-body">{children}</div> : null}
        {footer !== undefined ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
