import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import "./kit.css";

export interface CheckboxProps {
  children: ReactNode;
  id?: string;
  name?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
}

export function Checkbox({
  children,
  id,
  name,
  checked,
  defaultChecked,
  disabled,
  onChange,
  className,
}: CheckboxProps) {
  return (
    <label className={cn("row gap-1 small checkbox-row", className)}>
      <input
        type="checkbox"
        id={id}
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
      />
      <span>{children}</span>
    </label>
  );
}
