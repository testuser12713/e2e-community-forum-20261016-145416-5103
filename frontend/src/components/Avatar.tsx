import { cn } from "../lib/cn";

export type AvatarSize = 24 | 32 | 40 | 72;

const SIZE_CLASS: Record<AvatarSize, string> = {
  24: "avatar--24",
  32: "",
  40: "avatar--40",
  72: "avatar--72",
};

export interface AvatarProps {
  /** Name the initial letter comes from; the design uppercases it. */
  name?: string;
  size?: AvatarSize;
  /** Palette slot from the mockup (av-0 … av-7). */
  color?: number;
  /** Deleted accounts keep their place with a muted placeholder avatar. */
  deleted?: boolean;
  className?: string;
}

/**
 * Presentational avatar. The design shows a coloured circle with the first
 * letter of the username, or a muted dash for deleted accounts.
 */
export function Avatar({ name, size = 32, color = 0, deleted = false, className }: AvatarProps) {
  const initial = name !== undefined && name.length > 0 ? name.charAt(0) : "?";
  const palette = ((color % 8) + 8) % 8;
  return (
    <span
      className={cn(
        "avatar",
        SIZE_CLASS[size],
        deleted ? "avatar--deleted" : `av-${palette}`,
        className,
      )}
      aria-hidden="true"
    >
      {deleted ? "—" : initial}
    </span>
  );
}
