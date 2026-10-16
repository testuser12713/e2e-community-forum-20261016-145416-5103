import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { InfoIcon, WarningIcon } from "./icons";

export type BannerVariant = "info" | "warning" | "danger";

export interface BannerProps {
  variant?: BannerVariant;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const DEFAULT_ICON: Record<BannerVariant, ReactNode> = {
  info: <InfoIcon strokeWidth={1.75} />,
  warning: <WarningIcon strokeWidth={1.75} />,
  danger: <WarningIcon strokeWidth={1.75} />,
};

/**
 * Inline notice strip (edit-thread warning, moderation bar, error notice).
 */
export function Banner({ variant = "info", icon, children, className }: BannerProps) {
  return (
    <div
      className={cn("banner", variant !== "info" && `banner--${variant}`, className)}
      role={variant === "danger" ? "alert" : undefined}
    >
      {icon ?? DEFAULT_ICON[variant]}
      <div className="grow">{children}</div>
    </div>
  );
}

export interface BanBannerProps {
  children: ReactNode;
  className?: string;
}

/** Warning strip shown to a signed-in user with an active ban. */
export function BanBanner({ children, className }: BanBannerProps) {
  return (
    <div className={cn("ban-banner", className)} role="status">
      <WarningIcon strokeWidth={1.75} />
      <div className="grow">{children}</div>
    </div>
  );
}
