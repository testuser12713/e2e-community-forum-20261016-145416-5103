import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button,
  Card,
  CategoryNav,
  EmptyState,
  LinkButton,
  Pagination,
  SegmentedTabs,
  Sidebar,
  SidebarCard,
  SkeletonText,
  TagCloud,
  ThreadCard,
  Toast,
  ToastRegion,
  type VoteValue,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

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

type Sort = "new" | "top" | "hot";

const SORT_ITEMS: { value: Sort; label: string; title?: string }[] = [
  { value: "new", label: "Neu" },
  { value: "top", label: "Top" },
  { value: "hot", label: "Hot", title: "Nach Stimmen mit Zeitverfall sortiert" },
];

const PAGE_SIZE = 20;

/** Relative German time label the design shows in the thread meta line. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "gerade eben";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks === 1 ? "vor 1 Woche" : `vor ${weeks} Wochen`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? "vor 1 Monat" : `vor ${months} Monaten`;
  const years = Math.round(days / 365);
  return years <= 1 ? "vor 1 Jahr" : `vor ${years} Jahren`;
}

/**
 * The forum category screen (design/mockups/category.html): the thread feed of
 * one category with its new/top/hot sort switch and pagination, the category
 * sidebar, and the new-thread control scoped to this category.
 */
export default function Category() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { user } = useAuth();

  const [categories, setCategories] = useState<CategoryOut[] | null>(null);
  const [categoriesError, setCategoriesError] = useState(false);
  const [threads, setThreads] = useState<Page<ThreadSummary> | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState(false);
  const [sort, setSort] = useState<Sort>("new");
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [votes, setVotes] = useState<Record<number, VoteValue>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [slug]);

  useEffect(() => {
    let active = true;
    setCategoriesError(false);
    apiFetch<CategoryOut[]>("/api/categories")
      .then((data) => {
        if (active) setCategories(data);
      })
      .catch(() => {
        if (active) {
          setCategories([]);
          setCategoriesError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  useEffect(() => {
    let active = true;
    setThreadsLoading(true);
    setThreadsError(false);
    const query = new URLSearchParams({
      category: slug,
      sort,
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    apiFetch<Page<ThreadSummary>>(`/api/threads?${query.toString()}`)
      .then((data) => {
        if (!active) return;
        setThreads(data);
        setThreadsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setThreadsError(true);
        setThreadsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, sort, page, reloadToken]);

  const category = useMemo(
    () => (categories === null ? undefined : categories.find((entry) => entry.slug === slug)),
    [categories, slug],
  );

  const popularTags = useMemo(() => {
    if (threads === null) return [];
    const counts = new Map<string, number>();
    for (const thread of threads.items) {
      for (const tag of thread.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [threads]);

  const total = threads?.total ?? category?.thread_count ?? 0;
  const newThreadHref = `/new-thread?category=${encodeURIComponent(slug)}`;

  const handleSort = useCallback((next: Sort) => {
    setSort(next);
    setPage(1);
  }, []);

  const handleVote = useCallback(
    (thread: ThreadSummary, value: VoteValue) => {
      const previousVote = votes[thread.id] ?? 0;
      const previousScore = thread.score;
      setVotes((current) => ({ ...current, [thread.id]: value }));
      setThreads((current) =>
        current === null
          ? current
          : {
              ...current,
              items: current.items.map((item) =>
                item.id === thread.id
                  ? { ...item, score: previousScore + (value - previousVote) }
                  : item,
              ),
            },
      );

      apiFetch<{ score: number; my_vote: number }>(`/api/threads/${thread.id}/vote`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      })
        .then((result) => {
          setVotes((current) => ({ ...current, [thread.id]: result.my_vote as VoteValue }));
          setThreads((current) =>
            current === null
              ? current
              : {
                  ...current,
                  items: current.items.map((item) =>
                    item.id === thread.id ? { ...item, score: result.score } : item,
                  ),
                },
          );
        })
        .catch(() => {
          setVotes((current) => ({ ...current, [thread.id]: previousVote }));
          setThreads((current) =>
            current === null
              ? current
              : {
                  ...current,
                  items: current.items.map((item) =>
                    item.id === thread.id ? { ...item, score: previousScore } : item,
                  ),
                },
          );
          setToast("Die Stimme konnte nicht gespeichert werden.");
        });
    },
    [votes],
  );

  const categoriesUnknown = categories !== null && !categoriesError && category === undefined;

  return (
    <div className="layout">
      <section data-od-id="category-feed">
        {categoriesUnknown ? (
          <EmptyState
            title="Kategorie nicht gefunden"
            action={
              <LinkButton to="/" variant="secondary">
                Zur Startseite
              </LinkButton>
            }
          >
            Die Kategorie „{slug}“ existiert nicht.
          </EmptyState>
        ) : (
          <>
            <div style={{ marginBottom: "var(--space-4)" }}>
              <Card>
                <div className="between gap-3 wrap">
                  <div>
                    <h2>{category?.name ?? slug}</h2>
                    {category?.description !== null && category?.description !== undefined && (
                      <p className="muted" style={{ marginTop: 4 }}>
                        {category.description}
                      </p>
                    )}
                    <p className="muted small" style={{ marginTop: 8 }}>
                      {total} Threads
                    </p>
                  </div>
                  <LinkButton to={newThreadHref} variant="primary">
                    Neuer Thread
                  </LinkButton>
                </div>
                <div style={{ marginTop: "var(--space-3)" }}>
                  <SegmentedTabs
                    label="Sortierung"
                    value={sort}
                    onChange={handleSort}
                    items={SORT_ITEMS}
                  />
                </div>
              </Card>
            </div>

            {threadsLoading ? (
              <div className="stack gap-3">
                {[0, 1, 2, 3].map((index) => (
                  <Card key={index} compact>
                    <SkeletonText lines={3} />
                  </Card>
                ))}
              </div>
            ) : threadsError ? (
              <EmptyState
                title="Threads konnten nicht geladen werden"
                action={
                  <Button variant="secondary" onClick={() => setReloadToken((token) => token + 1)}>
                    Erneut versuchen
                  </Button>
                }
              >
                Bitte prüfe deine Verbindung und versuche es noch einmal.
              </EmptyState>
            ) : threads === null || threads.items.length === 0 ? (
              <EmptyState
                title="Noch keine Threads"
                action={
                  <LinkButton to={newThreadHref} variant="primary">
                    Ersten Thread erstellen
                  </LinkButton>
                }
              >
                In dieser Kategorie gibt es noch keine Threads.
              </EmptyState>
            ) : (
              threads.items.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  to={`/threads/${thread.id}`}
                  title={thread.title}
                  tags={thread.tags}
                  tagHref={(tag) => `/tag/${tag}`}
                  score={thread.score}
                  myVote={votes[thread.id] ?? 0}
                  onVote={(value) => handleVote(thread, value)}
                  voteDisabled={user === null || thread.author.id === user.id}
                  author={{ username: thread.author.username }}
                  profileHref={(username) => `/users/${username}`}
                  createdAtLabel={formatRelative(thread.created_at)}
                  commentCount={thread.comment_count}
                  pinned={thread.pinned}
                  locked={thread.locked}
                  deleted={thread.deleted}
                />
              ))
            )}

            {!threadsLoading && !threadsError && threads !== null && (
              <Pagination
                page={threads.page}
                pages={threads.pages}
                totalItems={threads.total}
                itemLabel="Threads"
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </section>

      <Sidebar>
        {category !== undefined && (
          <SidebarCard heading="Über diese Kategorie">
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              {category.description !== null && category.description !== ""
                ? `${category.description} ${total} Threads.`
                : `${total} Threads.`}
            </p>
          </SidebarCard>
        )}

        {categories !== null && categories.length > 0 && (
          <SidebarCard heading="Kategorien">
            <CategoryNav
              activeSlug={slug}
              items={categories.map((entry) => ({
                id: entry.id,
                slug: entry.slug,
                name: entry.name,
                href: `/category/${entry.slug}`,
                count: entry.thread_count,
              }))}
            />
          </SidebarCard>
        )}

        {popularTags.length > 0 && (
          <SidebarCard heading="Beliebte Tags">
            <TagCloud tags={popularTags} href={(tag) => `/tag/${tag}`} />
          </SidebarCard>
        )}

        {categoriesError && (
          <SidebarCard heading="Kategorien">
            <p className="muted small" style={{ margin: 0 }}>
              Kategorien konnten nicht geladen werden.{" "}
              <Link to="/">Zur Startseite</Link>
            </p>
          </SidebarCard>
        )}
      </Sidebar>

      <ToastRegion>
        {toast !== null && (
          <Toast variant="danger" onClose={() => setToast(null)}>
            {toast}
          </Toast>
        )}
      </ToastRegion>
    </div>
  );
}
