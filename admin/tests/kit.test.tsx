import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { AuthProvider } from "../src/context/AuthContext";
import { ThemeProvider } from "../src/context/ThemeContext";
import { writeSession, type Session } from "../src/lib/api";

const ADMIN_SESSION: Session = {
  accessToken: "test-access-token",
  user: {
    id: 1,
    username: "admin",
    email: "admin@forum.test",
    bio: null,
    role: "admin",
    karma: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
};

function renderGallery() {
  writeSession(ADMIN_SESSION);
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/gallery"]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

describe("admin UI kit gallery", () => {
  it("renders every kit section on the gallery route", () => {
    renderGallery();

    expect(screen.getByRole("heading", { level: 1, name: "Komponentengalerie" })).toBeTruthy();
    const sections = [
      "Schaltflächen",
      "Symbol-Schaltflächen",
      "Abzeichen",
      "Chips",
      "Avatare",
      "Karten",
      "Formularfelder",
      "Hinweise",
      "Reiter",
      "Tabellen",
      "Seitennavigation",
      "Kennzahlen",
      "Trend und Balken",
      "Leerer Zustand und Platzhalter",
      "Dialog",
      "Toasts",
      "Menü",
      "Inhaltsbereich",
      "Rahmen (Chrome)",
      "Trendwerte",
      "Dunkel-Modus",
    ];
    for (const title of sections) {
      expect(screen.getByRole("heading", { level: 3, name: title })).toBeTruthy();
    }
  });

  it("shows the chrome from the kit: navigation, forum link and the sign-out control", () => {
    renderGallery();

    for (const label of ["Dashboard", "Nutzer", "Kategorien", "Meldungen", "Audit-Log"]) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("link", { name: "Zum Forum" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Abmelden" }).length).toBeGreaterThan(0);
  });

  it("renders the disabled and loading button states", () => {
    renderGallery();

    const disabled = screen.getAllByRole("button", { name: "Deaktiviert" });
    expect(disabled.length).toBeGreaterThan(0);
    for (const button of disabled) expect((button as HTMLButtonElement).disabled).toBe(true);

    const loading = screen.getAllByRole("button", { name: /Lädt/ });
    expect(loading.length).toBeGreaterThan(0);
    for (const button of loading) {
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.querySelector(".spinner")).not.toBeNull();
    }
  });

  it("shows the table loading rows and the empty state", () => {
    renderGallery();

    const busy = screen.getByRole("table", { name: "Wird geladen" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.querySelectorAll(".skeleton").length).toBeGreaterThan(0);

    expect(screen.getByText("Keine Nutzer gefunden")).toBeTruthy();
  });

  it("sorts a table when a sortable column header is clicked", () => {
    renderGallery();

    const table = screen.getByRole("table", { name: "Audit-Log" });
    const header = screen.getByRole("columnheader", { name: /Zeit/ });
    expect(header.getAttribute("aria-sort")).toBe("descending");

    fireEvent.click(within(header).getByRole("button"));
    expect(header.getAttribute("aria-sort")).toBe("ascending");

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("13:12");
    expect(rows[2].textContent).toContain("14:58");
  });

  it("switches tabs on click", () => {
    renderGallery();

    const tab = screen.getByRole("tab", { name: /In Bearbeitung/ });
    expect(tab.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("progress")).toBeTruthy();
  });

  it("opens the dialog from a table action and closes it again", () => {
    renderGallery();

    fireEvent.click(screen.getAllByRole("button", { name: "Rolle ändern" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Rolle ändern" })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Rolle ändern" })[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses a toast", () => {
    renderGallery();

    const message = screen.getByText("Die Rolle wurde gespeichert.");
    const toast = message.closest(".toast");
    expect(toast).not.toBeNull();
    fireEvent.click(within(toast as HTMLElement).getByRole("button", { name: "Schließen" }));

    expect(screen.queryByText("Die Rolle wurde gespeichert.")).toBeNull();
  });

  it("opens the menu and closes it on selection", () => {
    renderGallery();

    fireEvent.click(screen.getByRole("button", { name: "Konto" }));
    const menu = screen.getByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Profil" }));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("removes a filter chip", () => {
    renderGallery();

    fireEvent.click(screen.getByRole("button", { name: "Kategorie: Backend" }));
    expect(screen.queryByRole("button", { name: "Kategorie: Backend" })).toBeNull();
    expect(screen.getByRole("button", { name: "Filter zurücksetzen" })).toBeTruthy();
  });

  it("toggles the theme from the chrome around the gallery", () => {
    renderGallery();

    const toggle = screen.getAllByRole("button", { name: "Darstellung" })[0];
    const before = document.documentElement.getAttribute("data-theme");
    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).not.toBe(before);
  });
});
