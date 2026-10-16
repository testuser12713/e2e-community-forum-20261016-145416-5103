import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Categories, { type Category } from "../src/pages/Categories";

const CATEGORIES: Category[] = [
  {
    id: 1,
    name: "Backend",
    slug: "backend",
    description: "Server, APIs, Datenbankanbindung und Betrieb.",
    position: 1,
    thread_count: 44,
  },
  {
    id: 2,
    name: "Frontend",
    slug: "frontend",
    description: "UI, Frameworks, Build-Tooling und Browser-Themen.",
    position: 2,
    thread_count: 31,
  },
];

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Categories />
    </MemoryRouter>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

function isGet(url: string, init?: RequestInit): boolean {
  return url.endsWith("/api/categories") && (init?.method ?? "GET") === "GET";
}

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("admin category management", () => {
  it("renders the category table with position, name, slug, description and thread count", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      Promise.resolve(isGet(url, init) ? makeResponse(200, CATEGORIES) : makeResponse(404, {})),
    );

    renderPage();

    const table = screen.getByRole("table", { name: "Kategorien" });
    expect(await within(table).findByText("Backend")).toBeTruthy();
    expect(within(table).getByText("backend")).toBeTruthy();
    expect(within(table).getByText("Server, APIs, Datenbankanbindung und Betrieb.")).toBeTruthy();
    expect(within(table).getByText("44")).toBeTruthy();

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Backend");
    expect(rows[1].textContent).toContain("Frontend");

    expect(screen.getByRole("button", { name: "Neue Kategorie" })).toBeTruthy();
  });

  it("creates a category through POST and appends it to the table", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isGet(url, init)) return Promise.resolve(makeResponse(200, CATEGORIES));
      if (url.endsWith("/api/admin/categories") && init?.method === "POST") {
        return Promise.resolve(
          makeResponse(201, {
            id: 3,
            name: "Security",
            slug: "security",
            description: null,
            position: 3,
            thread_count: 0,
          }),
        );
      }
      return Promise.resolve(makeResponse(404, {}));
    });

    renderPage();
    await screen.findByText("Backend");

    fireEvent.click(screen.getByRole("button", { name: "Neue Kategorie" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "Security" },
    });
    fireEvent.change(within(dialog).getByLabelText("Slug"), {
      target: { value: "security" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Security")).toBeTruthy();

    const call = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(call).toBeDefined();
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toMatchObject({ name: "Security", slug: "security" });
  });

  it("shows the duplicate slug error at the field", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isGet(url, init)) return Promise.resolve(makeResponse(200, CATEGORIES));
      if (url.endsWith("/api/admin/categories") && init?.method === "POST") {
        return Promise.resolve(
          makeResponse(409, {
            error: {
              code: "conflict",
              message: "A category with this slug already exists",
              fields: { slug: "This slug is already in use" },
            },
          }),
        );
      }
      return Promise.resolve(makeResponse(404, {}));
    });

    renderPage();
    await screen.findByText("Backend");

    fireEvent.click(screen.getByRole("button", { name: "Neue Kategorie" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Other" } });
    fireEvent.change(within(dialog).getByLabelText("Slug"), { target: { value: "backend" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await within(dialog).findByText("This slug is already in use")).toBeTruthy();
  });

  it("edits a category through PATCH", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isGet(url, init)) return Promise.resolve(makeResponse(200, CATEGORIES));
      if (url.endsWith("/api/admin/categories/1") && init?.method === "PATCH") {
        return Promise.resolve(
          makeResponse(200, {
            ...CATEGORIES[0],
            name: "Backend & APIs",
          }),
        );
      }
      return Promise.resolve(makeResponse(404, {}));
    });

    renderPage();
    await screen.findByText("Backend");

    fireEvent.click(screen.getAllByRole("button", { name: "Bearbeiten" })[0]);
    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByLabelText("Name") as HTMLInputElement;
    expect(nameInput.value).toBe("Backend");
    expect((within(dialog).getByLabelText("Slug") as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: "Backend & APIs" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Backend & APIs")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves a category up and persists the new order with PUT", async () => {
    let current = CATEGORIES;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isGet(url, init)) return Promise.resolve(makeResponse(200, current));
      if (url.endsWith("/api/admin/categories/order") && init?.method === "PUT") {
        current = [CATEGORIES[1], CATEGORIES[0]];
        return Promise.resolve(makeResponse(200, current));
      }
      return Promise.resolve(makeResponse(404, {}));
    });

    renderPage();
    await screen.findByText("Backend");

    const table = screen.getByRole("table", { name: "Kategorien" });
    const upButtons = within(table).getAllByRole("button", { name: "Nach oben" });
    expect((upButtons[0] as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(table).getAllByRole("button", { name: "Nach unten" })[0]);

    await waitFor(() => {
      const rows = within(table).getAllByRole("row").slice(1);
      expect(rows[0].textContent).toContain("Frontend");
      expect(rows[1].textContent).toContain("Backend");
    });

    const call = fetchMock.mock.calls.find(
      ([url, init]) =>
        (url as string).endsWith("/api/admin/categories/order") &&
        (init as RequestInit | undefined)?.method === "PUT",
    );
    expect(call).toBeDefined();
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({ ids: [2, 1] });
  });

  it("deletes a category after the confirmation dialog", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isGet(url, init)) return Promise.resolve(makeResponse(200, CATEGORIES));
      if (url.endsWith("/api/admin/categories/1") && init?.method === "DELETE") {
        return Promise.resolve(makeResponse(204, null));
      }
      return Promise.resolve(makeResponse(404, {}));
    });

    renderPage();
    await screen.findByText("Backend");

    fireEvent.click(screen.getAllByRole("button", { name: "Löschen" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Kategorie löschen?" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));

    await waitFor(() => {
      const table = screen.getByRole("table", { name: "Kategorien" });
      expect(within(table).queryByText("Backend")).toBeNull();
    });

    const call = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    );
    expect(call?.[0]).toContain("/api/admin/categories/1");
  });

  it("shows the server error when a category that still has threads cannot be deleted", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (isGet(url, init)) return Promise.resolve(makeResponse(200, CATEGORIES));
      if (url.endsWith("/api/admin/categories/1") && init?.method === "DELETE") {
        return Promise.resolve(
          makeResponse(409, {
            error: {
              code: "conflict",
              message: "The category still contains threads",
              fields: {},
            },
          }),
        );
      }
      return Promise.resolve(makeResponse(404, {}));
    });

    renderPage();
    await screen.findByText("Backend");

    fireEvent.click(screen.getAllByRole("button", { name: "Löschen" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Löschen" }));

    expect(await within(dialog).findByText("The category still contains threads")).toBeTruthy();
  });

  it("renders a readable state when the category list cannot be loaded", async () => {
    fetchMock.mockResolvedValue(makeResponse(500, { error: { code: "internal_error" } }));

    renderPage();

    expect(await screen.findByText("Kategorien konnten nicht geladen werden")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
