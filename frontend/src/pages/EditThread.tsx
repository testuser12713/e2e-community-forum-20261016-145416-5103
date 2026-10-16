import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Banner,
  Breadcrumb,
  Button,
  Chip,
  Field,
  LinkButton,
  MarkdownEditor,
  Prose,
  Select,
  Sidebar,
  SidebarCard,
  Skeleton,
  TextInput,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch } from "../lib/api";

/**
 * `ThreadDetail` from the sprint contract: the shape ``GET /api/threads/{id}``
 * answers and ``PATCH /api/threads/{id}`` echoes back after an edit.
 */
interface ThreadDetail {
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
  author: { id: number; username: string; karma: number };
  body_markdown: string;
  body_html: string;
}

const TITLE_MAX = 120;
const MAX_TAGS = 5;

type FieldErrors = Record<string, string>;

/**
 * Minimal, escaped Markdown preview that mirrors the mockup's own renderer
 * (design/mockups/app.js). Escaping happens first, so no user content can inject
 * markup; the authoritative render stays the server's sanitised `body_html`.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderPreviewHtml(markdown: string): string {
  const lines = escapeHtml(markdown).split(/\n/);
  const out: string[] = [];
  let inList = false;
  let inCode = false;

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      inCode = !inCode;
      out.push(inCode ? "<pre><code>" : "</code></pre>");
      continue;
    }
    if (inCode) {
      out.push(raw);
      continue;
    }

    const line = raw
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");

    const heading = line.match(/^(#{1,3})\s/);
    if (heading) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      const level = heading[1].length + 1;
      out.push(`<h${level}>${line.replace(/^#+\s/, "")}</h${level}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      out.push(`<blockquote>${line.replace(/^>\s?/, "")}</blockquote>`);
      continue;
    }
    if (/^[-*]\s/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${line.replace(/^[-*]\s/, "")}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (line.trim() === "") continue;
    out.push(`<p>${line}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.retryAfter !== null) {
      return `Zu viele Änderungen in kurzer Zeit. Bitte in ${error.retryAfter} Sekunden erneut versuchen.`;
    }
    return error.message;
  }
  return "Etwas ist schiefgelaufen. Bitte erneut versuchen.";
}

/**
 * Edit screen for one's own thread (design/mockups/edit-thread.html): the title
 * and the Markdown body are prefilled from ``GET /api/threads/{id}`` and saved
 * through ``PATCH /api/threads/{id}``, after which the thread is shown again.
 * The category is read-only for authors — the contract has no author-side move.
 * A signed-out visitor is sent to sign in; a non-author back to the thread.
 */
