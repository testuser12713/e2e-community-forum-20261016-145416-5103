import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Banner,
  Button,
  Card,
  CategoryNav,
  Chip,
  EmptyState,
  LinkButton,
  Pagination,
  SegmentedTabs,
  Sidebar,
  SidebarCard,
  Skeleton,
  SkeletonText,
  ThreadCard,
  type VoteValue,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

/* -------------------------------------------------------------------------- */
/* API shapes (the shared contract of GET /api/categories and GET /api/threads) */
/* -------------------------------------------------------------------------- */

interface CategoryOut {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  thread_count: number;
}

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

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

type SortOrder = "new" | "top" | "hot";

const SORT_ITEMS = [
  { value: "new" as const, label: "Neu" },
  { value: "top" as const, label: "Top" },
  { value: "hot" as const, label: "Hot", title: "Nach Stimmen mit Zeitverfall sortiert" },
];

const PAGE_SIZE = 20;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function parseSort(value: string | null): SortOrder {
  return value === "top" || value === "hot" ? value : "new";
}

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** German relative time for a thread's `created_at` (design shows "vor 3 Std."). */
function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "gerade eben";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days === 1) return "vor 1 Tag";
  if (days < 30) return `vor ${days} Tagen`;
  const months = Math.round(days / 30);
  if (months === 1) return "vor 1 Monat";
  if (months < 12) return `vor ${months} Monaten`;
  const years = Math.round(months / 12);
  return years === 1 ? "vor 1 Jahr" : `vor ${years} Jahren`;
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = parseSort(searchParams.get("sort"));
  const categorySlug = searchParams.get("category") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const page = parsePage(searchParams.get("page"));

  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [threadsPage, setThreadsPage] = useState<Page<ThreadSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [votes, setVotes] = useState<Record<number, { score: number; myVote: VoteValue }>>({});

  const updateParams = useCallback(
    (updates: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (resetPage) next.delete("page");
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  /* Categories: public, always returned in the administrator's order. */
  useEffect(() => {
    let active = true;
    apiFetch<CategoryOut[]>("/api/categories")
      .then((data) => {
        if (active) setCategories(data);
      })
      .catch(() => {
        // The feed still works without the sidebar navigation.
      });
    return () => {
      active = false;
    };
  }, []);

  /* Thread feed: refetched whenever the sort, filters or page change. */
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const query = new URLSearchParams();
    query.set("sort", sort);
    if (categorySlug !== "") query.set("category", categorySlug);
    if (tag !== "") query.set("tag", tag);
    query.set("page", String(page));
    query.set("page_size", String(PAGE_SIZE));

    apiFetch<Page<ThreadSummary>>(`/api/threads?${query.toString()}`)
      .then((data) => {
        if (!active) return;
        setThreadsPage(data);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setThreadsPage(null);
        setError("Die Threads konnten nicht geladen werden.");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sort, categorySlug, tag, page, reloadToken]);

  const activeCategory = useMemo(
    () => categories.find((entry) => entry.slug === categorySlug),
    [categories, categorySlug],
  );
  const heading = activeCategory?.name ?? "Alle Threads";
  const hasFilters = categorySlug !== "" || tag !== "";

  const handleVote = useCallback(
    async (threadId: number, value: VoteValue) => {
      try {
        const result = await apiFetch<{ score: number; my_vote: number }>(
          `/api/threads/${threadId}/vote`,
          { method: "PUT", body: JSON.stringify({ value }) },
        );
        setVotes((current) => ({
          ...current,
          [threadId]: { score: result.score, myVote: result.my_vote as VoteValue },
        }));
      } catch {
        // The next listing load reflects the server's true state.
      }
    },
    [],
  );

  const items = threadsPage?.items ?? [];

  return (
    <div className="layout">
      <section data-od-id="thread-feed">
        <div className="between gap-3 wrap" style={{ marginBottom: 16 }}>
          <h2 data-od-id="feed-heading">{heading}</h2>
          <SegmentedTabs
            label="Sortierung"
            value={sort}
            onChange={(value) => updateParams({ sort: value })}
            items={SORT_ITEMS}
          />
        </div>

        {hasFilters && (
          <div className="row gap-1 wrap" style={{ marginBottom: 16 }} data-od-id="active-filters">
            {categorySlug !== "" && (
              <Chip
                selected
                removable
                removeLabel={`Filter Kategorie: ${activeCategory?.name ?? categorySlug} entfernen`}
                onRemove={() => updateParams({ category: null })}
              >
                Kategorie: {activeCategory?.name ?? categorySlug}
              </Chip>
            )}
            {tag !== "" && (
              <Chip
                selected
                removable
                removeLabel={`Filter Tag: #${tag} entfernen`}
                onRemove={() => updateParams({ tag: null })}
              >
                Tag: #{tag}
              </Chip>
            )}
            <Chip to="/">Filter zurücksetzen</Chip>
          </div>
        )}

        {error !== null && (
          <Banner variant="danger" className="section">
            {error}
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" size="sm" onClick={() => setReloadToken((token) => token + 1)}>
                Erneut versuchen
              </Button>
            </div>
          </Banner>
        )}

        {error === null && loading && (
          <div className="stack gap-3" aria-busy="true" aria-label="Threads werden geladen">
            {Array.from({ length: 4 }, (_, index) => (
              <Card compact key={index}>
                <div className="row gap-3" style={{ alignItems: "flex-start" }}>
                  <Skeleton width={40} height={96} />
                  <div className="grow">
                    <SkeletonText lines={2} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {error === null && !loading && items.length === 0 && (
          <EmptyState
            title="Noch keine Threads"
            action={
              hasFilters ? (
                <LinkButton to="/" variant="secondary">
                  Filter zurücksetzen
                </LinkButton>
              ) : (
                <LinkButton to="/new-thread" variant="primary">
                  Neuer Thread
                </LinkButton>
              )
            }
          >
            {hasFilters
              ? "Für diesen Filter gibt es noch keine Threads."
              : "Sobald der erste Thread entsteht, erscheint er hier."}
          </EmptyState>
        )}

        {error === null && !loading && items.length > 0 && (
          <>
            {items.map((thread) => {
              const vote = votes[thread.id];
              return (
                <ThreadCard
                  key={thread.id}
                  to={`/threads/${thread.id}`}
                  title={thread.title}
                  tags={thread.tags}
                  tagHref={(value) => `/tag/${encodeURIComponent(value)}`}
                  score={vote?.score ?? thread.score}
                  myVote={vote?.myVote ?? 0}
                  onVote={user !== null ? (value) => void handleVote(thread.id, value) : undefined}
                  voteDisabled={user === null}
                  author={{ username: thread.author.username }}
                  profileHref={(username) => `/users/${encodeURIComponent(username)}`}
                  category={{ name: thread.category_name, href: `/category/${thread.category_slug}` }}
                  createdAtLabel={relativeTime(thread.created_at)}
                  commentCount={thread.comment_count}
                  pinned={thread.pinned}
                  locked={thread.locked}
                  deleted={thread.deleted}
                />
              );
            })}

            {threadsPage !== null && (
              <Pagination
                page={threadsPage.page}
                pages={threadsPage.pages}
                totalItems={threadsPage.total}
                itemLabel="Threads"
                onPageChange={(next) => updateParams({ page: String(next) }, false)}
              />
            )}
          </>
        )}
      </section>

      <Sidebar>
        <SidebarCard heading="Über die Community">
          <p className="muted small" style={{ margin: "6px 0 12px" }}>
            Ein Ort für Praktiker:innen aus Backend, Frontend und Datenbanken. Lies mit, stimme ab und
            teile dein Wissen.
          </p>
        </SidebarCard>

        <SidebarCard heading="Kategorien">
          <CategoryNav
            activeSlug={activeCategory?.slug}
            items={categories.map((entry) => ({
              id: entry.id,
              slug: entry.slug,
              name: entry.name,
              href: `/category/${entry.slug}`,
              count: entry.thread_count,
            }))}
          />
        </SidebarCard>
      </Sidebar>
    </div>
  );
}
