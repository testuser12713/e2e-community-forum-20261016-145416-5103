import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

const PROFILE = {
  username: "runa",
  bio: "Backend-Entwicklerin aus Leipzig.",
  karma: 42,
  created_at: "2026-02-14T18:30:00Z",
  threads: [
    {
      id: 7,
      category_id: 1,
      category_slug: "backend",
      category_name: "Backend",
      title: "PostgreSQL Indizes richtig einsetzen",
      tags: ["postgres", "performance"],
      score: 86,
      comment_count: 12,
      hot_score: 1.5,
      pinned: false,
      locked: false,
      deleted: false,
      edited_at: null,
      created_at: "2026-02-14T15:00:00Z",
      author: { id: 3, username: "runa", karma: 42 },
    },
  ],
  comments: [
    {
      id: 9,
      thread_id: 7,
      thread_title: "PostgreSQL Indizes richtig einsetzen",
      excerpt: "CREATE INDEX CONCURRENTLY nicht vergessen.",
      created_at: "2026-02-14T16:30:00Z",
    },
  ],
};

const USER = {
  id: 3,
  username: "runa",
  email: "runa@example.com",
  bio: "Backend-Entwicklerin aus Leipzig.",
  role: "user",
  karma: 42,
  created_at: "2026-02-14T18:30:00Z",
};

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

type Handler = (url: string, init: RequestInit) => Response;

function installFetch(handler: Handler) {
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function signIn() {
  localStorage.setItem("forum-session", JSON.stringify({ access_token: "token", user: USER }));
}

describe("forum profile page", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a public profile with bio, karma, threads and comments", async () => {
    installFetch((url) => {
      if (url.endsWith("/api/users/runa")) return makeResponse(PROFILE);
      return makeResponse({ error: { code: "not_found", message: "unknown" } }, 404);
    });

    renderApp("/users/runa");

    expect(await screen.findByText("@runa")).toBeTruthy();
    expect(screen.getByText("Backend-Entwicklerin aus Leipzig.")).toBeTruthy();
    expect(screen.getByText(/Karma 42/)).toBeTruthy();
    expect(screen.getByText("PostgreSQL Indizes richtig einsetzen")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Kommentare (1)" }));
    expect(await screen.findByText(/CREATE INDEX CONCURRENTLY/)).toBeTruthy();

    expect(screen.queryByRole("button", { name: "Sperren" })).toBeNull();
  });

  it("offers the moderator a ban control that bans the profile's user", async () => {
    const moderator = { ...USER, id: 1, username: "mod", role: "moderator" };
    localStorage.setItem(
      "forum-session",
      JSON.stringify({ access_token: "token", user: moderator }),
    );
    const calls: { url: string; init: RequestInit }[] = [];
    installFetch((url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/api/me")) return makeResponse(moderator);
      if (url.endsWith("/api/users/runa")) return makeResponse(PROFILE);
      if (url.endsWith("/api/admin/users/3/ban")) {
        return makeResponse({ ...USER, is_banned: true, banned_until: null, ban_reason: "Spam" });
      }
      return makeResponse({ error: { code: "not_found", message: "unknown" } }, 404);
    });

    renderApp("/users/runa");

    fireEvent.click(await screen.findByRole("button", { name: "Sperren" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Grund der Sperre"), {
      target: { value: "Spam" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sperren" }));

    await waitFor(() => {
      const ban = calls.find((call) => call.url.endsWith("/api/admin/users/3/ban"));
      expect(ban).toBeTruthy();
      expect(JSON.parse(ban!.init.body as string)).toEqual({ reason: "Spam" });
    });
  });

  it("reports a missing user instead of breaking the page", async () => {
    installFetch(() => makeResponse({ error: { code: "not_found", message: "unknown" } }, 404));

    renderApp("/users/ghost");

    expect(await screen.findByText("Nutzer nicht gefunden")).toBeTruthy();
  });
});

describe("forum settings page", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the bio through PATCH /api/me", async () => {
    signIn();
    const calls: { url: string; init: RequestInit }[] = [];
    installFetch((url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/api/me") && (init.method ?? "GET") === "GET") return makeResponse(USER);
      if (url.endsWith("/api/me") && init.method === "PATCH") {
        return makeResponse({ ...USER, bio: "Neue Bio" });
      }
      return makeResponse({ error: { code: "not_found", message: "unknown" } }, 404);
    });

    renderApp("/settings");

    const textarea = await screen.findByLabelText("Bio");
    fireEvent.change(textarea, { target: { value: "Neue Bio" } });
    fireEvent.click(screen.getByRole("button", { name: "Bio speichern" }));

    await screen.findByText("Bio gespeichert.");
    const patch = calls.find((call) => call.init.method === "PATCH" && call.url.endsWith("/api/me"));
    expect(patch).toBeTruthy();
    expect(JSON.parse(patch!.init.body as string)).toEqual({ bio: "Neue Bio" });
  });

  it("shows the server's error at the current password field", async () => {
    signIn();
    installFetch((url) => {
      if (url.endsWith("/api/me")) return makeResponse(USER);
      if (url.endsWith("/api/auth/password")) {
        return makeResponse(
          {
            error: {
              code: "wrong_password",
              message: "The current password is incorrect",
              fields: { current_password: "The current password is incorrect" },
            },
          },
          400,
        );
      }
      return makeResponse({ error: { code: "not_found", message: "unknown" } }, 404);
    });

    renderApp("/settings");

    fireEvent.change(await screen.findByLabelText("Aktuelles Passwort"), {
      target: { value: "falsch" },
    });
    fireEvent.change(screen.getByLabelText("Neues Passwort"), {
      target: { value: "NeuesPasswort1" },
    });
    fireEvent.change(screen.getByLabelText("Neues Passwort wiederholen"), {
      target: { value: "NeuesPasswort1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));

    expect(await screen.findByText("The current password is incorrect")).toBeTruthy();
  });

  it("changes the password and clears the fields on success", async () => {
    signIn();
    installFetch((url) => {
      if (url.endsWith("/api/me")) return makeResponse(USER);
      if (url.endsWith("/api/auth/password")) return makeResponse(undefined, 204);
      return makeResponse({ error: { code: "not_found", message: "unknown" } }, 404);
    });

    renderApp("/settings");

    fireEvent.change(await screen.findByLabelText("Aktuelles Passwort"), {
      target: { value: "Demo1234!" },
    });
    fireEvent.change(screen.getByLabelText("Neues Passwort"), {
      target: { value: "NeuesPasswort1" },
    });
    fireEvent.change(screen.getByLabelText("Neues Passwort wiederholen"), {
      target: { value: "NeuesPasswort1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));

    expect(await screen.findByText("Passwort geändert.")).toBeTruthy();
    await waitFor(() => {
      expect((screen.getByLabelText("Neues Passwort") as HTMLInputElement).value).toBe("");
    });
  });
});
