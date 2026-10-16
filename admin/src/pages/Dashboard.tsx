import { useCallback, useEffect, useState } from "react";
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
import { ApiError, apiFetch } from "../lib/api";

/**
 * The figures the admin dashboard reports. Mirrors ``AdminStats`` from the API
 * (GET /api/admin/stats): users, threads and comments created today and over the
 * last seven days, plus the current number of open reports.
 */
export interface AdminStats {
  users_today: number;
  users_7d: number;
  threads_today: number;
  threads_7d: number;
  comments_today: number;
  comments_7d: number;
  open_reports: number;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stats: AdminStats };

const STALE_ERROR = "Die Kennzahlen konnten nicht geladen werden.";

function isZeroActivity(stats: AdminStats): boolean {
  return (
    stats.users_today === 0 &&
    stats.users_7d === 0 &&
    stats.threads_today === 0 &&
    stats.threads_7d === 0 &&
    stats.comments_today === 0 &&
    stats.comments_7d === 0 &&
    stats.open_reports === 0
  );
}

function DashboardSkeleton() {
  return (
    <KpiGrid>
      <span className="sr-only" role="status">
        Kennzahlen werden geladen…
      </span>
      {Array.from({ length: 4 }, (_, index) => (
        <div className="kpi" key={index} aria-hidden="true">
          <Skeleton width={112} height={13} />
          <Skeleton width={64} height={34} />
        </div>
      ))}
    </KpiGrid>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const stats = await apiFetch<AdminStats>("/api/admin/stats");
      setState({ status: "ready", stats });
    } catch (error) {
      const message = error instanceof ApiError && error.message ? error.message : STALE_ERROR;
      setState({ status: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
              defaultValue="7"
              disabled
              title="Weitere Zeiträume folgen in Kürze."
            >
              <option value="7">Letzte 7 Tage</option>
              <option value="30">Letzte 30 Tage</option>
              <option value="90">Letzte 90 Tage</option>
            </Select>
            <Button
              size="sm"
              variant="secondary"
              loading={state.status === "loading"}
              onClick={() => void load()}
            >
              Aktualisieren
            </Button>
            <Button size="sm" variant="primary" to="/moderation">
              Meldungen prüfen
            </Button>
          </>
        }
      />

      {state.status === "loading" ? <DashboardSkeleton /> : null}

      {state.status === "error" ? (
        <Banner
          tone="danger"
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Erneut versuchen
            </Button>
          }
        >
          {state.message}
        </Banner>
      ) : null}

      {state.status === "ready" && isZeroActivity(state.stats) ? (
        <EmptyState
          title="Noch keine Aktivität"
          description="Nutzer-, Thread- und Kommentarzahlen sowie offene Meldungen erscheinen hier, sobald es sie gibt."
          action={
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Aktualisieren
            </Button>
          }
        />
      ) : null}

      {state.status === "ready" && !isZeroActivity(state.stats) ? (
        <KpiGrid>
          <Link
            to="/moderation"
            style={{ display: "block", color: "inherit", textDecoration: "none" }}
          >
            <Kpi label="Offene Meldungen" value={state.stats.open_reports} tone="danger" />
          </Link>
          <Kpi
            label="Neue Nutzer (7 Tage)"
            value={state.stats.users_7d}
            trend={{ delta: `+${state.stats.users_today}`, direction: "up", note: "heute" }}
          />
          <Kpi
            label="Neue Threads (7 Tage)"
            value={state.stats.threads_7d}
            trend={{ delta: `+${state.stats.threads_today}`, direction: "up", note: "heute" }}
          />
          <Kpi
            label="Neue Kommentare (7 Tage)"
            value={state.stats.comments_7d}
            trend={{ delta: `+${state.stats.comments_today}`, direction: "up", note: "heute" }}
          />
        </KpiGrid>
      ) : null}
    </>
  );
}
