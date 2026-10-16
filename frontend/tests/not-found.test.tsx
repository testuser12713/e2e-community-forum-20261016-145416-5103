import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../src/App";
import NotFound from "../src/pages/NotFound";

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("forum not-found page", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("shows the not-found screen for an unknown address", () => {
    renderApp("/diese-seite-gibt-es-nicht");

    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Diese Seite existiert nicht (mehr)." })).toBeTruthy();
    expect(
      screen.getByText(
        "Vielleicht wurde der Thread gelöscht, die Kategorie umbenannt oder der Link ist falsch.",
      ),
    ).toBeTruthy();
  });

  it("links to the home page and the search page", () => {
    renderApp("/unbekannt");

    const home = screen.getByRole("link", { name: "Zur Startseite" });
    const search = screen.getByRole("link", { name: "Zur Suche" });
    expect(home.getAttribute("href")).toBe("/");
    expect(search.getAttribute("href")).toBe("/search");
  });

  it("navigates to the home page when the primary link is pressed", () => {
    render(
      <MemoryRouter initialEntries={["/unbekannt"]}>
        <Routes>
          <Route path="/" element={<div>Zuhause</div>} />
          <Route path="/search" element={<div>Suche</div>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Zur Startseite" }));
    expect(screen.getByText("Zuhause")).toBeTruthy();
  });

  it("navigates to the search page when the secondary link is pressed", () => {
    render(
      <MemoryRouter initialEntries={["/unbekannt"]}>
        <Routes>
          <Route path="/" element={<div>Zuhause</div>} />
          <Route path="/search" element={<div>Suche</div>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Zur Suche" }));
    expect(screen.getByText("Suche")).toBeTruthy();
  });
});
