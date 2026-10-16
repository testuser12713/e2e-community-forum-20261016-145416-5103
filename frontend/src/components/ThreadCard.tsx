import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "../lib/cn";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Tag } from "./Tag";
import { VoteControl, type VoteValue } from "./VoteControl";

export interface ThreadCardProps {
  /** Target of the thread page. */
  to: string;
  title: string;
  tags?: string[];
  /** Builds the target of each tag; without it the tags stay plain pills. */
  tagHref?: (tag: string) => string;
  /** Sanitised excerpt HTML — the search screen puts <mark> into it. */
  excerptHtml?: string;
  /** Plain-text excerpt when there is no rendered HTML. */
  excerpt?: string;
  score: number;
  myVote?: VoteValue;
  onVote?: (value: VoteValue) => void;
  voteDisabled?: boolean;
  author?: { username: string; color?: number };
  /** Builds the profile target of the author. */
  profileHref?: (username: string) => string;
  category?: { name: string; href: string };
  createdAtLabel?: string;
  commentCount?: number;
  pinned?: boolean;
  locked?: boolean;
  deleted?: boolean;
  /** Right column: who touched the thread last. */
  activity?: { avatarName?: string; avatarColor?: number; label?: string };
  className?: string;
}

/**
 * One row of a thread list. The title is a real link; clicking anywhere else on
 * the card opens the thread too, so the pointer cursor is not a lie.
 */
export function ThreadCard({
  to,
  title,
  tags = [],
  tagHref,
  excerptHtml,
  excerpt,
  score,
  myVote = 0,
  onVote,
  voteDisabled = false,
  author,
  profileHref,
  category,
  createdAtLabel,
  commentCount,
  pinned = false,
  locked = false,
  deleted = false,
  activity,
  className,
}: ThreadCardProps) {
  const navigate = useNavigate();

  const handleCardClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea")) return;
    navigate(to);
  };

  const authorName = author !== undefined ? `@${author.username}` : undefined;
  const authorTarget = author !== undefined ? profileHref?.(author.username) : undefined;
  const hasBadge = pinned || locked || deleted;

  return (
    <article
      className={cn("thread-card", pinned && "thread-card--pinned", className)}
      onClick={handleCardClick}
    >
      <VoteControl
        score={score}
        value={myVote}
        onVote={onVote}
        disabled={voteDisabled}
        subject="Thread"
      />

      <div className="grow">
        {hasBadge && (
          <div className="row gap-1 wrap" style={{ marginBottom: 6 }}>
            {pinned && <Badge variant="pin">Angeheftet</Badge>}
            {locked && <Badge variant="lock">Gesperrt</Badge>}
            {deleted && <Badge variant="removed">Entfernt</Badge>}
          </div>
        )}
        <Link className="thread-title thread-clamp" to={to}>
          {title}
        </Link>
        {tags.length > 0 && (
          <div className="thread-tags">
            {tags.map((tag) => (
              <Tag key={tag} tag={tag} to={tagHref?.(tag)} />
            ))}
          </div>
        )}
        {excerptHtml !== undefined ? (
          <p className="thread-excerpt" dangerouslySetInnerHTML={{ __html: excerptHtml }} />
        ) : (
          excerpt !== undefined && <p className="thread-excerpt">{excerpt}</p>
        )}
        <div className="thread-meta">
          {author !== undefined && <Avatar name={author.username} size={24} color={author.color} />}
          {authorName !== undefined &&
            (authorTarget !== undefined ? <span>von <Link to={authorTarget}>{authorName}</Link></span> : <span>von {authorName}</span>)}
          {createdAtLabel !== undefined && (
            <>
              <span className="dot" aria-hidden="true" />
              <span>{createdAtLabel}</span>
            </>
          )}
          {category !== undefined && (
            <>
              <span className="dot" aria-hidden="true" />
              <Link to={category.href}>{category.name}</Link>
            </>
          )}
          {commentCount !== undefined && (
            <>
              <span className="dot" aria-hidden="true" />
              <span>{commentCount} Kommentare</span>
            </>
          )}
        </div>
      </div>

      {activity !== undefined && (
        <div className="thread-activity">
          <span>Letzte Aktivität</span>
          {activity.avatarName !== undefined && (
            <Avatar name={activity.avatarName} size={24} color={activity.avatarColor} />
          )}
          {activity.label !== undefined && <span>{activity.label}</span>}
        </div>
      )}
    </article>
  );
}
