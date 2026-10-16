import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type MarkdownEditorTab = "write" | "preview";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the writing area. */
  ariaLabel?: string;
  ariaLabelledby?: string;
  placeholder?: string;
  /** Grows the writing area (`textarea--h200` for thread bodies). */
  size?: "md" | "h200";
  /** Tab the editor starts on. */
  defaultTab?: MarkdownEditorTab;
  /** Rendered preview for the "Vorschau" tab; the page supplies the markup. */
  renderPreview?: (value: string) => ReactNode;
  /** Footnote under the editor ("HTML und Skripte werden entfernt."). */
  helper?: ReactNode;
  /** Disables writing (e.g. while submitting or when the thread is locked). */
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}

const TOOLS: { title: string; label: ReactNode; wrap: [string, string] }[] = [
  { title: "Fett", label: "B", wrap: ["**", "**"] },
  { title: "Kursiv", label: <span style={{ fontStyle: "italic" }}>I</span>, wrap: ["*", "*"] },
  { title: "Link", label: "🔗", wrap: ["[", "](https://)"] },
  { title: "Code", label: "</>", wrap: ["`", "`"] },
  { title: "Zitat", label: "„", wrap: ["> ", ""] },
];

/**
 * Markdown editor with the design's Schreiben/Vorschau tabs and formatting
 * toolbar. Purely presentational: the value and the rendered preview come from
 * the page.
 */
export function MarkdownEditor({
  value,
  onChange,
  ariaLabel,
  ariaLabelledby,
  placeholder,
  size = "md",
  defaultTab = "write",
  renderPreview,
  helper,
  disabled = false,
  invalid = false,
  className,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<MarkdownEditorTab>(defaultTab);

  const insert = (wrap: [string, string]) => {
    const [before, after] = wrap;
    onChange(`${value}${before}${after}`);
  };

  return (
    <div className={cn("editor", className)}>
      <div className="editor-tabs" role="tablist">
        <button
          className="editor-tab"
          type="button"
          role="tab"
          aria-selected={tab === "write"}
          onClick={() => setTab("write")}
        >
          Schreiben
        </button>
        <button
          className="editor-tab"
          type="button"
          role="tab"
          aria-selected={tab === "preview"}
          onClick={() => setTab("preview")}
        >
          Vorschau
        </button>
      </div>

      {tab === "write" ? (
        <>
          <div className="editor-toolbar" aria-label="Markdown-Werkzeuge">
            {TOOLS.map((tool) => (
              <button
                key={tool.title}
                type="button"
                title={tool.title}
                disabled={disabled}
                onClick={() => insert(tool.wrap)}
              >
                {tool.label}
              </button>
            ))}
          </div>
          <textarea
            className={cn(size === "h200" && "textarea--h200")}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            aria-invalid={invalid || undefined}
            disabled={disabled}
          />
        </>
      ) : (
        <div className="editor-preview md" aria-label="Vorschau">
          {renderPreview !== undefined ? (
            renderPreview(value)
          ) : (
            <p className="muted">Vorschau ist nicht verfügbar.</p>
          )}
        </div>
      )}

      <div className="editor-foot">
        <span className="helper">
          {helper ?? "Mit @Benutzername erwähnst du andere Nutzer. HTML und Skripte werden entfernt."}
        </span>
      </div>
    </div>
  );
}
