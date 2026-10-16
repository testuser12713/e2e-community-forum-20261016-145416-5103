import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const SIZE_CLASS: Record<ButtonSize, string | null> = {
  sm: "btn-sm",
  md: null,
  lg: "btn-lg",
};

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  type?: "button" | "submit" | "reset";
  to?: string;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  name?: string;
  value?: string;
  form?: string;
  className?: string;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  "aria-expanded"?: boolean;
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  block = false,
  loading = false,
  icon,
  type = "button",
  to,
  href,
  disabled = false,
  onClick,
  title,
  name,
  value,
  form,
  className,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
  "aria-expanded": ariaExpanded,
}: ButtonProps) {
  const classes = cn(
    "btn",
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    block && "btn-block",
    className,
  );
  const content = (
    <>
      {loading ? <span className="spinner" /> : icon}
      {children}
    </>
  );

  if (to && !disabled) {
    return (
      <Link className={classes} to={to} onClick={onClick} title={title} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }
  if (href && !disabled) {
    return (
      <a className={classes} href={href} onClick={onClick} title={title} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={ariaPressed}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      title={title}
      name={name}
      value={value}
      form={form}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
