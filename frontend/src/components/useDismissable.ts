import { useEffect, useRef, type RefObject } from "react";

/**
 * Dismisses an open popover or menu when the reader clicks or taps outside it
 * or presses Escape. Returns the ref that has to sit on the wrapper element
 * that contains both the trigger and the panel.
 */
export function useDismissable(open: boolean, onDismiss: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (ref.current !== null && target !== null && !ref.current.contains(target)) {
        onDismiss();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onDismiss]);

  return ref;
}
