export type UserRole = "user" | "moderator" | "admin";

export interface UserOut {
  id: number;
  username: string;
  email: string;
  bio: string | null;
  role: UserRole;
  karma: number;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserOut;
}

export interface Session {
  accessToken: string;
  user: UserOut;
}

export const SESSION_STORAGE_KEY = "admin-session";

export interface ApiErrorBody {
  code: string;
  message: string;
  fields: Record<string, string>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly retryAfter: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, string> = {},
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }
}

function envValue(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim().replace(/\/+$/, "");
  if (!value || value.includes("${")) return fallback;
  return value;
}

export const API_BASE_URL = envValue(import.meta.env.VITE_API_BASE_URL, "http://localhost:8000");
export const FORUM_URL = envValue(import.meta.env.VITE_FORUM_URL, "http://localhost:5173");

let memorySession: Session | null | undefined;
const sessionListeners = new Set<(session: Session | null) => void>();

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { accessToken?: unknown; user?: unknown };
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.user === "object" &&
    candidate.user !== null
  );
}

export function readSession(): Session | null {
  if (memorySession !== undefined) return memorySession;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    memorySession = isSession(parsed) ? parsed : null;
  } catch {
    memorySession = null;
  }
  return memorySession;
}

export function writeSession(session: Session | null): void {
  memorySession = session;
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
  }
  for (const listener of sessionListeners) listener(session);
}

export function subscribeSession(listener: (session: Session | null) => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function isAuthPath(path: string): boolean {
  return path.startsWith("/api/auth/");
}

async function sendRequest(url: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const session = readSession();
  if (session && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }
  try {
    return await fetch(url, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "network_error", "Die API ist nicht erreichbar.");
  }
}

function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get("Retry-After");
  if (!raw) return null;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function toApiError(response: Response, body: unknown): ApiError {
  const error = (body as { error?: Partial<ApiErrorBody> } | null)?.error;
  const fields =
    error && typeof error.fields === "object" && error.fields !== null ? error.fields : {};
  return new ApiError(
    response.status,
    error?.code ?? `http_${response.status}`,
    error?.message || response.statusText || "Die Anfrage ist fehlgeschlagen.",
    fields,
    retryAfterSeconds(response),
  );
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    const text = await response.text();
    return text ? { error: { code: `http_${response.status}`, message: text } } : null;
  } catch {
    return null;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await parseBody(response);
  if (!response.ok) throw toApiError(response, body);
  return body as T;
}

export async function refreshAccessToken(): Promise<Session | null> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    if (response.status === 401) writeSession(null);
    return null;
  }
  try {
    const data = (await response.json()) as LoginResponse;
    const session: Session = { accessToken: data.access_token, user: data.user };
    writeSession(session);
    return session;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = buildUrl(path);
  let response = await sendRequest(url, init);
  if (response.status === 401 && !isAuthPath(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await sendRequest(url, init);
  }
  return parseResponse<T>(response);
}
