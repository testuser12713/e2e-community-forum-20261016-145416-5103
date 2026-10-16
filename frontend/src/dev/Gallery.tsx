import { useRef, useState, type ReactNode } from "react";
import {
  AccountMenu,
  Avatar,
  Badge,
  BanBanner,
  Banner,
  BellIcon,
  Breadcrumb,
  Button,
  Card,
  CardHead,
  CardTitle,
  CategoryNav,
  ChevronRightIcon,
  Chip,
  CommentTree,
  EmptyState,
  Field,
  Helper,
  IconButton,
  LinkButton,
  MarkdownEditor,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  NotificationBell,
  Pagination,
  PasswordInput,
  Popover,
  Prose,
  RuleList,
  SearchBar,
  SegmentedTabs,
  Select,
  Sidebar,
  SidebarCard,
  Skeleton,
  SkeletonText,
  StatList,
  TagCloud,
  Tag,
  TextInput,
  Textarea,
  ThreadCard,
  Toast,
  ToastRegion,
  UserList,
  VoteControl,
  type CommentData,
  type NotificationItemData,
  type VoteValue,
} from "../components";

/* -------------------------------------------------------------------------- */
/* Gallery scaffolding                                                        */
/* -------------------------------------------------------------------------- */

interface SectionProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

function Section({ id, title, description, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="stack gap-3">
      <div>
        <h2 id={`${id}-title`}>{title}</h2>
        {description !== undefined && (
          <p className="muted small" style={{ marginTop: 4 }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ children, align = "center" }: { children: ReactNode; align?: "center" | "flex-start" }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: align }}>{children}</div>
  );
}

function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stack gap-1">
      <span className="xs muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * Demo cell for an open panel. The panel hangs from the right edge of its
 * trigger (design), so the trigger sits at the right of the cell and the cell
 * keeps room below the button for the panel itself.
 */
function PanelDemo({
  label,
  space = 240,
  children,
}: {
  label: string;
  space?: number;
  children: ReactNode;
}) {
  return (
    <Demo label={label}>
      <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: space }}>
        {children}
      </div>
    </Demo>
  );
}

