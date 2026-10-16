import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Search, { formatRelativeTime, type SearchResult } from "../src/pages/Search";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";

const apiFetchMock = apiFetch as unknown as ReturnType<typeof vi.fn>;

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

function makeThread(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 1,
    category_id: 1,
    category_slug: "general",
    category_name: "Allgemein",
    title: "PostgreSQL Indizes richtig einsetzen",
    tags: ["postgres"],
    score: 12,
    comment_count: 3,
    pinned: false,
    locked: false,
    deleted: false,
    created_at: new Date().toISOString(),
    author: { id: 1, username: "mara", karma: 42 },
    ...overrides,
  };
}

function makePage(items: SearchResult[]): Page<SearchResult> {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 20,
    pages: items.length > 0 ? 1 : 0,
  };
}

const CATEGORIES = [
  { id: 1, name: "Backend", slug: "backend" },
  { id: 2, name: "Datenbanken", slug: "datenbanken" },
];

function renderSearch(path = "/search?q=postgres") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Search />
    </MemoryRouter>,
  );
}

function mockApi(searchPage: Page<SearchResult>) {
  apiFetchMock.mockImplementation((path: string) => {
    if (path.startsWith("/api/categories")) return Promise.resolve(CATEGORIES);
    if (path.startsWith("/api/search")) return Promise.resolve(searchPage);
    return Promise.reject(new Error(`unexpected request: ${path}`));
  });
}

describe("forum search screen", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("lists the matches of the query and links each to its thread page", async () => {
    mockApi(makePage([makeThread({ id: 7, title: "PostgreSQL Index Leitfaden" })]));

    renderSearch("/search?q=postgres");

    const link = await screen.findByRole("link", { name: /PostgreSQL Index Leitfaden/ });
    expect(link.getAttribute("href")).toBe("/threads/7");
    expect(screen.getByText(/1 Treffer für „postgres“/)).toBeTruthy();

    const searchCall = apiFetchMock.mock.calls.find((call) =>
      String(call[0]).startsWith("/api/search"),
    );
    expect(searchCall).toBeTruthy();
    expect(String(searchCall?.[0])).toContain("q=postgres");
  });

  it("shows the no-result state when the query matches nothing", async () => {
    mockApi(makePage([]));

    renderSearch("/search?q=schneeeule");

    expect(await screen.findByRole("heading", { name: "Keine Treffer" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /PostgreSQL/ })).toBeNull();
  });

  it("starts on a prompt and does not search while the query is empty", async () => {
    mockApi(makePage([]));

    renderSearch("/search");
    await act(async () => {});

    expect(screen.getByRole("heading", { name: "Wonach suchst du?" })).toBeTruthy();
    const searchCalls = apiFetchMock.mock.calls.filter((call) =>
      String(call[0]).startsWith("/api/search"),
    );
    expect(searchCalls).toHaveLength(0);
  });

  it("narrows the search by category and tag", async () => {
    mockApi(makePage([makeThread()]));

    renderSearch("/search?q=postgres");

    const select = await screen.findByLabelText("Kategorie");
    fireEvent.change(select, { target: { value: "backend" } });

    const tagInput = screen.getByLabelText("Schlagwort");
    fireEvent.change(tagInput, { target: { value: "postgres" } });
    fireEvent.submit(tagInput.closest("form") as HTMLFormElement);
    await act(async () => {});

    const lastSearch = () =>
      String(
        apiFetchMock.mock.calls
          .filter((call) => String(call[0]).startsWith("/api/search"))
          .at(-1)?.[0],
      );

    expect(lastSearch()).toContain("category=backend");
    expect(lastSearch()).toContain("tag=postgres");
  });

  it("resets the active filters", async () => {
    mockApi(makePage([makeThread()]));

    renderSearch("/search?q=postgres&category=backend&tag=postgres");

    expect(await screen.findByText(/Kategorie: Backend/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    await act(async () => {});

    expect(screen.queryByText(/Kategorie: Backend/)).toBeNull();
    const lastSearch = String(
      apiFetchMock.mock.calls
        .filter((call) => String(call[0]).startsWith("/api/search"))
        .at(-1)?.[0],
    );
    expect(lastSearch).not.toContain("category=");
    expect(lastSearch).not.toContain("tag=");
  });

  it("shows the loading placeholders before the results arrive", async () => {
    let resolveSearch: (value: Page<SearchResult>) => void = () => undefined;
    const pending = new Promise<Page<SearchResult>>((resolve) => {
      resolveSearch = resolve;
    });
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("/api/categories")) return Promise.resolve(CATEGORIES);
      return pending;
    });

    renderSearch("/search?q=postgres");

    expect(await screen.findByLabelText("Suche läuft")).toBeTruthy();

    await act(async () => {
      resolveSearch(makePage([makeThread({ id: 3, title: "Index-Tuning" })]));
    });
    expect(await screen.findByRole("link", { name: /Index-Tuning/ })).toBeTruthy();
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");

  it("formats recent timestamps in German", () => {
    expect(formatRelativeTime("2026-10-16T11:59:30Z", now)).toBe("gerade eben");
    expect(formatRelativeTime("2026-10-16T11:30:00Z", now)).toBe("vor 30 Min.");
    expect(formatRelativeTime("2026-10-16T09:00:00Z", now)).toBe("vor 3 Std.");
    expect(formatRelativeTime("2026-10-14T12:00:00Z", now)).toBe("vor 2 Tagen");
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
