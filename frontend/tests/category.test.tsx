import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
  } as unknown as Response;
}

const CATEGORY = {
  id: 1,
  name: "Backend",
  slug: "backend",
  description: "APIs, Services und Serverlogik.",
  position: 1,
  thread_count: 44,
};

const CATEGORIES = [
  CATEGORY,
  { id: 2, name: "Frontend", slug: "frontend", description: null, position: 2, thread_count: 31 },
];

function thread(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    category_id: 1,
    category_slug: "backend",
    category_name: "Backend",
    title: `Thread ${id}`,
    tags: ["fastapi"],
    score: id,
    comment_count: id,
    hot_score: 0,
    pinned: false,
    locked: false,
    deleted: false,
    edited_at: null,
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    author: { id: 99, username: "lena", karma: 12 },
    ...overrides,
  };
}

function threadsPage(url: URL) {
  const sort = url.searchParams.get("sort") ?? "new";
  const page = Number(url.searchParams.get("page") ?? "1");
  if (page > 1) {
    return { items: [thread(30, { title: "Thread auf Seite zwei" })], total: 44, page, page_size: 20, pages: 3 };
  }
  if (sort === "top") {
    return { items: [thread(21, { title: "Top-sortierter Thread", score: 99 })], total: 44, page, page_size: 20, pages: 3 };
  }
  if (sort === "hot") {
    return { items: [thread(22, { title: "Hot-sortierter Thread" })], total: 44, page, page_size: 20, pages: 3 };
  }
  return {
    items: [thread(11, { title: "FastAPI + SQLAlchemy 2.0" }), thread(12, { title: "Alembic-Migrationen im Team" })],
    total: 44,
    page,
    page_size: 20,
    pages: 3,
  };
}

function setupFetch(threadsOverride?: (url: URL) => unknown) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/categories") {
      return Promise.resolve(jsonResponse(CATEGORIES));
    }
    if (url.pathname === "/api/threads") {
      const body = threadsOverride !== undefined ? threadsOverride(url) : threadsPage(url);
      return Promise.resolve(jsonResponse(body));
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderCategory(path = "/category/backend") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function fetchUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe("forum category page", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the category's threads and links each to its thread page", async () => {
    setupFetch();
    renderCategory();

    expect(await screen.findByRole("heading", { name: "Backend" })).toBeTruthy();
    expect(screen.getByText("44 Threads")).toBeTruthy();

    const title = await screen.findByRole("link", { name: /FastAPI \+ SQLAlchemy/ });
    expect(title.getAttribute("href")).toBe("/threads/11");
    expect(screen.getByRole("link", { name: /Alembic-Migrationen im Team/ })).toBeTruthy();
  });

  it("requests the feed of the category in the URL", async () => {
    const fetchMock = setupFetch();
    renderCategory();

    await screen.findByRole("link", { name: /FastAPI \+ SQLAlchemy/ });
    expect(fetchUrls(fetchMock).some((url) => url.includes("/api/threads?category=backend"))).toBe(true);
  });

  it("switches between new, top and hot sort orders", async () => {
    const fetchMock = setupFetch();
    renderCategory();

    await screen.findByRole("link", { name: /FastAPI \+ SQLAlchemy/ });

    fireEvent.click(screen.getByRole("tab", { name: "Top" }));
    await screen.findByRole("link", { name: /Top-sortierter Thread/ });
    expect(fetchUrls(fetchMock).some((url) => url.includes("sort=top"))).toBe(true);
    expect(screen.getByRole("tab", { name: "Top" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Hot" }));
    await screen.findByRole("link", { name: /Hot-sortierter Thread/ });
    expect(fetchUrls(fetchMock).some((url) => url.includes("sort=hot"))).toBe(true);
  });

  it("pages through the thread feed", async () => {
    const fetchMock = setupFetch();
    renderCategory();

    await screen.findByText("Seite 1 von 3 · 44 Threads");

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    await screen.findByRole("link", { name: /Thread auf Seite zwei/ });
    await waitFor(() =>
      expect(fetchUrls(fetchMock).some((url) => url.includes("page=2"))).toBe(true),
    );
  });

  it("scopes the new-thread control to this category", async () => {
    setupFetch();
    renderCategory();

    await screen.findByRole("link", { name: /FastAPI \+ SQLAlchemy/ });

    const links = screen.getAllByRole("link", { name: "Neuer Thread" });
    expect(links.some((link) => link.getAttribute("href") === "/new-thread?category=backend")).toBe(true);
  });

  it("renders the category sidebar navigation with the current category marked", async () => {
    setupFetch();
    renderCategory();

    await screen.findByRole("link", { name: /FastAPI \+ SQLAlchemy/ });

    const sidebar = document.querySelector("aside.sidebar") as HTMLElement;
    const frontend = within(sidebar).getByRole("link", { name: /Frontend/ });
    expect(frontend.getAttribute("href")).toBe("/category/frontend");

    const backend = within(sidebar).getByRole("link", { name: /Backend/ });
    expect(backend.getAttribute("aria-current")).toBe("page");
  });

  it("shows an empty state when the category has no threads", async () => {
    setupFetch(() => ({ items: [], total: 0, page: 1, page_size: 20, pages: 0 }));
    renderCategory();

    expect(await screen.findByRole("heading", { name: "Noch keine Threads" })).toBeTruthy();
  });

  it("shows a not-found state for an unknown category", async () => {
    setupFetch();
    renderCategory("/category/unbekannt");

    expect(await screen.findByRole("heading", { name: "Kategorie nicht gefunden" })).toBeTruthy();
  });
});
