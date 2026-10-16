import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

interface NotificationFixture {
  id: number;
  kind: string;
  thread_id: number | null;
  comment_id: number | null;
  actor_username: string | null;
  created_at: string;
  read_at: string | null;
}

const CREATED = "2026-10-16T09:00:00Z";

const FIXTURES: NotificationFixture[] = [
  {
    id: 1,
    kind: "reply",
    thread_id: 7,
    comment_id: 42,
    actor_username: "jonas_k",
    created_at: CREATED,
    read_at: null,
  },
  {
    id: 2,
    kind: "mention",
    thread_id: 9,
    comment_id: 55,
    actor_username: "lara",
    created_at: CREATED,
    read_at: "2026-10-16T09:30:00Z",
  },
  {
    id: 3,
    kind: "subscription",
    thread_id: 11,
    comment_id: null,
    actor_username: "tom",
    created_at: CREATED,
    read_at: null,
  },
];

let unreadCount: number;
let listRequests: URL[];
let listOverride: NotificationFixture[] | null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(): void {
  unreadCount = 2;
  listRequests = [];
  listOverride = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input.toString();
      const url = new URL(raw, "http://localhost");

      if (url.pathname === "/api/notifications/unread-count") {
        return json({ count: unreadCount });
      }

      if (url.pathname === "/api/notifications/read") {
        const payload = init?.body === undefined ? {} : (JSON.parse(String(init.body)) as { ids?: number[] });
        if (payload.ids === undefined) {
          unreadCount = 0;
        } else {
          unreadCount = Math.max(0, unreadCount - payload.ids.length);
        }
        return new Response(null, { status: 204 });
      }

      if (url.pathname === "/api/notifications") {
        listRequests.push(url);
        const unreadOnly = url.searchParams.get("unread_only") === "true";
        const page = Number(url.searchParams.get("page") ?? "1");
        const source = listOverride ?? FIXTURES;
        const items = unreadOnly ? source.filter((row) => row.read_at === null) : source;
        const total = 24;
        return json({
          items: page === 1 ? items : [{ ...FIXTURES[0], id: 99 }],
          total,
          page,
          page_size: 20,
          pages: 2,
        });
      }

      return new Response(null, { status: 404 });
    }),
  );
}

function renderNotifications() {
  return render(
    <MemoryRouter initialEntries={["/notifications"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("forum notifications screen", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    installFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the notification list, links each entry and marks unread rows", async () => {
    renderNotifications();

    const reply = await screen.findByRole("link", { name: /jonas_k hat auf deinen Beitrag geantwortet/ });
    expect(reply.getAttribute("href")).toBe("/threads/7#comment-42");
    expect(reply.className).toContain("notif-item--unread");

    const subscription = screen.getByRole("link", {
      name: /Neuer Kommentar in einem abonnierten Thread/,
    });
    expect(subscription.getAttribute("href")).toBe("/threads/11");
    expect(subscription.className).toContain("notif-item--unread");

    expect(screen.getByRole("button", { name: "Alle als gelesen markieren" })).toBeTruthy();
  });

  it("shows the unread count in the header badge and drops it to zero on mark all read", async () => {
    renderNotifications();

    const bell = screen.getByRole("button", { name: "Benachrichtigungen" });
    await waitFor(() => {
      expect(within(bell.parentElement as HTMLElement).getByText("2")).toBeTruthy();
    });
    expect(await screen.findByText("2 ungelesen")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Alle als gelesen markieren" }));

    await waitFor(() => {
      expect(screen.getByText("0 ungelesen")).toBeTruthy();
    });
    await waitFor(() => {
      expect(document.querySelector(".bell-badge")).toBeNull();
    });
  });

  it("marks a single notification read when it is opened", async () => {
    renderNotifications();

    const reply = await screen.findByRole("link", { name: /jonas_k hat auf deinen Beitrag geantwortet/ });
    fireEvent.click(reply);

    const bell = screen.getByRole("button", { name: "Benachrichtigungen" });
    await waitFor(() => {
      expect(within(bell.parentElement as HTMLElement).getByText("1")).toBeTruthy();
    });
  });

  it("filters between unread and all and pages through the list", async () => {
    renderNotifications();

    await screen.findByRole("link", { name: /jonas_k/ });
    expect(listRequests[0].searchParams.get("unread_only")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Alle" }));

    await waitFor(() => {
      expect(listRequests.at(-1)?.searchParams.get("unread_only")).toBe("false");
    });
    expect(await screen.findByText("Du wurdest in einem Kommentar erwähnt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    await waitFor(() => {
      expect(listRequests.at(-1)?.searchParams.get("page")).toBe("2");
    });
    expect(await screen.findByText(/Seite 2 von 2/)).toBeTruthy();
  });

  it("renders an empty state when the unread inbox is empty", async () => {
    unreadCount = 0;
    listOverride = [];
    renderNotifications();

    expect(await screen.findByRole("heading", { name: "Keine ungelesenen Benachrichtigungen" })).toBeTruthy();
    const markAll = screen.getByRole("button", { name: "Alle als gelesen markieren" });
    expect((markAll as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks an unauthenticated visitor to sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw = typeof input === "string" ? input : input.toString();
        const url = new URL(raw, "http://localhost");
        if (url.pathname === "/api/notifications") {
          return json({ error: { code: "unauthorized", message: "Nicht angemeldet", fields: {} } }, 401);
        }
        if (url.pathname === "/api/auth/refresh") {
          return new Response(null, { status: 401 });
        }
        return new Response(null, { status: 401 });
      }),
    );

    renderNotifications();

    expect(await screen.findByRole("heading", { name: "Anmeldung erforderlich" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Anmelden" })).toBeTruthy();
  });
});
