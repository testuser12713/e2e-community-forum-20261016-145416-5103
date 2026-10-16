import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Field,
  Modal,
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
  Toast,
  ToastRegion,
  type BadgeVariant,
  type ToastTone,
} from "../components";
import { ROLE_LABELS } from "../chrome/AdminNav";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiFetch, FORUM_URL, type UserOut, type UserRole } from "../lib/api";

/** ``UserAdmin`` from the shared contract: ``UserOut`` plus its current ban. */
interface UserAdmin extends UserOut {
  banned_until: string | null;
  ban_reason: string | null;
  is_banned: boolean;
  thread_count: number;
}

/** The contract's ``Page`` envelope, for views that need it in TypeScript. */
interface UserPage {
  items: UserAdmin[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const PAGE_SIZE = 20;

const ROLE_BADGE: Record<UserRole, BadgeVariant> = {
  admin: "admin",
  moderator: "moderator",
  user: "role",
};

const ROLE_OPTIONS: UserRole[] = ["user", "moderator", "admin"];

type StatusFilter = "" | "active" | "banned";

interface ToastEntry {
  id: number;
  tone: ToastTone;
  message: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Etwas ist schiefgelaufen. Bitte erneut versuchen.";
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv(rows: UserAdmin[]): void {
  const columns = ["id", "username", "email", "role", "karma", "created_at", "is_banned"];
  const lines = [columns.join(";")];
  for (const user of rows) {
    lines.push(
      [user.id, user.username, user.email, user.role, user.karma, user.created_at, user.is_banned]
        .map(csvCell)
        .join(";"),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "nutzer.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id ?? null;

  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | UserRole>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<UserPage>({
    items: [],
    total: 0,
    page: 1,
    page_size: PAGE_SIZE,
    pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roleTarget, setRoleTarget] = useState<UserAdmin | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>("user");
  const [banTarget, setBanTarget] = useState<UserAdmin | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banUntil, setBanUntil] = useState("");
  const [banError, setBanError] = useState<string | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<UserAdmin | null>(null);
  const [saving, setSaving] = useState(false);

  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const toastId = useRef(0);
  const toastTimers = useRef<number[]>([]);

  const pushToast = useCallback((tone: ToastTone, message: string) => {
    const id = (toastId.current += 1);
    setToasts((current) => [...current, { id, tone, message }]);
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
    toastTimers.current.push(timer);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(
    () => () => {
      for (const timer of toastTimers.current) window.clearTimeout(timer);
      toastTimers.current = [];
    },
    [],
  );

  // Debounce the search field: the server applies ``q`` to username and e-mail.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (appliedQuery) params.set("q", appliedQuery);
    if (roleFilter) params.set("role", roleFilter);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));

    apiFetch<UserPage>(`/api/admin/users?${params.toString()}`)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(messageOf(caught));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appliedQuery, roleFilter, page, reloadKey]);

  const applyUser = useCallback((updated: UserAdmin) => {
    setData((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === updated.id ? updated : item)),
    }));
  }, []);

  const visibleItems = useMemo(() => {
    if (!statusFilter) return data.items;
    return data.items.filter((user) =>
      statusFilter === "banned" ? user.is_banned : !user.is_banned,
    );
  }, [data.items, statusFilter]);

  const filtersActive = appliedQuery !== "" || roleFilter !== "" || statusFilter !== "";

  const openRoleModal = (target: UserAdmin) => {
    setSelectedRole(target.role);
    setRoleTarget(target);
  };

