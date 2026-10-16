import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { EyeIcon } from "./icons";
import { IconButton } from "./IconButton";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the control and the field as invalid (design's error state). */
  invalid?: boolean;
}

export function TextInput({ invalid = false, className, ...rest }: TextInputProps) {
  return <input className={cn("input", className)} aria-invalid={invalid || undefined} {...rest} />;
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: "md" | "h200";
  invalid?: boolean;
}

export function Textarea({ size = "md", invalid = false, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn("textarea", size === "h200" && "textarea--h200", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "md" | "sm";
  children: ReactNode;
}

export function Select({ size = "md", className, children, ...rest }: SelectProps) {
  return (
    <select className={cn("select", size === "sm" && "select--sm", className)} {...rest}>
      {children}
    </select>
  );
}

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  invalid?: boolean;
  /** Accessible name of the reveal control. */
  revealLabel?: string;
  hideLabel?: string;
}

/**
 * Password field with the design's reveal control inside the input wrapper.
 * The visibility toggle is local presentation state — nothing leaves the page.
 */
export function PasswordInput({
  invalid = false,
  revealLabel = "Passwort anzeigen",
  hideLabel = "Passwort verbergen",
  className,
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="input-wrap">
      <input
        className={cn("input", className)}
        type={visible ? "text" : "password"}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      <IconButton
        label={visible ? hideLabel : revealLabel}
        onClick={() => setVisible((current) => !current)}
        active={visible}
      >
        <EyeIcon />
      </IconButton>
    </div>
  );
}
