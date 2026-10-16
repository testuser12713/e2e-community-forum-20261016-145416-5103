import type { SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type SelectSize = "md" | "sm";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Height variant from the design, not the native `size` attribute. */
  size?: SelectSize;
  className?: string;
}

export function Select({ size = "md", className, children, ...rest }: SelectProps) {
  return (
    <select className={cn("select", size === "sm" && "select--sm", className)} {...rest}>
      {children}
    </select>
  );
}
