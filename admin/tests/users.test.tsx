import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/context/AuthContext";
import { writeSession, type UserOut, type UserRole } from "../src/lib/api";
import Users from "../src/pages/Users";

interface UserAdmin extends UserOut {
  banned_until: string | null;
  ban_reason: string | null;
  is_banned: boolean;
  thread_count: number;
}

interface RecordedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

function makeUser(overrides: Partial<UserAdmin> = {}): UserAdmin {
  return {
    id: 1,
    username: "mara",
    email: "mara@forum.test",
    bio: null,
    role: "user",
    karma: 248,
    created_at: "2026-02-14T10:00:00Z",
    banned_until: null,
    ban_reason: null,
    is_banned: false,
    thread_count: 0,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function installFetch(users: UserAdmin[]): { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const mock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url, method, body });

    const parsed = new URL(url);
    const path = parsed.pathname;

    if (method === "GET" && path === "/api/admin/users") {
      const q = (parsed.searchParams.get("q") ?? "").toLowerCase();
      const role = parsed.searchParams.get("role") ?? "";
      const filtered = users.filter(
        (user) =>
          (!q ||
            user.username.toLowerCase().includes(q) ||
            user.email.toLowerCase().includes(q)) &&
          (!role || user.role === role),
      );
      const page = Number(parsed.searchParams.get("page") ?? "1");
      const pageSize = Number(parsed.searchParams.get("page_size") ?? "20");
      const start = (page - 1) * pageSize;
      return jsonResponse({
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        page_size: pageSize,
        pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      });
    }

    const roleMatch = path.match(/^\/api\/admin\/users\/(\d+)\/role$/);
    if (roleMatch && method === "PATCH") {
      const user = users.find((item) => item.id === Number(roleMatch[1]));
      if (!user) return jsonResponse({ error: { code: "not_found", message: "weg", fields: {} } }, 404);
      user.role = body?.role as UserRole;
      return jsonResponse({ ...user });
    }

    const banMatch = path.match(/^\/api\/admin\/users\/(\d+)\/ban$/);
    if (banMatch && method === "POST") {
      const user = users.find((item) => item.id === Number(banMatch[1]));
      if (!user) return jsonResponse({ error: { code: "not_found", message: "weg", fields: {} } }, 404);
      user.is_banned = true;
      user.ban_reason = (body?.reason as string) ?? null;
      user.banned_until = (body?.expires_at as string) ?? null;
      return jsonResponse({ ...user });
    }
    if (banMatch && method === "DELETE") {
      const user = users.find((item) => item.id === Number(banMatch[1]));
      if (!user) return jsonResponse({ error: { code: "not_found", message: "weg", fields: {} } }, 404);
      user.is_banned = false;
      user.ban_reason = null;
      user.banned_until = null;
      return jsonResponse({ ...user });
    }

    return jsonResponse({ error: { code: "not_found", message: "nicht gefunden", fields: {} } }, 404);
  };
  vi.stubGlobal("fetch", vi.fn(mock));
  return { calls };
}

function renderUsers() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/users"]}>
        <Users />
      </MemoryRouter>
    </AuthProvider>,
  );
}

function usersTable(): HTMLElement {
  return screen.getByRole("table", { name: "Nutzer" });
}