export default function EditThread() {
  const { user, loading: authLoading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const threadId = Number(id);
  const validId = Number.isInteger(threadId) && threadId > 0;

  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (authLoading || userId === null || !validId) {
      if (!validId && !authLoading) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    apiFetch<ThreadDetail>(`/api/threads/${threadId}`)
      .then((result) => {
        if (cancelled) return;
        setThread(result);
        setTitle(result.title);
        setBody(result.body_markdown);
        setTags(result.tags);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setLoadError(messageOf(caught));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, threadId, validId]);

  const previewHtml = useMemo(() => renderPreviewHtml(body), [body]);

  const isAuthor = thread !== null && userId !== null && thread.author.id === userId;

  if (authLoading) {
    return (
      <div className="layout--compose">
        <div className="stack gap-3">
          <Skeleton height={32} width="40%" />
          <Skeleton height={240} />
        </div>
      </div>
    );
  }

  if (user === null) {
    return <Navigate to="/login" replace />;
  }

  if (!validId) {
    return <Navigate to="/" replace />;
  }

  if (thread !== null && !isAuthor) {
    return <Navigate to={`/threads/${thread.id}`} replace />;
  }

  const addTag = (raw: string) => {
    const cleaned = raw.trim().replace(/^#/, "");
    if (cleaned === "") return;
    setTags((current) =>
      current.includes(cleaned) || current.length >= MAX_TAGS ? current : [...current, cleaned],
    );
    setTagInput("");
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagInput);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const errors: FieldErrors = {};
    if (title.trim().length < 3) {
      errors.title = "Der Titel braucht mindestens 3 Zeichen.";
    }
    if (body.trim() === "") {
      errors.body_markdown = "Der Inhalt darf nicht leer sein.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitError(null);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setSubmitError(null);

    try {
      await apiFetch<ThreadDetail>(`/api/threads/${threadId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: title.trim(), body_markdown: body, tags }),
      });
      navigate(`/threads/${threadId}`);
    } catch (caught: unknown) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length > 0) {
        setFieldErrors(caught.fields);
      }
      setSubmitError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="layout--compose">
      <div>
        <Breadcrumb
          items={[
            { label: "Start", to: "/" },
            thread !== null
              ? { label: thread.category_name, to: `/category/${thread.category_slug}` }
              : { label: "Kategorie" },
            thread !== null
              ? { label: thread.title, to: `/threads/${thread.id}` }
              : { label: "Thread" },
            { label: "Bearbeiten" },
          ]}
        />

        <h1 data-od-id="edit-title">Thread bearbeiten</h1>
        <div style={{ marginTop: "var(--space-2)" }}>
          <Banner variant="warning">
            Nach dem Speichern wird der Thread als „bearbeitet“ gekennzeichnet.
          </Banner>
        </div>

        {loadError !== null ? <Banner variant="danger">{loadError}</Banner> : null}

        {loading ? (
          <div className="card stack gap-4" style={{ marginTop: "var(--space-4)" }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={200} />
          </div>
        ) : thread !== null ? (
          <form
            className="card"
            style={{ marginTop: "var(--space-4)" }}
            onSubmit={handleSubmit}
            data-od-id="edit-thread-form"
            noValidate
          >
            <div className="stack gap-4">
              <Field
                label="Titel"
                htmlFor="et-title"
                counter={`${title.length}/${TITLE_MAX}`}
                error={fieldErrors.title}
              >
                <TextInput
                  id="et-title"
                  maxLength={TITLE_MAX}
                  value={title}
                  invalid={Boolean(fieldErrors.title)}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (fieldErrors.title) {
                      setFieldErrors((current) => ({ ...current, title: "" }));
                    }
                  }}
                />
              </Field>

              <Field
                label="Kategorie"
                htmlFor="et-cat"
                hint="Nur Moderator:innen dürfen die Kategorie ändern; Autor:innen sehen sie schreibgeschützt."
              >
                <Select id="et-cat" value={thread.category_name} disabled>
                  <option>{thread.category_name}</option>
                </Select>
              </Field>

              <Field label="Inhalt">
                <MarkdownEditor
                  value={body}
                  onChange={(next) => {
                    setBody(next);
                    if (fieldErrors.body_markdown) {
                      setFieldErrors((current) => ({ ...current, body_markdown: "" }));
                    }
                  }}
                  ariaLabel="Thread-Inhalt"
                  size="h200"
                  invalid={Boolean(fieldErrors.body_markdown)}
                  renderPreview={() => <Prose html={previewHtml} />}
                  helper="HTML und Skripte werden entfernt."
                />
                {fieldErrors.body_markdown ? (
                  <span className="helper helper--error" role="alert">
                    {fieldErrors.body_markdown}
                  </span>
                ) : null}
              </Field>

              <Field label="Schlagwörter" htmlFor="et-tags">
                <TextInput
                  id="et-tags"
                  placeholder="Mit Komma oder Enter hinzufügen"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
                {tags.length > 0 ? (
                  <div className="row gap-1 wrap" style={{ marginTop: "var(--space-0)" }}>
                    {tags.map((tag) => (
                      <Chip
                        key={tag}
                        removable
                        onRemove={() => setTags((current) => current.filter((item) => item !== tag))}
                        removeLabel={`Schlagwort ${tag} entfernen`}
                      >
                        #{tag}
                      </Chip>
                    ))}
                  </div>
                ) : null}
              </Field>

              {submitError !== null ? (
                <Banner variant="danger">{submitError}</Banner>
              ) : null}

              <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                <LinkButton to={`/threads/${threadId}`} variant="ghost">
                  Abbrechen
                </LinkButton>
                <Button type="submit" variant="primary" loading={saving} data-od-id="save-changes-btn">
                  Änderungen speichern
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </div>

      <Sidebar className="compose-side">
        <SidebarCard heading="Hinweise">
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Die Kennzeichnung „bearbeitet“ erscheint mit Zeitstempel unter dem Titel.</li>
            <li>Bereits abgegebene Stimmen bleiben unverändert.</li>
          </ul>
        </SidebarCard>
      </Sidebar>
    </div>
  );
}
