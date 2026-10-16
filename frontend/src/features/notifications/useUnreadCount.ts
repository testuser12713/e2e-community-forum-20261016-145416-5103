import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

interface UnreadCountResponse {
  count: number;
}

/**
 * Module-level store for the unread badge. The header mounts the hook once and
 * the notifications screen publishes updates after it marks entries read, so
 * both views show the same number without sharing a context tree.
 */
let currentCount = 0;
const listeners = new Set<(count: number) => void>();

function publish(count: number): void {
  currentCount = count;
  for (const listener of listeners) listener(count);
}

/** Publishes a known count without touching the API (optimistic update). */
export function setUnreadCount(count: number): void {
  publish(Math.max(0, count));
}

/**
 * Re-reads GET /api/notifications/unread-count and publishes the result.
 * A signed-out or unreachable API leaves the last known count in place — the
 * notifications screen is the only caller that has just changed it.
 */
export function refreshUnreadCount(): Promise<void> {
  return apiFetch<UnreadCountResponse>("/api/notifications/unread-count")
    .then((result) => {
      publish(result.count);
    })
    .catch(() => {
      // The badge keeps its previous number; a 401 simply means "not signed in".
    });
}

/** The number of unread notifications, kept in sync with every other caller. */
export function useUnreadCount(): number {
  const [count, setCount] = useState(currentCount);

  useEffect(() => {
    const listener = (next: number) => setCount(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    void refreshUnreadCount();
  }, []);

  return count;
}
