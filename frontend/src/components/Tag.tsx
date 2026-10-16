import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export interface TagProps {
  tag: string;
  to?: string;
  className?: string;
}

/** Hashtag pill; links to the tag page when a target is given. */
export function Tag({ tag, to, className }: TagProps) {
  const label = `#${tag}`;
  if (to !== undefined) {
    return (
      <Link className={cn("tag", className)} to={to}>
        {label}
      </Link>
    );
  }
  return <span className={cn("tag", className)}>{label}</span>;
}

export interface TagCloudProps {
  tags: string[];
  /** Builds the target for each tag; without it the tags render as plain pills. */
  href?: (tag: string) => string;
  className?: string;
  label?: string;
}

export function TagCloud({ tags, href, className, label }: TagCloudProps) {
  return (
    <div className={cn("tag-cloud", className)} aria-label={label}>
      {tags.map((tag) => (
        <Tag key={tag} tag={tag} to={href?.(tag)} />
      ))}
    </div>
  );
}
