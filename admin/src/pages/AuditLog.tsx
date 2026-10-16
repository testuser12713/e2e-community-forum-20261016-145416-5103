import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banner,
  Button,
  Chip,
  Input,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Table,
  TableEmpty,
  TableHead,
  TableLoadingRows,
  TableRow,
  Td,
  Th,
} from "../components";
import { apiFetch, ApiError, FORUM_URL } from "../lib/api";

const PAGE_SIZE = 20;

export interface AuditEntry {
  id: number;
  actor_username: string | null;
  action: string;
  target_type: string;
  target_id: number | null;
  details: string;
  created_at: string;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const ACTION_LABELS: Record<string, string> = {
  "user.ban": "Nutzer gesperrt",
  "user.unban": "Nutzer entsperrt",
  "user.role_change": "Rolle geändert",
  "category.create": "Kategorie erstellt",
  "category.update": "Kategorie geändert",
  "category.delete": "Kategorie gelöscht",
  "category.reorder": "Kategorien sortiert",
  "thread.pin": "Thread angepinnt",
  "thread.lock": "Thread gesperrt",
  "thread.move": "Thread verschoben",
  "thread.remove": "Thread entfernt",
  "report.remove_content": "Inhalt entfernt",
  "report.dismiss": "Meldung verworfen",
  "seed.complete": "Seed abgeschlossen",
};

const TARGET_LABELS: Record<string, string> = {
  user: "Nutzer",
  thread: "Thread",
  comment: "Kommentar",
  category: "Kategorie",
  report: "Meldung",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function targetLabel(type: string): string {
  return TARGET_LABELS[type] ?? type;
}

function targetText(entry: AuditEntry): string {
  const label = targetLabel(entry.target_type);
  return entry.target_id === null ? label : `${label} #${entry.target_id}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: string): string {
  const date = parseDate(value);
  if (!date) return value;
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value: string): string {
  const date = parseDate(value);
  if (!date) return value;
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

type AuditDetails = Record<string, unknown>;

function parseDetails(raw: string): AuditDetails {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as AuditDetails) : {};
  } catch {
    return {};
  }
}

function formatDetails(entry: AuditEntry): string {
  const details = parseDetails(entry.details);
  const value = (key: string): string | null => {
    const raw = details[key];
    if (raw === null || raw === undefined || raw === "") return null;
    return String(raw);
  };

  switch (entry.action) {
    case "user.ban": {
      const parts: string[] = [];
      const reason = value("reason");
      if (reason) parts.push(`Grund: ${reason}`);
      const expires = value("expires_at");
      parts.push(expires ? `bis ${formatDate(expires)}` : "unbefristet");
      return parts.join(" · ");
    }
    case "user.unban":
      return "Sperre aufgehoben";
    case "user.role_change": {
      const from = value("from");
      const to = value("to");
      return from || to ? `${from ?? "?"} → ${to ?? "?"}` : "";
    }
    case "thread.pin":
      return details.pinned === true ? "Angeheftet" : "Anheftung aufgehoben";
    case "thread.lock":
      return details.locked === true ? "Für Kommentare gesperrt" : "Entsperrt";
    case "thread.move": {
      const category = value("category_id");
      return category ? `Kategorie #${category}` : "";
    }
    case "thread.remove":
      return "Thread entfernt";
    case "report.remove_content": {
      const contentType = value("content_type");
      const contentId = value("content_id");
      return contentType && contentId
        ? `${targetLabel(contentType)} #${contentId} entfernt`
        : "Inhalt entfernt";
    }
    case "report.dismiss":
      return "Kein Verstoß festgestellt";
    case "category.create": {
      const slug = value("slug");
      return slug ? `Slug ${slug}` : "";
    }
    case "category.delete":
      return value("name") ?? "";
    case "category.reorder": {
      const ids = details.ids;
      return Array.isArray(ids) ? `${ids.length} Kategorien sortiert` : "";
    }
    case "seed.complete":
      return "Demo-Inhalte angelegt";
    default:
      return Object.entries(details)
        .filter(([, raw]) => raw !== null && raw !== undefined && raw !== "")
        .map(([key, raw]) => `${key}: ${String(raw)}`)
        .join(" · ");
  }
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function ActorCell({ entry }: { entry: AuditEntry }) {
  if (!entry.actor_username) return <span className="muted">System</span>;
  return (
    <a href={`${FORUM_URL}/users/${encodeURIComponent(entry.actor_username)}`}>
      @{entry.actor_username}
    </a>
  );
}

function TargetCell({ entry }: { entry: AuditEntry }) {
  return (
    <>
      {targetLabel(entry.target_type)}
      {entry.target_id !== null ? (
        <>
          {" "}
          <span className="mono">#{entry.target_id}</span>
        </>
      ) : null}
    </>
  );
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<AuditPage>(`/api/admin/audit-log?page=${page}&page_size=${PAGE_SIZE}`)
      .then((data) => {
        if (!active) return;
        setEntries(data.items);
        setTotal(data.total);
        setPages(data.pages);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setEntries([]);
        setTotal(0);
        setPages(1);
        setError(
          cause instanceof ApiError ? cause.message : "Das Audit-Log konnte nicht geladen werden.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, reloadToken]);

  const actorOptions = useMemo(() => {
    const names = new Set<string>();
    for (const entry of entries) if (entry.actor_username) names.add(entry.actor_username);
    return [...names].sort((a, b) => a.localeCompare(b, "de"));
  }, [entries]);

  const actionOptions = useMemo(() => {
    const actions = new Set<string>(Object.keys(ACTION_LABELS));
    for (const entry of entries) actions.add(entry.action);
    return [...actions].sort((a, b) => actionLabel(a).localeCompare(actionLabel(b), "de"));
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const from = dateFilter ? parseDate(`${dateFilter}T00:00:00`)?.getTime() : undefined;
    return entries.filter((entry) => {
      if (actionFilter && entry.action !== actionFilter) return false;
      if (actorFilter && entry.actor_username !== actorFilter) return false;
      if (from !== undefined && from !== null) {
        const created = parseDate(entry.created_at)?.getTime() ?? 0;
        if (created < from) return false;
      }
      if (needle) {
        const haystack = `${entry.actor_username ?? ""} ${targetText(entry)}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [entries, query, actionFilter, actorFilter, dateFilter]);

  const exportCsv = useCallback(() => {
    const rows = [["Zeit", "Akteur", "Aktion", "Ziel", "Details"]];
    for (const entry of visible) {
      rows.push([
        entry.created_at,
        entry.actor_username ?? "",
        actionLabel(entry.action),
        targetText(entry),
        formatDetails(entry),
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "audit-log.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }, [visible]);

  const emptyTitle = entries.length === 0 ? "Noch keine Einträge" : "Keine Einträge gefunden";
  const emptyDescription =
    entries.length === 0
      ? "Sobald eine Moderations- oder Verwaltungsaktion ausgeführt wird, erscheint sie hier."
      : "Für die gewählten Filter gibt es auf dieser Seite keine Treffer.";

  return (
    <>
      <PageHeader
        title="Audit-Log"
        description="Alle Moderations- und Verwaltungsaktionen, unveränderlich protokolliert."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={exportCsv}
            disabled={visible.length === 0}
            title={visible.length === 0 ? "Keine Einträge zum Exportieren" : undefined}
          >
            CSV exportieren
          </Button>
        }
      />

      {error !== null ? (
        <Banner
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadToken((t) => t + 1)}>
              Erneut versuchen
            </Button>
          }
        >
          {error}
        </Banner>
      ) : null}

      <div className="filter-bar">
        <SearchInput
          label="Audit-Log durchsuchen"
          placeholder="Akteur oder Ziel suchen…"
          value={query}
          onChange={setQuery}
        />
        <Select
          size="sm"
          aria-label="Aktion filtern"
          value={actionFilter}
          onChange={(event) => setActionFilter(event.target.value)}
        >
          <option value="">Alle Aktionen</option>
          {actionOptions.map((action) => (
            <option key={action} value={action}>
              {actionLabel(action)}
            </option>
          ))}
        </Select>
        <Select
          size="sm"
          aria-label="Akteur filtern"
          value={actorFilter}
          onChange={(event) => setActorFilter(event.target.value)}
        >
          <option value="">Alle Akteure</option>
          {actorOptions.map((name) => (
            <option key={name} value={name}>
              @{name}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label="Ab Datum"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          style={{ height: 40, width: "auto" }}
        />
      </div>

      <Table busy={loading} label="Audit-Log">
        <TableHead>
          <TableRow>
            <Th>Zeit</Th>
            <Th>Akteur</Th>
            <Th>Aktion</Th>
            <Th>Ziel</Th>
            <Th>Details</Th>
          </TableRow>
        </TableHead>
        <tbody>
          {loading ? (
            <TableLoadingRows rows={6} columns={5} />
          ) : visible.length === 0 ? (
            <TableEmpty columns={5} title={emptyTitle} description={emptyDescription} />
          ) : (
            visible.map((entry) => (
              <TableRow key={entry.id}>
                <Td className="tabular muted">
                  <span title={entry.created_at}>{formatDateTime(entry.created_at)}</span>
                </Td>
                <Td>
                  <ActorCell entry={entry} />
                </Td>
                <Td>
                  <Chip>{actionLabel(entry.action)}</Chip>
                </Td>
                <Td>
                  <TargetCell entry={entry} />
                </Td>
                <Td className="muted">{formatDetails(entry)}</Td>
              </TableRow>
            ))
          )}
        </tbody>
      </Table>

      {!loading && pages > 1 ? (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          totalLabel="Einträge"
          onPageChange={setPage}
        />
      ) : null}
    </>
  );
}
