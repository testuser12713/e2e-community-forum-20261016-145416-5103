import { Fragment } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";

export interface Crumb {
  label: string;
  to?: string;
}

export interface BreadcrumbProps {
  items: Crumb[];
  label?: string;
  className?: string;
}

/**
 * Breadcrumb trail ("Start › Backend › Thread"). The last item is the current
 * page and is not a link.
 */
export function Breadcrumb({ items, label = "Brotkrumen", className }: BreadcrumbProps) {
  return (
    <nav className={cn("crumb", className)} aria-label={label}>
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 && (
            <span className="sep" aria-hidden="true">
              ›
            </span>
          )}
          {item.to !== undefined && index < items.length - 1 ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
