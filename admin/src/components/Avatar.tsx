import { cn } from "../lib/cn";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<AvatarSize, string | null> = {
  sm: "avatar--24",
  md: null,
  lg: "avatar--40",
  xl: "avatar--72",
};

const TONES = ["av-0", "av-1", "av-2", "av-3", "av-4", "av-5", "av-6", "av-7"];

function toneFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  tone?: number;
  deleted?: boolean;
  /** Accessible name; without one the avatar is decorative. */
  label?: string;
  className?: string;
}

export function Avatar({ name, size = "md", tone, deleted = false, label, className }: AvatarProps) {
  const colorClass = deleted
    ? "avatar--deleted"
    : tone === undefined
      ? toneFor(name)
      : TONES[tone % TONES.length];
  return (
    <span
      className={cn("avatar", SIZE_CLASS[size], colorClass, className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {deleted ? "—" : name.slice(0, 1)}
    </span>
  );
}
