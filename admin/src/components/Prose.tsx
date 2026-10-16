import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface ProseProps {
  children: ReactNode;
  className?: string;
}

/** Container for rendered user content (markdown, quotes, code). */
export function Prose({ children, className }: ProseProps) {
  return <div className={cn("md", className)}>{children}</div>;
}
