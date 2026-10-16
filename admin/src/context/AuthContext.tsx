import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  apiFetch,
  readSession,
  refreshAccessToken,
  subscribeSession,
  writeSession,
  type LoginResponse,
  type Session,
  type UserOut,
} from "../lib/api";

export interface AuthContextValue {
  user: UserOut | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserOut>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<UserOut | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [loading, setLoading] = useState(false);

  useEffect(() => subscribeSession(setSession), []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    writeSession({ accessToken: response.access_token, user: response.user });
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch<void>("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    writeSession(null);
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    try {
      const refreshed = await refreshAccessToken();
      return refreshed?.user ?? null;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      loading,
      login,
      logout,
      refreshSession,
    }),
    [session, loading, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
