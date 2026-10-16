import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>("../src/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
import AuditLog, { type AuditPage } from "../src/pages/AuditLog";

const mockedApiFetch = vi.mocked(apiFetch);

const BAN_ENTRY = {
  id: 1,
  actor_username: "admin",
  action: "user.ban",
  target_type: "user",
  target_id: 42,
  details: JSON.stringify({ reason: "Spam", expires_at: null }),
  created_at: "2026-10-16T14:58:00",
};

const REPORT_ENTRY = {
  id: 2,
  actor_username: "lena",
  action: "report.remove_content",
  target_type: "report",
  target_id: 1032,
  details: JSON.stringify({ action: "remove_content", content_type: "comment", content_id: 88213 }),
  created_at: "2026-10-16T14:31:00",
};

function page(items: AuditPage["items"], overrides: Partial<AuditPage> = {}): AuditPage {
  return { items, total: items.length, page: 1, page_size: 20, pages: 1, ...overrides };
}

function renderAudit() {
  return render(
    <MemoryRouter>
      <AuditLog />
    </MemoryRouter>,
  );
}

async function loadedTable(): Promise<HTMLElement> {
  await screen.findByRole("link", { name: "@admin" });
  return screen.getByRole("table", { name: "Audit-Log" });
}

beforeEach(() => {
  mockedApiFetch.mockReset();
});

describe("admin audit log", () => {
  it("lists actor, action, target and timestamp of the loaded entries", async () => {
    mockedApiFetch.mockResolvedValue(page([BAN_ENTRY, REPORT_ENTRY]));
    renderAudit();

    const table = await loadedTable();
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/admin/audit-log?page=1&page_size=20");

    expect(within(table).getByText("Nutzer gesperrt")).toBeTruthy();
    expect(within(table).getByText("Inhalt entfernt")).toBeTruthy();
    expect(within(table).getByText("#42")).toBeTruthy();
    expect(within(table).getByText("#1032")).toBeTruthy();
    expect(within(table).getByText("16.10.2026, 14:58")).toBeTruthy();
    expect(within(table).getByText("Grund: Spam · unbefristet")).toBeTruthy();
    expect(within(table).getByText("Kommentar #88213 entfernt")).toBeTruthy();
  });

  it("shows the kit loading state while the request is in flight", () => {
    mockedApiFetch.mockReturnValue(new Promise<AuditPage>(() => undefined));
    renderAudit();

    const table = screen.getByRole("table", { name: "Audit-Log" });
    expect(table.getAttribute("aria-busy")).toBe("true");
    expect(table.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("shows the kit empty state when there are no entries", async () => {
    mockedApiFetch.mockResolvedValue(page([]));
    renderAudit();

    expect(await screen.findByText("Noch keine Einträge")).toBeTruthy();
  });

  it("shows an error banner and retries the request on demand", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("boom"));
    renderAudit();

    expect(await screen.findByText("Das Audit-Log konnte nicht geladen werden.")).toBeTruthy();

    mockedApiFetch.mockResolvedValueOnce(page([BAN_ENTRY]));
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("link", { name: "@admin" })).toBeTruthy();
  });

  it("requests the next page from the pagination", async () => {
    mockedApiFetch.mockResolvedValue(page([BAN_ENTRY], { total: 45, pages: 3 }));
    renderAudit();

    await loadedTable();
    expect(screen.getByText(/Seite 1 von 3 · 45 Einträge/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenLastCalledWith("/api/admin/audit-log?page=2&page_size=20"),
    );
  });

  it("filters the loaded entries by the actor search", async () => {
    mockedApiFetch.mockResolvedValue(page([BAN_ENTRY, REPORT_ENTRY]));
    renderAudit();

    const table = await loadedTable();
    fireEvent.change(screen.getByRole("searchbox", { name: "Audit-Log durchsuchen" }), {
      target: { value: "lena" },
    });

    expect(within(table).queryByText("Nutzer gesperrt")).toBeNull();
    expect(within(table).getByText("Inhalt entfernt")).toBeTruthy();
  });

  it("filters the loaded entries by action and clears the result through the empty state", async () => {
    mockedApiFetch.mockResolvedValue(page([BAN_ENTRY, REPORT_ENTRY]));
    renderAudit();

    const table = await loadedTable();
    fireEvent.change(screen.getByRole("combobox", { name: "Aktion filtern" }), {
      target: { value: "user.ban" },
    });

    expect(within(table).getByText("Nutzer gesperrt")).toBeTruthy();
    expect(within(table).queryByText("Inhalt entfernt")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Aktion filtern" }), {
      target: { value: "thread.lock" },
    });
    expect(within(table).getByText("Keine Einträge gefunden")).toBeTruthy();
  });

  it("opens the export button only once entries are loaded", async () => {
    mockedApiFetch.mockResolvedValue(page([BAN_ENTRY]));
    renderAudit();

    const button = screen.getByRole("button", { name: "CSV exportieren" });
    await loadedTable();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("lists actions recorded elsewhere again after the screen is reopened", async () => {
    mockedApiFetch.mockResolvedValueOnce(page([]));
    const first = renderAudit();
    await screen.findByText("Noch keine Einträge");
    first.unmount();

    mockedApiFetch.mockResolvedValueOnce(page([BAN_ENTRY, REPORT_ENTRY]));
    renderAudit();
    const table = await loadedTable();
    expect(within(table).getByText("Nutzer gesperrt")).toBeTruthy();
    expect(within(table).getByText("Inhalt entfernt")).toBeTruthy();
  });
});
