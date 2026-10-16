import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  CommentTree,
  EmptyState,
  Field,
  LinkButton,
  MarkdownEditor,
  Modal,
  Prose,
  Select,
  Sidebar,
  SidebarCard,
  SkeletonText,
  StatList,
  Tag,
  TextInput,
  Textarea,
  Toast,
  ToastRegion,
  VoteControl,
  type CommentData,
  type VoteValue,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch } from "../lib/api";

/** Report reasons the design's dialog offers; the API validates the same list. */
const REPORT_REASONS = ["Spam", "Belästigung", "Hassrede", "Falsche Kategorie", "Sonstiges"];

const MAX_DEPTH = 5;

interface UserBrief {
  id: number;
  username: string;
  karma: number;
}

interface ThreadSummary {
  id: number;
  category_id: number;
  category_slug: string;
  category_name: string;
  title: string;
  tags: string[];
  score: number;
  comment_count: number;
  hot_score: number;
  pinned: boolean;
  locked: boolean;
  deleted: boolean;
  edited_at: string | null;
  created_at: string;
  author: UserBrief;
}

interface ThreadDetail extends ThreadSummary {
  body_markdown: string;
  body_html: string;
}

interface CategoryOut {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  thread_count: number;
}

interface CommentNode {
  id: number;
  thread_id: number;
  parent_id: number | null;
  depth: number;
  body_markdown: string;
  body_html: string;
  score: number;
  my_vote: number;
  deleted: boolean;
  edited_at: string | null;
  created_at: string;
  author: UserBrief | null;
  children: CommentNode[];
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface VoteResult {
  score: number;
  my_vote: number;
}

interface SubscriptionState {
  subscribed: boolean;
}

interface PublicProfile {
  username: string;
  bio: string | null;
  karma: number;
  created_at: string;
}

type ToastKind = "info" | "success" | "warning" | "danger";

interface ToastState {
  kind: ToastKind;
  message: string;
}

/** German relative-time label ("vor 3 Std.") for the thread and comment meta rows. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE");
}

function formatScore(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function toCommentData(node: CommentNode, viewerId: number | null): CommentData {
  return {
    id: node.id,
    author: node.author !== null ? { username: node.author.username } : null,
    bodyHtml: node.body_html,
    createdAtLabel: relativeTime(node.created_at),
    editedLabel:
      node.edited_at !== null ? `bearbeitet (${relativeTime(node.edited_at)})` : undefined,
    score: node.score,
    myVote: node.my_vote as VoteValue,
    deleted: node.deleted,
    own: node.author !== null && viewerId !== null && node.author.id === viewerId,
    children: (node.children ?? []).map((child) => toCommentData(child, viewerId)),
  };
}

function mapComment(
  nodes: CommentNode[],
  id: number,
  update: (node: CommentNode) => CommentNode,
): CommentNode[] {
  return nodes.map((node) =>
    node.id === id
      ? update(node)
      : { ...node, children: mapComment(node.children ?? [], id, update) },
  );
}

function insertReply(nodes: CommentNode[], parentId: number, reply: CommentNode): CommentNode[] {
  return nodes.map((node) =>
    node.id === parentId
      ? { ...node, children: [...(node.children ?? []), reply] }
      : { ...node, children: insertReply(node.children ?? [], parentId, reply) },
  );
}

function findComment(nodes: CommentNode[], id: number): CommentNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findComment(node.children ?? [], id);
    if (child !== null) return child;
  }
  return null;
}

/**
 * The forum thread page: the thread body with the kit's prose typography, the
 * vote rail, subscription and report controls, the nested comment tree with
 * replies down to depth five, and the moderator toolbar the design shows for a
 * moderator/admin account.
 */
export default function ThreadDetail() {
  const params = useParams();
  const threadId = Number(params.id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const viewerId = user?.id ?? null;
  const isModerator = user?.role === "moderator" || user?.role === "admin";

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [authorProfile, setAuthorProfile] = useState<PublicProfile | null>(null);
  const [related, setRelated] = useState<ThreadSummary[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [threadVote, setThreadVote] = useState<VoteValue>(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [rootDraft, setRootDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const [editTarget, setEditTarget] = useState<CommentNode | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const [reportTarget, setReportTarget] = useState<{ type: "thread" | "comment"; id: number } | null>(
    null,
  );
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportNote, setReportNote] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCategory, setMoveCategory] = useState<number | "">("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState("");

  const editorRef = useRef<HTMLDivElement>(null);

  const notify = useCallback((kind: ToastKind, message: string) => {
    setToast({ kind, message });
  }, []);

  const notifyError = useCallback(
    (err: unknown, fallback = "Etwas ist schiefgelaufen. Bitte versuche es erneut.") => {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const wait = err.retryAfter ?? 60;
          notify("warning", `Zu viele Schreibvorgänge in kurzer Zeit. Bitte warte ${wait} Sekunden.`);
          return;
        }
        notify("danger", err.message);
        return;
      }
      notify("danger", fallback);
    },
    [notify],
  );

  useEffect(() => {
    if (!Number.isFinite(threadId)) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError(null);

    const load = async () => {
      try {
        const [detail, commentPage] = await Promise.all([
          apiFetch<ThreadDetail>(`/api/threads/${threadId}`),
          apiFetch<Page<CommentNode>>(`/api/threads/${threadId}/comments?page=1&page_size=20`),
        ]);
        if (cancelled) return;
        setThread(detail);
        setComments(commentPage.items);
        setThreadVote(0);
        setLoading(false);

        void apiFetch<CategoryOut[]>("/api/categories")
          .then((rows) => {
            if (!cancelled) setCategories(rows);
          })
          .catch(() => undefined);

        void apiFetch<PublicProfile>(`/api/users/${encodeURIComponent(detail.author.username)}`)
          .then((profile) => {
            if (!cancelled) setAuthorProfile(profile);
          })
          .catch(() => undefined);

        void apiFetch<Page<ThreadSummary>>(
          `/api/threads?category=${encodeURIComponent(detail.category_slug)}&page=1&page_size=5`,
        )
          .then((page) => {
            if (!cancelled) setRelated(page.items.filter((item) => item.id !== detail.id));
          })
          .catch(() => undefined);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(
            err instanceof ApiError ? err.message : "Der Thread konnte nicht geladen werden.",
          );
        }
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    if (user === null || !Number.isFinite(threadId)) {
      setSubscribed(false);
      return;
    }
    let cancelled = false;
    void apiFetch<SubscriptionState>(`/api/threads/${threadId}/subscription`)
      .then((state) => {
        if (!cancelled) setSubscribed(state.subscribed);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [threadId, user]);

  const handleThreadVote = async (value: VoteValue) => {
    try {
      const result = await apiFetch<VoteResult>(`/api/threads/${threadId}/vote`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      setThread((current) => (current === null ? current : { ...current, score: result.score }));
      setThreadVote(result.my_vote as VoteValue);
    } catch (err) {
      notifyError(err, "Die Stimme konnte nicht gespeichert werden.");
    }
  };

  const handleCommentVote = async (commentId: number, value: VoteValue) => {
    try {
      const result = await apiFetch<VoteResult>(`/api/comments/${commentId}/vote`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      setComments((current) =>
        mapComment(current, commentId, (node) => ({
          ...node,
          score: result.score,
          my_vote: result.my_vote,
        })),
      );
    } catch (err) {
      notifyError(err, "Die Stimme konnte nicht gespeichert werden.");
    }
  };

  const submitComment = async (bodyMarkdown: string, parentId: number | null) => {
    const created = await apiFetch<CommentNode>(`/api/threads/${threadId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body_markdown: bodyMarkdown, parent_id: parentId }),
    });
    if (parentId === null) {
      setComments((current) => [...current, created]);
    } else {
      setComments((current) => insertReply(current, parentId, created));
    }
    setThread((current) =>
      current === null ? current : { ...current, comment_count: current.comment_count + 1 },
    );
  };

  const handleReply = async (parentId: number, body: string) => {
    try {
      await submitComment(body, parentId);
      notify("success", "Antwort gesendet.");
    } catch (err) {
      notifyError(err, "Die Antwort konnte nicht gesendet werden.");
    }
  };

  const submitRootComment = async () => {
    const body = rootDraft.trim();
    if (body === "" || busy) return;
    setBusy(true);
    try {
      await submitComment(body, null);
      setRootDraft("");
      notify("success", "Kommentar gesendet.");
    } catch (err) {
      notifyError(err, "Der Kommentar konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (commentId: number) => {
    const node = findComment(comments, commentId);
    if (node === null) return;
    setEditTarget(node);
    setEditDraft(node.body_markdown);
  };

  const submitEdit = async () => {
    if (editTarget === null) return;
    const body = editDraft.trim();
    if (body === "") return;
    setBusy(true);
    try {
      const updated = await apiFetch<CommentNode>(`/api/comments/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body_markdown: body }),
      });
      setComments((current) =>
        mapComment(current, editTarget.id, (node) => ({
          ...node,
          body_markdown: updated.body_markdown,
          body_html: updated.body_html,
          edited_at: updated.edited_at,
        })),
      );
      setEditTarget(null);
      notify("success", "Kommentar aktualisiert.");
    } catch (err) {
      notifyError(err, "Der Kommentar konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await apiFetch<void>(`/api/comments/${commentId}`, { method: "DELETE" });
      setComments((current) =>
        mapComment(current, commentId, (node) => ({ ...node, deleted: true })),
      );
      notify("success", "Kommentar gelöscht. Antworten bleiben sichtbar.");
    } catch (err) {
      notifyError(err, "Der Kommentar konnte nicht gelöscht werden.");
    }
  };

  const openReport = (target: { type: "thread" | "comment"; id: number }) => {
    setReportTarget(target);
    setReportReason(REPORT_REASONS[0]);
    setReportNote("");
  };

  const submitReport = async () => {
    if (reportTarget === null) return;
    setBusy(true);
    try {
      await apiFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          content_type: reportTarget.type,
          content_id: reportTarget.id,
          reason: reportReason,
          note: reportNote.trim() === "" ? null : reportNote.trim(),
        }),
      });
      setReportTarget(null);
      notify("success", "Meldung gesendet. Danke für den Hinweis.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReportTarget(null);
        notify("info", "Du hast diesen Inhalt bereits gemeldet.");
        return;
      }
      notifyError(err, "Die Meldung konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSubscription = async () => {
    if (user === null || busy) return;
    setBusy(true);
    try {
      if (subscribed) {
        await apiFetch<void>(`/api/threads/${threadId}/subscription`, { method: "DELETE" });
        setSubscribed(false);
        notify("info", "Abonnement beendet.");
      } else {
        await apiFetch<void>(`/api/threads/${threadId}/subscription`, { method: "POST" });
        setSubscribed(true);
        notify("success", "Thread abonniert. Du erhältst eine Benachrichtigung bei neuen Antworten.");
      }
    } catch (err) {
      notifyError(err, "Das Abonnement konnte nicht geändert werden.");
    } finally {
      setBusy(false);
    }
  };

  const applyThreadSummary = (summary: ThreadSummary) => {
    setThread((current) =>
      current === null
        ? current
        : {
            ...current,
            category_id: summary.category_id,
            category_slug: summary.category_slug,
            category_name: summary.category_name,
            score: summary.score,
            comment_count: summary.comment_count,
            pinned: summary.pinned,
            locked: summary.locked,
            deleted: summary.deleted,
          },
    );
  };

  const togglePin = async () => {
    if (thread === null) return;
    try {
      const summary = await apiFetch<ThreadSummary>(`/api/admin/threads/${threadId}/pin`, {
        method: "POST",
        body: JSON.stringify({ pinned: !thread.pinned }),
      });
      applyThreadSummary(summary);
      notify("success", summary.pinned ? "Thread angepinnt." : "Anpinnen aufgehoben.");
    } catch (err) {
      notifyError(err, "Die Aktion konnte nicht ausgeführt werden.");
    }
  };

  const toggleLock = async () => {
    if (thread === null) return;
    try {
      const summary = await apiFetch<ThreadSummary>(`/api/admin/threads/${threadId}/lock`, {
        method: "POST",
        body: JSON.stringify({ locked: !thread.locked }),
      });
      applyThreadSummary(summary);
      notify("success", summary.locked ? "Thread gesperrt." : "Thread entsperrt.");
    } catch (err) {
      notifyError(err, "Die Aktion konnte nicht ausgeführt werden.");
    }
  };

  const openMove = () => {
    if (thread === null) return;
    setMoveCategory(thread.category_id);
    setMoveOpen(true);
  };

  const submitMove = async () => {
    if (moveCategory === "" || busy) return;
    setBusy(true);
    try {
      const summary = await apiFetch<ThreadSummary>(`/api/admin/threads/${threadId}/move`, {
        method: "POST",
        body: JSON.stringify({ category_id: moveCategory }),
      });
      applyThreadSummary(summary);
      setMoveOpen(false);
      notify("success", `Thread nach „${summary.category_name}" verschoben.`);
    } catch (err) {
      notifyError(err, "Der Thread konnte nicht verschoben werden.");
    } finally {
      setBusy(false);
    }
  };

  const submitRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch<void>(`/api/admin/threads/${threadId}`, { method: "DELETE" });
      setRemoveOpen(false);
      notify("success", "Thread entfernt.");
      navigate("/");
    } catch (err) {
      notifyError(err, "Der Thread konnte nicht entfernt werden.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="stack gap-3">
        <SkeletonText lines={2} />
        <SkeletonText lines={6} />
      </div>
    );
  }

  if (notFound) {
    return (
      <EmptyState
        title="Thread nicht gefunden"
        action={
          <LinkButton to="/" variant="primary">
            Zur Startseite
          </LinkButton>
        }
      >
        Dieser Thread existiert nicht oder wurde entfernt.
      </EmptyState>
    );
  }

  if (error !== null || thread === null) {
    return (
      <EmptyState
        title="Thread konnte nicht geladen werden"
        action={
          <LinkButton to="/" variant="secondary">
            Zur Startseite
          </LinkButton>
        }
      >
        {error ?? "Bitte versuche es später erneut."}
      </EmptyState>
    );
  }

  const signedIn = user !== null;
  const ownThread = viewerId !== null && thread.author.id === viewerId;
  const replyDisabled = !signedIn || thread.locked;
  const replyDisabledNote = thread.locked
    ? "Dieser Thread ist gesperrt — neue Kommentare sind nicht möglich."
    : "Melde dich an, um zu antworten.";

  const commentData = comments.map((node) => toCommentData(node, viewerId));

  return (
    <>
      <div className="layout layout--reading">
        <div className="reading-col">
          <Breadcrumb
            items={[
              { label: "Start", to: "/" },
              { label: thread.category_name, to: `/category/${thread.category_slug}` },
              { label: thread.title },
            ]}
          />

          {isModerator && (
            <div className="banner" style={{ gap: 8 }} data-od-id="mod-bar">
              <Badge variant="moderator">Moderation</Badge>
              <div className="row gap-1 wrap">
                <Button variant="secondary" size="sm" onClick={togglePin}>
                  {thread.pinned ? "Anpinnen aufheben" : "Anpinnen"}
                </Button>
                <Button variant="secondary" size="sm" onClick={toggleLock}>
                  {thread.locked ? "Entsperren" : "Sperren"}
                </Button>
                <Button variant="secondary" size="sm" onClick={openMove}>
                  Verschieben
                </Button>
                <Button variant="danger" size="sm" onClick={() => setRemoveOpen(true)}>
                  Thread entfernen
                </Button>
              </div>
            </div>
          )}

          <header data-od-id="thread-header">
            <div className="row gap-1 wrap" style={{ marginBottom: 8 }}>
              {thread.pinned && <Badge variant="pin">Angeheftet</Badge>}
              {thread.locked && <Badge variant="lock">Gesperrt</Badge>}
              <Link
                to={`/category/${thread.category_slug}`}
                style={{ color: "var(--color-fg-muted)" }}
              >
                {thread.category_name}
              </Link>
            </div>
            <h1 data-od-id="thread-title">{thread.title}</h1>
            {thread.tags.length > 0 && (
              <div className="thread-tags" style={{ marginTop: 12 }}>
                {thread.tags.map((tag) => (
                  <Tag key={tag} tag={tag} to={`/tag/${encodeURIComponent(tag)}`} />
                ))}
              </div>
            )}
            <div
              className="row gap-2 wrap"
              style={{ marginTop: 16, fontSize: 13, color: "var(--color-fg-muted)" }}
            >
              <Avatar name={thread.author.username} size={24} color={thread.author.id} />
              <Link
                to={`/users/${encodeURIComponent(thread.author.username)}`}
                style={{ fontWeight: 600, color: "var(--color-fg)" }}
              >
                @{thread.author.username}
              </Link>
              <span>{relativeTime(thread.created_at)}</span>
              {thread.edited_at !== null && (
                <span title={thread.edited_at}>bearbeitet ({relativeTime(thread.edited_at)})</span>
              )}
            </div>
          </header>

          <div
            className="row gap-4 wrap"
            style={{ margin: "20px 0", alignItems: "flex-start" }}
            data-od-id="thread-actions"
          >
            <VoteControl
              score={thread.score}
              value={threadVote}
              onVote={signedIn && !ownThread ? handleThreadVote : undefined}
              disabled={!signedIn || ownThread}
              subject="Thread"
            />
            <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleSubscription}
                disabled={!signedIn || busy}
                title={!signedIn ? "Melde dich an, um zu abonnieren." : undefined}
                aria-pressed={subscribed}
              >
                <BellGlyph />
                {subscribed ? "Abonniert" : "Abonnieren"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openReport({ type: "thread", id: thread.id })}
                disabled={!signedIn || ownThread}
                title={
                  !signedIn
                    ? "Melde dich an, um zu melden."
                    : ownThread
                      ? "Du kannst deinen eigenen Beitrag nicht melden."
                      : undefined
                }
              >
                Melden
              </Button>
              {ownThread && (
                <LinkButton to={`/threads/${thread.id}/edit`} variant="secondary" size="sm">
                  Bearbeiten
                </LinkButton>
              )}
            </div>
          </div>

          <Prose as="article" className="card" html={thread.body_html} />

          <section className="section" style={{ marginTop: 32 }} data-od-id="comment-section">
            <div className="between" style={{ marginBottom: 8 }}>
              <h3>Antworten ({thread.comment_count})</h3>
              {!replyDisabled && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => editorRef.current?.scrollIntoView?.({ block: "center" })}
                >
                  Kommentar schreiben
                </Button>
              )}
            </div>

