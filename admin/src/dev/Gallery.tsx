import { useState, type ReactNode } from "react";
import { AdminNav } from "../chrome/AdminNav";
import {
  AlertIcon,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardHead,
  Checkbox,
  Chip,
  CloseIcon,
  Delta,
  EmptyState,
  Field,
  IconButton,
  Input,
  Kpi,
  KpiGrid,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  PageHeader,
  Pagination,
  PasswordInput,
  ProgressBar,
  Prose,
  ReportCard,
  SearchInput,
  Select,
  SideNavItem,
  Skeleton,
  SkeletonText,
  Sparkline,
  Table,
  TableEmpty,
  TableHead,
  TableLoadingRows,
  TableRow,
  Tabs,
  Td,
  Textarea,
  Th,
  Toast,
  ToastRegion,
  ThemeToggle,
  EyeIcon,
  ForumIcon,
  MenuIcon,
  type SortDirection,
  type ToastTone,
} from "../components";
import { FORUM_URL, type UserOut } from "../lib/api";

const DEMO_ADMIN: UserOut = {
  id: 1,
  username: "admin",
  email: "admin@forum.test",
  bio: null,
  role: "admin",
  karma: 430,
  created_at: "2025-09-01T00:00:00Z",
};

const SPARK_POINTS = [28, 30, 27, 34, 32, 38, 36, 42, 40, 46, 43, 48, 45, 51, 49, 55];

const TOP_CATEGORIES = [
  { name: "Backend", count: 44, share: 100 },
  { name: "Frontend", count: 31, share: 70 },
  { name: "Datenbanken", count: 28, share: 64 },
  { name: "DevOps", count: 21, share: 48 },
];

interface UserRow {
  username: string;
  tone: number;
  role: "user" | "moderator" | "admin";
  karma: number;
  registered: string;
  banned?: boolean;
}

const USER_ROWS: UserRow[] = [
  { username: "mara", tone: 1, role: "user", karma: 248, registered: "14.02.2026" },
  { username: "lena", tone: 4, role: "moderator", karma: 191, registered: "03.11.2025" },
  { username: "admin", tone: 5, role: "admin", karma: 430, registered: "01.09.2025" },
  { username: "spam_bot", tone: 0, role: "user", karma: -12, registered: "16.10.2026", banned: true },
];

const ROLE_BADGE = {
  user: { variant: "role" as const, label: "Nutzer" },
  moderator: { variant: "moderator" as const, label: "Moderator" },
  admin: { variant: "admin" as const, label: "Administrator" },
};

interface AuditRow {
  id: number;
  time: string;
  actor: string;
  action: string;
  details: string;
}

const AUDIT_ROWS: AuditRow[] = [
  { id: 1, time: "16.10.2026, 14:58", actor: "admin", action: "Nutzer gesperrt", details: "Grund: Spam · unbefristet" },
  { id: 2, time: "16.10.2026, 14:31", actor: "lena", action: "Inhalt entfernt", details: "Grund: Belästigung" },
  { id: 3, time: "16.10.2026, 13:12", actor: "admin", action: "Rolle geändert", details: "Nutzer → Moderator" },
];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="admin-section">
      <h3>{title}</h3>
      {description !== undefined ? <p className="muted small">{description}</p> : null}
      <div className="stack gap-4" style={{ marginTop: "var(--space-3)" }}>
        {children}
      </div>
    </section>
  );
}

function Demo({ label, children, block = false }: { label: string; children: ReactNode; block?: boolean }) {
  return (
    <div className="stack gap-1">
      <span className="xs muted">{label}</span>
      <div className={block ? undefined : "row wrap gap-2"}>{children}</div>
    </div>
  );
}

