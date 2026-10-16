import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

const SESSION_USER = {
  id: 1,
  username: "mara",
  email: "mara@example.com",
  bio: null,
  role: "user",
  karma: 0,
  created_at: "2026-02-14T18:30:00Z",
};

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("forum shell", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders the shell with navigation around the routed page", () => {
    renderApp("/");

    expect(screen.getByRole("link", { name: "Community" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Neuer Thread" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Benachrichtigungen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hell/Dunkel umschalten" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Alle Threads" })).toBeTruthy();
  });

  it("renders the routed page inside the frame", async () => {
    localStorage.setItem(
      "forum-session",
      JSON.stringify({ access_token: "token", user: SESSION_USER }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => SESSION_USER,
        } as unknown as Response),
      ),
    );

    renderApp("/settings");

    expect(await screen.findByRole("heading", { name: "Einstellungen" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Community" })).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it("keeps the theme choice after a reload", () => {
    const first = renderApp("/");
    fireEvent.click(screen.getByRole("button", { name: "Hell/Dunkel umschalten" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("forum-theme")).toBe("dark");

    first.unmount();
    renderApp("/");

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
