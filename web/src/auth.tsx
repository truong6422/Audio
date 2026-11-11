import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@shared/types";
import { apiGet, apiPost } from "./api";

interface AuthState {
  user: User | null;
  ready: boolean;
  login(email: string, password: string): Promise<User>;
  register(input: { email: string; password: string; name: string; setupToken?: string }): Promise<User>;
  logout(): Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    apiGet<{ user: User | null }>("/api/auth/me")
      .then((r) => setUser(r.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await apiPost<{ user: User }>("/api/auth/login", { email, password });
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (input: { email: string; password: string; name: string; setupToken?: string }) => {
    const body: Record<string, unknown> = { email: input.email, password: input.password, name: input.name };
    if (input.setupToken) body.setupToken = input.setupToken;
    const r = await apiPost<{ user: User }>("/api/auth/register", body);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/api/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, ready, login, register, logout }), [user, ready, login, register, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth ngoài AuthProvider");
  return v;
}
