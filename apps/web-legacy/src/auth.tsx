// Auth context: session token + workspace, gates the app.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";

import { clearToken, getToken, setToken, get as apiGet, post as apiPost } from "./api";

export type WorkspaceInfo = {
  id: string;
  name: string;
  short_name: string;
  role: string;
  site_label: string;
  product_line: string;
  accent: string;
  story: string;
  domains: string[];
  shift?: string;
};

export type AuthUser = {
  email: string;
  name: string;
  role: string;
};

type AuthState = {
  ready: boolean;
  user: AuthUser | null;
  workspace: WorkspaceInfo | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);

  const applySession = useCallback((data: { user: AuthUser; workspace: WorkspaceInfo; token?: string }) => {
    if (data.token) setToken(data.token);
    setUser(data.user);
    setWorkspace(data.workspace);
    if (data.workspace?.accent) {
      document.documentElement.style.setProperty("--tenant-accent", data.workspace.accent);
    }
  }, []);

  const clearSession = useCallback(() => {
    clearToken();
    setUser(null);
    setWorkspace(null);
    document.documentElement.style.removeProperty("--tenant-accent");
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      clearSession();
      setReady(true);
      return;
    }
    try {
      const me = await apiGet<{ user: AuthUser; workspace: WorkspaceInfo }>("/api/auth/me");
      applySession(me);
    } catch {
      clearSession();
    } finally {
      setReady(true);
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiPost<{
      token: string; user: AuthUser; workspace: WorkspaceInfo;
    }>("/api/auth/login", { email, password });
    applySession(res);
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await apiPost("/api/auth/logout");
    } catch { /* ignore */ }
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ ready, user, workspace, login, logout, refresh }),
    [ready, user, workspace, login, logout, refresh],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