export default function Gallery() {
  const [tab, setTab] = useState("open");
  const [page, setPage] = useState(3);
  const [sortKey, setSortKey] = useState<"time" | "actor">("time");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [dialog, setDialog] = useState<"role" | "ban" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastTone[]>(["success", "danger", "warning", "info"]);
  const [regionToast, setRegionToast] = useState(false);
  const [chromeNote, setChromeNote] = useState(false);
  const [checked, setChecked] = useState(true);
  const [filters, setFilters] = useState(["Kategorie: Backend", "Tag: #fastapi"]);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [standaloneChip, setStandaloneChip] = useState(true);

  const announce = (message: string) => {
    setAnnouncement(message);
  };

  const sortedAudit = [...AUDIT_ROWS].sort((a, b) => {
    const value = sortKey === "time" ? a.time.localeCompare(b.time) : a.actor.localeCompare(b.actor);
    return sortDir === "asc" ? value : -value;
  });

  const toggleSort = (key: "time" | "actor") => {
    if (key === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <>
      <PageHeader
        title="Komponentengalerie"
        description="Jede Komponente des Admin-UI-Kits in jedem Zustand. Hover und Fokus reagieren live; der Hell/Dunkel-Wechsel sitzt in der Navigation."
        actions={<Button variant="secondary" size="sm" href={FORUM_URL}>Zum Forum</Button>}
      />

      <Banner tone="info">
        Entwicklungsseite: Diese Galerie zeigt ausschließlich die Bausteine des Kits, ohne Daten aus der API.
      </Banner>

      <Section title="Schaltflächen" description="Primär, Sekundär, Ghost und Gefahr; Hover, Fokus und aktiver Druck sind interaktiv.">
        <Demo label="Varianten">
          <Button variant="primary" onClick={() => announce("Primär ausgelöst.")}>Primär</Button>
          <Button variant="secondary" onClick={() => announce("Sekundär ausgelöst.")}>Sekundär</Button>
          <Button variant="ghost" onClick={() => announce("Ghost ausgelöst.")}>Ghost</Button>
          <Button variant="danger" onClick={() => announce("Gefahr ausgelöst.")}>Gefahr</Button>
        </Demo>
        <Demo label="Größen">
          <Button variant="primary" size="sm" onClick={() => announce("Klein ausgelöst.")}>Klein</Button>
          <Button variant="primary" onClick={() => announce("Standard ausgelöst.")}>Standard</Button>
          <Button variant="primary" size="lg" onClick={() => announce("Groß ausgelöst.")}>Groß</Button>
        </Demo>
        <Demo label="Zustände">
          <Button variant="primary" disabled>Deaktiviert</Button>
          <Button variant="secondary" disabled>Deaktiviert</Button>
          <Button variant="primary" loading>Lädt …</Button>
          <Button variant="secondary" loading>Lädt …</Button>
        </Demo>
        <Demo label="Mit Symbol und als Link">
          <Button variant="secondary" icon={<AlertIcon />} onClick={() => announce("Mit Symbol ausgelöst.")}>
            Mit Symbol
          </Button>
          <Button variant="primary" to="/users">Router-Link</Button>
          <Button variant="secondary" href={FORUM_URL}>Externer Link</Button>
        </Demo>
        <Demo label="Blockbreite" block>
          <Button variant="primary" block onClick={() => announce("Volle Breite ausgelöst.")}>Volle Breite</Button>
        </Demo>
      </Section>

      <Section title="Symbol-Schaltflächen" description="Mit Hover, Fokus, gedrücktem Zustand und deaktiviert.">
        <Demo label="Standard und klein">
          <IconButton label="Menü" onClick={() => announce("Menü-Schaltfläche ausgelöst.")}><MenuIcon /></IconButton>
          <IconButton label="Schließen" size="sm" onClick={() => announce("Schließen ausgelöst.")}><CloseIcon /></IconButton>
          <IconButton label="Zum Forum" href={FORUM_URL}><ForumIcon /></IconButton>
        </Demo>
        <Demo label="Gedrückt und deaktiviert">
          <IconButton label="Passwort anzeigen" pressed onClick={() => announce("Gedrückter Zustand ausgelöst.")}><EyeIcon /></IconButton>
          <IconButton label="Nicht verfügbar" disabled><CloseIcon /></IconButton>
          <IconButton label="Nicht verfügbar (klein)" size="sm" disabled><CloseIcon /></IconButton>
        </Demo>
      </Section>

      <Section title="Abzeichen" description="Rollen, Status, Zähler und Markierungen aus den Admin-Screens.">
        <Demo label="Varianten">
          <Badge variant="role">Nutzer</Badge>
          <Badge variant="moderator">Moderator</Badge>
          <Badge variant="admin">Administrator</Badge>
          <Badge variant="pin">Angeheftet</Badge>
          <Badge variant="lock">Gesperrt</Badge>
          <Badge variant="removed">Gesperrt</Badge>
          <Badge variant="new">Neu</Badge>
          <Badge variant="danger">7</Badge>
          <Badge variant="count">12</Badge>
        </Demo>
        <Demo label="Status">
          <Badge variant="open">Offen</Badge>
          <Badge variant="progress">In Bearbeitung</Badge>
          <Badge variant="done">Erledigt</Badge>
        </Demo>
      </Section>

      <Section title="Chips" description="Filter-Markierungen; das × entfernt den Chip wirklich.">
        <Demo label="Zustände">
          <Chip>Neutral</Chip>
          <Chip selected>Ausgewählt</Chip>
          {standaloneChip ? (
            <Chip removable selected onRemove={() => setStandaloneChip(false)}>
              Entfernbar
            </Chip>
          ) : (
            <Chip onClick={() => setStandaloneChip(true)}>Chip wieder anzeigen</Chip>
          )}
          <Chip href={FORUM_URL}>Als Link</Chip>
        </Demo>
        <Demo label="Aktive Filter (interaktiv)">
          {filters.length > 0 ? (
            filters.map((filter) => (
              <Chip
                key={filter}
                selected
                removable
                onRemove={() => setFilters((current) => current.filter((item) => item !== filter))}
              >
                {filter}
              </Chip>
            ))
          ) : (
            <span className="small muted">Keine Filter aktiv.</span>
          )}
          {filters.length < 2 ? (
            <Chip onClick={() => setFilters(["Kategorie: Backend", "Tag: #fastapi"])}>Filter zurücksetzen</Chip>
          ) : null}
        </Demo>
      </Section>

      <Section title="Avatare" description="Größen, automatische Farbtöne und das Konto ohne Bild.">
        <Demo label="Größen">
          <Avatar name="Mara" size="sm" />
          <Avatar name="Lena" />
          <Avatar name="Admin" size="lg" />
          <Avatar name="Tobias" size="xl" />
        </Demo>
        <Demo label="Töne und gelöschtes Konto">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((tone) => (
            <Avatar key={tone} name="Mara" tone={tone} />
          ))}
          <Avatar name="spam_bot" deleted />
        </Demo>
      </Section>

      <Section title="Karten" description="Standard, kompakt und mit Kopfzeile samt Aktion.">
        <Demo label="Standard" block>
          <Card>
            <p>Eine einfache Karte mit Inhalt und Abstand aus der Design-Skala.</p>
          </Card>
        </Demo>
        <Demo label="Kompakt" block>
          <Card compact>
            <p className="small">Kompakte Karte mit weniger Innenabstand.</p>
          </Card>
        </Demo>
        <Demo label="Mit Kopfzeile" block>
          <Card>
            <CardHead title="Aktivität (30 Tage)" action={<Badge variant="done">+18 %</Badge>} />
            <Sparkline points={SPARK_POINTS} label="Trend steigend" />
          </Card>
        </Demo>
        <Demo label="Meldungskarte (Warteschlange)" block>
          <ReportCard>
            <div className="between gap-2 wrap">
              <div className="row gap-2 wrap">
                <span className="mono muted">#1042</span>
                <Badge variant="open">Offen</Badge>
                <Chip>Spam</Chip>
              </div>
              <span className="small muted">vor 8 Min.</span>
            </div>
            <p className="small muted" style={{ marginTop: "var(--space-2)" }}>
              Gemeldet von @lena
            </p>
          </ReportCard>
        </Demo>
      </Section>

      <Section title="Formularfelder" description="Ein leeres Formular startet neutral; Fehler erscheinen erst nach Eingabe oder Absenden.">
        <Demo label="Eingabefelder" block>
          <div className="stack gap-3" style={{ maxWidth: 360 }}>
            <Field label="E-Mail" htmlFor="gallery-email">
              <Input id="gallery-email" type="email" placeholder="name@example.com" />
            </Field>
            <Field label="Name" htmlFor="gallery-name" helper="Wird öffentlich im Profil angezeigt.">
              <Input id="gallery-name" defaultValue="mara" />
            </Field>
            <Field label="Slug" htmlFor="gallery-slug" error="Nur Kleinbuchstaben und Bindestriche.">
              <Input id="gallery-slug" defaultValue="Backend!" />
            </Field>
            <Field label="Nicht änderbar" htmlFor="gallery-disabled">
              <Input id="gallery-disabled" defaultValue="admin@forum.test" disabled />
            </Field>
          </div>
        </Demo>
        <Demo label="Textbereich mit Zähler" block>
          <Field label="Beschreibung" htmlFor="gallery-desc" helper="Worum geht es in dieser Kategorie?" counter="12/200">
            <Textarea id="gallery-desc" maxLength={200} defaultValue="Server, APIs und Betrieb." />
          </Field>
        </Demo>
        <Demo label="Auswahlfelder" block>
          <div className="row wrap gap-2">
            <Select aria-label="Zeitraum" size="sm" defaultValue="7">
              <option value="7">Letzte 7 Tage</option>
              <option value="30">Letzte 30 Tage</option>
              <option value="90">Letzte 90 Tage</option>
            </Select>
            <Select aria-label="Rolle" defaultValue="user">
              <option value="user">Nutzer</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Administrator</option>
            </Select>
            <Select aria-label="Deaktiviert" disabled defaultValue="none">
              <option value="none">Deaktiviert</option>
            </Select>
          </div>
        </Demo>
        <Demo label="Kontrollkästchen">
          <Checkbox checked={checked} onChange={setChecked}>Im Forum sichtbar</Checkbox>
          <Checkbox defaultChecked>Angemeldet bleiben</Checkbox>
          <Checkbox disabled>Nicht verfügbar</Checkbox>
        </Demo>
        <Demo label="Passwortfeld" block>
          <div style={{ maxWidth: 360 }}>
            <PasswordInput id="gallery-pw" aria-label="Passwort" defaultValue="geheim12345" />
          </div>
        </Demo>
        <Demo label="Suchfeld" block>
          <div className="stack gap-2">
            <SearchInput
              label="Nutzer durchsuchen"
              placeholder="Nach Name oder E-Mail suchen…"
              onSubmit={(query) => announce(query ? "Suche: " + query : "Suche ohne Eingabe ausgelöst.")}
            />
            <SearchInput
              label="Galerie durchsuchen"
              size="lg"
              placeholder="Große Suchleiste"
              onSubmit={(query) => announce(query ? "Suche: " + query : "Suche ohne Eingabe ausgelöst.")}
            />
            <SearchInput label="Deaktivierte Suche" placeholder="Deaktiviert" disabled />
          </div>
        </Demo>
      </Section>

      <Section title="Hinweise" description="Banner für Information, Fehler, Warnung und Sperren.">
        <Demo label="Farbtöne" block>
          <div className="stack gap-2">
            <Banner tone="info">Diese Aktion berührt mehrere Inhalte.</Banner>
            <Banner tone="danger">Dieses Konto hat keine Berechtigung für den Administrationsbereich.</Banner>
            <Banner tone="warning">Der Worker verarbeitet gerade einen großen Stapel Jobs.</Banner>
            <Banner tone="ban">Dieses Konto ist bis 23.10.2026 gesperrt. Weiterlesen ist möglich, Schreiben nicht.</Banner>
          </div>
        </Demo>
      </Section>

      <Section title="Reiter" description="Statusfilter wie auf der Meldungsseite; Klick und Pfeiltasten wechseln den Reiter.">
        <Demo label="Meldungen nach Status" block>
          <Tabs
            label="Status"
            value={tab}
            onChange={setTab}
            items={[
              { value: "open", label: "Offen", count: 7, panelId: "gallery-tab-panel" },
              { value: "progress", label: "In Bearbeitung", count: 2, panelId: "gallery-tab-panel" },
              { value: "done", label: "Erledigt", count: 1, panelId: "gallery-tab-panel" },
            ]}
          />
          <div id="gallery-tab-panel" role="tabpanel" style={{ marginTop: "var(--space-3)" }}>
            <Card compact>
              <p className="small">
                Ausgewählt: <strong>{tab}</strong>
              </p>
            </Card>
          </div>
        </Demo>
        <Demo label="Deaktivierter Reiter" block>
          <Tabs
            label="Archiv"
            value="now"
            onChange={() => undefined}
            items={[
              { value: "now", label: "Aktuell" },
              { value: "old", label: "Archiv", disabled: true },
            ]}
          />
        </Demo>
      </Section>

      <Section title="Tabellen" description="Kopfzeile mit Sortierung, Ladezeilen und der leere Zustand.">
        <Demo label="Nutzerliste" block>
          <Table label="Nutzer">
            <TableHead>
              <TableRow>
                <Th>Nutzer</Th>
                <Th>Rolle</Th>
                <Th num>Karma</Th>
                <Th>Registriert</Th>
                <Th>Status</Th>
                <Th>
                  <span className="sr-only">Aktionen</span>
                </Th>
              </TableRow>
            </TableHead>
            <tbody>
              {USER_ROWS.map((row) => (
                <TableRow key={row.username}>
                  <Td>
                    <div className="row gap-2">
                      <Avatar name={row.username} size="sm" tone={row.tone} />
                      <span>@{row.username}</span>
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={ROLE_BADGE[row.role].variant}>{ROLE_BADGE[row.role].label}</Badge>
                  </Td>
                  <Td num>{row.karma}</Td>
                  <Td className="muted">{row.registered}</Td>
                  <Td>
                    <Badge variant={row.banned ? "removed" : "done"}>{row.banned ? "Gesperrt" : "Aktiv"}</Badge>
                  </Td>
                  <Td>
                    <div className="admin-inline-actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDialog("role")}
                      >
                        Rolle ändern
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={row.role === "admin"}
                        title={row.role === "admin" ? "Der eigene Account kann nicht gesperrt werden" : undefined}
                        onClick={() => setDialog("ban")}
                      >
                        Sperren
                      </Button>
                    </div>
                  </Td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Demo>

        <Demo label="Sortierbare Tabelle (interaktiv)" block>
          <Table label="Audit-Log">
            <TableHead>
              <TableRow>
                <Th
                  sortable
                  sorted={sortKey === "time" ? sortDir : false}
                  onSort={() => toggleSort("time")}
                >
                  Zeit
                </Th>
                <Th
                  sortable
                  sorted={sortKey === "actor" ? sortDir : false}
                  onSort={() => toggleSort("actor")}
                >
                  Akteur
                </Th>
                <Th>Aktion</Th>
                <Th>Details</Th>
              </TableRow>
            </TableHead>
            <tbody>
              {sortedAudit.map((row) => (
                <TableRow key={row.id}>
                  <Td className="tabular muted">{row.time}</Td>
                  <Td>@{row.actor}</Td>
                  <Td>
                    <Chip>{row.action}</Chip>
                  </Td>
                  <Td className="muted">{row.details}</Td>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Demo>

        <Demo label="Ladezeilen" block>
          <Table label="Wird geladen" busy>
            <TableHead>
              <TableRow>
                <Th>Nutzer</Th>
                <Th>Rolle</Th>
                <Th num>Karma</Th>
              </TableRow>
            </TableHead>
            <tbody>
              <TableLoadingRows rows={3} columns={3} />
            </tbody>
          </Table>
        </Demo>

        <Demo label="Leerer Zustand" block>
          <Table label="Keine Treffer">
            <TableHead>
              <TableRow>
                <Th>Nutzer</Th>
                <Th>Rolle</Th>
                <Th>Registriert</Th>
              </TableRow>
            </TableHead>
            <tbody>
              <TableEmpty
                columns={3}
                title="Keine Nutzer gefunden"
                description="Für diese Suche gibt es keine Treffer. Filter zurücksetzen und erneut versuchen."
                action={<Button variant="secondary" size="sm" to="/users">Zur Nutzerverwaltung</Button>}
              />
            </tbody>
          </Table>
        </Demo>
      </Section>

      <Section title="Seitennavigation" description="Klick wechselt die Seite; die Pfeile sind am Rand deaktiviert.">
        <Demo label="Erste und letzte Seite" block>
          <div className="stack gap-4">
            <Pagination page={page} pages={124} total={2480} totalLabel="Nutzer" onPageChange={setPage} />
            <Pagination page={1} pages={1} total={3} onPageChange={() => undefined} />
          </div>
        </Demo>
      </Section>

      <Section title="Kennzahlen" description="KPI-Karten des Dashboards mit Trend und Hervorhebung.">
        <Demo label="Vier Kennzahlen" block>
          <KpiGrid>
            <Kpi label="Offene Meldungen" value={7} tone="danger" trend={{ delta: "+3", direction: "up", note: "seit gestern" }} />
            <Kpi label="Neue Nutzer" value={184} trend={{ delta: "+12 %", direction: "up", note: "vs. Vorwoche" }} />
            <Kpi label="Neue Threads" value={42} trend={{ delta: "+5 %", direction: "up", note: "vs. Vorwoche" }} />
            <Kpi label="Täglich aktiv" value={612} trend={{ delta: "−3 %", direction: "down", note: "vs. Vorwoche" }} />
          </KpiGrid>
        </Demo>
        <Demo label="Ohne Trend">
          <KpiGrid>
            <Kpi label="Kommentare heute" value={312} />
            <Kpi label="Kommentare (7 Tage)" value={1874} />
          </KpiGrid>
        </Demo>
      </Section>

      <Section title="Trend und Balken" description="Sparkline und Fortschrittsbalken aus den Dashboard-Karten.">
        <Demo label="Sparkline" block>
          <Card compact>
            <CardHead title="Aktivität (30 Tage)" action={<Badge variant="done">+18 %</Badge>} />
            <Sparkline points={SPARK_POINTS} label="Trend steigend" />
            <div className="between small muted" style={{ marginTop: "var(--space-1)" }}>
              <span>1. Sep.</span>
              <span>16. Okt.</span>
            </div>
          </Card>
        </Demo>
        <Demo label="Balken" block>
          <div className="stack gap-2 small">
            {TOP_CATEGORIES.map((category) => (
              <div key={category.name}>
                <div className="between">
                  <span>{category.name}</span>
                  <span className="tabular">{category.count}</span>
                </div>
                <ProgressBar value={category.share} label={category.name} />
              </div>
            ))}
          </div>
        </Demo>
      </Section>

      <Section title="Leerer Zustand und Platzhalter" description="Für leere Listen und noch ladende Inhalte.">
        <Demo label="Leerer Zustand mit Aktion" block>
          <EmptyState
            title="Keine Meldungen"
            description="Sobald Nutzer Inhalte melden, erscheinen sie hier."
            action={<Button variant="secondary" size="sm" to="/moderation">Zur Warteschlange</Button>}
          />
        </Demo>
        <Demo label="Platzhalterzeilen" block>
          <div className="stack gap-3" style={{ maxWidth: 480 }}>
            <Skeleton width={180} height={20} />
            <SkeletonText lines={3} />
          </div>
        </Demo>
      </Section>

      <Section title="Dialog" description="Klick öffnet den Dialog; Escape und Klick daneben schließen ihn.">
        <Demo label="Öffnen">
          <Button variant="primary" onClick={() => setDialog("role")}>Rolle ändern</Button>
          <Button variant="danger" onClick={() => setDialog("ban")}>Nutzer sperren</Button>
        </Demo>
      </Section>

      <Section title="Toasts" description="Vier Töne, jeweils schließbar; die Region ist die feste Anzeigefläche.">
        <Demo label="Töne" block>
          <div className="stack gap-2" style={{ maxWidth: 420 }}>
            {toasts.map((tone) => (
              <Toast
                key={tone}
                tone={tone}
                onDismiss={() => setToasts((current) => current.filter((item) => item !== tone))}
              >
                {tone === "success"
                  ? "Die Rolle wurde gespeichert."
                  : tone === "danger"
                    ? "Der Inhalt konnte nicht entfernt werden."
                    : tone === "warning"
                      ? "Zu viele Anfragen — bitte kurz warten."
                      : "Die Einstellungen wurden geladen."}
              </Toast>
            ))}
            {toasts.length < 4 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setToasts(["success", "danger", "warning", "info"])}
              >
                Toasts zurücksetzen
              </Button>
            ) : null}
          </div>
        </Demo>
        <Demo label="Feste Region (aria-live)">
          <Button variant="secondary" size="sm" onClick={() => setRegionToast(true)} disabled={regionToast}>
            Toast anzeigen
          </Button>
        </Demo>
      </Section>

      <Section title="Menü" description="Aufklappmenü mit Einträgen und Trenner; ein Eintrag ist deaktiviert.">
        <Demo label="Interaktiv" block>
          <div className="popwrap" style={{ display: "inline-block" }}>
            <Button variant="secondary" onClick={() => setMenuOpen((current) => !current)} aria-expanded={menuOpen}>
              Konto
              <MenuIcon width={16} height={16} />
            </Button>
            {menuOpen ? (
              <Menu label="Konto">
                <MenuItem onClick={() => setMenuOpen(false)}>Profil</MenuItem>
                <MenuItem onClick={() => setMenuOpen(false)}>Einstellungen</MenuItem>
                <MenuItem disabled>Benachrichtigungen</MenuItem>
                <MenuSeparator />
                <MenuItem onClick={() => setMenuOpen(false)}>Abmelden</MenuItem>
              </Menu>
            ) : null}
          </div>
        </Demo>
      </Section>

      <Section title="Inhaltsbereich" description="Gerenderte Nutzerinhalte (Markdown, Zitate) stehen in einem Prose-Container.">
        <Demo label="Zitat aus einer Meldung" block>
          <Prose>
            <blockquote>
              Kaufen Sie jetzt günstige Kreditkarten-Daten — <code>bit.ly/xxxx</code> — 100 % diskret.
            </blockquote>
          </Prose>
        </Demo>
      </Section>

      <Section title="Rahmen (Chrome)" description="Die Navigation mit aktuellem Konto, Abmelden und dem Link zurück zum Forum. Der echte Rahmen umgibt diese Seite bereits; hier zusätzlich mit angemeldetem Konto.">
        <Demo label="Angemeldet als Administrator" block>
          <Card compact>
            <AdminNav
              label="Admin-Navigation (Galerie)"
              user={DEMO_ADMIN}
              reportCount={7}
              onSignOut={() => setChromeNote(true)}
            />
          </Card>
        </Demo>
        <Demo label="Abgemeldet" block>
          <Card compact>
            <AdminNav label="Admin-Navigation (Galerie, abgemeldet)" />
          </Card>
        </Demo>
        <Demo label="Darstellung und Navigationseintrag">
          <ThemeToggle />
          <SideNavItem to="/gallery" icon={<MenuIcon />} active>Galerie (aktiv)</SideNavItem>
        </Demo>
        {chromeNote ? (
          <p className="small muted">Abmelden ist in der Demo nur angedeutet — in der echten Navigation beendet es die Sitzung.</p>
        ) : null}
      </Section>

      <Section title="Trendwerte" description="Delta-Abzeichen für steigende und fallende Werte.">
        <Demo label="Auf und ab">
          <Delta direction="up">+3</Delta>
          <Delta direction="up">+12 %</Delta>
          <Delta direction="down">−3 %</Delta>
        </Demo>
      </Section>

      <Section
        title="Dunkel-Modus"
        description="Dieselben Bausteine mit den Token-Werten des dunklen Modus. Der Schalter „Darstellung“ in der Navigation stellt das gesamte Panel um."
      >
        <Demo label="Ausschnitt in dunkler Darstellung" block>
          <div data-theme="dark" className="card">
            <div className="stack gap-4">
              <div className="row wrap gap-2">
                <Button variant="primary">Primär</Button>
                <Button variant="secondary">Sekundär</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Gefahr</Button>
                <Button variant="primary" disabled>Deaktiviert</Button>
                <Button variant="primary" loading>Lädt …</Button>
              </div>
              <div className="row wrap gap-2">
                <Badge variant="admin">Administrator</Badge>
                <Badge variant="open">Offen</Badge>
                <Badge variant="done">Erledigt</Badge>
                <Chip selected>Ausgewählt</Chip>
                <Avatar name="Mara" size="sm" />
                <Avatar name="spam_bot" deleted />
              </div>
              <div className="stack gap-2" style={{ maxWidth: 360 }}>
                <Field label="E-Mail" htmlFor="gallery-dark-email">
                  <Input id="gallery-dark-email" defaultValue="admin@forum.test" />
                </Field>
                <Select aria-label="Zeitraum" defaultValue="7">
                  <option value="7">Letzte 7 Tage</option>
                  <option value="30">Letzte 30 Tage</option>
                </Select>
              </div>
              <div className="stack gap-2" style={{ maxWidth: 420 }}>
                <Toast tone="success">Der Inhalt wurde entfernt.</Toast>
                <Skeleton width={220} height={16} />
              </div>
            </div>
          </div>
        </Demo>
      </Section>

      <ToastRegion>
        {announcement !== null ? (
          <Toast tone="info" onDismiss={() => setAnnouncement(null)}>
            {announcement}
          </Toast>
        ) : null}
        {regionToast ? (
          <Toast tone="success" onDismiss={() => setRegionToast(false)}>
            Diese Meldung sitzt in der festen Toast-Region.
          </Toast>
        ) : null}
      </ToastRegion>

      <Modal
        open={dialog !== null}
        title={dialog === "ban" ? "Nutzer sperren" : "Rolle ändern"}
        description={
          dialog === "ban"
            ? "Gesperrte Nutzer können weiterhin lesen, aber keine Threads, Kommentare, Stimmen oder Meldungen abgeben."
            : "Die Rolle bestimmt Moderations- und Verwaltungsrechte. Änderungen werden im Audit-Log festgehalten."
        }
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>Abbrechen</Button>
            {dialog === "ban" ? (
              <Button variant="danger" onClick={() => setDialog(null)}>Sperren</Button>
            ) : (
              <Button variant="primary" onClick={() => setDialog(null)}>Rolle speichern</Button>
            )}
          </>
        }
      >
        {dialog === "ban" ? (
          <div className="stack gap-3">
            <Field label="Grund der Sperre" htmlFor="gallery-ban-reason">
              <Input id="gallery-ban-reason" placeholder="z. B. wiederholtes Spam-Verhalten" />
            </Field>
            <Field label="Ablaufdatum (optional)" htmlFor="gallery-ban-until">
              <Input id="gallery-ban-until" type="date" />
            </Field>
          </div>
        ) : (
          <Field label="Neue Rolle" htmlFor="gallery-role">
            <Select id="gallery-role" defaultValue="user">
              <option value="user">Nutzer</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Administrator</option>
            </Select>
          </Field>
        )}
      </Modal>
    </>
  );
}