function Grid({ children, min = "220px" }: { children: ReactNode; min?: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}), 1fr))`,
        gap: "var(--space-3)",
        alignItems: "start",
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Interactive demos                                                          */
/* -------------------------------------------------------------------------- */

const DEMO_TAGS = ["postgres", "performance", "datenbanken"];

function ThreadCardDemo() {
  const [state, setState] = useState({ score: 87, vote: 1 as VoteValue });

  const vote = (next: VoteValue) => {
    setState((current) => ({ score: current.score + (next - current.vote), vote: next }));
  };

  return (
    <ThreadCard
      to="/threads/1"
      title="PostgreSQL Indizes richtig einsetzen — ein Leitfaden mit EXPLAIN ANALYZE"
      tags={DEMO_TAGS}
      tagHref={(tag) => `/tag/${tag}`}
      excerpt="Wann ein B-Tree-Index hilft, wann er schadet, und wie man mit EXPLAIN (ANALYZE, BUFFERS) die tatsächlichen Kosten liest."
      score={state.score}
      myVote={state.vote}
      onVote={vote}
      author={{ username: "mara", color: 1 }}
      profileHref={(username) => `/users/${username}`}
      category={{ name: "Backend", href: "/category/backend" }}
      createdAtLabel="vor 3 Std."
      commentCount={42}
      pinned
      activity={{ avatarName: "lena", avatarColor: 4, label: "vor 12 Min." }}
    />
  );
}

function threadCardStates(vote: VoteValue) {
  return (
    <ThreadCard
      to="/threads/2"
      title="FastAPI + SQLAlchemy 2.0: async oder sync — was nutzt ihr in Produktion?"
      tags={["fastapi", "python"]}
      tagHref={(tag) => `/tag/${tag}`}
      excerpt="AsyncSession sieht in den Docs gut aus, aber Sync-Engine mit psycopg3 läuft überraschend solide."
      score={41}
      myVote={vote}
      author={{ username: "lena", color: 4 }}
      category={{ name: "Backend", href: "/category/backend" }}
      createdAtLabel="vor 5 Std."
      commentCount={18}
    />
  );
}

function VoteDemo({
  initialScore,
  initialVote = 0,
  disabled = false,
  orientation = "vertical",
  subject = "Inhalt",
}: {
  initialScore: number;
  initialVote?: VoteValue;
  disabled?: boolean;
  orientation?: "vertical" | "horizontal";
  subject?: string;
}) {
  const [state, setState] = useState({ score: initialScore, vote: initialVote });
  return (
    <VoteControl
      score={state.score}
      value={state.vote}
      orientation={orientation}
      subject={subject}
      disabled={disabled}
      onVote={
        disabled
          ? undefined
          : (next) => setState((current) => ({ score: current.score + (next - current.vote), vote: next }))
      }
    />
  );
}

function PaginationDemo() {
  const [first, setFirst] = useState(1);
  const [middle, setMiddle] = useState(6);
  const [last, setLast] = useState(12);
  const [short, setShort] = useState(1);
  return (
    <div className="stack gap-3">
      <Demo label={`Erste Seite (Zurück deaktiviert) — Seite ${first}`}>
        <Pagination page={first} pages={12} totalItems={148} itemLabel="Threads" onPageChange={setFirst} />
      </Demo>
      <Demo label={`Mittlere Seite (mit Auslassung) — Seite ${middle}`}>
        <Pagination page={middle} pages={12} totalItems={148} itemLabel="Threads" onPageChange={setMiddle} />
      </Demo>
      <Demo label={`Letzte Seite (Weiter deaktiviert) — Seite ${last}`}>
        <Pagination page={last} pages={12} totalItems={148} itemLabel="Threads" onPageChange={setLast} />
      </Demo>
      <Demo label={`Wenige Seiten — Seite ${short}`}>
        <Pagination
          page={short}
          pages={2}
          totalItems={24}
          itemLabel="Benachrichtigungen"
          onPageChange={setShort}
        />
      </Demo>
      <p className="xs muted">
        Bei nur einer Seite rendert die Paginierung nichts — es gäbe nichts zu wechseln (Zustand „leer").
      </p>
    </div>
  );
}

function ChipsDemo() {
  const [category, setCategory] = useState(true);
  const [tag, setTag] = useState(true);
  return (
    <Demo label="Chip: ausgewählt, entfernt, neutral">
      <Row>
        {category ? (
          <Chip
            selected
            removable
            removeLabel="Filter Kategorie: Backend entfernen"
            onRemove={() => setCategory(false)}
          >
            Kategorie: Backend
          </Chip>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setCategory(true)}>
            Filter Kategorie wieder anzeigen
          </Button>
        )}
        {tag ? (
          <Chip selected removable removeLabel="Filter Tag entfernen" onRemove={() => setTag(false)}>
            Tag: #fastapi
          </Chip>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setTag(true)}>
            Filter Tag wieder anzeigen
          </Button>
        )}
        <Chip to="/">Filter zurücksetzen</Chip>
        <Chip>#postgres</Chip>
      </Row>
      <span className="xs muted">
        Ausgewählt: {category ? "Kategorie: Backend" : "keine Kategorie"}
        {tag ? " · #fastapi" : ""}
      </span>
    </Demo>
  );
}

const COMMENT_DEMO: CommentData[] = [
  {
    id: 1,
    author: { username: "tobias", role: "moderator", color: 6 },
    bodyHtml:
      "<p>Der Tipp mit dem Teilindex hat bei uns am meisten gebracht. <code>WHERE deleted_at IS NULL</code> hat den Index von 180 MB auf 40 MB reduziert.</p>",
    createdAtLabel: "vor 2 Std.",
    score: 12,
    children: [
      {
        id: 2,
        author: { username: "mara", color: 1 },
        bodyHtml: "<p>Genau, und <code>CREATE INDEX CONCURRENTLY</code> nicht vergessen.</p>",
        createdAtLabel: "vor 90 Min.",
        score: 8,
        myVote: 1,
        own: true,
        children: [
          {
            id: 3,
            author: { username: "jonas_k", color: 2 },
            bodyHtml: "<p>Bei uns läuft das nachts im Wartungsfenster.</p>",
            createdAtLabel: "vor 1 Std.",
            score: 5,
            children: [
              {
                id: 4,
                author: { username: "sara", color: 5 },
                bodyHtml: "<p>Kommt auf die Datenbankgröße an.</p>",
                createdAtLabel: "vor 45 Min.",
                editedLabel: "bearbeitet",
                score: 3,
                children: [
                  {
                    id: 5,
                    author: { username: "mara", color: 1 },
                    bodyHtml: "<p>Danke — so bleibt der Thread auch für Neulinge nachvollziehbar.</p>",
                    createdAtLabel: "vor 12 Min.",
                    score: 2,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 7,
    author: { username: "sara", color: 5 },
    bodyHtml: "<p>Ergänzend: <code>pg_stat_user_indexes</code> zeigt <code>idx_scan = 0</code>.</p>",
    createdAtLabel: "vor 1 Std.",
    score: 4,
    collapsed: true,
    children: [
      {
        id: 8,
        author: { username: "jonas_k", color: 2 },
        bodyHtml: "<p>Wir haben so drei Alt-Indizes entfernt und ~2 GB gespart.</p>",
        createdAtLabel: "vor 40 Min.",
        score: 3,
      },
    ],
  },
  {
    id: 9,
    author: null,
    createdAtLabel: "vor 6 Std.",
    score: 0,
    deleted: true,
    children: [
      {
        id: 10,
        author: { username: "lena", color: 4 },
        bodyHtml: "<p>Die Antwort bleibt trotzdem sinnvoll — gutes Beispiel für weiches Löschen.</p>",
        createdAtLabel: "vor 5 Std.",
        score: 1,
      },
    ],
  },
];

function updateComment(
  nodes: CommentData[],
  id: number,
  update: (node: CommentData) => CommentData,
): CommentData[] {
  return nodes.map((node) =>
    node.id === id
      ? update(node)
      : node.children !== undefined
        ? { ...node, children: updateComment(node.children, id, update) }
        : node,
  );
}

function CommentDemo({ onStatus }: { onStatus: (message: string) => void }) {
  const [comments, setComments] = useState<CommentData[]>(COMMENT_DEMO);
  const replyId = useRef(100);

  return (
    <CommentTree
      comments={comments}
      onVote={(id, next) =>
        setComments((current) =>
          updateComment(current, id, (node) => ({
            ...node,
            score: node.score + (next - (node.myVote ?? 0)),
            myVote: next,
          })),
        )
      }
      onReply={(id, body) => {
        replyId.current += 1;
        const newId = replyId.current;
        setComments((current) =>
          updateComment(current, id, (node) => ({
            ...node,
            children: [
              ...(node.children ?? []),
              {
                id: newId,
                author: { username: "du", color: 0 },
                bodyHtml: `<p>${body.replace(/[<>&]/g, "")}</p>`,
                createdAtLabel: "gerade eben",
                score: 1,
                own: true,
              },
            ],
          })),
        );
        onStatus(`Antwort an Kommentar #${id} gesendet.`);
      }}
      onReport={(id) => onStatus(`Kommentar #${id} gemeldet (Demo).`)}
      onEdit={(id) => onStatus(`Kommentar #${id} bearbeiten (Demo).`)}
      onDelete={(id) => {
        setComments((current) => updateComment(current, id, (node) => ({ ...node, deleted: true })));
        onStatus(`Kommentar #${id} gelöscht (weiches Löschen, Antworten bleiben).`);
      }}
      profileHref={(username) => `/users/${username}`}
    />
  );
}