            {comments.length === 0 ? (
              <EmptyState title="Noch keine Antworten">
                Sei der Erste, der auf diesen Thread antwortet.
              </EmptyState>
            ) : (
              <CommentTree
                comments={commentData}
                maxDepth={MAX_DEPTH}
                onVote={signedIn ? handleCommentVote : undefined}
                onReply={signedIn ? handleReply : undefined}
                onReport={
                  signedIn ? (commentId) => openReport({ type: "comment", id: commentId }) : undefined
                }
                onEdit={startEdit}
                onDelete={handleDeleteComment}
                profileHref={(username) => `/users/${encodeURIComponent(username)}`}
                replyDisabled={replyDisabled}
                replyDisabledNote={replyDisabledNote}
              />
            )}

            <div className="card" id="root-editor" style={{ marginTop: 24 }} ref={editorRef}>
              <h4 style={{ marginBottom: 12 }}>Antwort schreiben</h4>
              {thread.locked ? (
                <p className="muted">Dieser Thread ist gesperrt — neue Kommentare sind nicht möglich.</p>
              ) : !signedIn ? (
                <div className="stack gap-2">
                  <p className="muted">Melde dich an, um an der Diskussion teilzunehmen.</p>
                  <LinkButton to="/login" variant="primary" size="sm">
                    Anmelden
                  </LinkButton>
                </div>
              ) : (
                <>
                  <MarkdownEditor
                    value={rootDraft}
                    onChange={setRootDraft}
                    ariaLabel="Kommentartext"
                    placeholder="Schreibe eine hilfreiche Antwort…"
                  />
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    <Button
                      variant="primary"
                      onClick={() => void submitRootComment()}
                      loading={busy}
                      disabled={rootDraft.trim() === ""}
                    >
                      Kommentar senden
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <Sidebar>
          <SidebarCard>
            <div className="stack" style={{ alignItems: "center", textAlign: "center", gap: 8 }}>
              <Avatar name={thread.author.username} size={72} color={thread.author.id} />
              <Link
                to={`/users/${encodeURIComponent(thread.author.username)}`}
                style={{ fontSize: 17, fontWeight: 600, color: "var(--color-fg)" }}
              >
                @{thread.author.username}
              </Link>
              <span
                className="karma tabular"
                style={{ fontSize: 20, fontWeight: 600 }}
              >
                Karma {authorProfile?.karma ?? thread.author.karma}
              </span>
              {authorProfile?.bio !== undefined && authorProfile?.bio !== null && (
                <p className="muted small">{authorProfile.bio}</p>
              )}
              <LinkButton
                to={`/users/${encodeURIComponent(thread.author.username)}`}
                variant="secondary"
                size="sm"
                block
              >
                Profil ansehen
              </LinkButton>
            </div>
          </SidebarCard>

          {related.length > 0 && (
            <SidebarCard heading="In dieser Kategorie">
              <div className="stack gap-2">
                {related.map((item) => (
                  <Link key={item.id} to={`/threads/${item.id}`} style={{ color: "var(--color-fg)" }}>
                    {item.title}
                  </Link>
                ))}
              </div>
            </SidebarCard>
          )}

          <SidebarCard heading="Statistik">
            <StatList
              items={[
                { label: "Kommentare", value: thread.comment_count },
                { label: "Stimmen", value: formatScore(thread.score) },
                { label: "Erstellt", value: relativeTime(thread.created_at) },
              ]}
            />
          </SidebarCard>
        </Sidebar>
      </div>

      <Modal
        open={editTarget !== null}
        title="Kommentar bearbeiten"
        description="Nach dem Speichern wird der Kommentar als bearbeitet gekennzeichnet."
        onClose={() => setEditTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={() => void submitEdit()}
              loading={busy}
              disabled={editDraft.trim() === ""}
            >
              Speichern
            </Button>
          </>
        }
      >
        <MarkdownEditor
          value={editDraft}
          onChange={setEditDraft}
          ariaLabel="Kommentar bearbeiten"
          placeholder="Kommentartext…"
        />
      </Modal>

      <Modal
        open={moveOpen}
        title="Thread verschieben"
        description="Der Thread wandert in eine andere Kategorie. Abonnenten bleiben erhalten."
        onClose={() => setMoveOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={() => void submitMove()}
              loading={busy}
              disabled={moveCategory === ""}
            >
              Verschieben
            </Button>
          </>
        }
      >
        <Field label="Kategorie" htmlFor="move-category">
          <Select
            id="move-category"
            value={moveCategory === "" ? "" : String(moveCategory)}
            onChange={(event) => setMoveCategory(Number(event.target.value))}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={removeOpen}
        title="Thread entfernen"
        description="Der Thread wird als entfernt angezeigt; die Kommentare bleiben sichtbar."
        onClose={() => setRemoveOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveOpen(false)}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={() => void submitRemove()} loading={busy}>
              Thread entfernen
            </Button>
          </>
        }
      >
        <Field
          label="Grund"
          htmlFor="remove-reason"
          hint="Wird im Audit-Log festgehalten."
        >
          <TextInput
            id="remove-reason"
            value={removeReason}
            onChange={(event) => setRemoveReason(event.target.value)}
            placeholder="z. B. Duplikat"
          />
        </Field>
      </Modal>

      <Modal
        open={reportTarget !== null}
        title="Inhalt melden"
        onClose={() => setReportTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportTarget(null)}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={() => void submitReport()} loading={busy}>
              Meldung senden
            </Button>
          </>
        }
      >
        <div className="stack gap-3">
          <Field label="Grund" htmlFor="report-reason">
            <Select
              id="report-reason"
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
            >
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Anmerkung (optional)" htmlFor="report-note" hint="Maximal 500 Zeichen.">
            <Textarea
              id="report-note"
              value={reportNote}
              onChange={(event) => setReportNote(event.target.value)}
              maxLength={500}
              placeholder="Was ist das Problem?"
            />
          </Field>
        </div>
      </Modal>

      {toast !== null && (
        <ToastRegion>
          <Toast variant={toast.kind} onClose={() => setToast(null)}>
            {toast.message}
          </Toast>
        </ToastRegion>
      )}
    </>
  );
}

/** Small bell glyph for the subscription button (matches the design's icon). */
function BellGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
