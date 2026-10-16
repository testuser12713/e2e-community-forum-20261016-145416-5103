import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

type Json = Record<string, unknown> | unknown[];

interface MockResponse {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<Json>;
}

function okJson(body: Json): MockResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

const BACKEND = { id: 1, name: "Backend", slug: "backend", description: null, position: 1, thread_count: 2 };
const FRONTEND = { id: 2, name: "Frontend", slug: "frontend", description: null, position: 2, thread_count: 1 };
const DATENBANKEN = {
  id: 3,
  name: "Datenbanken",
  slug: "datenbanken",
  description: null,
  position: 3,
  thread_count: 0,
};
const CATEGORIES = [BACKEND, FRONTEND, DATENBANKEN];

function makeThread(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    category_id: BACKEND.id,
    category_slug: BACKEND.slug,
    category_name: BACKEND.name,
    title: `Thread ${id}`,
    tags: ["fastapi"],
    score: 10,
    comment_count: 3,
    hot_score: 1,
    pinned: false,
    locked: false,
    deleted: false,
    edited_at: null,
    created_at: new Date().toISOString(),
    author: { id: 100 + id, username: `user${id}`, karma: 5 },
    ...overrides,
  };
}

const PINNED = makeThread(1, {
  title: "PostgreSQL Indizes richtig einsetzen",
  tags: ["postgres", "performance"],
  score: 87,
  comment_count: 42,
  pinned: true,
});
const SECOND = makeThread(2, { title: "FastAPI async oder sync", score: 41, comment_count: 18 });
const THIRD = makeThread(3, {
  title: "Vite HMR im Monorepo",
  score: 33,
  comment_count: 9,
  category_id: FRONTEND.id,
  category_slug: FRONTEND.slug,
  category_name: FRONTEND.name,
});

const NEW_ORDER = [PINNED, SECOND, THIRD];
const TOP_ORDER = [PINNED, THIRD, SECOND];

function page(items: Record<string, unknown>[], pageNumber: number, total: number, pages: number) {
  return { items, total, page: pageNumber, page_size: 20, pages };
}

function threadTitles(): string[] {
  return Array.from(document.querySelectorAll(".thread-title")).map((node) => node.textContent ?? "");
}

let fetchMock: ReturnType<typeof vi.fn>;

function installFetch() {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/categories") return okJson(CATEGORIES);
    if (url.pathname === "/api/threads") {
      const sort = url.searchParams.get("sort") ?? "new";
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      const category = url.searchParams.get("category");
      if (category === FRONTEND.slug) return okJson(page([THIRD], 1, 1, 1));
      if (pageNumber === 2) return okJson(page([SECOND], 2, 42, 3));
      return okJson(page(sort === "top" ? TOP_ORDER : NEW_ORDER, pageNumber, 42, 3));
    }
    return okJson({ error: { code: "not_found", message: "not found", fields: {} } });
  });
}

function renderHome(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("forum home page", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    installFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the categories in the order the API returns them", async () => {
    renderHome();

    const nav = await screen.findByRole("navigation", { name: "Kategorien" });
    await waitFor(() => {
      expect(within(nav).getAllByRole("link").length).toBe(CATEGORIES.length);
    });

    const hrefs = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/category/backend", "/category/frontend", "/category/datenbanken"]);
  });

  it("shows the thread list with pinned state, score and comment count", async () => {
    renderHome();

    const title = await screen.findByRole("link", { name: PINNED.title as string });
    expect(title.getAttribute("href")).toBe("/threads/1");
    expect(screen.getAllByText("Angeheftet").length).toBeGreaterThan(0);
    expect(screen.getByText("+87")).toBeTruthy();
    expect(screen.getByText("42 Kommentare")).toBeTruthy();
  });

  it("reorders the list when the top sort is selected and refetches with sort=top", async () => {
    renderHome();
    await screen.findByRole("link", { name: SECOND.title as string });

    const before = threadTitles();
    expect(before.indexOf(SECOND.title as string)).toBeLessThan(before.indexOf(THIRD.title as string));

    fireEvent.click(screen.getByRole("tab", { name: "Top" }));

    await waitFor(() => {
      const called = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(called.some((url) => url.includes("sort=top"))).toBe(true);
    });

    await waitFor(() => {
      const after = threadTitles();
      expect(after.indexOf(THIRD.title as string)).toBeLessThan(after.indexOf(SECOND.title as string));
    });
  });

  it("moves through the list with the page controls", async () => {
    renderHome();
    await screen.findByRole("link", { name: SECOND.title as string });

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    await waitFor(() => {
      const called = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(called.some((url) => url.includes("page=2"))).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: PINNED.title as string })).toBeNull();
      expect(screen.getByRole("link", { name: SECOND.title as string })).toBeTruthy();
    });
  });

  it("uses the category query parameter to filter the feed", async () => {
    renderHome("/?category=frontend");
    await screen.findByRole("link", { name: THIRD.title as string });

    await waitFor(() => {
      const called = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(called.some((url) => url.includes("category=frontend"))).toBe(true);
    });

    expect(screen.queryByRole("link", { name: PINNED.title as string })).toBeNull();
    expect(screen.getByText("Kategorie: Frontend")).toBeTruthy();
  });

  it("renders the kit empty state when there are no threads", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/categories") return okJson(CATEGORIES);
      if (url.pathname === "/api/threads") return okJson(page([], 1, 0, 0));
      return okJson({ error: { code: "not_found", message: "not found", fields: {} } });
    });

    renderHome();

    expect(await screen.findByRole("heading", { name: "Noch keine Threads" })).toBeTruthy();
  });

  it("renders the kit error state and retries the request", async () => {
    let failing = true;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/categories") return okJson(CATEGORIES);
      if (url.pathname === "/api/threads") {
        if (failing) {
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: { get: () => null },
            json: () => Promise.resolve({ error: { code: "server_error", message: "boom", fields: {} } }),
          } satisfies MockResponse);
        }
        return okJson(page(NEW_ORDER, 1, 3, 1));
      }
      return okJson({ error: { code: "not_found", message: "not found", fields: {} } });
    });

    renderHome();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Die Threads konnten nicht geladen werden.")).toBeTruthy();

    failing = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByRole("link", { name: PINNED.title as string })).toBeTruthy();
  });
});
