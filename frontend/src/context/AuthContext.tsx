import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  apiFetch,
  getAccessToken,
  setAccessToken,
  setSessionListener,
  type SessionResponse,
  type UserOut,
} from "../lib/api";

const SESSION_STORAGE_KEY = "forum-session";

interface StoredSession {
  access_token: string;
  user: UserOut;
}

export interface AuthContextValue {
  user: UserOut | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed.access_token === "string" && typeof parsed.user?.username === "string") {
      return parsed;
    }
  } catch {
    // Corrupted storage counts as "not signed in".
  }
  return null;
}

function writeStoredSession(session: StoredSession | null): void {
  try {
    if (session === null) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Storage may be unavailable; the in-memory session still works.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const applySession = useCallback((next: SessionResponse | null) => {
    if (next === null) {
      setAccessToken(null);
      setSession(null);
      writeStoredSession(null);
      return;
    }
    const stored: StoredSession = { access_token: next.access_token, user: next.user };
    setAccessToken(next.access_token);
    setSession(stored);
    writeStoredSession(stored);
  }, []);

  useEffect(() => {
    setSessionListener((next) => {
      applySession(next);
    });
    return () => {
      setSessionListener(null);
    };
  }, [applySession]);

  useEffect(() => {
    mountedRef.current = true;
    const stored = readStoredSession();
    if (stored !== null) {
      setAccessToken(stored.access_token);
      setSession(stored);
    }

    const restore = async () => {
      if (stored === null) {
        setLoading(false);
        return;
      }
      try {
        const me = await apiFetch<UserOut>("/api/me");
        if (!mountedRef.current) return;
        applySession({
          access_token: getAccessToken() ?? stored.access_token,
          token_type: "bearer",
          expires_in: 0,
          user: me,
        });
      } catch {
        if (mountedRef.current) applySession(null);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    void restore();

    return () => {
      mountedRef.current = false;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const next = await apiFetch<SessionResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      applySession(next);
    },
    [applySession],
  );

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      await apiFetch<UserOut>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      });
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>("/api/auth/logout", { method: "POST" });
    } catch {
      // Signing out locally must succeed even when the API cannot be reached;
      // the refresh cookie is dropped by the browser at the latest when it expires.
    } finally {
      applySession(null);
    }
  }, [applySession]);

  const refreshSession = useCallback(async () => {
    const next = await apiFetch<SessionResponse>("/api/auth/refresh", { method: "POST" });
    applySession(next);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      loading,
      login,
      register,
      logout,
      refreshSession,
    }),
    [session, loading, login, register, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