function OverlayDemo({ onStatus }: { onStatus: (message: string) => void }) {
  const [open, setOpen] = useState<"popover" | "menu" | null>(null);

  const toggle = (which: "popover" | "menu") => {
    setOpen((current) => (current === which ? null : which));
  };

  return (
    <Row align="flex-start">
      <PanelDemo label="Popover (aufklappbar)" space={200}>
        <div className="popwrap" style={{ display: "inline-block" }}>
          <IconButton
            label="Popover-Beispiel öffnen"
            aria-haspopup="dialog"
            aria-expanded={open === "popover"}
            onClick={() => toggle("popover")}
          >
            <BellIcon />
          </IconButton>
          <Popover open={open === "popover"} label="Beispiel-Popover">
            <div className="popover-head">
              <strong>Benachrichtigungen</strong>
            </div>
            <p className="muted small">Inhalt der aufklappenden Fläche.</p>
          </Popover>
        </div>
      </PanelDemo>
      <PanelDemo label="Menü (aufklappbar, mit deaktiviertem Eintrag)" space={200}>
        <div className="popwrap" style={{ display: "inline-block" }}>
          <IconButton
            label="Menü-Beispiel öffnen"
            aria-haspopup="menu"
            aria-expanded={open === "menu"}
            onClick={() => toggle("menu")}
          >
            <ChevronRightIcon />
          </IconButton>
          <Menu open={open === "menu"} label="Beispielmenü">
            <MenuItem onClick={() => onStatus("Profil (Demo).")}>Profil</MenuItem>
            <MenuItem onClick={() => onStatus("Einstellungen (Demo).")}>Einstellungen</MenuItem>
            <MenuSeparator />
            <MenuItem disabled title="Bald verfügbar">
              Konto löschen
            </MenuItem>
          </Menu>
        </div>
      </PanelDemo>
    </Row>
  );
}

function ModalDemo() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Row>
        <Button onClick={() => setOpen("report")}>Inhalt melden</Button>
        <Button variant="danger" onClick={() => setOpen("remove")}>
          Thread entfernen
        </Button>
        <Button variant="secondary" onClick={() => setOpen("ban")}>
          Nutzer sperren
        </Button>
      </Row>

      <Modal
        open={open === "report"}
        title="Inhalt melden"
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={() => setOpen(null)}>
              Meldung senden
            </Button>
          </>
        }
      >
        <div className="stack gap-3">
          <Field label="Grund" htmlFor="gallery-report-reason">
            <Select id="gallery-report-reason" defaultValue="Spam">
              <option>Spam</option>
              <option>Belästigung</option>
              <option>Hassrede</option>
              <option>Falsche Kategorie</option>
              <option>Sonstiges</option>
            </Select>
          </Field>
          <Field label="Anmerkung (optional)" htmlFor="gallery-report-note" hint="Maximal 500 Zeichen.">
            <Textarea id="gallery-report-note" maxLength={500} placeholder="Was ist das Problem?" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={open === "remove"}
        title="Thread entfernen"
        description="Der Thread wird als entfernt angezeigt; die Kommentare bleiben sichtbar."
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={() => setOpen(null)}>
              Thread entfernen
            </Button>
          </>
        }
      >
        <Field label="Grund" htmlFor="gallery-remove-reason">
          <TextInput id="gallery-remove-reason" placeholder="z. B. Duplikat" />
        </Field>
      </Modal>

      <Modal
        open={open === "ban"}
        title="Nutzer sperren"
        description="@mara kann weiterhin lesen, aber keine Threads, Kommentare, Stimmen oder Meldungen abgeben."
        onClose={() => setOpen(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={() => setOpen(null)}>
              Sperren
            </Button>
          </>
        }
      >
        <div className="stack gap-3">
          <Field label="Grund der Sperre" htmlFor="gallery-ban-reason">
            <TextInput id="gallery-ban-reason" placeholder="z. B. wiederholtes Spam-Verhalten" />
          </Field>
          <Field label="Ablaufdatum (optional)" htmlFor="gallery-ban-until">
            <TextInput id="gallery-ban-until" type="date" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function TabsDemo() {
  const [sort, setSort] = useState<"neu" | "top" | "hot">("neu");
  const [filter, setFilter] = useState<"unread" | "all">("unread");
  return (
    <div className="stack gap-3">
      <Demo label="Sortierung (Neu · Top · Hot)">
        <SegmentedTabs
          label="Sortierung"
          value={sort}
          onChange={setSort}
          items={[
            { value: "neu", label: "Neu" },
            { value: "top", label: "Top" },
            { value: "hot", label: "Hot", title: "Nach Stimmen mit Zeitverfall sortiert" },
          ]}
        />
      </Demo>
      <Demo label="Filter (Ungelesen · Alle)">
        <SegmentedTabs
          label="Filter"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "unread", label: "Ungelesen" },
            { value: "all", label: "Alle" },
          ]}
        />
      </Demo>
    </div>
  );
}

