import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { VoteValue } from "../components";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  SegmentedTabs,
  Sidebar,
  SidebarCard,
  SkeletonText,
  StatList,
  TagCloud,
  TextInput,
  ThreadCard,
  Toast,
  ToastRegion,
} from "../components";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch } from "../lib/api";

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

interface CommentSummary {
  id: number;
  thread_id: number;
  thread_title: string;
  excerpt: string;
  created_at: string;
}

interface PublicProfile {
  username: string;
  bio: string | null;
  karma: number;
  created_at: string;
  threads: ThreadSummary[];
  comments: CommentSummary[];
}

type ProfileTab = "threads" | "comments";

interface ToastState {
  message: string;
  variant: "success" | "danger";
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
  return formatDateTime(iso);
}

function avatarColor(name: string): number {
  let sum = 0;
  for (let index = 0; index < name.length; index += 1) {
    sum += name.charCodeAt(index);
  }
  return sum % 8;
}

function topTags(threads: ThreadSummary[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    for (const tag of thread.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export default function Profile() {
  const { username = "" } = useParams<{ username: string }>();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("threads");
  const [votes, setVotes] = useState<Record<number, { score: number; myVote: VoteValue }>>({});
  const [toast, setToast] = useState<ToastState | null>(null);

  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banUntil, setBanUntil] = useState("");
  const [banError, setBanError] = useState<string | null>(null);
  const [banSubmitting, setBanSubmitting] = useState(false);

  const showToast = useCallback((message: string, variant: ToastState["variant"]) => {
    setToast({ message, variant });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    setProfile(null);
    setVotes({});

    apiFetch<PublicProfile>(`/api/users/${encodeURIComponent(username)}`)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 404) {
          setNotFound(true);
        } else {
          setLoadError("Das Profil konnte nicht geladen werden.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [username]);

  const handleVote = useCallback(
    (thread: ThreadSummary, value: VoteValue) => {
      void (async () => {
        try {
          const result = await apiFetch<{ score: number; my_vote: number }>(
            `/api/threads/${thread.id}/vote`,
            { method: "PUT", body: JSON.stringify({ value }) },
          );
          setVotes((current) => ({
            ...current,
            [thread.id]: { score: result.score, myVote: result.my_vote as VoteValue },
          }));
        } catch (error) {
          const message =
            error instanceof ApiError ? error.message : "Die Stimme konnte nicht gespeichert werden.";
          showToast(message, "danger");
        }
      })();
    },
    [showToast],
  );

  const submitBan = useCallback(() => {
    if (profile === null) return;
    const targetId = profile.threads[0]?.author.id;
    if (targetId === undefined) {
      setBanError("Für diesen Nutzer ist keine Sperre möglich.");
      return;
    }
    if (banReason.trim() === "") {
      setBanError("Bitte einen Grund angeben.");
      return;
    }
    setBanError(null);
    setBanSubmitting(true);
    const expiresAt = banUntil === "" ? undefined : new Date(`${banUntil}T23:59:59`).toISOString();
    apiFetch(`/api/admin/users/${targetId}/ban`, {
      method: "POST",
      body: JSON.stringify({ reason: banReason.trim(), expires_at: expiresAt }),
    })
      .then(() => {
        setBanOpen(false);
        setBanReason("");
        setBanUntil("");
        showToast(`@${profile.username} wurde gesperrt.`, "success");
      })
      .catch((error: unknown) => {
        setBanError(error instanceof ApiError ? error.message : "Die Sperre ist fehlgeschlagen.");
      })
      .finally(() => {
        setBanSubmitting(false);
      });
  }, [banReason, banUntil, profile, showToast]);

  const isModerator = user !== null && (user.role === "moderator" || user.role === "admin");
  const isForeignProfile = user !== null && user.username !== profile?.username;
  const canModerate = isModerator && isForeignProfile;
  const banTargetId = profile?.threads[0]?.author.id ?? null;
  const voteDisabled = user === null || user.username === profile?.username;

  if (loading) {
    return (
      <section className="stack gap-4" aria-busy="true">
        <Card>
          <SkeletonText lines={3} />
        </Card>
      </section>
    );
  }

  if (notFound) {
    return (
      <EmptyState title="Nutzer nicht gefunden">
        Es gibt keinen Nutzer mit dem Namen @{username}.
      </EmptyState>
    );
  }

  if (loadError !== null || profile === null) {
    return <EmptyState title="Profil nicht verfügbar">{loadError}</EmptyState>;
  }

  const tags = topTags(profile.threads);

  return (
    <section className="stack gap-4">
      <header className="card" data-od-id="profile-header">
        <div className="row gap-4 wrap" style={{ alignItems: "flex-start" }}>
          <Avatar name={profile.username} size={72} color={avatarColor(profile.username)} />
          <div className="grow">
            <div className="row gap-2 wrap">
              <h2 style={{ margin: 0 }} data-od-id="profile-username">
                @{profile.username}
              </h2>
            </div>
            <p className="muted small" style={{ marginTop: 6 }}>
              Mitglied seit {formatDateTime(profile.created_at)}
            </p>
            <p className="tabular" style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>
              Karma {profile.karma}
            </p>
          </div>
          {canModerate && (
            <div className="row gap-2 wrap">
              <Button
                variant="danger"
                data-od-id="profile-ban"
                disabled={banTargetId === null}
                title={banTargetId === null ? "Für diesen Nutzer ist keine Sperre möglich." : undefined}
                onClick={() => setBanOpen(true)}
              >
                Sperren
              </Button>
              <Button
                variant="secondary"
                data-od-id="profile-role"
                disabled
                title="Bald verfügbar"
              >
                Rolle ändern
              </Button>
            </div>
          )}
        </div>

        <hr className="divider" />
        <div data-od-id="profile-bio">
          <div className="sidebar-heading">Bio</div>
          {profile.bio !== null && profile.bio.trim() !== "" ? (
            <p style={{ marginTop: 6 }}>{profile.bio}</p>
          ) : (
            <p className="muted" style={{ marginTop: 6 }}>
              Dieser Nutzer hat noch keine Bio hinterlegt.
            </p>
          )}
        </div>
      </header>

      <div className="layout">
        <section data-od-id="profile-content">
          <SegmentedTabs<ProfileTab>
            label="Profil-Bereiche"
            className="profile-tabs"
            value={tab}
            onChange={setTab}
            items={[
              { value: "threads", label: `Threads (${profile.threads.length})` },
              { value: "comments", label: `Kommentare (${profile.comments.length})` },
            ]}
          />

          {tab === "threads" ? (
            <div style={{ marginTop: 16 }}>
              {profile.threads.length === 0 ? (
                <EmptyState title="Noch keine Threads">
                  @{profile.username} hat noch keinen Thread erstellt.
                </EmptyState>
              ) : (
                profile.threads.map((thread) => {
                  const state = votes[thread.id] ?? { score: thread.score, myVote: 0 as VoteValue };
                  return (
                    <ThreadCard
                      key={thread.id}
                      to={`/threads/${thread.id}`}
                      title={thread.title}
                      tags={thread.tags}
                      tagHref={(tag) => `/tag/${encodeURIComponent(tag)}`}
                      score={state.score}
                      myVote={state.myVote}
                      onVote={(value) => handleVote(thread, value)}
                      voteDisabled={voteDisabled}
                      category={{ name: thread.category_name, href: `/category/${thread.category_slug}` }}
                      createdAtLabel={formatRelative(thread.created_at)}
                      commentCount={thread.comment_count}
                      pinned={thread.pinned}
                      locked={thread.locked}
                      deleted={thread.deleted}
                    />
                  );
                })
              )}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              {profile.comments.length === 0 ? (
                <EmptyState title="Noch keine Kommentare">
                  @{profile.username} hat noch keinen Kommentar geschrieben.
                </EmptyState>
              ) : (
                profile.comments.map((comment) => (
                  <Card key={comment.id} compact className="profile-comment">
                    <p>{comment.excerpt}</p>
                    <div className="row gap-2 wrap small muted" style={{ marginTop: 8 }}>
                      <span>
                        in <Link to={`/threads/${comment.thread_id}`}>{comment.thread_title}</Link>
                      </span>
                      <span className="dot" aria-hidden="true" />
                      <span>{formatRelative(comment.created_at)}</span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </section>

        <Sidebar>
          <SidebarCard heading="Statistik">
            <StatList
              items={[
                { label: "Karma", value: profile.karma },
                { label: "Threads", value: profile.threads.length },
                { label: "Kommentare", value: profile.comments.length },
              ]}
            />
          </SidebarCard>
          {tags.length > 0 && (
            <SidebarCard heading="Top-Tags">
              <TagCloud
                tags={tags}
                href={(tag) => `/tag/${encodeURIComponent(tag)}`}
                label="Top-Tags"
              />
            </SidebarCard>
          )}
        </Sidebar>
      </div>

      {canModerate && (
        <Modal
          open={banOpen}
          title="Nutzer sperren"
          description={`@${profile.username} kann weiterhin lesen, aber keine Threads, Kommentare, Stimmen oder Meldungen abgeben.`}
          onClose={() => setBanOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setBanOpen(false)}>
                Abbrechen
              </Button>
              <Button variant="danger" loading={banSubmitting} onClick={submitBan}>
                Sperren
              </Button>
            </>
          }
        >
          <div className="stack gap-3">
            <Field label="Grund der Sperre" htmlFor="ban-reason" error={banError}>
              <TextInput
                id="ban-reason"
                value={banReason}
                invalid={banError !== null}
                placeholder="z. B. wiederholtes Spam-Verhalten"
                onChange={(event) => setBanReason(event.target.value)}
              />
            </Field>
            <Field label="Ablaufdatum (optional)" htmlFor="ban-until">
              <TextInput
                id="ban-until"
                type="date"
                value={banUntil}
                onChange={(event) => setBanUntil(event.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}

      <ToastRegion>
        {toast !== null && (
          <Toast variant={toast.variant} onClose={() => setToast(null)}>
            {toast.message}
          </Toast>
        )}
      </ToastRegion>
    </section>
  );
}
