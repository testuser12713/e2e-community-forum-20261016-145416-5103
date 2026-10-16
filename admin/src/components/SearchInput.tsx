import type { FormEvent } from "react";
import { cn } from "../lib/cn";
import { SearchIcon } from "./icons";

export type SearchInputSize = "md" | "lg";

export interface SearchInputProps {
  /** Accessible name of the search field. */
  label: string;
  name?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  size?: SearchInputSize;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  className?: string;
}

export function SearchInput({
  label,
  name = "q",
  placeholder,
  value,
  defaultValue,
  size = "md",
  disabled,
  onChange,
  onSubmit,
  className,
}: SearchInputProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const field = form.elements.namedItem(name);
    const query = field instanceof HTMLInputElement ? field.value : "";
    onSubmit?.(query);
  };

  return (
    <form
      className={cn("search-bar", size === "lg" && "search-bar--lg", className)}
      role="search"
      onSubmit={handleSubmit}
    >
      <SearchIcon />
      <input
        type="search"
        name={name}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-label={label}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
    </form>
  );
}
