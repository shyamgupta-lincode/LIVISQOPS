// Login — domain on email selects Harley / Tier 1 / Tier 2 / Lam / Hemlock workspace.

import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { get } from "../api";
import { useAuth, type WorkspaceInfo } from "../auth";

type CatalogRow = WorkspaceInfo & { example_email: string };

export default function Login() {
  const { ready, user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("jordan.hale@harleydavidson.com");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [hint, setHint] = useState<WorkspaceInfo | null>(null);

  useEffect(() => {
    get<{ workspaces: CatalogRow[]; demo_password: string }>("/api/auth/workspaces")
      .then((d) => {
        setCatalog(d.workspaces || []);
        if (d.demo_password) setPassword(d.demo_password);
      })
      .catch(() => { /* health not ready yet */ });
  }, []);

  useEffect(() => {
    const q = email.trim();
    if (!q.includes("@")) {
      setHint(null);
      return;
    }
    const t = setTimeout(() => {
      get<{ workspace: WorkspaceInfo | null }>(
        `/api/auth/resolve?email=${encodeURIComponent(q)}`,
      )
        .then((d) => setHint(d.workspace))
        .catch(() => setHint(null));
    }, 200);
    return () => clearTimeout(t);
  }, [email]);

  const accent = hint?.accent || "#3E96F4";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      nav("/", { replace: true });
    } catch (err: any) {
      setError(String(err?.message || err || "Login failed"));
    } finally {
      setBusy(false);
    }
  };

  const pickDemo = (row: CatalogRow) => {
    setEmail(row.example_email);
    setPassword("demo");
    setError(null);
  };

  const domainHint = useMemo(() => {
    if (!hint) return "Enter a demo email — domain selects the workspace.";
    return `Entering ${hint.name} · ${hint.role}`;
  }, [hint]);

  if (ready && user) return <Navigate to="/" replace />;

  return (
    <div className="login-page" style={{ ["--tenant-accent" as any]: accent }}>
      <div className="login-panel">
        <div className="login-brand">
          <img className="mark" src="https://livis.ai/image/icons/lincode_livis.svg" alt="Lincode LIVIS" />
          <img className="mark wordmark" src="/qualityops-logo.svg" alt="QualityOps" />
        </div>
        <h1>Sign in to LIVIS</h1>
        <p className="login-sub">
          Your email domain selects the tenant workspace — Harley-Davidson OEM,
          Meridian Dynamics (Tier 1), Apex Precision (Tier 2), Lam Research, or
          Hemlock Semiconductor.
        </p>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@harleydavidson.com"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <div
            className={`login-hint ${hint ? "known" : ""}`}
            style={hint ? { borderColor: accent } : undefined}
          >
            <span className="login-hint-dot" style={{ background: hint ? accent : "#8A8680" }} />
            <div>
              <strong>{hint ? hint.short_name : "Workspace"}</strong>
              <div className="dim">{domainHint}</div>
              {hint && <div className="dim">{hint.site_label} · {hint.product_line}</div>}
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Enter workspace"}
          </button>
        </form>

        <div className="demo-logins">
          <div className="demo-logins-title">Demo logins</div>
          <p className="dim">Password for all: <code>demo</code></p>
          <div className="demo-logins-grid">
            {catalog.map((row) => (
              <button
                key={row.id}
                type="button"
                className="demo-login-card"
                style={{ ["--card-accent" as any]: row.accent }}
                onClick={() => pickDemo(row)}
              >
                <div className="demo-login-name">{row.name}</div>
                <div className="demo-login-role">{row.role}</div>
                <div className="demo-login-email">{row.example_email}</div>
                <div className="demo-login-domains">
                  {row.domains.slice(0, 2).map((d) => (
                    <span key={d}>@{d}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
