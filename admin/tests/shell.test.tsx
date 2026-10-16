import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { AuthProvider } from "../src/context/AuthContext";
import { THEME_STORAGE_KEY, ThemeProvider } from "../src/context/ThemeContext";
import { FORUM_URL } from "../src/lib/api";

function renderApp(route = "/") {
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

describe("admin shell", () => {
  it("renders its own shell with the navigation and a link back to the forum", () => {
    renderApp("/");

    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeTruthy();
    for (const label of ["Dashboard", "Nutzer", "Kategorien", "Meldungen", "Audit-Log"]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }

    const forumLinks = screen.getAllByRole("link", { name: "Zum Forum" });
    expect(forumLinks.length).toBeGreaterThan(0);
    expect(forumLinks[0].getAttribute("href")).toBe(FORUM_URL);
    expect(screen.getByRole("button", { name: "Darstellung" })).toBeTruthy();
  });

  it("registers every approved admin route", () => {
    const routes: Array<[string, string]> = [
      ["/users", "Nutzer"],
      ["/categories", "Kategorien"],
      ["/moderation", "Meldungen"],
      ["/audit", "Audit-Log"],
    ];

    for (const [route, heading] of routes) {
      const { unmount } = renderApp(route);
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
      unmount();
    }
  });

  it("renders the sign-in route on its own, without the admin chrome", () => {
    renderApp("/login");

    expect(screen.getByRole("heading", { level: 1, name: "Administrationsbereich" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Zum Forum" })).toBeNull();
    expect(screen.getByRole("link", { name: "Zurück zum Forum" }).getAttribute("href")).toBe(
      FORUM_URL,
    );
  });

  it("toggles the theme and keeps the choice across a reload", () => {
    const { unmount } = renderApp("/");

    const toggle = screen.getByRole("button", { name: "Darstellung" });
    const before = document.documentElement.getAttribute("data-theme");
    fireEvent.click(toggle);

    const after = document.documentElement.getAttribute("data-theme");
    expect(after).not.toBe(before);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(after);

    unmount();
    renderApp("/");
    expect(document.documentElement.getAttribute("data-theme")).toBe(after);
  });
});
