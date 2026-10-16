import { useTheme } from "../context/ThemeContext";
import { cn } from "../lib/cn";
import { ThemeMoonIcon, ThemeSunIcon } from "./icons";

export interface ThemeToggleProps {
  label?: string;
  className?: string;
}

/** Switches between the light and the dark theme; the icons swap via CSS. */
export function ThemeToggle({ label = "Darstellung", className }: ThemeToggleProps) {
  const { toggleTheme } = useTheme();
  return (
    <button type="button" className={cn("admin-nav-item", className)} onClick={toggleTheme}>
      <ThemeMoonIcon className="theme-moon" />
      <ThemeSunIcon className="theme-sun" />
      {label}
    </button>
  );
}
