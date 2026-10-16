import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>("../src/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
import Dashboard from "../src/pages/Dashboard";

const mockedApiFetch = vi.mocked(apiFetch);

const STATS = {
  users_today: 12,
  users_7d: 184,
  threads_today: 5,
  threads_7d: 42,
  comments_today: 9,
  comments_7d: 88,
  open_reports: 7,
};

const ZERO_STATS = {
  users_today: 0,
  users_7d: 0,
  threads_today: 0,
  threads_7d: 0,
  comments_today: 0,
  comments_7d: 0,
  open_reports: 0,
};

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

describe("admin dashboard", () => {
  it("renders the KPI figures from the stats endpoint", async () => {
    mockedApiFetch.mockResolvedValue(STATS);
    renderDashboard();

    expect(await screen.findByText("184")).toBeTruthy();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/admin/stats");

    expect(screen.getByText("Neue Nutzer")).toBeTruthy();
    expect(screen.getByText("Neue Threads")).toBeTruthy();
    expect(screen.getByText("Neue Kommentare")).toBeTruthy();
    expect(screen.getByText("Offene Meldungen")).toBeTruthy();

    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText("88")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("shows the today figure beside its seven-day figure on each card", async () => {
    mockedApiFetch.mockResolvedValue(STATS);
    renderDashboard();

    expect(await screen.findByText("184")).toBeTruthy();
    expect(screen.getByText("+12")).toBeTruthy();
    expect(screen.getByText("+5")).toBeTruthy();
    expect(screen.getByText("+9")).toBeTruthy();
  });

  it("shows skeleton cards with a status role while the request is in flight", () => {
    mockedApiFetch.mockReturnValue(new Promise<typeof STATS>(() => undefined));
    renderDashboard();

    const status = screen.getByRole("status");
    expect(status.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("shows a danger banner and refetches on retry", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("boom"));
    renderDashboard();

    expect(await screen.findByText("Die Kennzahlen konnten nicht geladen werden.")).toBeTruthy();

    mockedApiFetch.mockResolvedValueOnce(STATS);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("184")).toBeTruthy();
  });

  it("shows the kit empty state for an all-zero response", async () => {
    mockedApiFetch.mockResolvedValue(ZERO_STATS);
    renderDashboard();

    expect(await screen.findByText("Noch keine Aktivität")).toBeTruthy();
    expect(screen.queryByText("Offene Meldungen")).toBeNull();
  });

  it("links the open-reports card into the moderation queue", async () => {
    mockedApiFetch.mockResolvedValue(STATS);
    renderDashboard();

    const link = await screen.findByRole("link", { name: /Offene Meldungen/ });
    expect(link.getAttribute("href")).toBe("/moderation");
  });

  it("renders the period filter visibly disabled", () => {
    mockedApiFetch.mockReturnValue(new Promise<typeof STATS>(() => undefined));
    renderDashboard();

    const period = screen.getByRole("combobox", { name: "Zeitraum" }) as HTMLSelectElement;
    expect(period.disabled).toBe(true);
    const options = Array.from(period.options).map((option) => option.textContent);
    expect(options).toEqual(["Letzte 7 Tage", "Letzte 30 Tage", "Letzte 90 Tage"]);
  });

  it("refetches the stats from the refresh control", async () => {
    mockedApiFetch.mockResolvedValue(STATS);
    renderDashboard();

    await screen.findByText("184");
    mockedApiFetch.mockClear();
    mockedApiFetch.mockResolvedValue({ ...STATS, users_7d: 200 });

    fireEvent.click(screen.getByRole("button", { name: "Aktualisieren" }));
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledWith("/api/admin/stats"));
    expect(await screen.findByText("200")).toBeTruthy();
  });
});