const NOTIFICATION_ITEMS: NotificationItemData[] = [
  {
    id: 1,
    actor: { username: "mara", color: 1 },
    message: (
      <>
        <strong>@mara</strong> hat deinen Thread kommentiert
      </>
    ),
    detail: "„PostgreSQL Indizes richtig einsetzen“",
    unread: true,
    href: "/threads/1",
  },
  {
    id: 2,
    actor: { username: "lena", color: 4 },
    message: "Du wurdest in einem Kommentar erwähnt",
    detail: "„Hier ist der Tipp von @mara sehr hilfreich.“",
    unread: true,
    href: "/threads/1",
  },
  {
    id: 3,
    actor: { username: "tobias", color: 3 },
    message: 'Neuer Kommentar in „Alembic-Migrationen im Team"',
    href: "/threads/4",
  },
];

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

export default function Gallery() {
  const [previewText, setPreviewText] = useState(
    "Danke für den Leitfaden — wir haben den Teilindex direkt ausprobiert.\n\n**Fragen an euch:**\n- Welche Pool-Größe fahrt ihr pro Instanz?",
  );
  const [editorValue, setEditorValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  return (
    <div className="stack" style={{ gap: "var(--space-6)" }}>
      <header>
        <h1>UI-Kit-Galerie</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Jede Komponente des Forum-Kits in jedem Zustand. Die Kopfzeile oben ist die echte Chrome des
          Forums; die Wahl zwischen hell und dunkel oben rechts gilt für alles auf dieser Seite.
          Hover-, Fokus- und Gedrückt-Zustände folgen den Design-Regeln und reagieren auf Maus und
          Tastatur — die Vorschauen hier zeigen die ruhenden Zustände, die Klick-Vorschauen zählen wirklich.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="kopfzeile"
        title="Kopfzeile und Navigation"
        description="Die Chrome oben trägt Marke, Suche, Neuer-Thread-Schaltfläche, Benachrichtigungen, Kontomenü und Themenwahl. Unter 640 px entfallen Suchfeld und Markentext, die Navigation bleibt erreichbar."
      >
        <Grid min="320px">
          <PanelDemo label="Benachrichtigungen mit Ungelesen-Zähler (offen)" space={300}>
            <NotificationBell
              defaultOpen
              label="Benachrichtigungen (offen)"
              unreadCount={4}
              items={NOTIFICATION_ITEMS}
              onMarkAllRead={() => setToast("Alle Benachrichtigungen als gelesen markiert (Demo).")}
              viewAllHref="/notifications"
            />
          </PanelDemo>
          <PanelDemo label="Benachrichtigungen leer (Panel geschlossen)" space={0}>
            <NotificationBell label="Benachrichtigungen (leer)" unreadCount={0} items={[]} viewAllHref="/notifications" />
          </PanelDemo>
          <PanelDemo label="Benachrichtigungen, sehr viele (99+)" space={300}>
            <NotificationBell
              label="Benachrichtigungen (99+)"
              unreadCount={128}
              items={NOTIFICATION_ITEMS}
            />
          </PanelDemo>
          <PanelDemo label="Kontomenü angemeldet (offen)" space={220}>
            <AccountMenu
              defaultOpen
              label="Konto (angemeldet)"
              user={{ username: "mara", color: 1 }}
              onLogout={() => setToast("Abgemeldet (Demo).")}
              profileHref="/users/mara"
              settingsHref="/settings"
              notificationsHref="/notifications"
            />
          </PanelDemo>
          <PanelDemo label="Kontomenü abgemeldet (offen)" space={140}>
            <AccountMenu defaultOpen label="Konto (abgemeldet)" loginHref="/login" registerHref="/register" />
          </PanelDemo>
          <PanelDemo label="Konto ohne Abmelde-Aktion (abgemeldet)" space={140}>
            <AccountMenu
              user={null}
              label="Konto (ohne Abmelden)"
              loginHref="/login"
              registerHref="/register"
            />
          </PanelDemo>
        </Grid>

        <Row>
          <Demo label="Brotkrumen (zwei Ebenen)">
            <Breadcrumb
              items={[
                { label: "Start", to: "/" },
                { label: "Backend", to: "/category/backend" },
                { label: "PostgreSQL Indizes richtig einsetzen" },
              ]}
            />
          </Demo>
        </Row>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="schaltflaechen"
        title="Schaltflächen"
        description="Varianten, Größen, Blockbreite sowie die Zustände deaktiviert und lädt."
      >
        <Grid min="180px">
          <Demo label="Primary">
            <Button variant="primary">Thread veröffentlichen</Button>
          </Demo>
          <Demo label="Secondary">
            <Button variant="secondary">Abbrechen</Button>
          </Demo>
          <Demo label="Ghost">
            <Button variant="ghost">Alle als gelesen markieren</Button>
          </Demo>
          <Demo label="Danger">
            <Button variant="danger">Thread entfernen</Button>
          </Demo>
          <Demo label="Klein (sm)">
            <Button variant="secondary" size="sm">
              Melden
            </Button>
          </Demo>
          <Demo label="Groß (lg)">
            <Button variant="primary" size="lg">
              Anmelden
            </Button>
          </Demo>
          <Demo label="Deaktiviert">
            <Button variant="secondary" disabled title="Bald verfügbar">
              Konto löschen
            </Button>
          </Demo>
          <Demo label="Lädt (deaktiviert)">
            <Button variant="primary" loading>
              Wird gespeichert…
            </Button>
          </Demo>
        </Grid>
        <Demo label="Blockbreite">
          <div style={{ maxWidth: 360 }}>
            <Button variant="primary" block>
              Konto erstellen
            </Button>
          </div>
        </Demo>
        <Demo label="Navigation als Schaltfläche">
          <Row>
            <LinkButton to="/new-thread" variant="primary">
              Neuer Thread
            </LinkButton>
            <LinkButton to="/search" variant="secondary">
              Zur Suche
            </LinkButton>
          </Row>
        </Demo>
        <Demo label="Icon-Schaltflächen (Standard, klein, gedrückt/aktiv, deaktiviert)">
          <Row>
            <IconButton
              label="Benachrichtigungen"
              onClick={() => setToast("Benachrichtigungen (Demo).")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <circle cx="12" cy="12" r="9" />
              </svg>
            </IconButton>
            <IconButton
              size="sm"
              label="Schließen"
              onClick={() => setToast("Geschlossen (Demo).")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </IconButton>
            <IconButton label="Gedrückt (aktiv)" active onClick={() => setToast("Umschalten (Demo).")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </IconButton>
            <IconButton label="Deaktiviert" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </IconButton>
          </Row>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="abzeichen" title="Abzeichen" description="Rollen, Thread-Zustände und Zähler.">
        <Row>
          <Badge variant="role">Nutzer</Badge>
          <Badge variant="moderator">Moderator</Badge>
          <Badge variant="admin">Admin</Badge>
          <Badge variant="pin">Angeheftet</Badge>
          <Badge variant="lock">Gesperrt</Badge>
          <Badge variant="removed">Entfernt</Badge>
          <Badge variant="new">4 ungelesen</Badge>
          <Badge variant="danger">Offen</Badge>
          <Badge variant="count">12</Badge>
        </Row>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="avatare"
        title="Avatare"
        description="Vier Größen, acht Farben und der Platzhalter gelöschter Konten."
      >
        <Row>
          <Avatar name="mara" size={72} color={1} />
          <Avatar name="lena" size={40} color={4} />
          <Avatar name="jonas_k" color={2} />
          <Avatar name="tobias" size={24} color={6} />
          <Avatar name="sara" size={24} color={5} />
          <Avatar name="admin" size={24} color={7} />
          <Avatar size={24} deleted />
          <Avatar size={24} color={3} />
        </Row>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="tags-chips" title="Tags und Chips" description="Schlagwörter sowie auswählbare und entfernbare Filter-Chips.">
        <Demo label="Schlagwörter (verlinkt)">
          <TagCloud tags={["postgres", "fastapi", "python", "docker"]} href={(tag) => `/tag/${tag}`} />
        </Demo>
        <Demo label="Schlagwort ohne Ziel">
          <Tag tag="meta" />
        </Demo>
        <ChipsDemo />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="formularfelder"
        title="Formularfelder"
        description="Ein leeres Formular startet neutral — Fehler und Regelverletzungen erscheinen erst nach dem Absenden oder bei Eingabe."
      >
        <Grid min="280px">
          <Demo label="Eingabe (neutral)">
            <Field label="Titel" htmlFor="g-title" hint="Maximal 120 Zeichen.">
              <TextInput id="g-title" placeholder="Worum geht es?" maxLength={120} />
            </Field>
          </Demo>
          <Demo label="Eingabe mit Zähler">
            <Field label="Titel" htmlFor="g-title2" counter="52/120">
              <TextInput id="g-title2" defaultValue="Verbindungspooling mit PgBouncer" maxLength={120} />
            </Field>
          </Demo>
          <Demo label="Fehlerzustand mit Meldung am Feld">
            <Field label="Benutzername" htmlFor="g-user" error="Dieser Benutzername ist bereits vergeben.">
              <TextInput id="g-user" defaultValue="mara" invalid />
            </Field>
          </Demo>
          <Demo label="Deaktiviert">
            <Field label="Kategorie" htmlFor="g-cat-disabled">
              <Select id="g-cat-disabled" disabled defaultValue="Backend">
                <option>Backend</option>
              </Select>
            </Field>
          </Demo>
          <Demo label="Auswahl">
            <Field label="Kategorie" htmlFor="g-cat">
              <Select id="g-cat" defaultValue="Datenbanken">
                <option>Backend</option>
                <option>Frontend</option>
                <option>Datenbanken</option>
                <option>DevOps</option>
                <option>Karriere</option>
                <option>Meta</option>
              </Select>
            </Field>
          </Demo>
          <Demo label="Auswahl klein">
            <Select size="sm" aria-label="Status" defaultValue="offen">
              <option value="offen">Offen</option>
              <option value="erledigt">Erledigt</option>
            </Select>
          </Demo>
          <Demo label="Mehrzeilige Eingabe">
            <Field label="Anmerkung (optional)" htmlFor="g-note" hint="Maximal 500 Zeichen." counter="18/500">
              <Textarea id="g-note" maxLength={500} defaultValue="Was ist das Problem?" />
            </Field>
          </Demo>
          <Demo label="Passwort mit Anzeige-Umschalter">
            <Field label="Passwort" htmlFor="g-pw">
              <PasswordInput id="g-pw" autoComplete="new-password" defaultValue="Sommer2026!" />
            </Field>
          </Demo>
          <Demo label="Passwortregeln (erfüllt, verletzt, offen)">
            <RuleList
              items={[
                { label: "mindestens 10 Zeichen", status: "ok" },
                { label: "Groß- und Kleinbuchstabe", status: "ok" },
                { label: "mindestens eine Ziffer", status: "bad" },
              ]}
            />
          </Demo>
          <Demo label="Hilfetexte">
            <Helper>Passwörter werden mit Argon2 gehasht.</Helper>
            <Helper error>Die Passwörter stimmen nicht überein.</Helper>
          </Demo>
        </Grid>

        <Demo label="Suche (Standard, groß, gefüllt, deaktiviert)">
          <div className="stack gap-2" style={{ maxWidth: 640 }}>
            <SearchBar onSubmit={(query) => setToast(`Suche nach „${query}" (Demo).`)} />
            <SearchBar
              size="lg"
              defaultValue="postgres index"
              onSubmit={(query) => setToast(`Suche nach „${query}" (Demo).`)}
            />
            <SearchBar disabled placeholder="Suche ist derzeit nicht verfügbar" />
          </div>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="tabs" title="Segmentierte Tabs" description="Ausgewählter und nicht ausgewählter Zustand; die Tabs schalten wirklich um.">
        <TabsDemo />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="paginierung" title="Paginierung" description="Erste, mittlere und letzte Seite; Zurück/Weiter sind an den Rändern deaktiviert — und schalten sonst wirklich um.">
        <PaginationDemo />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="stimmen" title="Stimmen" description="Eigene Stimme hoch/runter, neutrale und negative Punktzahl, horizontale Variante, gesperrt (eigene Inhalte) — die Klick-Vorschauen zählen wirklich.">
        <Row align="flex-start">
          <Demo label="Ohne eigene Stimme">
            <VoteDemo initialScore={41} />
          </Demo>
          <Demo label="Upvote aktiv (Klick nimmt die Stimme zurück)">
            <VoteDemo initialScore={87} initialVote={1} subject="Thread" />
          </Demo>
          <Demo label="Downvote aktiv">
            <VoteDemo initialScore={-3} initialVote={-1} subject="Thread" />
          </Demo>
          <Demo label="Null">
            <VoteDemo initialScore={0} subject="Thread" />
          </Demo>
          <Demo label="Horizontal (Kommentar)">
            <VoteDemo initialScore={12} initialVote={1} orientation="horizontal" subject="Kommentar" />
          </Demo>
          <Demo label="Gesperrt (eigener Inhalt)">
            <VoteDemo initialScore={5} disabled />
          </Demo>
          <Demo label="Interaktiv (klicken zählt)">
            <VoteDemo initialScore={10} subject="Thread" />
          </Demo>
        </Row>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="thread-karten" title="Thread-Karten" description="Angeheftet, gesperrt, entfernt, mit und ohne Tags — die Stimmen zählen in dieser Vorschau wirklich.">
        <ThreadCardDemo />
        {threadCardStates(0)}
        {threadCardStates(1)}
        <ThreadCard
          to="/threads/3"
          title="Umfrage: Welches Editor-Setup nutzt ihr 2026?"
          tags={["meta", "tooling"]}
          tagHref={(tag) => `/tag/${tag}`}
          excerpt="Die Umfrage ist beendet und der Thread wurde gesperrt — danke an alle 214 Teilnehmenden."
          score={44}
          locked
          author={{ username: "admin", color: 7 }}
          category={{ name: "Meta", href: "/category/meta" }}
          createdAtLabel="vor 5 Tagen"
          commentCount={87}
          activity={{ avatarName: "lena", avatarColor: 4, label: "vor 3 Tagen" }}
        />
        <ThreadCard
          to="/threads/4"
          title="Vite HMR bricht im Monorepo ab — Lösung mit einem shared tsconfig"
          tags={["typescript", "vite"]}
          tagHref={(tag) => `/tag/${tag}`}
          excerptHtml="Nach dem Umbau auf pnpm-Workspaces hat der Dev-Server die Änderungen im <code>ui</code>-Paket nicht mehr gesehen."
          score={33}
          myVote={-1}
          onVote={() => undefined}
          deleted
          author={{ username: "tobias", color: 6 }}
          category={{ name: "Frontend", href: "/category/frontend" }}
          createdAtLabel="vor 8 Std."
          commentCount={9}
        />
        <ThreadCard
          to="/threads/5"
          title="Ohne Tags und ohne Kategorie"
          excerpt="Auch eine Karte ohne Zusatzzeilen bleibt stabil."
          score={2}
          author={{ username: "jonas_k", color: 2 }}
        />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="kommentare"
        title="Kommentare"
        description="Verschachtelt bis Tiefe 5, mit eingeklappten Teilbäumen, gelöschten Knoten samt Antworten und dem Antwortformular. Abstimmen, Antworten und Löschen funktionieren in dieser Vorschau."
      >
        <CommentDemo onStatus={(message) => setStatusToast(message)} />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="nutzerinhalte"
        title="Nutzerinhalte (Prose)"
        description="Die Typografie für Thread- und Kommentartexte, wie thread-detail.html sie zeigt."
      >
        <Card className="reading-col">
          <Prose
            html={`<p>Ein Index ist kein Selbstzweck. Er beschleunigt das Lesen und verlangsamt jedes Schreiben.</p>
<h2>Erst messen, dann indizieren</h2>
<p>Bevor irgendein <code>CREATE INDEX</code> entsteht, lohnt ein Blick auf den tatsächlichen Plan.</p>
<pre><code>EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title FROM threads
WHERE category_id = 4
LIMIT 20;</code></pre>
<ul><li><code>(category_id, created_at DESC)</code> bedient Filter <em>und</em> Sortierung.</li>
<li>Ein Teilindex auf <code>WHERE deleted_at IS NULL</code> hält den Index klein.</li></ul>
<blockquote>Faustregel: Jeder Index, der nie in einem Plan auftaucht, ist reine Schreiblast.</blockquote>
<p>Wie geht ihr vor? <a href="https://example.com">Mehr dazu</a></p>`}
          />
        </Card>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="editor" title="Markdown-Editor" description="Schreiben- und Vorschau-Tab, Werkzeugleiste, deaktivierter Zustand.">
        <Grid min="320px">
          <Demo label="Schreiben (leer, neutral)">
            <MarkdownEditor
              value={editorValue}
              onChange={setEditorValue}
              placeholder="Schreibe eine hilfreiche Antwort…"
              ariaLabel="Kommentartext"
            />
          </Demo>
          <Demo label="Schreiben (mit Inhalt)">
            <MarkdownEditor
              value={previewText}
              onChange={setPreviewText}
              ariaLabel="Thread-Inhalt"
              size="h200"
              helper="HTML und Skripte werden entfernt."
            />
          </Demo>
          <Demo label="Vorschau-Tab">
            <MarkdownEditor
              defaultTab="preview"
              value={previewText}
              onChange={setPreviewText}
              ariaLabel="Thread-Inhalt (Vorschau)"
              renderPreview={(value) => (
                <Prose
                  html={`<p>${value
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/\n\n/g, "</p><p>")
                    .replace(/\n/g, "<br>")}</p>`}
                />
              )}
            />
          </Demo>
          <Demo label="Deaktiviert (gesperrter Thread)">
            <MarkdownEditor
              value="Dieser Thread ist gesperrt — neue Kommentare sind nicht möglich."
              onChange={() => undefined}
              disabled
              ariaLabel="Kommentartext (gesperrt)"
            />
          </Demo>
        </Grid>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="benachrichtigungen" title="Benachrichtigungen" description="Listeneinträge gelesen/ungelesen sowie der leere Zustand.">
        <Card compact className="reading-col">
          {NOTIFICATION_ITEMS.map((item) => (
            <div
              key={item.id}
              className={item.unread === true ? "notif-item notif-item--unread" : "notif-item"}
            >
              <Avatar name={item.actor?.username} size={24} color={item.actor?.color} />
              <p>
                {item.message}
                {item.detail !== undefined && (
                  <>
                    <br />
                    <span className="muted">{item.detail}</span>
                  </>
                )}
              </p>
              {item.unread === true && <span className="notif-dot" aria-hidden="true" />}
            </div>
          ))}
        </Card>
        <EmptyState title="Keine Benachrichtigungen" action={<LinkButton to="/" variant="secondary">Zur Startseite</LinkButton>}>
          Sobald jemand auf deine Inhalte antwortet, erscheint es hier.
        </EmptyState>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="hinweise" title="Hinweise und Banner" description="Info, Warnung, Fehler und die Sperr-Erinnerung.">
        <div className="stack gap-3">
          <Banner>Benachrichtigungen erscheinen nur in der Anwendung. E-Mails versenden wir bewusst nicht.</Banner>
          <Banner variant="warning">Nach dem Speichern wird der Thread als „bearbeitet" gekennzeichnet.</Banner>
          <Banner variant="danger">Benutzername oder Passwort ist falsch.</Banner>
          <BanBanner>
            Dein Konto ist bis zum 24.10.2026 gesperrt. Lesen bleibt möglich — Schreiben, Abstimmen und
            Melden sind es nicht.
          </BanBanner>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="leerzustand" title="Leerer Zustand" description="Was Listen ohne Inhalt zeigen — mit und ohne Handlungsangebot.">
        <Grid min="320px">
          <EmptyState title="Noch keine Threads">
            Sobald der erste Thread entsteht, erscheint er hier.
          </EmptyState>
          <EmptyState
            title="Keine Treffer"
            action={
              <LinkButton to="/" variant="secondary">
                Filter zurücksetzen
              </LinkButton>
            }
          >
            Versuche es mit anderen Schlagwörtern.
          </EmptyState>
        </Grid>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="ladeplatzhalter" title="Lade-Platzhalter" description="Beim Laden einer Liste oder eines Threads.">
        <Grid min="280px">
          <Card compact>
            <SkeletonText lines={4} />
          </Card>
          <Card compact>
            <Skeleton height={120} />
            <div style={{ marginTop: 12 }}>
              <SkeletonText lines={2} />
            </div>
          </Card>
        </Grid>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="toasts" title="Toasts" description="Varianten inklusive der Wartemeldung bei zu vielen Beiträgen (429).">
        <div className="stack gap-2" style={{ maxWidth: 480 }}>
          <Toast onClose={() => setToast(null)}>Entwurf gespeichert.</Toast>
          <Toast variant="success" onClose={() => setToast(null)}>
            Thread veröffentlicht.
          </Toast>
          <Toast variant="warning" onClose={() => setToast(null)}>
            Zu viele Beiträge in kurzer Zeit. Bitte warte noch <strong>42</strong> Sekunden.
          </Toast>
          <Toast variant="danger" onClose={() => setToast(null)}>
            Speichern fehlgeschlagen. Bitte erneut versuchen.
          </Toast>
          <Toast variant="info">Benachrichtigung ohne Schließen-Schaltfläche.</Toast>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="dialoge" title="Dialoge" description="Melden, Moderations-Aktion und Sperre — als echte, schließbare Dialoge.">
        <ModalDemo />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="karten" title="Karten" description="Standard, kompakt und mit Kopfzeile.">
        <Grid min="280px">
          <Card>
            <CardHead>
              <CardTitle>Konto</CardTitle>
            </CardHead>
            <StatList
              items={[
                { label: "Benutzername", value: "@mara" },
                { label: "Rolle", value: <Badge variant="role">Nutzer</Badge> },
              ]}
            />
          </Card>
          <Card compact>
            <CardHead>
              <CardTitle>Statistik</CardTitle>
            </CardHead>
            <StatList
              items={[
                { label: "Kommentare", value: 12 },
                { label: "Stimmen", value: "+87" },
                { label: "Erstellt", value: "vor 3 Std." },
              ]}
            />
          </Card>
        </Grid>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="seitenleiste" title="Seitenleiste" description="Kategorien-Navigation, Tags, aktive Nutzer und Kennzahlen.">
        <div className="layout">
          <Card>
            <CardTitle>Inhalt der Seite</CardTitle>
            <p className="muted small" style={{ marginTop: 8 }}>
              Die Seitenleiste des Designs, direkt neben der Inhaltsspalte.
            </p>
          </Card>
          <Sidebar>
            <SidebarCard heading="Kategorien">
              <CategoryNav
                activeSlug="backend"
                items={[
                  { slug: "backend", name: "Backend", href: "/category/backend", count: 44 },
                  { slug: "frontend", name: "Frontend", href: "/category/frontend", count: 31 },
                  { slug: "datenbanken", name: "Datenbanken", href: "/category/datenbanken", count: 28 },
                  { slug: "devops", name: "DevOps", href: "/category/devops", count: 21 },
                  { slug: "karriere", name: "Karriere", href: "/category/karriere", count: 16 },
                  { slug: "meta", name: "Meta", href: "/category/meta", count: 8 },
                ]}
              />
            </SidebarCard>
            <SidebarCard heading="Beliebte Tags">
              <TagCloud
                tags={["postgres", "fastapi", "python", "typescript", "docker", "react"]}
                href={(tag) => `/tag/${tag}`}
              />
            </SidebarCard>
            <SidebarCard heading="Aktive Nutzer">
              <UserList
                users={[
                  { username: "mara", karma: 248, href: "/users/mara", color: 1 },
                  { username: "lena", karma: 191, href: "/users/lena", color: 4 },
                  { username: "jonas_k", karma: 157, href: "/users/jonas_k", color: 2 },
                ]}
              />
            </SidebarCard>
            <SidebarCard heading="Statistik">
              <StatList
                items={[
                  { label: "Karma", value: 248 },
                  { label: "Threads", value: 12 },
                  { label: "Kommentare", value: 48 },
                ]}
              />
            </SidebarCard>
          </Sidebar>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section id="menues" title="Popover und Menü" description="Die aufklappenden Flächen der Chrome, einzeln — drücken öffnet und schließt sie.">
        <OverlayDemo onStatus={(message) => setStatusToast(message)} />
      </Section>

      <ToastRegion>
        {toast !== null && (
          <Toast variant="success" onClose={() => setToast(null)}>
            {toast}
          </Toast>
        )}
        {statusToast !== null && (
          <Toast variant="info" onClose={() => setStatusToast(null)}>
            {statusToast}
          </Toast>
        )}
      </ToastRegion>
    </div>
  );
}
