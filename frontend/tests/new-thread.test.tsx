import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewThread from "../src/pages/NewThread";

const CATEGORIES = [
  { id: 1, name: "Backend", slug: "backend", description: "", position: 1, thread_count: 4 },
  { id: 2, name: "Frontend", slug: "frontend", description: "", position: 2, thread_count: 2 },
];

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function errorBody(code: string, message: string, fields: Record<string, string> = {}) {
  return { error: { code, message, fields } };
}

function renderComposer() {
  return render(
    <MemoryRouter initialEntries={["/new-thread"]}>
      <Routes>
        <Route path="/new-thread" element={<NewThread />} />
        <Route path="/threads/:id" element={<div>Thread-Seite geöffnet</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const fetchMock = vi.fn();

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Routes GET /api/categories; the caller supplies the POST /api/threads answer. */
function mockApi(onCreate: () => Response | Promise<Response>) {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.endsWith("/api/categories") && method === "GET") {
      return Promise.resolve(jsonResponse(200, CATEGORIES));
    }
    if (url.endsWith("/api/threads") && method === "POST") {
      return Promise.resolve(onCreate());
    }
    return Promise.reject(new Error(`unexpected request ${method} ${url}`));
  });
}

async function fillRequiredFields() {
  await screen.findByRole("option", { name: "Backend" });
  fireEvent.change(screen.getByLabelText("Titel"), {
    target: { value: "Verbindungspooling mit PgBouncer" },
  });
  fireEvent.change(screen.getByLabelText("Inhalt"), {
    target: { value: "**Frage:** Wie poolt ihr?" },
  });
}

describe("new thread composer", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the API categories into the category select", async () => {
    mockApi(() => jsonResponse(201, { id: 1 }));
    renderComposer();

    const select = (await screen.findByLabelText("Kategorie")) as HTMLSelectElement;
    await waitFor(() => {
      expect(within(select).getAllByRole("option")).toHaveLength(2);
    });
    expect(within(select).getByRole("option", { name: "Frontend" })).toBeTruthy();
    expect(screen.getByLabelText("Titel")).toBeTruthy();
    expect(screen.getByLabelText("Schlagwörter")).toBeTruthy();
  });

  it("stops with a message at the title field when the title is missing", async () => {
    mockApi(() => jsonResponse(201, { id: 1 }));
    renderComposer();

    await screen.findByRole("option", { name: "Backend" });
    fireEvent.change(screen.getByLabelText("Inhalt"), { target: { value: "Ein Rumpf." } });
    fireEvent.click(screen.getByRole("button", { name: "Thread veröffentlichen" }));

    expect(await screen.findByText("Bitte gib einen Titel ein.")).toBeTruthy();
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(0);
  });

  it("does not show field errors on an untouched form", async () => {
    mockApi(() => jsonResponse(201, { id: 1 }));
    renderComposer();

    await screen.findByRole("option", { name: "Backend" });
    expect(screen.queryByText("Bitte gib einen Titel ein.")).toBeNull();
    expect(screen.queryByText("Bitte gib einen Inhalt ein.")).toBeNull();
  });

  it("creates a thread, sends the payload and navigates to the created thread", async () => {
    mockApi(() => jsonResponse(201, { id: 314 }));
    renderComposer();

    await fillRequiredFields();
    const tagsInput = screen.getByLabelText("Schlagwörter");
    fireEvent.change(tagsInput, { target: { value: "postgres" } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Thread veröffentlichen" }));

    expect(await screen.findByText("Thread-Seite geöffnet")).toBeTruthy();

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(post).toBeTruthy();
    const created = JSON.parse((post?.[1] as RequestInit).body as string);
    expect(created).toMatchObject({
      category_id: 1,
      title: "Verbindungspooling mit PgBouncer",
      body_markdown: "**Frage:** Wie poolt ihr?",
      tags: ["postgres"],
    });
  });

  it("adds tags by comma or Enter and rejects duplicates and more than five", async () => {
    mockApi(() => jsonResponse(201, { id: 1 }));
    renderComposer();

    await screen.findByRole("option", { name: "Backend" });
    const tagsInput = screen.getByLabelText("Schlagwörter");

    fireEvent.change(tagsInput, { target: { value: "postgres" } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });
    expect(screen.getAllByText("#postgres").length).toBeGreaterThan(0);

    fireEvent.change(tagsInput, { target: { value: "postgres" } });
    fireEvent.keyDown(tagsInput, { key: "Enter" });
    expect(screen.getByText("Doppelte Schlagwörter werden abgelehnt.")).toBeTruthy();

    for (const tag of ["a", "b", "c", "d", "e"]) {
      fireEvent.change(tagsInput, { target: { value: tag } });
      fireEvent.keyDown(tagsInput, { key: "Enter" });
    }
    expect(screen.getByText("Maximal 5 Schlagwörter.")).toBeTruthy();
  });

  it("surfaces the rate limit with the Retry-After countdown", async () => {
    mockApi(() =>
      jsonResponse(429, errorBody("rate_limited", "too many posts"), { "Retry-After": "42" }),
    );
    renderComposer();

    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Thread veröffentlichen" }));

    const toast = await screen.findByText(/Zu viele Beiträge in kurzer Zeit/);
    expect(toast.textContent).toContain("42");
  });

  it("surfaces a ban notice when the API rejects the write with 403", async () => {
    mockApi(() =>
      jsonResponse(403, errorBody("banned", "Dein Konto ist gesperrt. Schreibzugriffe sind nicht möglich.")),
    );
    renderComposer();

    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Thread veröffentlichen" }));

    expect(
      await screen.findByText(/Dein Konto ist gesperrt. Schreibzugriffe sind nicht möglich./),
    ).toBeTruthy();
  });

  it("shows the server's field errors from a 422 answer", async () => {
    mockApi(() =>
      jsonResponse(422, errorBody("validation_error", "invalid", { title: "Titel ist zu lang." })),
    );
    renderComposer();

    await fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Thread veröffentlichen" }));

    expect(await screen.findByText("Titel ist zu lang.")).toBeTruthy();
  });

  it("renders the entered markdown in the preview tab", async () => {
    mockApi(() => jsonResponse(201, { id: 1 }));
    renderComposer();

    await screen.findByRole("option", { name: "Backend" });
    fireEvent.change(screen.getByLabelText("Inhalt"), { target: { value: "Hallo **Welt**" } });

    fireEvent.click(screen.getByRole("tab", { name: "Vorschau" }));
    expect(screen.getByText("Hallo **Welt**")).toBeTruthy();
  });
});
