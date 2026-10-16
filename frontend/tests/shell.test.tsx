import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import App from "../src/App";

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
    expect(screen.getByRole("link", { name: "Benachrichtigungen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hell/Dunkel umschalten" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Alle Threads" })).toBeTruthy();
  });

  it("renders the routed page inside the frame", () => {
    renderApp("/settings");

    expect(screen.getByRole("heading", { name: "Einstellungen" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Community" })).toBeTruthy();
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
