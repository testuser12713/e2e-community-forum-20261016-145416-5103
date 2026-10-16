import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../src/context/AuthContext";
import EditThread from "../src/pages/EditThread";

const USER = {
  id: 1,
  username: "demo",
  email: "demo@forum.test",
  bio: null,
  role: "user",
  karma: 3,
  created_at: "2026-01-01T00:00:00Z",
};

const THREAD = {
  id: 7,
  category_id: 2,
  category_slug: "datenbanken",
  category_name: "Datenbanken",
  title: "PostgreSQL Indizes richtig einsetzen",
  tags: ["postgres", "performance"],
  score: 5,
  comment_count: 2,
  hot_score: 1.5,
  pinned: false,
  locked: false,
  deleted: false,
  edited_at: null,
  created_at: "2026-01-01T00:00:00Z",
  author: { id: 1, username: "demo", karma: 3 },
  body_markdown: "Erst messen, dann indizieren.",
  body_html: "<p>Erst messen, dann indizieren.</p>",
};

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
  } as unknown as Response;
}

function seedSession(user: typeof USER) {
  localStorage.setItem("forum-session", JSON.stringify({ access_token: "token", user }));
}

interface FetchRoutes {
  user?: unknown;
  thread?: unknown;
  patch?: (init: RequestInit) => Response;
}

function stubFetch(routes: FetchRoutes) {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.endsWith("/api/me")) {
      return makeResponse(200, routes.user ?? USER);
    }
    if (url.endsWith("/api/threads/7") && method === "PATCH") {
      return routes.patch?.(init ?? {}) ?? makeResponse(200, THREAD);
    }
    if (url.endsWith("/api/threads/7") && method === "GET") {
      return makeResponse(200, routes.thread ?? THREAD);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={["/threads/7/edit"]}>
      <AuthProvider>
        <Routes>
          <Route path="/threads/:id/edit" element={<EditThread />} />
          <Route path="/threads/:id" element={<h1>Thread-Seite</h1>} />
          <Route path="/login" element={<h1>Anmelden</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("edit-thread screen", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("prefills the form from the thread and saves changes, then returns to the thread", async () => {
    seedSession(USER);
    const fetchMock = stubFetch({});
    renderEdit();

    const titleInput = await screen.findByLabelText("Titel");
    expect((titleInput as HTMLInputElement).value).toBe(THREAD.title);
    const bodyTextarea = screen.getByLabelText("Thread-Inhalt");
    expect((bodyTextarea as HTMLTextAreaElement).value).toBe(THREAD.body_markdown);

    fireEvent.change(titleInput, { target: { value: "Überarbeiteter Titel" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));

    await screen.findByRole("heading", { name: "Thread-Seite" });

    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/api/threads/7") &&
        (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    const sentBody = JSON.parse((patchCall?.[1] as RequestInit).body as string);
    expect(sentBody.title).toBe("Überarbeiteter Titel");
    expect(sentBody.body_markdown).toBe(THREAD.body_markdown);
    expect(sentBody.tags).toEqual(THREAD.tags);
  });

  it("does not reach the screen for a signed-out visitor", async () => {
    stubFetch({});
    renderEdit();

    expect(await screen.findByRole("heading", { name: "Anmelden" })).toBeTruthy();
    expect(screen.queryByLabelText("Titel")).toBeNull();
  });

  it("sends a non-author back to the thread", async () => {
    seedSession(USER);
    stubFetch({ thread: { ...THREAD, author: { id: 2, username: "other", karma: 1 } } });
    renderEdit();

    expect(await screen.findByRole("heading", { name: "Thread-Seite" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Änderungen speichern" })).toBeNull();
  });

  it("rejects a too-short title before contacting the API", async () => {
    seedSession(USER);
    const fetchMock = stubFetch({});
    renderEdit();

    const titleInput = await screen.findByLabelText("Titel");
    fireEvent.change(titleInput, { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));

    expect(await screen.findByText("Der Titel braucht mindestens 3 Zeichen.")).toBeTruthy();
    const patchCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCalls).toHaveLength(0);
  });

  it("shows a readable message when the server rejects the save", async () => {
    seedSession(USER);
    stubFetch({
      patch: () =>
        makeResponse(
          403,
          { error: { code: "forbidden", message: "Du darfst nur eigene Threads bearbeiten." } },
        ),
    });
    renderEdit();

    await screen.findByLabelText("Titel");
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));

    expect(
      await screen.findByText("Du darfst nur eigene Threads bearbeiten."),
    ).toBeTruthy();
  });

  it("adds and removes tags as chips", async () => {
    seedSession(USER);
    stubFetch({});
    renderEdit();

    await screen.findByLabelText("Titel");
    const tagInput = screen.getByLabelText("Schlagwörter");
    fireEvent.change(tagInput, { target: { value: "neu" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });

    expect(screen.getByText("#neu")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Schlagwort neu entfernen" }));
    await waitFor(() => expect(screen.queryByText("#neu")).toBeNull());
  });
});
