import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export interface CategoryNavItem {
  id?: number;
  name: string;
  /** Compare this against `activeSlug` to mark the current category. */
  slug?: string;
  href: string;
  /** Thread count shown at the right edge. */
  count?: number;
}

export interface CategoryNavProps {
  items: CategoryNavItem[];
  /** Slug of the category the user is currently looking at. */
  activeSlug?: string;
  label?: string;
  className?: string;
}

/** Sidebar navigation over the forum's categories. */
export function CategoryNav({ items, activeSlug, label = "Kategorien", className }: CategoryNavProps) {
  return (
    <nav className={cn("cat-nav", className)} aria-label={label}>
      {items.map((item) => {
        const active = activeSlug !== undefined && item.slug === activeSlug;
        return (
          <Link
            className={cn("cat-row", active && "cat-row--active")}
            key={item.slug ?? item.id ?? item.name}
            to={item.href}
            aria-current={active ? "page" : undefined}
          >
            <span className="truncate">{item.name}</span>
            {item.count !== undefined && <span className="count tabular">{item.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
