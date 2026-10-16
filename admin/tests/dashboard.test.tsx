import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import { AuthProvider } from "../src/context/AuthContext";
import { ThemeProvider } from "../src/context/ThemeContext";
import type { AdminStats } from "../src/pages/Dashboard";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderDashboard() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </ThemeProvider>,
  );
}

function kpiCard(label: string): HTMLElement {
  const element = screen.getByText(label).closest(".kpi");
  if (!element) throw new Error(`KPI card not found: ${label}`);
  return element as HTMLElement;
}

const seededStats: AdminStats = {
  users_today: 12,
  users_7d: 184,
  threads_today: 5,
  threads_7d: 42,
  comments_today: 31,
  comments_7d: 312,
  open_reports: 7,
};

describe("admin dashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows user, thread and comment counts for today and the last 7 days plus open reports", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(seededStats)));

    renderDashboard();

    expect(await screen.findByText("184")).toBeTruthy();

    expect(kpiCard("Neue Nutzer (7 Tage)").textContent).toContain("184");
    expect(kpiCard("Neue Nutzer (7 Tage)").textContent).toContain("+12");

    expect(kpiCard("Neue Threads (7 Tage)").textContent).toContain("42");
    expect(kpiCard("Neue Threads (7 Tage)").textContent).toContain("+5");

    expect(kpiCard("Neue Kommentare (7 Tage)").textContent).toContain("312");
    expect(kpiCard("Neue Kommentare (7 Tage)").textContent).toContain("+31");

    expect(kpiCard("Offene Meldungen").textContent).toContain("7");
  });

  it("links the open-report figure into the moderation queue", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(seededStats)));

    renderDashboard();

    const link = await screen.findByRole("link", { name: /Offene Meldungen/ });
    expect(link.getAttribute("href")).toBe("/moderation");
    expect(link.textContent).toContain("7");
  });

  it("shows a loading state while the statistics are pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    renderDashboard();

    expect(screen.getByText("Kennzahlen werden geladen…")).toBeTruthy();
    expect(screen.queryByText("Offene Meldungen")).toBeNull();
  });

  it("shows an error state with a retry when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { error: { code: "internal", message: "Die Kennzahlen sind nicht verfügbar." } },
          500,
        ),
      ),
    );

    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Die Kennzahlen sind nicht verfügbar.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("shows the empty state when every figure is zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          users_today: 0,
          users_7d: 0,
          threads_today: 0,
          threads_7d: 0,
          comments_today: 0,
          comments_7d: 0,
          open_reports: 0,
        }),
      ),
    );

    renderDashboard();

    expect(await screen.findByText("Noch keine Aktivität")).toBeTruthy();
  });

  it("keeps the period filter visible but disabled and refetches on refresh", async () => {
    const refreshed: AdminStats = { ...seededStats, users_7d: 999 };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(seededStats))
      .mockResolvedValueOnce(jsonResponse(refreshed));
    vi.stubGlobal("fetch", fetchMock);

    renderDashboard();

    const period = (await screen.findByRole("combobox", { name: "Zeitraum" })) as HTMLSelectElement;
    expect(period.disabled).toBe(true);

    await screen.findByText("184");
    fireEvent.click(screen.getByRole("button", { name: "Aktualisieren" }));

    await waitFor(() => expect(screen.getByText("999")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
