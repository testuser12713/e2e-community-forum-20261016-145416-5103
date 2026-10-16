import { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Chip,
  EmptyState,
  Modal,
  PageHeader,
  Pagination,
  ReportCard,
  SkeletonText,
  Toast,
  ToastRegion,
  type ToastTone,
} from "../components";
import { apiFetch, FORUM_URL } from "../lib/api";

const PAGE_SIZE = 20;

interface ReportOut {
  id: number;
  content_type: "thread" | "comment";
  content_id: number;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  reporter_username: string;
  content_excerpt: string;
  content_url: string;
}

interface ReportPage {
  items: ReportOut[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

type ResolveAction = "remove_content" | "dismiss";

interface PendingAction {
  report: ReportOut;
  action: ResolveAction;
}

interface Notice {
  tone: ToastTone;
  message: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "gerade eben";
  if (diff < hour) return `vor ${Math.floor(diff / minute)} Min.`;
  if (diff < day) return `vor ${Math.floor(diff / hour)} Std.`;
  const days = Math.floor(diff / day);
  return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
}

function forumContentUrl(report: ReportOut): string {
  const path = report.content_url || `/threads/${report.content_id}`;
  return `${FORUM_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function contentLabel(report: ReportOut): string {
  return report.content_type === "comment" ? "Gemeldeter Kommentar" : "Gemeldeter Thread";
}

function removeLabel(report: ReportOut): string {
  return report.content_type === "comment" ? "Inhalt entfernen" : "Thread entfernen";
}

export default function ModerationQueue() {
  const [reports, setReports] = useState<ReportOut[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [resolving, setResolving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ReportPage>(
        `/api/admin/reports?status=open&page=${targetPage}&page_size=${PAGE_SIZE}`,
      );
      setReports(data.items);
      setTotal(data.total);
      setPage(data.page);
      setPages(data.pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Meldungen konnten nicht geladen werden.");
      setReports([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const resolve = async () => {
    if (!pending) return;
    const { report, action } = pending;
    setResolving(true);
    try {
      await apiFetch<ReportOut>(`/api/admin/reports/${report.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setReports((current) => current.filter((item) => item.id !== report.id));
      setTotal((current) => Math.max(0, current - 1));
      setNotice({
        tone: action === "remove_content" ? "success" : "info",
        message:
          action === "remove_content"
            ? `Der gemeldete Inhalt wurde entfernt (#${report.id}).`
            : `Die Meldung #${report.id} wurde verworfen.`,
      });
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Die Aktion ist fehlgeschlagen.");
      setPending(null);
    } finally {
      setResolving(false);
    }
  };

  const description = loaded
    ? `${total} offene ${total === 1 ? "Meldung" : "Meldungen"}. Prüfe, entscheide und dokumentiere jeden Fall.`
    : "Prüfe, entscheide und dokumentiere jeden Fall.";

  const showEmpty = loaded && !loading && !error && reports.length === 0;

  return (
    <>
      <PageHeader title="Meldungen" description={description} />

      {error ? (
        <Banner
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={() => void load(page)}>
              Erneut versuchen
            </Button>
          }
        >
          {error}
        </Banner>
      ) : null}

      {loading ? (
        <div className="stack gap-2" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <ReportCard key={index}>
              <SkeletonText lines={3} />
            </ReportCard>
          ))}
        </div>
      ) : null}

      {showEmpty ? (
        <EmptyState
          title="Keine offenen Meldungen"
          description="Sobald Nutzer Inhalte melden, erscheinen die Fälle hier zur Prüfung."
        />
      ) : null}

      {!loading && reports.length > 0 ? (
        <div>
          {reports.map((report) => (
            <ReportCard key={report.id}>
              <div className="between gap-2 wrap" style={{ marginBottom: "var(--space-2)" }}>
                <div className="row gap-2 wrap">
                  <span className="mono muted">#{report.id}</span>
                  <Badge variant="open">Offen</Badge>
                  <Chip>{report.reason}</Chip>
                </div>
                <span className="small muted">{relativeTime(report.created_at)}</span>
              </div>

              <div className="row gap-2" style={{ alignItems: "flex-start" }}>
                <Avatar name={report.reporter_username} size="sm" />
                <p className="grow">{contentLabel(report)}</p>
              </div>

              {report.content_excerpt ? (
                <blockquote
                  className="md"
                  style={{
                    margin: "var(--space-2) 0",
                    borderLeft: "3px solid var(--color-accent)",
                    background: "var(--color-bg-subtle)",
                    padding: "8px 14px",
                    borderRadius: `0 var(--radius-sm) var(--radius-sm) 0`,
                    color: "var(--color-fg-muted)",
                  }}
                >
                  {report.content_excerpt}
                </blockquote>
              ) : null}

              {report.note ? <p className="small muted">Notiz: {report.note}</p> : null}

              <p className="small muted" style={{ marginTop: "var(--space-1)" }}>
                Gemeldet von @{report.reporter_username}
              </p>

              <div className="admin-inline-actions" style={{ marginTop: "var(--space-2)" }}>
                <Button variant="secondary" size="sm" href={forumContentUrl(report)}>
                  Inhalt ansehen
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setPending({ report, action: "remove_content" })}
                >
                  {removeLabel(report)}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPending({ report, action: "dismiss" })}
                >
                  Verwerfen
                </Button>
              </div>
            </ReportCard>
          ))}
        </div>
      ) : null}

      {!loading && pages > 1 ? (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          totalLabel="Meldungen"
          onPageChange={setPage}
        />
      ) : null}

      <Modal
        open={pending !== null}
        title={pending?.action === "dismiss" ? "Meldung verwerfen?" : "Inhalt entfernen"}
        description={
          pending?.action === "dismiss"
            ? "Die Meldung wird als erledigt markiert, ohne den Inhalt zu ändern. Der meldende Nutzer wird informiert."
            : "Der Inhalt wird als entfernt angezeigt; untergeordnete Antworten bleiben sichtbar. Die Aktion wird im Audit-Log festgehalten."
        }
        onClose={() => (resolving ? undefined : setPending(null))}
        footer={
          <>
            <Button variant="secondary" disabled={resolving} onClick={() => setPending(null)}>
              Abbrechen
            </Button>
            <Button
              variant={pending?.action === "dismiss" ? "primary" : "danger"}
              loading={resolving}
              onClick={() => void resolve()}
            >
              {pending?.action === "dismiss" ? "Verwerfen" : pending ? removeLabel(pending.report) : ""}
            </Button>
          </>
        }
      />

      <ToastRegion>
        {notice ? (
          <Toast tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.message}
          </Toast>
        ) : null}
      </ToastRegion>
    </>
  );
}
