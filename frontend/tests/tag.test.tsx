import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

interface ThreadAuthor {
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
  author: ThreadAuthor;
}

interface PageBody {
  items: ThreadSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

const CATEGORIES = [
  { id: 1, name: "Backend", slug: "backend", description: null, position: 0, thread_count: 44 },
  { id: 2, name: "Frontend", slug: "frontend", description: null, position: 1, thread_count: 31 },
];

function makeThread(id: number, overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id,
    category_id: 1,
    category_slug: "backend",
    category_name: "Backend",
    title: `Thread ${id}`,
    tags: ["fastapi", "python"],
    score: 41,
    comment_count: 18,
    hot_score: 1.5,
    pinned: false,
    locked: false,
    deleted: false,
    edited_at: null,
    created_at: new Date(Date.now() - 40 * 60_000).toISOString(),
    author: { id: 2, username: "lena", karma: 12 },
    ...overrides,
  };
}

function pageFor(url: URL): PageBody {
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("page_size") ?? "20");
  const items = Array.from({ length: pageSize }, (_, index) =>
    makeThread((page - 1) * pageSize + index + 1),
  );
  return { items, total: 45, page, page_size: pageSize, pages: 3 };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

function renderTag(path = "/tag/fastapi") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function threadRequests(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes("/api/threads?"));
}

describe("forum tag page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const path = url.pathname + url.search;
      if (url.pathname === "/api/categories") {
        return Promise.resolve(jsonResponse(CATEGORIES));
      }
      if (url.pathname === "/api/me") {
        return Promise.resolve(
          jsonResponse({
            id: 99,
            username: "mara",
            email: "mara@forum.test",
            bio: null,
            role: "user",
            karma: 3,
            created_at: new Date().toISOString(),
          }),
        );
      }
      if (/^\/api\/threads\/\d+\/vote$/.test(url.pathname)) {
        return Promise.resolve(jsonResponse({ score: 42, my_vote: 1 }));
      }
      if (path.startsWith("/api/threads?")) {
        return Promise.resolve(jsonResponse(pageFor(url)));
      }
      return Promise.resolve(
        jsonResponse({ error: { code: "not_found", message: "Nicht gefunden", fields: {} } }, 404),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the threads carrying the tag and links each one at its thread route", async () => {
    renderTag();

    expect(await screen.findByRole("heading", { name: "#fastapi" })).toBeTruthy();
    const firstTitle = await screen.findByRole("link", { name: "Thread 1" });
    expect(firstTitle.getAttribute("href")).toBe("/threads/1");
    expect(screen.getByText("Thread 2")).toBeTruthy();

    const requested = threadRequests(fetchMock);
    expect(requested[0]).toContain("tag=fastapi");
    expect(requested[0]).toContain("sort=new");
  });

  it("shows the tag sidebar with related tags, categories and the composer shortcut", async () => {
    renderTag();

    expect(await screen.findByRole("heading", { name: "#fastapi" })).toBeTruthy();

    const tagsCard = screen.getByText("Tags").closest(".sidebar-card") as HTMLElement;
    const python = within(tagsCard).getByRole("link", { name: "#python" });
    expect(python.getAttribute("href")).toBe("/tag/python");
    expect(within(tagsCard).queryByRole("link", { name: "#fastapi" })).toBeNull();

    const categoriesCard = (await screen.findByText("Kategorien")).closest(
      ".sidebar-card",
    ) as HTMLElement;
    const backend = within(categoriesCard).getByRole("link", { name: /Backend/ });
    expect(backend.getAttribute("href")).toBe("/category/backend");

    const composer = screen.getByRole("link", { name: "Thread mit #fastapi schreiben" });
    expect(composer.getAttribute("href")).toBe("/new-thread");
  });

  it("switches the sort order and resets to the first page", async () => {
    renderTag();
    await screen.findByRole("link", { name: "Thread 1" });

    fireEvent.click(screen.getByRole("tab", { name: "Top" }));

    await waitFor(() => {
      expect(threadRequests(fetchMock).some((url) => url.includes("sort=top"))).toBe(true);
    });
  });

  it("pages through the feed and keeps the total in the info line", async () => {
    renderTag();
    await screen.findByRole("link", { name: "Thread 1" });

    expect(screen.getByText("Seite 1 von 3 · 45 Threads")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    await waitFor(() => {
      expect(threadRequests(fetchMock).some((url) => url.includes("page=2"))).toBe(true);
    });
    expect(await screen.findByText("Seite 2 von 3 · 45 Threads")).toBeTruthy();
  });

  it("renders an empty state when the tag has no threads", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/categories") return Promise.resolve(jsonResponse(CATEGORIES));
      if (url.pathname === "/api/threads") {
        return Promise.resolve(
          jsonResponse({ items: [], total: 0, page: 1, page_size: 20, pages: 0 }),
        );
      }
      return Promise.resolve(jsonResponse({ items: [], total: 0, page: 1, page_size: 20, pages: 0 }));
    });

    renderTag();

    expect(await screen.findByRole("heading", { name: "Keine Threads" })).toBeTruthy();
  });

  it("shows a readable error with a working retry", async () => {
    let attempt = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/categories") return Promise.resolve(jsonResponse(CATEGORIES));
      if (url.pathname === "/api/threads") {
        attempt += 1;
        if (attempt === 1) {
          return Promise.resolve(
            jsonResponse(
              { error: { code: "server_error", message: "Interner Fehler", fields: {} } },
              500,
            ),
          );
        }
        return Promise.resolve(jsonResponse(pageFor(url)));
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    renderTag();

    expect(await screen.findByText("Interner Fehler")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByRole("link", { name: "Thread 1" })).toBeTruthy();
  });

  it("keeps the vote control disabled for a signed-out visitor", async () => {
    renderTag();
    await screen.findByRole("link", { name: "Thread 1" });

    const card = screen.getByRole("link", { name: "Thread 1" }).closest("article") as HTMLElement;
    const upvote = within(card).getByRole("button", { name: "Thread upvoten" });
    expect((upvote as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends an upvote for a signed-in visitor and shows the new score", async () => {
    localStorage.setItem(
      "forum-session",
      JSON.stringify({
        access_token: "test-token",
        user: {
          id: 99,
          username: "mara",
          email: "mara@forum.test",
          bio: null,
          role: "user",
          karma: 3,
          created_at: new Date().toISOString(),
        },
      }),
    );
    renderTag();

    const title = await screen.findByRole("link", { name: "Thread 1" });
    const card = title.closest("article") as HTMLElement;
    expect(within(card).getByText("+41")).toBeTruthy();

    fireEvent.click(within(card).getByRole("button", { name: "Thread upvoten" }));

    await waitFor(() => {
      const voteCall = fetchMock.mock.calls.find((call) =>
        /\/api\/threads\/1\/vote$/.test(String(call[0])),
      );
      expect(voteCall).toBeTruthy();
    });
    expect(await within(card).findByText("+42")).toBeTruthy();
  });
});
