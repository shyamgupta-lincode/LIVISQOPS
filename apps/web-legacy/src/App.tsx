import React from "react";
import {
  Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate,
} from "react-router-dom";

import { usePoll, useLiveEvents } from "./api";
import { useAuth } from "./auth";
import { APPS, appForPath, workspaceForPath } from "./apps";
import GuidedTour from "./tour/GuidedTour";
import { ToastHost } from "./components/ui";
import { CopilotProvider, UniversalCopilot } from "./copilot";

import Login from "./pages/Login";
import Launcher from "./pages/Launcher";
import CommandCenter from "./pages/CommandCenter";
import FactoryTwin from "./pages/FactoryTwin";
import Production from "./pages/Production";
import WarrantyClaims from "./pages/WarrantyClaims";
import StationWorkspace from "./pages/StationWorkspace";
import Quality from "./pages/Quality";
import Workflows from "./pages/Workflows";
import VisionAI from "./pages/VisionAI";
import Agents from "./pages/Agents";
import EdgeFleet from "./pages/EdgeFleet";
import ProofEngine from "./pages/ProofEngine";
import Assets from "./pages/Assets";
import Admin from "./pages/Admin";
import ContextGraph from "./pages/ContextGraph";
import EntityManager from "./pages/EntityManager";
import QualityEvents from "./pages/QualityEvents";
import EventBackbone from "./pages/EventBackbone";
import DataPlanes from "./pages/DataPlanes";
import PredictiveMaintenance from "./pages/PredictiveMaintenance";
import GovernedLearning from "./pages/GovernedLearning";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const loc = useLocation();
  if (!ready) {
    return (
      <div className="login-page" style={{ placeItems: "center" }}>
        <div className="dim">Loading session…</div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}

function ContextRibbon() {
  const { data: kpis } = usePoll<any>("/api/kpis", 6000);
  const { data: topo } = usePoll<any>("/api/topology", 30000);
  const { connected } = useLiveEvents(1);
  const { user, workspace, logout } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();

  const app = appForPath(loc.pathname);
  const wsNav = app ? workspaceForPath(app, loc.pathname) : undefined;
  const siteName = topo?.site?.name || workspace?.site_label || "Site";
  const shift = topo?.site?.shift || workspace?.shift || "Shift A";
  const shortShift = String(shift).replace(/\s*\(.*\)$/, "");

  return (
    <div className="context-ribbon">
      <div className="crumbs">
        <span className="crumb link" onClick={() => nav("/")}>Apps</span>
        <span className="sep">/</span>
        {app && (
          <>
            <span className="crumb link" style={{ color: app.color }} onClick={() => nav(app.base)}>
              {app.name}
            </span>
            <span className="sep">/</span>
          </>
        )}
        <span className="here">{wsNav?.label ?? "Workspace"}</span>
      </div>

      <div className="ctx-divider" />
      <div className="ctx-block">
        <span className="ctx-label">Tenant</span>
        <span className="ctx-value" style={{ color: workspace?.accent || undefined }}>
          {workspace?.short_name || workspace?.name || "—"}
        </span>
      </div>
      <div className="ctx-divider" />
      <div className="ctx-block">
        <span className="ctx-label">Site · Shift</span>
        <span className="ctx-value">{siteName.replace(/^Harley-Davidson · /, "")} · {shortShift}</span>
      </div>
      <div className="ctx-divider" />
      <div className="ctx-block">
        <span className="ctx-label">Plan vs Actual</span>
        <span className="ctx-value num">
          {kpis ? `${kpis.actual_units} / ${kpis.plan_units}` : "—"}
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <div className="ctx-block">
        <span className="ctx-label">Live Link</span>
        <span className="ctx-value small">
          <span className={`conn-dot ${connected ? "ok" : "down"}`} />
          {connected ? "Central connected" : "Reconnecting…"}
        </span>
      </div>
      <div className="ctx-divider" />
      <div className="ctx-block">
        <span className="ctx-label">User</span>
        <span className="ctx-value">{user?.name || "—"}</span>
      </div>
      <button
        type="button"
        className="ctx-logout"
        title="Sign out"
        onClick={async () => {
          await logout();
          nav("/login", { replace: true });
        }}
      >
        Log out
      </button>
    </div>
  );
}

/** Shell for a chosen app: brand, app badge, app-scoped nav, switcher. */
function AppShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const { workspace } = useAuth();
  const app = appForPath(loc.pathname);

  if (!app) return <Navigate to="/" replace />;

  return (
    <CopilotProvider>
      <div
        className="shell"
        style={{
          ["--app-color" as any]: app.color,
          ["--tenant-accent" as any]: workspace?.accent || app.color,
        }}
      >
        <nav className="sidenav" data-tour="sidenav">
          <button className="side-brand" onClick={() => nav("/")} title="Back to app launcher">
            <div className="brand-stack">
              <img className="mark" src="https://livis.ai/image/icons/lincode_livis.svg" alt="Lincode LIVIS" />
              <img className="mark wordmark" src="/qualityops-logo.svg" alt="QualityOps" />
            </div>
          </button>

          {workspace && (
            <div className="tenant-badge" style={{ borderColor: workspace.accent }}>
              <div className="tenant-name" style={{ color: workspace.accent }}>{workspace.name}</div>
              <div className="tenant-role">{workspace.role}</div>
            </div>
          )}

          <div className="app-badge">
            <div className="app-icon-sm">{app.icon}</div>
            <div>
              <div className="name">{app.name}</div>
            </div>
          </div>

          <div className="nav-section" data-tour="workspaces-nav">
            <div className="nav-section-label">Workspaces</div>
            {app.workspaces.map((w) => (
              <NavLink
                key={w.to}
                to={w.to}
                end={w.end}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <span className="icon">{w.icon}</span>
                <span>
                  {w.label}
                  <span className="nav-desc">{w.desc}</span>
                </span>
              </NavLink>
            ))}
          </div>

          <button className="side-switch" data-tour="switch-app" onClick={() => nav("/")} title="Back to the app launcher">
            <span>⊞</span> Switch app
            <span style={{ marginLeft: "auto" }}>→</span>
          </button>
        </nav>

        <div className="main">
          <div data-tour="context-ribbon">
            <ContextRibbon />
          </div>
          <div className="content" data-tour="content">
            <Outlet />
          </div>
        </div>
        <ToastHost />
        <UniversalCopilot />
      </div>
    </CopilotProvider>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Launcher />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          {/* Operate */}
          <Route path="/operate" element={<CommandCenter />} />
          <Route path="/operate/twin" element={<FactoryTwin />} />
          <Route path="/operate/production" element={<Production />} />
          <Route path="/operate/warranty" element={<WarrantyClaims />} />
          <Route path="/operate/station" element={<StationWorkspace />} />
          <Route path="/operate/station/:stationId" element={<StationWorkspace />} />
          {/* Quality & AI */}
          <Route path="/quality" element={<Quality />} />
          <Route path="/quality/events" element={<QualityEvents />} />
          <Route path="/quality/vision" element={<VisionAI />} />
          <Route path="/quality/agents" element={<Agents />} />
          {/* Engineer · context → data planes → backbone → assets → pdm → workflows → edge */}
          <Route path="/engineer" element={<Navigate to="/engineer/graph" replace />} />
          <Route path="/engineer/graph" element={<ContextGraph />} />
          <Route path="/engineer/graph/:graphId" element={<ContextGraph />} />
          <Route path="/engineer/data-planes" element={<DataPlanes />} />
          <Route path="/engineer/backbone" element={<EventBackbone />} />
          <Route path="/engineer/assets" element={<Assets />} />
          <Route path="/engineer/pdm" element={<PredictiveMaintenance />} />
          <Route path="/engineer/workflows" element={<Workflows />} />
          <Route path="/engineer/edge" element={<EdgeFleet />} />
          {/* Govern */}
          <Route path="/govern" element={<ProofEngine />} />
          <Route path="/govern/learning" element={<GovernedLearning />} />
          <Route path="/govern/entities" element={<EntityManager />} />
          <Route path="/govern/admin" element={<Admin />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <GuidedTour />
    </>
  );
}
