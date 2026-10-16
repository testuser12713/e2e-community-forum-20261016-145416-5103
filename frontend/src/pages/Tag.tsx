import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Banner,
  Button,
  CategoryNav,
  EmptyState,
  LinkButton,
  Pagination,
  SegmentedTabs,
  Sidebar,
  SidebarCard,
  Skeleton,
  TagCloud,
  ThreadCard,
  Toast,
  ToastRegion,
  type VoteValue,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { apiFetch, ApiError } from "../lib/api";

type Sort = "new" | "top" | "hot";

const PAGE_SIZE = 20;

interface ThreadAuthor {
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
  author: ThreadAuthor;
}

interface CategoryOut {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  thread_count: number;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface VoteState {
  score: number;
  myVote: VoteValue;
}

/** Relative German time label, matching the design's card copy ("vor 40 Min."). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "vor 1 Tag";
  if (days < 30) return `vor ${days} Tagen`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "vor 1 Monat" : `vor ${months} Monaten`;
  const years = Math.floor(days / 365);
  return years <= 1 ? "vor 1 Jahr" : `vor ${years} Jahren`;
}

/**
 * The tag screen: the feed of threads carrying a tag (GET /api/threads?tag=…)
 * with sort tabs and pagination, plus the design's tag sidebar — a cloud of the
 * related tags of the loaded threads, the category navigation and a shortcut
 * into the composer. Every control acts or is visibly disabled.
 */
export default function Tag() {
  const { tag = "" } = useParams();
  const { user } = useAuth();

  const [sort, setSort] = useState<Sort>("new");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ThreadSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [votes, setVotes] = useState<Record<number, VoteState>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setPage(1);
    setVotes({});
  }, [tag]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      tag,
      sort,
      page: String(page),
      page_size: String(PAGE_SIZE),
    });

    apiFetch<Page<ThreadSummary>>(`/api/threads?${params.toString()}`)
      .then((result) => {
        if (!active) return;
        setData(result);
        setVotes({});
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Die Threads konnten nicht geladen werden.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tag, sort, page, retryKey]);

  useEffect(() => {
    let active = true;
    apiFetch<CategoryOut[]>("/api/categories")
      .then((list) => {
        if (active) setCategories(list);
      })
      .catch(() => {
        // The feed still works when the category rail cannot be loaded.
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  const handleVote = useCallback(async (thread: ThreadSummary, value: VoteValue) => {
    setVotes((current) => {
      const previous = current[thread.id] ?? { score: thread.score, myVote: 0 as VoteValue };
      const optimistic: VoteState = {
        score: previous.score - previous.myVote + value,
        myVote: value,
      };
      return { ...current, [thread.id]: optimistic };
    });
    try {
      const result = await apiFetch<{ score: number; my_vote: number }>(
        `/api/threads/${thread.id}/vote`,
        { method: "PUT", body: JSON.stringify({ value }) },
      );
      setVotes((current) => ({
        ...current,
        [thread.id]: { score: result.score, myVote: result.my_vote as VoteValue },
      }));
    } catch (cause: unknown) {
      setVotes((current) => {
        const previous = current[thread.id] ?? { score: thread.score, myVote: 0 as VoteValue };
        return { ...current, [thread.id]: previous };
      });
      setToast(
        cause instanceof ApiError
          ? cause.message
          : "Die Stimme konnte nicht gespeichert werden.",
      );
    }
  }, []);

  const threads = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 0;

  const relatedTags = useMemo(() => {
    const found = new Set<string>();
    for (const thread of threads) {
      for (const name of thread.tags) {
        if (name !== tag) found.add(name);
      }
    }
    return Array.from(found);
  }, [threads, tag]);

  return (
    <>
      <div className="layout">
        <section data-od-id="tag-feed" aria-busy={loading}>
          <div className="between gap-3 wrap" style={{ marginBottom: "var(--space-3)" }}>
            <div>
              <h2 data-od-id="tag-name">#{tag}</h2>
              <p className="muted" style={{ marginTop: 4 }}>
                Beiträge mit diesem Schlagwort
                {loading ? "" : ` · ${total} ${total === 1 ? "Thread" : "Threads"}`}
              </p>
            </div>
            <SegmentedTabs<Sort>
              label="Sortierung"
              value={sort}
              onChange={(next) => {
                setSort(next);
                setPage(1);
              }}
              items={[
                { value: "new", label: "Neu" },
                { value: "top", label: "Top" },
                { value: "hot", label: "Hot", title: "Nach Stimmen mit Zeitverfall sortiert" },
              ]}
            />
          </div>

          {error !== null ? (
            <Banner variant="danger">
              <div className="between gap-3 wrap">
                <span>{error}</span>
                <Button variant="secondary" size="sm" onClick={() => setRetryKey((key) => key + 1)}>
                  Erneut versuchen
                </Button>
              </div>
            </Banner>
          ) : loading ? (
            <div className="stack gap-2" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} height={112} />
              ))}
            </div>
          ) : threads.length === 0 ? (
            <EmptyState title="Keine Threads">
              Für dieses Schlagwort gibt es noch keine Beiträge.
            </EmptyState>
          ) : (
            <>
              {threads.map((thread) => {
                const vote = votes[thread.id] ?? { score: thread.score, myVote: 0 as VoteValue };
                const canVote = user !== null && user.id !== thread.author.id;
                return (
                  <ThreadCard
                    key={thread.id}
                    to={`/threads/${thread.id}`}
                    title={thread.title}
                    tags={thread.tags}
                    tagHref={(name) => `/tag/${encodeURIComponent(name)}`}
                    score={vote.score}
                    myVote={vote.myVote}
                    onVote={canVote ? (value) => void handleVote(thread, value) : undefined}
                    voteDisabled={!canVote}
                    author={{ username: thread.author.username, color: thread.author.id }}
                    profileHref={(username) => `/users/${encodeURIComponent(username)}`}
                    category={{
                      name: thread.category_name,
                      href: `/category/${thread.category_slug}`,
                    }}
                    commentCount={thread.comment_count}
                    pinned={thread.pinned}
                    locked={thread.locked}
                    deleted={thread.deleted}
                    activity={{ label: relativeTime(thread.created_at) }}
                  />
                );
              })}
              <Pagination
                page={data?.page ?? 1}
                pages={pages}
                totalItems={total}
                itemLabel="Threads"
                onPageChange={setPage}
              />
            </>
          )}
        </section>

        <Sidebar>
          <SidebarCard heading="Tags">
            {relatedTags.length > 0 ? (
              <TagCloud
                tags={relatedTags}
                href={(name) => `/tag/${encodeURIComponent(name)}`}
                label="Weitere Schlagwörter"
              />
            ) : (
              <p className="muted small">Keine weiteren Schlagwörter.</p>
            )}
          </SidebarCard>

          {categories.length > 0 && (
            <SidebarCard heading="Kategorien">
              <CategoryNav
                items={categories.map((category) => ({
                  id: category.id,
                  name: category.name,
                  slug: category.slug,
                  href: `/category/${category.slug}`,
                  count: category.thread_count,
                }))}
              />
            </SidebarCard>
          )}

          <SidebarCard>
            <LinkButton to="/new-thread" variant="primary" block>
              Thread mit #{tag} schreiben
            </LinkButton>
          </SidebarCard>
        </Sidebar>
      </div>

      <ToastRegion>
        {toast !== null && (
          <Toast variant="danger" onClose={() => setToast(null)}>
            {toast}
          </Toast>
        )}
      </ToastRegion>
    </>
  );
}
