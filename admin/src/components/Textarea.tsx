import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  tall?: boolean;
  className?: string;
}

export function Textarea({ tall = false, className, ...rest }: TextareaProps) {
  return <textarea className={cn("textarea", tall && "textarea--h200", className)} {...rest} />;
}
