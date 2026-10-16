import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(options: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}): string {
  const { variant = "secondary", size = "md", block = false, className } = options;
  return cn(
    "btn",
    `btn-${variant}`,
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    block && "btn-block",
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Reveals the design's spinner and blocks further clicks until it ends. */
  loading?: boolean;
  icon?: ReactNode;
}

/**
 * Primary action control. `loading` shows the spinner and disables the button,
 * `disabled` renders the design's dimmed, non-interactive state.
 */
export function Button({
  variant,
  size,
  block,
  loading = false,
  icon,
  children,
  className,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const blocked = disabled === true || loading;
  return (
    <button
      className={buttonClass({ variant, size, block, className })}
      type={type}
      disabled={blocked}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export interface LinkButtonProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Marks a navigation target that is currently active. */
  "aria-current"?: "page" | undefined;
}

/** The same button look for navigation, rendered as a router link. */
export function LinkButton({
  to,
  variant,
  size,
  block,
  icon,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonClass({ variant, size, block, className })} to={to} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