  const submitRole = async () => {
    if (!roleTarget) return;
    setSaving(true);
    try {
      const updated = await apiFetch<UserAdmin>(`/api/admin/users/${roleTarget.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole }),
      });
      applyUser(updated);
      pushToast("success", "Die Rolle wurde gespeichert.");
      setRoleTarget(null);
    } catch (caught: unknown) {
      pushToast("danger", messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const openBanModal = (target: UserAdmin) => {
    setBanReason("");
    setBanUntil("");
    setBanError(null);
    setBanTarget(target);
  };

  const submitBan = async () => {
    if (!banTarget) return;
    const reason = banReason.trim();
    if (!reason) {
      setBanError("Bitte einen Grund angeben.");
      return;
    }
    setSaving(true);
    setBanError(null);
    try {
      const body: { reason: string; expires_at?: string } = { reason };
      // The control gives a date; the contract wants ISO 8601, so the ban lasts
      // until the end of the chosen day.
      if (banUntil) body.expires_at = `${banUntil}T23:59:59Z`;
      const updated = await apiFetch<UserAdmin>(`/api/admin/users/${banTarget.id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      applyUser(updated);
      pushToast("success", `@${updated.username} wurde gesperrt.`);
      setBanTarget(null);
    } catch (caught: unknown) {
      setBanError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const submitUnban = async () => {
    if (!unbanTarget) return;
    setSaving(true);
    try {
      const updated = await apiFetch<UserAdmin>(`/api/admin/users/${unbanTarget.id}/ban`, {
        method: "DELETE",
      });
      applyUser(updated);
      pushToast("success", `Die Sperre von @${updated.username} wurde aufgehoben.`);
      setUnbanTarget(null);
    } catch (caught: unknown) {
      pushToast("danger", messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="admin-head">
        <div>
          <h1>Nutzer</h1>
          <p>
            {loading
              ? "Konten werden geladen …"
              : `${data.total.toLocaleString("de-DE")} Konten. Rollen vergeben, Konten sperren und Profile prüfen.`}
          </p>
        </div>
        <div className="admin-head-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || data.items.length === 0}
            onClick={() => exportCsv(visibleItems)}
          >
            CSV exportieren
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled
            title="Einladungen sind bald verfügbar"
          >
            Einladen
          </Button>
        </div>
      </div>

      <div className="filter-bar">
        <SearchInput
          label="Nutzer durchsuchen"
          placeholder="Nach Name oder E-Mail suchen…"
          value={query}
          onChange={setQuery}
          onSubmit={(value) => {
            setAppliedQuery(value.trim());
            setPage(1);
          }}
        />
        <Select
          size="sm"
          aria-label="Rolle filtern"
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value as "" | UserRole);
            setPage(1);
          }}
        >
          <option value="">Alle Rollen</option>
          <option value="user">Nutzer</option>
          <option value="moderator">Moderator</option>
          <option value="admin">Administrator</option>
        </Select>
        <Select
          size="sm"
          aria-label="Status filtern"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          <option value="">Alle Status</option>
          <option value="active">Aktiv</option>
          <option value="banned">Gesperrt</option>
        </Select>
      </div>

      {error !== null ? (
        <Banner
          tone="danger"
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              Erneut versuchen
            </Button>
          }
        >
          {error}
        </Banner>
      ) : (
        <>
          <Table busy={loading} label="Nutzer">
            <TableHead>
              <TableRow>
                <Th>Nutzer</Th>
                <Th>Rolle</Th>
                <Th num>Karma</Th>
                <Th num>Threads</Th>
                <Th>Registriert</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Aktionen</span>
                </Th>
              </TableRow>
            </TableHead>
            <tbody>
              {loading ? (
                <TableLoadingRows rows={8} columns={7} />
              ) : visibleItems.length === 0 ? (
                <TableEmpty
                  columns={7}
                  title="Keine Nutzer gefunden"
                  description={
                    filtersActive
                      ? "Keine Treffer für die aktuelle Suche oder Filter."
                      : "Es sind noch keine Konten vorhanden."
                  }
                />
              ) : (
                visibleItems.map((user) => {
                  const isSelf = currentUserId !== null && currentUserId === user.id;
                  return (
                    <TableRow key={user.id}>
                      <Td>
                        <div className="row gap-2">
                          <Avatar name={user.username} size="sm" deleted={user.is_banned} />
                          <a href={`${FORUM_URL}/users/${encodeURIComponent(user.username)}`}>
                            @{user.username}
                          </a>
                        </div>
                      </Td>
                      <Td>
                        <Badge variant={ROLE_BADGE[user.role]}>{ROLE_LABELS[user.role] ?? user.role}</Badge>
                      </Td>
                      <Td num>{user.karma}</Td>
                      <Td num>{user.thread_count}</Td>
                      <Td>
                        <span className="muted">{formatDate(user.created_at)}</span>
                      </Td>
                      <Td>
                        {user.is_banned ? (
                          <Badge variant="removed" title={user.ban_reason ?? undefined}>
                            Gesperrt
                          </Badge>
                        ) : (
                          <Badge variant="done">Aktiv</Badge>
                        )}
                      </Td>
                      <Td>
                        <div className="admin-inline-actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openRoleModal(user)}
                          >
                            Rolle ändern
                          </Button>
                          {user.is_banned ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setUnbanTarget(user)}
                            >
                              Entsperren
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isSelf}
                              title={
                                isSelf ? "Der eigene Account kann nicht gesperrt werden" : undefined
                              }
                              onClick={() => openBanModal(user)}
                            >
                              Sperren
                            </Button>
                          )}
                        </div>
                      </Td>
                    </TableRow>
                  );
                })
              )}
            </tbody>
          </Table>

          {!loading && data.total > 0 ? (
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              totalLabel="Nutzer"
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}

      <Modal
        open={roleTarget !== null}
        title="Rolle ändern"
        description="Die Rolle bestimmt Moderation- und Verwaltungsrechte. Änderungen werden im Audit-Log festgehalten."
        onClose={() => setRoleTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleTarget(null)}>
              Abbrechen
            </Button>
            <Button variant="primary" loading={saving} onClick={submitRole}>
              Rolle speichern
            </Button>
          </>
        }
      >
        <Field label="Neue Rolle" htmlFor="user-role-select">
          <Select
            id="user-role-select"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as UserRole)}
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={banTarget !== null}
        title="Nutzer sperren"
        description="Gesperrte Nutzer können weiterhin lesen, aber keine Threads, Kommentare, Stimmen oder Meldungen abgeben."
        onClose={() => setBanTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBanTarget(null)}>
              Abbrechen
            </Button>
            <Button variant="danger" loading={saving} onClick={submitBan}>
              Sperren
            </Button>
          </>
        }
      >
        <div className="stack gap-3">
          <Field label="Grund der Sperre" htmlFor="ban-user-reason" error={banError ?? undefined}>
            <input
              className="input"
              id="ban-user-reason"
              placeholder="z. B. wiederholtes Spam-Verhalten"
              value={banReason}
              onChange={(event) => {
                setBanReason(event.target.value);
                if (banError) setBanError(null);
              }}
            />
          </Field>
          <Field label="Ablaufdatum (optional)" htmlFor="ban-user-until">
            <input
              className="input"
              id="ban-user-until"
              type="date"
              value={banUntil}
              onChange={(event) => setBanUntil(event.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={unbanTarget !== null}
        title="Sperre aufheben?"
        description={
          unbanTarget
            ? `@${unbanTarget.username} erhält wieder volle Schreibrechte. Die bisherigen Meldungen bleiben im Audit-Log.`
            : undefined
        }
        onClose={() => setUnbanTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnbanTarget(null)}>
              Abbrechen
            </Button>
            <Button variant="primary" loading={saving} onClick={submitUnban}>
              Entsperren
            </Button>
          </>
        }
      />

      <ToastRegion>
        {toasts.map((toast) => (
          <Toast key={toast.id} tone={toast.tone} onDismiss={() => dismissToast(toast.id)}>
            {toast.message}
          </Toast>
        ))}
      </ToastRegion>
    </>
  );
}
