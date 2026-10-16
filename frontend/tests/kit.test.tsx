import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

function renderGallery() {
  return render(
    <MemoryRouter initialEntries={["/dev/gallery"]}>
      <App />
    </MemoryRouter>,
  );
}

const SECTION_TITLES = [
  "Kopfzeile und Navigation",
  "Schaltflächen",
  "Abzeichen",
  "Avatare",
  "Tags und Chips",
  "Formularfelder",
  "Segmentierte Tabs",
  "Paginierung",
  "Stimmen",
  "Thread-Karten",
  "Kommentare",
  "Nutzerinhalte (Prose)",
  "Markdown-Editor",
  "Benachrichtigungen",
  "Hinweise und Banner",
  "Leerer Zustand",
  "Lade-Platzhalter",
  "Toasts",
  "Dialoge",
  "Karten",
  "Seitenleiste",
  "Popover und Menü",
];

describe("forum UI kit gallery", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders the header chrome and every kit section", () => {
    renderGallery();

    expect(screen.getByRole("heading", { name: "UI-Kit-Galerie" })).toBeTruthy();

    const header = document.querySelector("header.app-header") as HTMLElement;
    expect(within(header).getByRole("link", { name: "Community" })).toBeTruthy();
    expect(within(header).getByRole("link", { name: "Neuer Thread" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Benachrichtigungen" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Konto" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "Hell/Dunkel umschalten" })).toBeTruthy();
    expect(within(header).getByRole("searchbox", { name: "Threads durchsuchen" })).toBeTruthy();

    for (const title of SECTION_TITLES) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
  });

  it("shows the disabled and loading button states as such", () => {
    renderGallery();

    const disabled = screen.getByRole("button", { name: "Konto löschen" });
    expect((disabled as HTMLButtonElement).disabled).toBe(true);
    expect(disabled.getAttribute("title")).toBe("Bald verfügbar");

    const loading = screen.getByRole("button", { name: /Wird gespeichert/ });
    expect((loading as HTMLButtonElement).disabled).toBe(true);
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("keeps the theme choice after a reload and renders the kit in dark mode", () => {
    const first = renderGallery();
    fireEvent.click(screen.getByRole("button", { name: "Hell/Dunkel umschalten" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("forum-theme")).toBe("dark");
    expect(screen.getByRole("heading", { name: "Stimmen" })).toBeTruthy();

    first.unmount();
    renderGallery();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("counts votes in the gallery preview and toggles the own vote off", () => {
    renderGallery();

    const cards = document.getElementById("thread-karten") as HTMLElement;
    const title = within(cards).getByRole("link", {
      name: /PostgreSQL Indizes richtig einsetzen — ein Leitfaden/,
    });
    const card = title.closest("article") as HTMLElement;
    expect(within(card).getByText("+87")).toBeTruthy();

    fireEvent.click(within(card).getByRole("button", { name: "Thread upvoten" }));
    expect(within(card).getByText("+86")).toBeTruthy();

    fireEvent.click(within(card).getByRole("button", { name: "Thread downvoten" }));
    expect(within(card).getByText("+85")).toBeTruthy();
  });

  it("renders the comment tree with depth limit, collapsible replies and a working reply form", () => {
    renderGallery();

    expect(screen.getAllByText("Maximale Antworttiefe erreicht.")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "1 Antworten" }));
    expect(screen.getByText(/drei Alt-Indizes entfernt/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Antworten" })[0]);
    const textarea = screen.getByLabelText("Antwort");
    fireEvent.change(textarea, { target: { value: "Danke fuer den Hinweis!" } });
    fireEvent.click(screen.getByRole("button", { name: "Antwort senden" }));

    expect(screen.getByText("Danke fuer den Hinweis!")).toBeTruthy();
    expect(screen.getByText(/Antwort an Kommentar #1 gesendet/)).toBeTruthy();
  });

  it("keeps deleted comments visible with their children", () => {
    renderGallery();

    expect(screen.getByText("Der Kommentar wurde entfernt.")).toBeTruthy();
    expect(screen.getByText(/gutes Beispiel für weiches Löschen/)).toBeTruthy();
  });

  it("opens and closes the report dialog", () => {
    renderGallery();

    fireEvent.click(screen.getByRole("button", { name: "Inhalt melden" }));
    const dialog = screen.getByRole("dialog", { name: "Inhalt melden" });
    expect(within(dialog).getByLabelText("Grund")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog", { name: "Inhalt melden" })).toBeNull();
  });

  it("disables the pagination edges and switches the middle page", () => {
    renderGallery();

    const back = screen.getAllByRole("button", { name: "Zurück" });
    expect((back[0] as HTMLButtonElement).disabled).toBe(true);

    const next = screen.getAllByRole("button", { name: "Weiter" });
    expect((next[2] as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(next[1]);
    expect(screen.getByText(/Mittlere Seite \(mit Auslassung\) — Seite 7/)).toBeTruthy();
  });

  it("renders user content in the design's prose typography", () => {
    renderGallery();

    const heading = screen.getByRole("heading", { name: "Erst messen, dann indizieren" });
    expect(heading.closest(".md")).toBeTruthy();
    expect(screen.getByText(/SELECT id, title FROM threads/)).toBeTruthy();
  });

  it("switches the markdown editor to its preview tab", () => {
    renderGallery();

    const section = document.getElementById("editor") as HTMLElement;
    const writeArea = within(section).getByLabelText("Kommentartext");
    const editor = writeArea.closest(".editor") as HTMLElement;

    fireEvent.click(within(editor).getByRole("tab", { name: "Vorschau" }));
    expect(within(editor).getByText("Vorschau ist nicht verfügbar.")).toBeTruthy();

    fireEvent.click(within(editor).getByRole("tab", { name: "Schreiben" }));
    expect(within(editor).getByLabelText("Kommentartext")).toBeTruthy();
  });

  it("opens the header notification panel with its empty state and closes it on Escape", () => {
    renderGallery();

    const header = document.querySelector("header.app-header") as HTMLElement;
    fireEvent.click(within(header).getByRole("button", { name: "Benachrichtigungen" }));

    expect(within(header).getByText("Noch keine Benachrichtigungen.")).toBeTruthy();
    const markAll = within(header).getByRole("button", { name: "Alle als gelesen markieren" });
    expect((markAll as HTMLButtonElement).disabled).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(header).queryByText("Noch keine Benachrichtigungen.")).toBeNull();
  });

  it("shows the unread badge with its capped count", () => {
    renderGallery();

    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("shows empty states, banners and toasts", () => {
    renderGallery();

    expect(screen.getByRole("heading", { name: "Noch keine Threads" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Keine Treffer" })).toBeTruthy();
    expect(screen.getByText("Benutzername oder Passwort ist falsch.")).toBeTruthy();
    expect(screen.getByText(/Zu viele Beiträge in kurzer Zeit/)).toBeTruthy();
    expect(
      screen.getByText(/Dein Konto ist bis zum 24.10.2026 gesperrt/),
    ).toBeTruthy();
  });

  it("links thread cards at their thread route", () => {
    renderGallery();

    const cards = document.getElementById("thread-karten") as HTMLElement;
    const title = within(cards).getByRole("link", {
      name: /PostgreSQL Indizes richtig einsetzen — ein Leitfaden/,
    });
    expect(title.getAttribute("href")).toBe("/threads/1");

    const pinnedBadge = screen.getAllByText("Angeheftet")[0];
    expect(pinnedBadge.className).toContain("badge--pin");
  });

  it("renders the whole gallery without console errors or uncaught exceptions", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      renderGallery();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
