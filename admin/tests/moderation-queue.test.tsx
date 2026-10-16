import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ModerationQueue from "../src/pages/ModerationQueue";

interface ReportFixture {
  id: number;
  content_type: "thread" | "comment";
  content_id: number;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  reporter_username: string;
  content_excerpt: string;
  content_url: string;
}

function report(overrides: Partial<ReportFixture> = {}): ReportFixture {
  return {
    id: 1042,
    content_type: "comment",
    content_id: 7,
    reason: "Spam",
    note: null,
    status: "open",
    created_at: new Date(Date.now() - 8 * 60_000).toISOString(),
    reporter_username: "lena",
    content_excerpt: "Kaufen Sie jetzt günstige Kreditkarten-Daten — bit.ly/xxxx",
    content_url: "/threads/12#comment-7",
    ...overrides,
  };
}

function pageOf(items: ReportFixture[]) {
  return { items, total: items.length, page: 1, page_size: 20, pages: 1 };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderQueue() {
  return render(
    <MemoryRouter>
      <ModerationQueue />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("moderation queue", () => {
  it("lists an open report with reason, note, reporter, content and a forum link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(pageOf([report({ note: "Wiederholter Spam-Link" })]))),
    );

    renderQueue();

    expect(await screen.findByText("Spam")).toBeTruthy();
    expect(screen.getByText("#1042")).toBeTruthy();
    expect(screen.getByText("Gemeldeter Kommentar")).toBeTruthy();
    expect(
      screen.getByText("Kaufen Sie jetzt günstige Kreditkarten-Daten — bit.ly/xxxx"),
    ).toBeTruthy();
    expect(screen.getByText("Notiz: Wiederholter Spam-Link")).toBeTruthy();
    expect(screen.getByText("Gemeldet von @lena")).toBeTruthy();

    const link = screen.getByRole("link", { name: "Inhalt ansehen" });
    expect(link.getAttribute("href")).toContain("/threads/12#comment-7");
  });

  it("shows the empty state when the queue is empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(pageOf([]))));

    renderQueue();

    expect(await screen.findByText("Keine offenen Meldungen")).toBeTruthy();
  });

  it("shows an error state when the queue cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: "forbidden", message: "Zugriff verweigert" } }, 403)),
    );

    renderQueue();

    expect(await screen.findByText("Zugriff verweigert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("removes the reported content and drops the entry from the queue", async () => {
    const calls: Array<{ id: number; action: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes("/resolve")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { action: string };
          calls.push({ id: Number(url.split("/").at(-2)), action: body.action });
          return jsonResponse(report({ status: "resolved" }));
        }
        return jsonResponse(pageOf([report()]));
      }),
    );

    renderQueue();
    await screen.findByText("Spam");

    fireEvent.click(screen.getByRole("button", { name: "Inhalt entfernen" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Inhalt entfernen" }));

    await waitFor(() => {
      expect(screen.queryByText("#1042")).toBeNull();
    });
    expect(calls).toEqual([{ id: 1042, action: "remove_content" }]);
    expect(screen.getByText("Keine offenen Meldungen")).toBeTruthy();
  });

  it("dismisses the report and drops the entry from the queue", async () => {
    const calls: Array<{ id: number; action: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes("/resolve")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { action: string };
          calls.push({ id: Number(url.split("/").at(-2)), action: body.action });
          return jsonResponse(report({ status: "dismissed" }));
        }
        return jsonResponse(
          pageOf([report({ id: 1041, content_type: "thread", reason: "Falsche Kategorie" })]),
        );
      }),
    );

    renderQueue();
    await screen.findByText("Falsche Kategorie");

    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Verwerfen" }));

    await waitFor(() => {
      expect(screen.queryByText("#1041")).toBeNull();
    });
    expect(calls).toEqual([{ id: 1041, action: "dismiss" }]);
    expect(screen.getByText("Keine offenen Meldungen")).toBeTruthy();
  });
});
