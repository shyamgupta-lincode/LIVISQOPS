// Entry experience: choose an App (Operate, Quality & AI, Engineer, Govern)
// and land directly in that role's workflows. Live plant stats on each card
// tell you where attention is needed before you even enter.

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { fmtUsd, usePoll } from "../api";
import { useAuth } from "../auth";
import { APPS } from "../apps";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Launcher() {
  const nav = useNavigate();
  const { user, workspace, logout } = useAuth();
  const { data: cc } = usePoll<any>("/api/command-center", 8000);
  const { data: defects } = usePoll<any[]>("/api/defects?status=Open", 10000);
  const { data: nodes } = usePoll<any[]>("/api/edge/nodes", 10000);
  const { data: value } = usePoll<any>("/api/value/summary", 10000);
  const { data: workflows } = usePoll<any[]>("/api/workflows", 15000);

  // Keyboard shortcuts: 1-4 enter apps directly.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < APPS.length && !e.metaKey && !e.ctrlKey && !e.altKey) {
        nav(APPS[idx].base);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [nav]);

  const p1Count = cc?.events?.filter((e: any) => e.priority === "P1").length ?? null;
  const constraintCount = cc?.constraint_radar?.length ?? null;
  const criticalDefects = defects?.filter((d) => d.severity === "Critical").length ?? null;
  const unhealthyNodes = nodes ? nodes.filter((n) => n.health !== "Healthy").length : null;
  const pendingChanges = workflows?.filter((w) => w.status === "Draft" || w.status === "In Review").length ?? null;

  const statsFor = (appId: string): React.ReactNode => {
    switch (appId) {
      case "operate":
        return (
          <>
            {p1Count !== null && (
              <span className={`stat-pill ${p1Count > 0 ? "alert" : "good"}`}>
                <b>{p1Count}</b> open P1
              </span>
            )}
            {cc && (
              <span className="stat-pill">
                OEE <b>{(cc.kpis.oee * 100).toFixed(1)}%</b>
              </span>
            )}
            {constraintCount !== null && (
              <span className="stat-pill"><b>{constraintCount}</b> constraints emerging</span>
            )}
          </>
        );
      case "quality":
        return (
          <>
            {defects && (
              <span className={`stat-pill ${(criticalDefects ?? 0) > 0 ? "alert" : ""}`}>
                <b>{defects.length}</b> open defects
              </span>
            )}
            {criticalDefects !== null && criticalDefects > 0 && (
              <span className="stat-pill alert"><b>{criticalDefects}</b> critical</span>
            )}
            {cc && <span className="stat-pill">FPY <b>{(cc.kpis.fpy * 100).toFixed(1)}%</b></span>}
          </>
        );
      case "engineer":
        return (
          <>
            {nodes && (
              <span className={`stat-pill ${(unhealthyNodes ?? 0) > 0 ? "alert" : "good"}`}>
                <b>{nodes.length - (unhealthyNodes ?? 0)}/{nodes.length}</b> edge nodes healthy
              </span>
            )}
            {pendingChanges !== null && (
              <span className="stat-pill"><b>{pendingChanges}</b> changes awaiting review
              </span>
            )}
          </>
        );
      case "govern":
        return (
          <>
            {value && (
              <span className="stat-pill good">
                saved today <b>{fmtUsd(value.money_saved_today_usd)}</b>
              </span>
            )}
            {value && (
              <span className="stat-pill">payback <b>{value.payback_months}mo</b></span>
            )}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="launcher">
      <div className="launcher-top">
        <div className="launcher-brand">
          <img className="mark" src="https://livis.ai/image/icons/lincode_livis.svg" alt="Lincode LIVIS" />
          <img className="mark wordmark" src="/qualityops-logo.svg" alt="QualityOps" />
        </div>
        <div className="row" style={{ gap: 16, alignItems: "center" }}>
          {workspace && (
            <div className="ctx-block" style={{ textAlign: "right" }}>
              <span className="ctx-label">Workspace</span>
              <span className="ctx-value" style={{ color: workspace.accent }}>{workspace.name}</span>
            </div>
          )}
          <div className="ctx-block" style={{ textAlign: "right" }}>
            <span className="ctx-label">Signed in</span>
            <span className="ctx-value">{user?.name} · {user?.role}</span>
          </div>
          <button
            type="button"
            className="ctx-logout"
            onClick={async () => {
              await logout();
              nav("/login", { replace: true });
            }}
          >
            Log out
          </button>
        </div>
      </div>

      <div className="launcher-hero" data-tour="launcher-hero">
        <h1 className="launcher-greeting">
          {greeting()}, <em>{(user?.name || "there").split(" ")[0]}</em>. Where do you want to work?
        </h1>
        <p className="launcher-sub">
          {workspace
            ? `${workspace.site_label} · ${workspace.role}. Choose an app — Switch app keeps you in this tenant.`
            : "Choose an app to enter its workflows. Live badges show where attention is needed right now."}
        </p>
      </div>

      <div className="app-grid" data-tour="launcher-grid">
        {APPS.map((app, i) => (
          <button
            key={app.id}
            className="app-card"
            data-tour={`app-card-${app.id}`}
            style={{ ["--app-color" as any]: app.color }}
            onClick={() => nav(app.base)}
          >
            <div className="row between">
              <div className="app-icon">{app.icon}</div>
              <span className="kbd-hint">press {i + 1}</span>
            </div>
            <h2>{app.name}</h2>
            <div className="app-tagline">{app.tagline}</div>
            <div className="app-stats">{statsFor(app.id)}</div>
            <div className="app-workspaces">
              {app.workspaces.map((w) => (
                <span className="tag" key={w.to}>{w.label}</span>
              ))}
            </div>
            <div className="app-cta">
              <span>Enter {app.name}</span>
              <span className="arrow">→</span>
            </div>
          </button>
        ))}
      </div>

      <div className="launcher-foot">
        <span>
          <span className="conn-dot ok" />
          {workspace ? `${workspace.short_name} · ${workspace.site_label}` : "Central connected"}
        </span>
        <span>·</span>
        <span>{APPS.reduce((n, a) => n + a.workspaces.length, 0)} workspaces across {APPS.length} apps</span>
        <span>·</span>
        <span>For each persona: {APPS.map((a) => a.personas.split(" · ")[0]).join(", ")}</span>
      </div>
    </div>
  );
}
