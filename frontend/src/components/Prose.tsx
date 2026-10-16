import { cn } from "../lib/cn";

export interface ProseProps {
  /**
   * Sanitised HTML as the API delivers it (`body_html`, `body_markdown` is
   * rendered server-side with nh3 — raw HTML and scripts never reach this
   * point). Covers thread bodies, comment bodies, editor previews and profile
   * bios.
   */
  html: string;
  className?: string;
  as?: "div" | "article" | "section";
}

/**
 * Typography for rendered user content — the `.md` block of the design
 * (headings, lists, quotes, code, links) — see design/mockups/thread-detail.html.
 */
export function Prose({ html, className, as: Tag = "div" }: ProseProps) {
  return (
    <Tag
      className={cn("md", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
