import { cn } from "../lib/cn";
import { ArrowDownIcon, ArrowUpIcon } from "./icons";

export type VoteValue = 1 | -1 | 0;

export interface VoteControlProps {
  /** Current score as reported by the API. */
  score: number;
  /** The viewer's own vote (0 = none). */
  value?: VoteValue;
  /**
   * Called with the value the click requests: the opposite value, or 0 when the
   * active vote is clicked again (the design's toggle behaviour).
   */
  onVote?: (value: VoteValue) => void;
  /** Locks the control — own content and signed-out visitors cannot vote. */
  disabled?: boolean;
  /** Sits beside the score in comment headers. */
  orientation?: "vertical" | "horizontal";
  /** What the vote is about, for the accessible names ("Thread", "Kommentar"). */
  subject?: string;
  className?: string;
}

function formatScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

/**
 * Up/down vote rail with the running score. Colour and pressed state follow the
 * viewer's own vote (`vote-control--up` / `--down`).
 */
export function VoteControl({
  score,
  value = 0,
  onVote,
  disabled = false,
  orientation = "vertical",
  subject = "Inhalt",
  className,
}: VoteControlProps) {
  const locked = disabled || onVote === undefined;

  const handle = (next: VoteValue) => {
    if (locked || onVote === undefined) return;
    onVote(value === next ? 0 : next);
  };

  return (
    <div
      className={cn(
        "vote-control",
        orientation === "horizontal" && "vote-control--h",
        value === 1 && "vote-control--up",
        value === -1 && "vote-control--down",
        className,
      )}
      title={disabled ? `${subject} kann nicht bewertet werden` : undefined}
    >
      <button
        className="vote-btn vote-btn--up"
        type="button"
        aria-label={`${subject} upvoten`}
        aria-pressed={value === 1}
        disabled={locked}
        onClick={() => handle(1)}
      >
        <ArrowUpIcon />
      </button>
      <span className="vote-score tabular">{formatScore(score)}</span>
      <button
        className="vote-btn vote-btn--down"
        type="button"
        aria-label={`${subject} downvoten`}
        aria-pressed={value === -1}
        disabled={locked}
        onClick={() => handle(-1)}
      >
        <ArrowDownIcon />
      </button>
    </div>
  );
}
