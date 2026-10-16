import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

const USER = {
  id: 1,
  username: "mara",
  email: "mara@example.com",
  bio: null,
  role: "user",
  karma: 0,
  created_at: "2026-01-01T00:00:00Z",
};

const SESSION = {
  access_token: "token-1",
  token_type: "bearer",
  expires_in: 900,
  user: USER,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  fields: Record<string, string> = {},
): Response {
  return jsonResponse(status, { error: { code, message, fields } });
}

/** Routes fetch calls by the path a request targets. */
function mockFetch(handlers: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [path, handler] of Object.entries(handlers)) {
      if (url.endsWith(path)) return handler();
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("forum authentication screens", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the login screen with a neutral form", () => {
    renderApp("/login");

    expect(screen.getByRole("heading", { name: "Willkommen zurück" })).toBeTruthy();
    expect(screen.getByLabelText("Benutzername oder E-Mail")).toBeTruthy();
    expect(screen.getByLabelText("Passwort")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anmelden" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the design's banner for wrong credentials", async () => {
    mockFetch({
      "/api/auth/login": () =>
        errorResponse(401, "invalid_credentials", "E-mail or password is incorrect"),
    });

    renderApp("/login");
    fireEvent.change(screen.getByLabelText("Benutzername oder E-Mail"), {
      target: { value: "mara@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Benutzername oder Passwort ist falsch.",
      );
    });
  });

  it("signs in and lands on the home page with the account in the header", async () => {
    mockFetch({ "/api/auth/login": () => jsonResponse(200, SESSION) });

    renderApp("/login");
    fireEvent.change(screen.getByLabelText("Benutzername oder E-Mail"), {
      target: { value: "mara@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "Sommer2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alle Threads" })).toBeTruthy();
    });

    const header = document.querySelector("header.app-header") as HTMLElement;
    expect(header).not.toBeNull();
    fireEvent.click(within(header).getByRole("button", { name: "Konto" }));
    expect(within(header).getByRole("menuitem", { name: "Abmelden" })).toBeTruthy();
  });

  it("renders the register screen with a neutral form", () => {
    renderApp("/register");

    expect(screen.getByRole("heading", { name: "Konto erstellen" })).toBeTruthy();
    expect(screen.getByLabelText("Benutzername")).toBeTruthy();
    expect(screen.getByLabelText("E-Mail")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Konto erstellen" })).toBeTruthy();

    const rule = screen.getByText("mindestens 10 Zeichen");
    expect(rule.className).not.toContain("ok");
    expect(rule.className).not.toContain("bad");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the violated password rule at the password field once the user types", () => {
    renderApp("/register");

    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "kurz" } });

    expect(screen.getByText("mindestens 10 Zeichen").className).toContain("bad");
    expect(screen.getByText("Groß- und Kleinbuchstabe").className).toContain("bad");
    expect(screen.getByText("mindestens eine Ziffer").className).toContain("bad");
  });

  it("shows the server's message at the username field when it is taken", async () => {
    mockFetch({
      "/api/auth/register": () =>
        errorResponse(409, "conflict", "This username is already taken", {
          username: "This username is already taken",
        }),
    });

    renderApp("/register");
    fireEvent.change(screen.getByLabelText("Benutzername"), { target: { value: "mara" } });
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "mara@example.com" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "Sommer2026" } });
    fireEvent.change(screen.getByLabelText("Passwort wiederholen"), {
      target: { value: "Sommer2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Konto erstellen" }));

    await waitFor(() => {
      expect(screen.getByText("This username is already taken")).toBeTruthy();
    });
    expect(screen.getByLabelText("Benutzername").getAttribute("aria-invalid")).toBe("true");
  });

  it("signs in after a successful registration", async () => {
    const fetchMock = mockFetch({
      "/api/auth/register": () => jsonResponse(201, USER),
      "/api/auth/login": () => jsonResponse(200, SESSION),
    });

    renderApp("/register");
    fireEvent.change(screen.getByLabelText("Benutzername"), { target: { value: "mara" } });
    fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: "mara@example.com" } });
    fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: "Sommer2026" } });
    fireEvent.change(screen.getByLabelText("Passwort wiederholen"), {
      target: { value: "Sommer2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Konto erstellen" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alle Threads" })).toBeTruthy();
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/auth/register"))).toBe(
      true,
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/auth/login"))).toBe(true);
  });

  it("ends the session on logout and asks for a login again", async () => {
    localStorage.setItem("forum-session", JSON.stringify({ access_token: "token-1", user: USER }));
    mockFetch({
      "/api/me": () => jsonResponse(200, USER),
      "/api/auth/logout": () => new Response(null, { status: 204 }),
    });

    renderApp("/");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Alle Threads" })).toBeTruthy();
    });

    const header = document.querySelector("header.app-header") as HTMLElement;
    fireEvent.click(within(header).getByRole("button", { name: "Konto" }));
    fireEvent.click(within(header).getByRole("menuitem", { name: "Abmelden" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Willkommen zurück" })).toBeTruthy();
    });
    expect(localStorage.getItem("forum-session")).toBeNull();
  });
});
