// Thin API client + polling/websocket hooks for the LIVIS central plane.

import { useCallback, useEffect, useRef, useState } from "react";

const BASE = "";
const TOKEN_KEY = "livis_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function get<T = any>(path: string): Promise<T> {
  const r = await fetch(BASE + path, { headers: authHeaders() });
  if (r.status === 401 && !path.startsWith("/api/auth/")) {
    clearToken();
  }
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `${r.status} ${path}`);
  }
  return r.json();
}

async function mutate<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && !path.startsWith("/api/auth/")) {
    clearToken();
  }
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail?.detail ?? `${r.status} ${path}`);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

export async function post<T = any>(path: string, body?: unknown): Promise<T> {
  return mutate<T>("POST", path, body);
}

export async function put<T = any>(path: string, body?: unknown): Promise<T> {
  return mutate<T>("PUT", path, body);
}

export async function del<T = any>(path: string): Promise<T> {
  return mutate<T>("DELETE", path);
}

/** Fetch once + refetch on an interval (live plant feel without heavy state mgmt). */
export function usePoll<T = any>(path: string | null, intervalMs = 5000): {
  data: T | null; refresh: () => void; error: string | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setError(null);
      return;
    }
    if (!getToken() && !path.startsWith("/api/auth/")) {
      setData(null);
      return;
    }
    let alive = true;
    const load = () =>
      get<T>(path)
        .then((d) => { if (alive) { setData(d); setError(null); } })
        .catch((e) => { if (alive) setError(String(e)); });
    load();
    const id = intervalMs > 0 ? setInterval(load, intervalMs) : undefined;
    return () => { alive = false; if (id) clearInterval(id); };
  }, [path, intervalMs, tick]);

  return { data, refresh, error };
}

export interface LiveEnvelope {
  envelope_version: string;
  event_id: string;
  topic: string;
  source: string;
  source_timestamp: string;
  timestamp_trust: number;
  payload: any;
  workspace_id?: string;
}

/** Subscribe to the live event stream; keeps the last N envelopes. */
export function useLiveEvents(max = 40): { events: LiveEnvelope[]; connected: boolean } {
  const [events, setEvents] = useState<LiveEnvelope[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setConnected(false);
      return;
    }
    let closed = false;
    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const t = getToken();
      if (!t) return;
      const ws = new WebSocket(`${proto}://${location.host}/ws/live?token=${encodeURIComponent(t)}`);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (m) => {
        try {
          const env: LiveEnvelope = JSON.parse(m.data);
          setEvents((prev) => [env, ...prev].slice(0, max));
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(connect, 2500);
      };
    }
    connect();
    return () => { closed = true; wsRef.current?.close(); };
  }, [max]);

  return { events, connected };
}

export const fmtUsd = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M`
  : v >= 1000 ? `$${(v / 1000).toFixed(1)}k`
  : `$${v.toFixed(0)}`;

export const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

export const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
