import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

const DEMO_USER = {
  id: 10,
  username: "demo",
  email: "demo@forum.test",
  bio: null,
  role: "user",
  karma: 5,
  created_at: "2026-10-16T09:00:00Z",
};

const MODERATOR_USER = { ...DEMO_USER, id: 11, username: "moderator", role: "moderator" };

interface MockState {
  thread: Record<string, unknown>;
  comments: Record<string, unknown>[];
  user: typeof DEMO_USER;
  rateLimited: boolean;
  subscription: boolean;
}

let state: MockState;

function makeThread(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    category_id: 1,
    category_slug: "backend",
    category_name: "Backend",
    title: "PostgreSQL Indizes richtig einsetzen",
    tags: ["postgres", "performance"],
    score: 10,
    comment_count: 3,
    hot_score: 1.2,
    pinned: false,
    locked: false,
    deleted: false,
    edited_at: null,
    created_at: "2026-10-16T09:14:00Z",
    author: { id: 2, username: "mara", karma: 248 },
    body_markdown: "# Hallo",
    body_html: "<h2>Erst messen</h2><p>Index Körper</p>",
    ...overrides,
  };
}

function makeComments(): Record<string, unknown>[] {
  return [
    {
      id: 11,
      thread_id: 1,
      parent_id: null,
      depth: 1,
      body_markdown: "Fremder Kommentar",
      body_html: "<p>Fremder Kommentar</p>",
      score: 3,
      my_vote: 0,
      deleted: false,
      edited_at: null,
      created_at: "2026-10-16T10:00:00Z",
      author: { id: 3, username: "tobias", karma: 12 },
      children: [
        {
          id: 12,
          thread_id: 1,
          parent_id: 11,
          depth: 2,
          body_markdown: "Mein Kommentar",
          body_html: "<p>Mein Kommentar</p>",
          score: 1,
          my_vote: 0,
          deleted: false,
          edited_at: null,
          created_at: "2026-10-16T10:05:00Z",
          author: { id: 10, username: "demo", karma: 5 },
          children: [
            {
              id: 13,
              thread_id: 1,
              parent_id: 12,
              depth: 3,
              body_markdown: "Antwort auf meinen Kommentar",
              body_html: "<p>Antwort auf meinen Kommentar</p>",
              score: 0,
              my_vote: 0,
              deleted: false,
              edited_at: null,
              created_at: "2026-10-16T10:06:00Z",
              author: { id: 4, username: "lena", karma: 7 },
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state.thread)) {
    if (key !== "body_markdown" && key !== "body_html") copy[key] = value;
  }
  return { ...copy, ...overrides };
}

function handler(input: RequestInfo | URL, init?: RequestInit): Promise<Response> | Response {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};

  if (path === "/api/me") return jsonResponse(state.user);
  if (path === "/api/threads/1" && method === "GET") return jsonResponse(state.thread);
  if (path === "/api/threads/1/comments" && method === "GET") {
    return jsonResponse({
      items: state.comments,
      total: state.comments.length,
      page: 1,
      page_size: 20,
      pages: 1,
    });
  }
  if (path === "/api/categories") {
    return jsonResponse([
      { id: 1, name: "Backend", slug: "backend", description: null, position: 0, thread_count: 5 },
      { id: 2, name: "Frontend", slug: "frontend", description: null, position: 1, thread_count: 2 },
    ]);
  }
  if (path.startsWith("/api/users/")) {
    return jsonResponse({
      username: "mara",
      bio: "Backend-Entwicklerin.",
      karma: 248,
      created_at: "2026-01-01T00:00:00Z",
    });
  }
  if (path === "/api/threads" && method === "GET") {
    return jsonResponse({ items: [], total: 0, page: 1, page_size: 5, pages: 0 });
  }
  if (path === "/api/threads/1/subscription" && method === "GET") {
    return jsonResponse({ subscribed: state.subscription });
  }
  if (path === "/api/threads/1/subscription" && (method === "POST" || method === "DELETE")) {
    state.subscription = method === "POST";
    return new Response(null, { status: 204 });
  }
  if (path === "/api/threads/1/vote" && method === "PUT") {
    if (state.rateLimited) {
      return new Response(
        JSON.stringify({ error: { code: "rate_limited", message: "Too many writes" } }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "30" } },
      );
    }
    return jsonResponse({ score: 11, my_vote: body.value });
  }
  if (path.startsWith("/api/comments/") && path.endsWith("/vote") && method === "PUT") {
    return jsonResponse({ score: 4, my_vote: body.value });
  }
  if (path === "/api/threads/1/comments" && method === "POST") {
    return jsonResponse(
      {
        id: 99,
        thread_id: 1,
        parent_id: body.parent_id ?? null,
        depth: body.parent_id === null ? 1 : 2,
        body_markdown: body.body_markdown,
        body_html: `<p>${String(body.body_markdown)}</p>`,
        score: 0,
        my_vote: 0,
        deleted: false,
        edited_at: null,
        created_at: "2026-10-16T11:00:00Z",
        author: { id: state.user.id, username: state.user.username, karma: state.user.karma },
        children: [],
      },
      201,
    );
  }
  if (path.startsWith("/api/comments/") && method === "PATCH") {
    return jsonResponse({
      id: 12,
      thread_id: 1,
      parent_id: 11,
      depth: 2,
      body_markdown: body.body_markdown,
      body_html: `<p>${String(body.body_markdown)}</p>`,
      score: 1,
      my_vote: 0,
      deleted: false,
      edited_at: "2026-10-16T11:30:00Z",
      created_at: "2026-10-16T10:05:00Z",
      author: { id: 10, username: "demo", karma: 5 },
      children: [],
    });
  }
  if (path.startsWith("/api/comments/") && method === "DELETE") {
    return new Response(null, { status: 204 });
  }
  if (path === "/api/reports" && method === "POST") {
    return jsonResponse(
      {
        id: 5,
        content_type: body.content_type,
        content_id: body.content_id,
        reason: body.reason,
        note: body.note ?? null,
        status: "open",
        created_at: "2026-10-16T11:40:00Z",
        reporter_username: state.user.username,
        content_excerpt: "…",
        content_url: "/threads/1",
      },
      201,
    );
  }
  if (path === "/api/admin/threads/1/pin" && method === "POST") {
    return jsonResponse(summary({ pinned: body.pinned === true }));
  }
  if (path === "/api/admin/threads/1/lock" && method === "POST") {
    state.thread = makeThread({ ...state.thread, locked: body.locked === true });
    return jsonResponse(summary({ locked: body.locked === true }));
  }
  if (path === "/api/admin/threads/1/move" && method === "POST") {
    return jsonResponse(summary({ category_id: body.category_id, category_name: "Frontend" }));
  }
  if (path === "/api/admin/threads/1" && method === "DELETE") {
    return new Response(null, { status: 204 });
  }
  return jsonResponse({ error: { code: "not_found", message: `No mock for ${method} ${path}` } }, 404);
}

function seedSession(user = DEMO_USER) {
  localStorage.setItem("forum-session", JSON.stringify({ access_token: "test-token", user }));
}

function renderThread() {
  return render(
    <MemoryRouter initialEntries={["/threads/1"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  state = {
    thread: makeThread(),
    comments: makeComments(),
    user: DEMO_USER,
    rateLimited: false,
    subscription: false,
  };
  vi.stubGlobal("fetch", vi.fn(handler));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forum thread page", () => {
  it("renders the thread, its prose body and the nested comment tree", async () => {
    seedSession();
    renderThread();

    await screen.findByRole("heading", { name: /PostgreSQL Indizes richtig einsetzen/ });
    expect(screen.getByRole("heading", { name: "Erst messen" })).toBeTruthy();
    expect(screen.getAllByText("Backend").length).toBeGreaterThan(0);
    expect(screen.getByText("#postgres")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Antworten (3)" })).toBeTruthy();
    expect(await screen.findByText("Fremder Kommentar")).toBeTruthy();
    expect(screen.getByText("Mein Kommentar")).toBeTruthy();
    expect(screen.getByText("Antwort auf meinen Kommentar")).toBeTruthy();
  });

  it("upvotes the thread and shows the new score immediately", async () => {
    seedSession();
    renderThread();

    await screen.findByRole("heading", { name: /PostgreSQL Indizes/ });
    fireEvent.click(screen.getByRole("button", { name: "Thread upvoten" }));

    const voteControl = screen
      .getByRole("button", { name: "Thread upvoten" })
      .closest(".vote-control") as HTMLElement;
    await waitFor(() => expect(within(voteControl).getByText("+11")).toBeTruthy());
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => String(url).endsWith("/api/threads/1/vote") && init?.method === "PUT");
    expect(call).toBeTruthy();
  });

  it("replies to a foreign comment and shows the new reply", async () => {
    seedSession();
    renderThread();

    await screen.findByText("Fremder Kommentar");
    fireEvent.click(screen.getAllByRole("button", { name: "Antworten" })[0]);
    const textarea = screen.getByLabelText("Antwort");
    fireEvent.change(textarea, { target: { value: "Danke für den Hinweis!" } });
    fireEvent.click(screen.getByRole("button", { name: "Antwort senden" }));

    expect(await screen.findByText("Danke für den Hinweis!")).toBeTruthy();
  });

  it("edits the user's own comment and marks it as edited", async () => {
    seedSession();
    renderThread();

    await screen.findByText("Mein Kommentar");
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));

    const dialog = await screen.findByRole("dialog", { name: "Kommentar bearbeiten" });
    const box = within(dialog).getByLabelText("Kommentar bearbeiten");
    fireEvent.change(box, { target: { value: "Bearbeitet!" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Bearbeitet!")).toBeTruthy();
    expect(screen.getByText(/bearbeitet/)).toBeTruthy();
  });

  it("soft-deletes the user's own comment but keeps its replies", async () => {
    seedSession();
    renderThread();

    await screen.findByText("Mein Kommentar");
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));

    expect(await screen.findByText("Der Kommentar wurde entfernt.")).toBeTruthy();
    expect(screen.getByText("Antwort auf meinen Kommentar")).toBeTruthy();
  });

  it("reports a foreign comment through the dialog", async () => {
    seedSession();
    renderThread();

    await screen.findByText("Fremder Kommentar");
    fireEvent.click(screen.getAllByRole("button", { name: "Melden" })[1]);

    const dialog = await screen.findByRole("dialog", { name: "Inhalt melden" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Meldung senden" }));

    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([url]) => String(url).endsWith("/api/reports"));
      expect(call).toBeTruthy();
      expect(JSON.parse(call![1]?.body as string)).toMatchObject({
        content_type: "comment",
        content_id: 11,
      });
    });
  });

  it("toggles the subscription and reflects the new state", async () => {
    seedSession();
    renderThread();

    const subscribe = await screen.findByRole("button", { name: "Abonnieren" });
    fireEvent.click(subscribe);

    expect(await screen.findByRole("button", { name: "Abonniert" })).toBeTruthy();
  });

  it("shows the wait message when a write is rate limited", async () => {
    seedSession();
    state.rateLimited = true;
    renderThread();

    await screen.findByRole("heading", { name: /PostgreSQL Indizes/ });
    fireEvent.click(screen.getByRole("button", { name: "Thread upvoten" }));

    expect(await screen.findByText(/Zu viele Schreibvorgänge in kurzer Zeit/)).toBeTruthy();
    expect(screen.getByText(/30 Sekunden/)).toBeTruthy();
  });

  it("hides the moderator toolbar from a regular user", async () => {
    seedSession();
    renderThread();

    await screen.findByRole("heading", { name: /PostgreSQL Indizes/ });
    expect(screen.queryByText("Moderation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sperren" })).toBeNull();
  });

  it("locks a thread through the moderator toolbar", async () => {
    seedSession(MODERATOR_USER);
    state.user = MODERATOR_USER;
    renderThread();

    expect(await screen.findByText("Moderation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sperren" }));

    expect(await screen.findByRole("button", { name: "Entsperren" })).toBeTruthy();
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/api/admin/threads/1/lock"));
    expect(call).toBeTruthy();
  });

  it("links the author's own thread to its edit screen", async () => {
    seedSession();
    state.thread = makeThread({ author: { id: 10, username: "demo", karma: 5 } });
    renderThread();

    await screen.findByRole("heading", { name: /PostgreSQL Indizes/ });
    const edit = screen.getByRole("link", { name: "Bearbeiten" });
    expect(edit.getAttribute("href")).toBe("/threads/1/edit");
  });
});
