import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Chip,
  EmptyState,
  Field,
  Pagination,
  SearchBar,
  Select,
  Sidebar,
  SidebarCard,
  Skeleton,
  TagCloud,
  TextInput,
  ThreadCard,
} from "../components";
import { ApiError, apiFetch } from "../lib/api";

/** One page of a paginated API answer (the sprint's list envelope). */
interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface UserBrief {
  id: number;
  username: string;
  karma: number;
}

/** The subset of ThreadSummary the search result card renders. */
export interface SearchResult {
  id: number;
  category_id: number;
  category_slug: string;
  category_name: string;
  title: string;
  tags: string[];
  score: number;
  comment_count: number;
  pinned: boolean;
  locked: boolean;
  deleted: boolean;
  created_at: string;
  author: UserBrief;
}

interface CategoryOption {
  id: number;
  name: string;
  slug: string;
}

const PAGE_SIZE = 20;

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${pluralForm}`;
}

/** Short German age label used by the result cards ("vor 3 Std."). */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "";
  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSeconds < 60) return "gerade eben";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `vor ${plural(minutes, "Min.", "Min.")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${plural(hours, "Std.", "Std.")}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${plural(days, "Tag", "Tagen")}`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `vor ${plural(weeks, "Woche", "Wochen")}`;
  return new Date(timestamp).toLocaleDateString("de-DE");
}

function ResultSkeleton() {
  return (
    <div className="thread-card" aria-hidden="true">
      <div className="stack gap-1" style={{ alignItems: "center" }}>
        <Skeleton width={32} height={32} />
      </div>
      <div className="stack gap-1">
        <Skeleton width="70%" height={18} />
        <Skeleton width="90%" height={12} />
        <Skeleton width="40%" height={12} />
      </div>
      <div />
    </div>
  );
}

/**
 * Full-text search screen (design/mockups/search.html): the large search field,
 * the category and tag filters in the sidebar, and the result list fed by
 * GET /api/search. The query lives in the URL, so a search is shareable and the
 * browser's back button walks through it.
 */
export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const categorySlug = searchParams.get("category") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const rawPage = Number(searchParams.get("page") ?? "1");
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const [queryInput, setQueryInput] = useState(query);
  const [tagInput, setTagInput] = useState(tag);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  useEffect(() => {
    setQueryInput(query);
  }, [query]);

  useEffect(() => {
    setTagInput(tag);
  }, [tag]);

  // A navigation is a React transition, so the re-render (and with it a fresh
  // ``searchParams``) can lag behind two filter changes made in quick
  // succession. Composing each update from a ref we keep in step with the URL
  // keeps such changes from overwriting one another (e.g. a category select
  // followed immediately by a tag submit).
  const latestParams = useRef(searchParams);
  useEffect(() => {
    latestParams.current = searchParams;
  }, [searchParams]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(latestParams.current);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (resetPage) next.delete("page");
      latestParams.current = next;
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  const handleSearch = (value: string) => {
    updateParams({ q: value.trim() === "" ? null : value.trim() });
  };

  const handleTagCommit = () => {
    const trimmed = tagInput.trim();
    if (trimmed !== tag) updateParams({ tag: trimmed === "" ? null : trimmed });
  };

  const handleTagSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleTagCommit();
  };

  const resetFilters = () => {
    updateParams({ category: null, tag: null });
  };

  // Categories for the filter select. A failure leaves the select with its
  // "Alle Kategorien" option only — the search itself keeps working.
  useEffect(() => {
    const controller = new AbortController();
    apiFetch<CategoryOption[]>("/api/categories", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setCategories(data);
      })
      .catch(() => {
        // The filter stays empty; the request is optional for the screen.
      });
    return () => controller.abort();
  }, []);

  const [results, setResults] = useState<Page<SearchResult> | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const hasQuery = query.trim() !== "";

  useEffect(() => {
    if (!hasQuery) {
      setResults(null);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    const params = new URLSearchParams({ q: query, page_size: String(PAGE_SIZE) });
    if (categorySlug !== "") params.set("category", categorySlug);
    if (tag !== "") params.set("tag", tag);
    if (page > 1) params.set("page", String(page));

    apiFetch<Page<SearchResult>>(`/api/search?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setResults(data);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          error instanceof ApiError ? error.message : "Die Suche ist fehlgeschlagen.",
        );
        setStatus("error");
      });
    return () => controller.abort();
  }, [query, categorySlug, tag, page, hasQuery, reloadToken]);

  const categoryName = useMemo(
    () => categories.find((option) => option.slug === categorySlug)?.name ?? categorySlug,
    [categories, categorySlug],
  );

  const frequentTags = useMemo(() => {
    if (results === null) return [];
    const counts = new Map<string, number>();
    for (const item of results.items) {
      for (const itemTag of item.tags) {
        counts.set(itemTag, (counts.get(itemTag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([name]) => name);
  }, [results]);

  const accentStyle = { marginTop: "var(--space-2)" } as const;

  return (
    <>
      <div className="layout" style={{ gridTemplateColumns: "1fr" }}>
        <div>
          <SearchBar
            size="lg"
            value={queryInput}
            onChange={setQueryInput}
            onSubmit={handleSearch}
            label="Threads durchsuchen"
          />
          {hasQuery && status === "ready" && results !== null && (
            <p className="muted" style={{ marginTop: "var(--space-2)" }}>
              {plural(results.total, "Treffer", "Treffer")} für „{query}“
            </p>
          )}
        </div>
      </div>

      <div className="layout" style={{ marginTop: "var(--space-4)" }}>
        <section data-od-id="search-results" aria-label="Suchergebnisse">
          {status === "idle" && (
            <EmptyState title="Wonach suchst du?">
              Gib einen Suchbegriff ein, um Threads über Titel und Text zu finden.
            </EmptyState>
          )}

          {status === "loading" && (
            <div aria-busy="true" aria-label="Suche läuft">
              <ResultSkeleton />
              <ResultSkeleton />
              <ResultSkeleton />
            </div>
          )}

          {status === "error" && (
            <EmptyState
              title="Die Suche ist fehlgeschlagen"
              action={
                <Button variant="secondary" onClick={() => setReloadToken((token) => token + 1)}>
                  Erneut versuchen
                </Button>
              }
            >
              {errorMessage}
            </EmptyState>
          )}

          {status === "ready" && results !== null && results.items.length === 0 && (
            <EmptyState title="Keine Treffer">
              Für „{query}“ wurde kein Thread gefunden. Versuche ein anderes Wort oder entferne
              einen Filter.
            </EmptyState>
          )}

          {status === "ready" &&
            results !== null &&
            results.items.map((thread) => (
              <ThreadCard
                key={thread.id}
                to={`/threads/${thread.id}`}
                title={thread.title}
                tags={thread.tags}
                tagHref={(name) => `/tag/${encodeURIComponent(name)}`}
                score={thread.score}
                author={{ username: thread.author.username }}
                profileHref={(username) => `/users/${encodeURIComponent(username)}`}
                category={{
                  name: thread.category_name,
                  href: `/category/${encodeURIComponent(thread.category_slug)}`,
                }}
                createdAtLabel={formatRelativeTime(thread.created_at)}
                commentCount={thread.comment_count}
                pinned={thread.pinned}
                locked={thread.locked}
                deleted={thread.deleted}
              />
            ))}

          {status === "ready" && results !== null && (
            <Pagination
              page={results.page}
              pages={results.pages}
              totalItems={results.total}
              itemLabel="Treffer"
              onPageChange={(next) => updateParams({ page: String(next) }, false)}
            />
          )}
        </section>

        <Sidebar data-od-id="search-filters" className="search-filters">
          <SidebarCard heading="Filter">
            <Field label="Kategorie" htmlFor="search-category">
              <Select
                id="search-category"
                value={categorySlug}
                onChange={(event) =>
                  updateParams({ category: event.target.value === "" ? null : event.target.value })
                }
              >
                <option value="">Alle Kategorien</option>
                {categories.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>

            <form onSubmit={handleTagSubmit} style={{ marginTop: "var(--space-2)" }}>
              <Field label="Schlagwort" htmlFor="search-tag">
                <TextInput
                  id="search-tag"
                  value={tagInput}
                  placeholder="z. B. postgres"
                  onChange={(event) => setTagInput(event.target.value)}
                  onBlur={handleTagCommit}
                />
              </Field>
            </form>

            {(categorySlug !== "" || tag !== "") && (
              <>
                <div className="sidebar-heading" style={{ marginTop: "var(--space-3)" }}>
                  Aktive Filter
                </div>
                <div className="row gap-1 wrap">
                  {categorySlug !== "" && (
                    <Chip
                      selected
                      removable
                      onRemove={() => updateParams({ category: null })}
                      removeLabel="Kategorie-Filter entfernen"
                    >
                      Kategorie: {categoryName}
                    </Chip>
                  )}
                  {tag !== "" && (
                    <Chip
                      selected
                      removable
                      onRemove={() => updateParams({ tag: null })}
                      removeLabel="Schlagwort-Filter entfernen"
                    >
                      #{tag}
                    </Chip>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  block
                  style={accentStyle}
                  onClick={resetFilters}
                >
                  Filter zurücksetzen
                </Button>
              </>
            )}
          </SidebarCard>

          {frequentTags.length > 0 && (
            <SidebarCard heading="Häufige Tags">
              <TagCloud
                tags={frequentTags}
                href={(name) => `/tag/${encodeURIComponent(name)}`}
              />
            </SidebarCard>
          )}
        </Sidebar>
      </div>
    </>
  );
}
