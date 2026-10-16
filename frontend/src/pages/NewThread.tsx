import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BanBanner,
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
  Tag,
  TextInput,
  Toast,
  ToastRegion,
} from "../components";
import { ApiError, apiFetch } from "../lib/api";

interface CategoryOut {
  id: number;
  name: string;
  slug: string;
  description: string;
  position: number;
  thread_count: number;
}

interface CreatedThread {
  id: number;
}

const TITLE_MAX = 120;
const TAGS_MAX = 5;
const BAN_MESSAGE = "Dein Konto ist gesperrt. Du kannst derzeit keine Threads veröffentlichen.";
const RATE_LIMIT_MESSAGE = "Zu viele Beiträge in kurzer Zeit. Bitte warte noch ";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Compose screen for a new thread (design/mockups/new-thread.html): category
 * choice fed by the categories API, title with counter, Markdown body and a
 * tag input. Field feedback appears once the field was touched or the form was
 * submitted; a ban (403) and the write rate limit (429 + Retry-After) are
 * surfaced separately.
 */
export default function NewThread() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagError, setTagError] = useState<string | null>(null);

  const [touched, setTouched] = useState({ title: false, body: false });
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [banned, setBanned] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<CategoryOut[]>("/api/categories")
      .then((items) => {
        if (cancelled) return;
        setCategories(items);
        setCategoriesError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setCategoriesError(
          error instanceof ApiError
            ? error.message
            : "Die Kategorien konnten nicht geladen werden.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (categoryId === null && categories.length > 0) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    if (retryAfter === null || retryAfter <= 0) return;
    const id = window.setTimeout(() => {
      setRetryAfter((current) => (current === null ? null : current - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [retryAfter]);

  const category = useMemo(
    () => categories.find((item) => item.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const titleMissing = title.trim() === "";
  const bodyMissing = body.trim() === "";
  const titleError =
    fieldErrors.title ??
    ((touched.title || submitted) && titleMissing ? "Bitte gib einen Titel ein." : null);
  const bodyError =
    fieldErrors.body_markdown ??
    fieldErrors.body ??
    ((touched.body || submitted) && bodyMissing ? "Bitte gib einen Inhalt ein." : null);
  const categoryError = fieldErrors.category_id ?? null;

  const rateLimited = retryAfter !== null && retryAfter > 0;

  const commitTags = (raw: string) => {
    const parts = raw
      .split(",")
      .map((part) => part.trim().replace(/^#+/, ""))
      .filter((part) => part !== "");
    if (parts.length === 0) return;
    setTagInput("");
    const next = [...tags];
    let error: string | null = null;
    for (const part of parts) {
      if (next.length >= TAGS_MAX) {
        error = `Maximal ${TAGS_MAX} Schlagwörter.`;
        break;
      }
      if (next.includes(part)) {
        error = "Doppelte Schlagwörter werden abgelehnt.";
        continue;
      }
      next.push(part);
    }
    setTags(next);
    setTagError(error);
  };

  const removeTag = (tag: string) => {
    setTags((current) => current.filter((item) => item !== tag));
    setTagError(null);
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTags(tagInput);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    setBanned(false);
    setFieldErrors({});

    if (titleMissing || bodyMissing || categoryId === null || categories.length === 0) {
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiFetch<CreatedThread>("/api/threads", {
        method: "POST",
        body: JSON.stringify({
          category_id: categoryId,
          title: title.trim(),
          body_markdown: body,
          tags,
        }),
      });
      navigate(`/threads/${created.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) {
          setRetryAfter(error.retryAfter !== null && error.retryAfter > 0 ? error.retryAfter : 60);
        } else if (error.status === 403) {
          setBanned(true);
          setFormError(error.message !== "" ? error.message : BAN_MESSAGE);
        } else if (error.status === 422) {
          setFieldErrors(error.fields);
        } else if (error.status === 404) {
          setFormError(error.message !== "" ? error.message : "Die gewählte Kategorie existiert nicht.");
        } else {
          setFormError(
            error.message !== ""
              ? error.message
              : "Der Thread konnte nicht veröffentlicht werden.",
          );
        }
      } else {
        setFormError("Der Thread konnte nicht veröffentlicht werden.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderPreview = (value: string) => (
    <Prose
      html={`<p>${escapeHtml(value)
        .replace(/\n\n+/g, "</p><p>")
        .replace(/\n/g, "<br>")}</p>`}
    />
  );

  const cancelHref = category !== null ? `/category/${category.slug}` : "/";

  return (
    <>
      <div className="layout--compose">
        <div>
          <Breadcrumb
            items={[
              { label: "Start", to: "/" },
              category !== null
                ? { label: category.name, to: `/category/${category.slug}` }
                : { label: "Neuer Thread" },
              { label: "Neuer Thread" },
            ]}
          />
          <h1 data-od-id="new-thread-title">Neuen Thread erstellen</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {category !== null ? (
              <>
                in <Link to={`/category/${category.slug}`}>{category.name}</Link>
              </>
            ) : (
              "in einer Kategorie"
            )}
          </p>

          {banned && <BanBanner className="callout">{formError ?? BAN_MESSAGE}</BanBanner>}
          {!banned && formError !== null && (
            <Banner variant="danger" className="callout">
              {formError}
            </Banner>
          )}
          {categoriesError !== null && (
            <Banner variant="danger" className="callout">
              {categoriesError}
            </Banner>
          )}
          {categoriesError === null && categories.length === 0 && (
            <Banner variant="warning" className="callout">
              Es sind noch keine Kategorien verfügbar. Threads können gerade nicht angelegt werden.
            </Banner>
          )}

          <form className="card" style={{ marginTop: 24 }} onSubmit={handleSubmit} data-od-id="new-thread-form" noValidate>
            <div className="stack gap-4">
              <Field
                label="Titel"
                htmlFor="nt-title"
                error={titleError}
                counter={`${title.length}/${TITLE_MAX}`}
              >
                <TextInput
                  id="nt-title"
                  maxLength={TITLE_MAX}
                  placeholder="Worum geht es?"
                  value={title}
                  invalid={titleError !== null}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTouched((current) => ({ ...current, title: true }));
                  }}
                />
              </Field>

              <Field label="Kategorie" htmlFor="nt-cat" error={categoryError}>
                <Select
                  id="nt-cat"
                  value={categoryId === null ? "" : String(categoryId)}
                  onChange={(event) => {
                    setCategoryId(event.target.value === "" ? null : Number(event.target.value));
                  }}
                  disabled={categories.length === 0}
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label={<span id="nt-body-label">Inhalt</span>}
                error={bodyError}
              >
                <MarkdownEditor
                  value={body}
                  onChange={(value) => {
                    setBody(value);
                    setTouched((current) => ({ ...current, body: true }));
                  }}
                  size="h200"
                  ariaLabelledby="nt-body-label"
                  placeholder="Beschreibe dein Thema in Markdown…"
                  helper="HTML und Skripte werden entfernt."
                  renderPreview={renderPreview}
                  invalid={bodyError !== null}
                  disabled={submitting}
                />
              </Field>

              <Field
                label="Schlagwörter"
                htmlFor="nt-tags"
                error={tagError}
                hint={`Maximal ${TAGS_MAX} Schlagwörter. Doppelte werden abgelehnt.`}
              >
                <TextInput
                  id="nt-tags"
                  placeholder="Mit Komma oder Enter hinzufügen"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => commitTags(tagInput)}
                  aria-describedby="nt-tags-hint"
                />
                {tags.length > 0 && (
                  <div className="row gap-1 wrap" style={{ marginTop: 4 }}>
                    {tags.map((tag) => (
                      <Chip
                        key={tag}
                        removable
                        onRemove={() => removeTag(tag)}
                        removeLabel={`Schlagwort ${tag} entfernen`}
                      >
                        #{tag}
                      </Chip>
                    ))}
                  </div>
                )}
              </Field>

              <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                <LinkButton to={cancelHref} variant="ghost">
                  Abbrechen
                </LinkButton>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  disabled={rateLimited}
                  data-od-id="publish-btn"
                >
                  Thread veröffentlichen
                </Button>
              </div>
            </div>
          </form>
        </div>

        <Sidebar className="compose-side">
          <SidebarCard heading="Tipps">
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Markdown wird sicher gerendert, HTML und Skripte werden entfernt.</li>
              <li>Schlagwörter helfen anderen, den Thread zu finden.</li>
              <li>Ein konkretes Beispiel erhöht die Chance auf gute Antworten.</li>
            </ul>
          </SidebarCard>

          <SidebarCard heading="Vorschau">
            <div className="stack gap-1">
              <strong style={{ fontSize: 15 }}>{title.trim() !== "" ? title.trim() : "Ohne Titel"}</strong>
              <span className="muted small">{category?.name ?? "Keine Kategorie"}</span>
              <div className="row gap-1 wrap">
                {tags.map((tag) => (
                  <Tag key={tag} tag={tag} />
                ))}
              </div>
            </div>
          </SidebarCard>
        </Sidebar>
      </div>

      {rateLimited && (
        <ToastRegion>
          <Toast variant="warning" onClose={() => setRetryAfter(null)}>
            {RATE_LIMIT_MESSAGE}
            <strong>{retryAfter}</strong> Sekunden.
          </Toast>
        </ToastRegion>
      )}
    </>
  );
}
