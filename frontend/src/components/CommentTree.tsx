import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Prose } from "./Prose";
import { VoteControl, type VoteValue } from "./VoteControl";

export interface CommentAuthor {
  username: string;
  /** moderator/admin get their badge next to the name. */
  role?: "user" | "moderator" | "admin";
  color?: number;
}

export interface CommentData {
  id: number;
  /** Deleted accounts keep the node with a muted placeholder author. */
  author: CommentAuthor | null;
  /** Sanitised HTML of the comment body. */
  bodyHtml?: string;
  createdAtLabel: string;
  /** "bearbeitet (vor 2 Std.)" — present only for edited comments. */
  editedLabel?: string;
  score: number;
  myVote?: VoteValue;
  deleted?: boolean;
  /** The viewer wrote this comment: no vote, but edit/delete. */
  own?: boolean;
  /** The node has been collapsed by the reader (children hidden). */
  collapsed?: boolean;
  children?: CommentData[];
}

export interface CommentTreeProps {
  comments: CommentData[];
  /** Threads allow replies down to this depth (SPEC: 5). */
  maxDepth?: number;
  onVote?: (commentId: number, value: VoteValue) => void;
  onReply?: (commentId: number, bodyMarkdown: string) => void;
  onReport?: (commentId: number) => void;
  onEdit?: (commentId: number) => void;
  onDelete?: (commentId: number) => void;
  /** Builds the profile target of a comment author. */
  profileHref?: (username: string) => string;
  /** Disables all reply controls (locked thread or active ban). */
  replyDisabled?: boolean;
  /** Reason shown next to disabled replies. */
  replyDisabledNote?: string;
  className?: string;
}

interface CommentItemProps extends Omit<CommentTreeProps, "comments" | "className"> {
  comment: CommentData;
  depth: number;
}

const ROLE_BADGE: Record<string, { variant: "moderator" | "admin"; label: string }> = {
  moderator: { variant: "moderator", label: "Moderator" },
  admin: { variant: "admin", label: "Admin" },
};

function replyPlaceholder(author: CommentAuthor | null, deleted: boolean): string {
  if (deleted || author === null) return "Antwort schreiben…";
  return `Antwort an @${author.username} schreiben…`;
}

function CommentItem({
  comment,
  depth,
  maxDepth = 5,
  onVote,
  onReply,
  onReport,
  onEdit,
  onDelete,
  profileHref,
  replyDisabled = false,
  replyDisabledNote = "Antworten sind derzeit nicht möglich.",
}: CommentItemProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [collapsed, setCollapsed] = useState(comment.collapsed === true);

  const children = comment.children ?? [];
  const canReply = onReply !== undefined && depth < maxDepth && !replyDisabled;
  const roleBadge = comment.author?.role !== undefined ? ROLE_BADGE[comment.author.role] : undefined;

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = replyText.trim();
    if (body === "" || onReply === undefined) return;
    onReply(comment.id, body);
    setReplyText("");
    setReplyOpen(false);
  };

  return (
    <article className={cn("comment", comment.deleted === true && "comment--deleted")}>
      <div className="comment-row">
        <Avatar
          name={comment.author?.username}
          size={24}
          color={comment.author?.color}
          deleted={comment.deleted === true || comment.author === null}
        />
        <div className="comment-main">
          <div className="comment-meta">
            {comment.deleted === true || comment.author === null ? (
              <span className="muted">gelöschter Nutzer</span>
            ) : profileHref !== undefined ? (
              <Link className="author" to={profileHref(comment.author.username)}>
                @{comment.author.username}
              </Link>
            ) : (
              <span className="author">@{comment.author.username}</span>
            )}
            {roleBadge !== undefined && <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>}
            <span>{comment.createdAtLabel}</span>
            {comment.editedLabel !== undefined && <span>{comment.editedLabel}</span>}
            {!comment.deleted && (
              <VoteControl
                orientation="horizontal"
                subject="Kommentar"
                score={comment.score}
                value={comment.myVote}
                onVote={
                  comment.own === true || onVote === undefined
                    ? undefined
                    : (value) => onVote(comment.id, value)
                }
                disabled={comment.own === true}
              />
            )}
          </div>

          {comment.deleted === true ? (
            <div className="comment-body md">
              <em>Der Kommentar wurde entfernt.</em>
            </div>
          ) : (
            comment.bodyHtml !== undefined && <Prose className="comment-body" html={comment.bodyHtml} />
          )}

          {!comment.deleted && (
            <div className="comment-actions">
              {children.length > 0 && (
                <button type="button" onClick={() => setCollapsed((current) => !current)}>
                  <span>{collapsed ? `${children.length} Antworten` : "Ausblenden"}</span>
                </button>
              )}
              {canReply && (
                <button type="button" onClick={() => setReplyOpen((current) => !current)}>
                  Antworten
                </button>
              )}
              {comment.own === true && onEdit !== undefined && (
                <button type="button" onClick={() => onEdit(comment.id)}>
                  Bearbeiten
                </button>
              )}
              {comment.own === true && onDelete !== undefined && (
                <button type="button" onClick={() => onDelete(comment.id)}>
                  Löschen
                </button>
              )}
              {comment.own !== true && onReport !== undefined && (
                <button type="button" onClick={() => onReport(comment.id)}>
                  Melden
                </button>
              )}
              {depth >= maxDepth && (
                <span className="muted small">Maximale Antworttiefe erreicht.</span>
              )}
              {replyDisabled && depth < maxDepth && (
                <span className="muted small">{replyDisabledNote}</span>
              )}
            </div>
          )}

          {canReply && replyOpen && (
            <form className="editor" style={{ marginTop: 12 }} onSubmit={submitReply}>
              <textarea
                value={replyText}
                onChange={(event) => setReplyText(event.target.value)}
                placeholder={replyPlaceholder(comment.author, comment.deleted === true)}
                aria-label="Antwort"
              />
              <div className="editor-foot">
                <span className="helper">Mit @Benutzername erwähnst du andere Nutzer.</span>
                <div className="row gap-1">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => setReplyOpen(false)}
                  >
                    Abbrechen
                  </button>
                  <button className="btn btn-primary btn-sm" type="submit" disabled={replyText.trim() === ""}>
                    Antwort senden
                  </button>
                </div>
              </div>
            </form>
          )}

          {children.length > 0 && !collapsed && (
            <div className="comment-children">
              {children.map((child) => (
                <CommentItem
                  key={child.id}
                  comment={child}
                  depth={depth + 1}
                  maxDepth={maxDepth}
                  onVote={onVote}
                  onReply={onReply}
                  onReport={onReport}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  profileHref={profileHref}
                  replyDisabled={replyDisabled}
                  replyDisabledNote={replyDisabledNote}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Nested comment thread of a thread page: replies down to `maxDepth`, deleted
 * nodes kept with their children, collapsible subtrees and the reply form.
 */
export function CommentTree({ comments, className, ...rest }: CommentTreeProps) {
  return (
    <div className={className}>
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          depth={1}
          replyDisabled={false}
          {...rest}
        />
      ))}
    </div>
  );
}
