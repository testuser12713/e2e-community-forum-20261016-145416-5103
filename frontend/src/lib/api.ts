export interface UserOut {
  id: number;
  username: string;
  email: string;
  bio: string | null;
  role: string;
  karma: number;
  created_at: string;
}

export interface SessionResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserOut;
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

const rawApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_BASE = (rawApiBase ?? "").replace(/\/+$/, "");

/**
 * The auth endpoints answer 401 as a meaningful result (wrong credentials, an
 * expired refresh token), so they never go through the refresh-and-retry loop.
 * Spelled exactly as the sprint contract declares them.
 */
const NO_REFRESH_RETRY_PATHS = new Set([
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/password",
]);

let accessToken: string | null = null;
let sessionListener: ((session: SessionResponse) => void) | null = null;
let refreshInFlight: Promise<SessionResponse | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionListener(listener: ((session: SessionResponse) => void) | null): void {
  sessionListener = listener;
}

function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function buildInit(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers, credentials: init.credentials ?? "include" };
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let code = "request_failed";
  let message = `Request failed with status ${response.status}`;
  let fields: Record<string, string> = {};
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; fields?: Record<string, string> };
    };
    if (body && typeof body === "object" && body.error) {
      if (typeof body.error.code === "string") code = body.error.code;
      if (typeof body.error.message === "string") message = body.error.message;
      if (body.error.fields && typeof body.error.fields === "object") fields = body.error.fields;
    }
  } catch {
    // A failure without the API's JSON error envelope keeps the generic message.
  }
  const retryAfterHeader = response.headers.get("Retry-After");
  const retryAfterSeconds = retryAfterHeader === null ? Number.NaN : Number(retryAfterHeader);
  return new ApiError(
    response.status,
    code,
    message,
    fields,
    Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
  );
}

async function refreshSession(): Promise<SessionResponse | null> {
  if (refreshInFlight === null) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(buildUrl("/api/auth/refresh"), {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) return null;
        const session = (await response.json()) as SessionResponse;
        accessToken = session.access_token;
        sessionListener?.(session);
        return session;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await fetch(buildUrl(path), buildInit(init, accessToken));

  if (response.status === 401 && !NO_REFRESH_RETRY_PATHS.has(path)) {
    const session = await refreshSession();
    if (session !== null) {
      response = await fetch(buildUrl(path), buildInit(init, session.access_token));
    }
  }

  if (!response.ok) {
    throw await errorFromResponse(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
