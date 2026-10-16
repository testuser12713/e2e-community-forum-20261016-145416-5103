import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banner,
  Button,
  EmptyState,
  Kpi,
  KpiGrid,
  PageHeader,
  Select,
  Skeleton,
} from "../components";
import { apiFetch, ApiError } from "../lib/api";

interface AdminStats {
  users_today: number;
  users_7d: number;
  threads_today: number;
  threads_7d: number;
  comments_today: number;
  comments_7d: number;
  open_reports: number;
}

function isAllZero(stats: AdminStats): boolean {
  return Object.values(stats).every((value) => value === 0);
}

function KpiSkeletonCard() {
  return (
    <div className="kpi">
      <Skeleton width={96} height={16} />
      <Skeleton width={64} height={40} />
      <Skeleton width={120} height={16} />
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<AdminStats>("/api/admin/stats")
      .then((data) => {
        if (!active) return;
        setStats(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setStats(null);
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Die Kennzahlen konnten nicht geladen werden.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const refresh = () => setReloadToken((token) => token + 1);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Überblick über Forum-Aktivität und Moderationsaufgaben."
        actions={
          <>
            <Select
              size="sm"
              aria-label="Zeitraum"
              defaultValue="7d"
              disabled
              title="Weitere Zeiträume folgen in Kürze."
            >
              <option value="7d">Letzte 7 Tage</option>
              <option value="30d">Letzte 30 Tage</option>
              <option value="90d">Letzte 90 Tage</option>
            </Select>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
              Aktualisieren
            </Button>
            <Button variant="primary" size="sm" to="/moderation">
              Meldungen prüfen
            </Button>
          </>
        }
      />

      {error !== null ? (
        <Banner
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={refresh}>
              Erneut versuchen
            </Button>
          }
        >
          {error}
        </Banner>
      ) : null}

      {loading ? (
        <div role="status" aria-label="Kennzahlen werden geladen">
          <span className="sr-only">Kennzahlen werden geladen…</span>
          <KpiGrid label="Kennzahlen werden geladen">
            <KpiSkeletonCard />
            <KpiSkeletonCard />
            <KpiSkeletonCard />
            <KpiSkeletonCard />
          </KpiGrid>
        </div>
      ) : error !== null ? null : stats === null || isAllZero(stats) ? (
        <EmptyState
          title="Noch keine Aktivität"
          description="Sobald Nutzer, Threads oder Kommentare entstehen, erscheinen die Kennzahlen hier."
        />
      ) : (
        <KpiGrid>
          <Link
            to="/moderation"
            style={{ display: "grid", color: "inherit", textDecoration: "none" }}
            aria-label={`Offene Meldungen: ${stats.open_reports}`}
          >
            <Kpi label="Offene Meldungen" value={stats.open_reports} tone="danger" />
          </Link>
          <Kpi
            label="Neue Nutzer"
            value={stats.users_7d}
            trend={{ delta: `+${stats.users_today}`, direction: "up", note: "heute" }}
          />
          <Kpi
            label="Neue Threads"
            value={stats.threads_7d}
            trend={{ delta: `+${stats.threads_today}`, direction: "up", note: "heute" }}
          />
          <Kpi
            label="Neue Kommentare"
            value={stats.comments_7d}
            trend={{ delta: `+${stats.comments_today}`, direction: "up", note: "heute" }}
          />
        </KpiGrid>
      )}
    </>
  );
}
