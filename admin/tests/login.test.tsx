import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, vi } from "vitest";
import App from "../src/App";
import { AuthProvider } from "../src/context/AuthContext";
import { ThemeProvider } from "../src/context/ThemeContext";
import {
  SESSION_STORAGE_KEY,
  readSession,
  writeSession,
  type Session,
  type UserOut,
} from "../src/lib/api";

const ADMIN_USER: UserOut = {
  id: 1,
  username: "admin",
  email: "admin@forum.test",
  bio: null,
  role: "admin",
  karma: 0,
  created_at: "2026-01-01T00:00:00Z",
};

const PLAIN_USER: UserOut = {
  id: 2,
  username: "demo",
  email: "demo@forum.test",
  bio: null,
  role: "user",
  karma: 0,
  created_at: "2026-01-01T00:00:00Z",
};

const ADMIN_SESSION: Session = { accessToken: "test-access-token", user: ADMIN_USER };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function loginResponse(user: UserOut): Response {
  return jsonResponse(200, {
    access_token: "token-123",
    token_type: "bearer",
    expires_in: 900,
    user,
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, { error: { code, message, fields: {} } });
}

const fetchMock = vi.fn();

function renderApp(route = "/login") {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

function submitCredentials(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("E-Mail"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Passwort"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
}

beforeEach(() => {
  writeSession(null);
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin sign-in", () => {
  it("stores the admin session under its own key, never the forum's", () => {
    expect(SESSION_STORAGE_KEY).toBe("admin-session");
  });

  it("renders its own sign-in form with the forum link", () => {
    fetchMock.mockResolvedValue(errorResponse(500, "unexpected", "unexpected"));
    renderApp();

    expect(screen.getByRole("heading", { level: 1, name: "Administrationsbereich" })).toBeTruthy();
    expect(screen.getByLabelText("E-Mail")).toBeTruthy();
    expect(screen.getByLabelText("Passwort")).toBeTruthy();
    expect(screen.getByLabelText("Angemeldet bleiben")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zurück zum Forum" })).toBeTruthy();
  });

  it("redirects a protected route to the sign-in when there is no session", () => {
    fetchMock.mockResolvedValue(errorResponse(500, "unexpected", "unexpected"));
    renderApp("/");

    expect(screen.getByRole("heading", { level: 1, name: "Administrationsbereich" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "Dashboard" })).toBeNull();
  });

  it("shows the server's message for wrong credentials and starts no session", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/login")) {
        return errorResponse(401, "invalid_credentials", "E-Mail oder Passwort ist falsch.");
      }
      return errorResponse(404, "not_found", "not found");
    });
    renderApp();

    submitCredentials("admin@forum.test", "wrong-password");

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("E-Mail oder Passwort ist falsch.");
    });
    expect(readSession()).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Administrationsbereich" })).toBeTruthy();
  });

  it("refuses a plain user without the moderator or admin role", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/login")) return loginResponse(PLAIN_USER);
      if (url.includes("/api/auth/logout")) return new Response(null, { status: 204 });
      return errorResponse(404, "not_found", "not found");
    });
    renderApp();

    submitCredentials("demo@forum.test", "Demo1234!");

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Dieses Konto hat keine Berechtigung für den Administrationsbereich.",
      );
    });
    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Dashboard" })).toBeNull();
  });

  it("signs an administrator in and opens the dashboard", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/login")) return loginResponse(ADMIN_USER);
      return errorResponse(404, "not_found", "not found");
    });
    renderApp();

    submitCredentials("admin@forum.test", "Demo1234!");

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    });
    expect(readSession()?.user.username).toBe("admin");
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it("signs out from the chrome and returns to the sign-in screen", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/logout")) return new Response(null, { status: 204 });
      return errorResponse(404, "not_found", "not found");
    });
    writeSession(ADMIN_SESSION);
    renderApp("/");

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Administrationsbereich" })).toBeTruthy();
    });
    expect(readSession()).toBeNull();
  });
});
