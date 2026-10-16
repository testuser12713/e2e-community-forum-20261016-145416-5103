import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Accessible name — icon buttons carry no visible text. */
  label: string;
  size?: "sm" | "md";
  /** Sets `aria-pressed`; used for toggles (theme, password reveal). */
  active?: boolean;
  children: ReactNode;
}

/**
 * Square icon control the screens use in the header, pagination-free rows and
 * inside input wrappers.
 */
export function IconButton({
  label,
  size = "md",
  active,
  children,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      className={cn("icon-btn", size === "sm" && "icon-btn--sm", className)}
      type={type}
      aria-label={label}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}
