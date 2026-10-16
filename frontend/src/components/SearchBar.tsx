import { useState, type FormEvent } from "react";
import { cn } from "../lib/cn";
import { SearchIcon } from "./icons";

export interface SearchBarProps {
  /** Controlled value; leave out for an uncontrolled field. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Called with the trimmed term when the form is submitted. */
  onSubmit?: (query: string) => void;
  placeholder?: string;
  label?: string;
  size?: "md" | "lg";
  disabled?: boolean;
  className?: string;
  name?: string;
}

/**
 * Search form used in the header, on the search page and in filter panels.
 */
export function SearchBar({
  value,
  defaultValue = "",
  onChange,
  onSubmit,
  placeholder = "Threads durchsuchen…",
  label = "Threads durchsuchen",
  size = "md",
  disabled = false,
  className,
  name = "q",
}: SearchBarProps) {
  const [inner, setInner] = useState(defaultValue);
  const current = value !== undefined ? value : inner;

  const handleChange = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit?.(current.trim());
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
        value={current}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        disabled={disabled}
      />
    </form>
  );
}
