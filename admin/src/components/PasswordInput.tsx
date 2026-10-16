import { useState } from "react";
import { cn } from "../lib/cn";
import { EyeIcon } from "./icons";
import { IconButton } from "./IconButton";

export interface PasswordInputProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}

export function PasswordInput({
  id,
  name,
  value,
  defaultValue,
  placeholder,
  autoComplete = "current-password",
  disabled,
  onChange,
  className,
  "aria-label": ariaLabel,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={cn("input-wrap", className)}>
      <input
        className="input"
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      <IconButton
        label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
        pressed={visible}
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
      >
        <EyeIcon />
      </IconButton>
    </div>
  );
}