beforeEach(() => {
  writeSession(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin user management", () => {
  it("lists users and visibly marks a banned one", async () => {
    installFetch([
      makeUser(),
      makeUser({
        id: 2,
        username: "spam_bot",
        email: "spam@forum.test",
        karma: -12,
        is_banned: true,
        ban_reason: "Wiederholtes Spam-Verhalten",
        banned_until: "2026-12-01T23:59:59Z",
      }),
    ]);
    renderUsers();

    expect(await screen.findByText("@mara")).toBeTruthy();
    const table = usersTable();
    expect(within(table).getByText("@spam_bot")).toBeTruthy();
    expect(within(table).getByText("Gesperrt")).toBeTruthy();
    expect(within(table).getByText("Aktiv")).toBeTruthy();
    expect(within(table).getByText("-12")).toBeTruthy();
  });

  it("shows each user's thread count in the Threads column", async () => {
    installFetch([
      makeUser({ id: 1, username: "mara", thread_count: 12 }),
      makeUser({ id: 2, username: "lena", thread_count: 9 }),
    ]);
    renderUsers();

    await screen.findByText("@mara");
    const table = usersTable();
    expect(within(table).getByText("12")).toBeTruthy();
    expect(within(table).getByText("9")).toBeTruthy();
    expect(within(table).queryByText("—")).toBeNull();
  });

  it("searches by name or e-mail and asks the API for the query", async () => {
    const { calls } = installFetch([
      makeUser(),
      makeUser({ id: 2, username: "lena", email: "lena@forum.test" }),
    ]);
    renderUsers();
    await screen.findByText("@mara");

    const search = screen.getByRole("searchbox", { name: "Nutzer durchsuchen" });
    fireEvent.change(search, { target: { value: "lena" } });
    fireEvent.submit(search.closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.queryByText("@mara")).toBeNull());
    expect(screen.getByText("@lena")).toBeTruthy();
    expect(calls.some((call) => call.url.includes("q=lena"))).toBe(true);
  });

  it("filters by role through the API", async () => {
    const { calls } = installFetch([
      makeUser(),
      makeUser({ id: 2, username: "lena", role: "moderator" }),
    ]);
    renderUsers();
    await screen.findByText("@mara");

    fireEvent.change(screen.getByRole("combobox", { name: "Rolle filtern" }), {
      target: { value: "moderator" },
    });

    await waitFor(() => expect(screen.queryByText("@mara")).toBeNull());
    expect(screen.getByText("@lena")).toBeTruthy();
    expect(calls.some((call) => call.url.includes("role=moderator"))).toBe(true);
  });

  it("changes a role and updates the table", async () => {
    const { calls } = installFetch([makeUser()]);
    renderUsers();
    await screen.findByText("@mara");

    fireEvent.click(screen.getByRole("button", { name: "Rolle ändern" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Neue Rolle"), {
      target: { value: "moderator" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Rolle speichern" }));

    expect(await screen.findByText("Die Rolle wurde gespeichert.")).toBeTruthy();
    await waitFor(() => expect(within(usersTable()).getByText("Moderator")).toBeTruthy());
    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.url).toContain("/api/admin/users/1/role");
    expect(patch?.body).toEqual({ role: "moderator" });
  });

  it("bans a user with a reason and an optional expiry date", async () => {
    const { calls } = installFetch([makeUser()]);
    renderUsers();
    await screen.findByText("@mara");

    fireEvent.click(screen.getByRole("button", { name: "Sperren" }));
    const dialog = screen.getByRole("dialog");

    const until = within(dialog).getByLabelText("Ablaufdatum (optional)");
    expect(until.getAttribute("type")).toBe("date");

    fireEvent.change(within(dialog).getByLabelText("Grund der Sperre"), {
      target: { value: "Wiederholtes Spam-Verhalten" },
    });
    fireEvent.change(until, { target: { value: "2026-12-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sperren" }));

    await waitFor(() => expect(within(usersTable()).getByText("Gesperrt")).toBeTruthy());
    const post = calls.find((call) => call.method === "POST");
    expect(post?.url).toContain("/api/admin/users/1/ban");
    expect(post?.body).toEqual({
      reason: "Wiederholtes Spam-Verhalten",
      expires_at: "2026-12-01T23:59:59Z",
    });
  });

  it("refuses to ban without a reason and never calls the API", async () => {
    const { calls } = installFetch([makeUser()]);
    renderUsers();
    await screen.findByText("@mara");

    fireEvent.click(screen.getByRole("button", { name: "Sperren" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sperren" }));

    expect(await within(dialog).findByText("Bitte einen Grund angeben.")).toBeTruthy();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("unbans a user and clears the ban state", async () => {
    const { calls } = installFetch([
      makeUser({ id: 2, username: "spam_bot", is_banned: true, ban_reason: "Spam" }),
    ]);
    renderUsers();
    await screen.findByText("@spam_bot");
    expect(within(usersTable()).getByText("Gesperrt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Entsperren" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Entsperren" }));

    await waitFor(() => expect(within(usersTable()).getByText("Aktiv")).toBeTruthy());
    const remove = calls.find((call) => call.method === "DELETE");
    expect(remove?.url).toContain("/api/admin/users/2/ban");
  });

  it("keeps the own account from being banned", async () => {
    writeSession({ accessToken: "token", user: makeUser({ id: 1, username: "admin", role: "admin" }) });
    installFetch([
      makeUser({ id: 1, username: "admin", role: "admin" }),
      makeUser({ id: 2, username: "mara" }),
    ]);
    renderUsers();
    await screen.findByText("@admin");

    const rows = within(usersTable())
      .getAllByRole("row")
      .filter((row) => row.textContent?.includes("@admin"));
    const banButton = within(rows[0]).getByRole("button", { name: "Sperren" });
    expect((banButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the kit's loading state while the request is in flight", async () => {
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => pending));
    renderUsers();

    const table = usersTable();
    expect(table.getAttribute("aria-busy")).toBe("true");
    expect(table.querySelectorAll(".skeleton").length).toBeGreaterThan(0);

    release(jsonResponse({ items: [], total: 0, page: 1, page_size: 20, pages: 1 }));
    expect(await screen.findByText("Keine Nutzer gefunden")).toBeTruthy();
  });

  it("shows the kit's empty state when no user matches", async () => {
    installFetch([]);
    renderUsers();
    expect(await screen.findByText("Keine Nutzer gefunden")).toBeTruthy();
  });

  it("shows the kit's error banner with a retry action", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: { code: "server_error", message: "Die Nutzerliste ist nicht erreichbar.", fields: {} } },
          500,
        ),
      ),
    );
    renderUsers();

    expect(await screen.findByText("Die Nutzerliste ist nicht erreichbar.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
