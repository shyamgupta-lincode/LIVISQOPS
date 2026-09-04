const API = process.env.NEXT_PUBLIC_API_URL || "/api";

export function token(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("fo_token");
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as any),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const base = path.startsWith("/api") ? "" : `${API}`;
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/api") ? path : `/v1${path}`}`;
  // normalize: callers use /quality/... against /api/v1
  const finalUrl = path.startsWith("/api/")
    ? path
    : path.startsWith("/v1/")
      ? `/api${path}`
      : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(finalUrl, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json();
}

export async function login(email: string, password: string) {
  const data = await api<{ token: string; user: any }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("fo_token", data.token);
  localStorage.setItem("fo_user", JSON.stringify(data.user));
  return data;
}
