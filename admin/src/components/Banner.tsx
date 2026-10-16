import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { AlertIcon, InfoIcon } from "./icons";

export type BannerTone = "info" | "danger" | "warning" | "ban";

const TONE_CLASS: Record<BannerTone, string> = {
  info: "banner",
  danger: "banner banner--danger",
  warning: "banner banner--warning",
  ban: "ban-banner",
};

export interface BannerProps {
  children: ReactNode;
  tone?: BannerTone;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({ children, tone = "info", icon, action, className }: BannerProps) {
  const defaultIcon = tone === "info" ? <InfoIcon /> : <AlertIcon />;
  return (
    <div className={cn(TONE_CLASS[tone], className)} role={tone === "danger" ? "alert" : undefined}>
      {icon ?? defaultIcon}
      <span className="grow">{children}</span>
      {action}
    </div>
  );
}
