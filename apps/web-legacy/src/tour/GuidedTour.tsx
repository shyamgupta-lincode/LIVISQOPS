// Guided tour FAB: Storyline (narrative) + Interactive Lab (prefilled forms + trace).

import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

import {
  LabArtifacts, emptyLabArtifacts, onTourNotice, tourCommand,
} from "./bridge";
import {
  LAB_PHASES, LAB_STEPS, LabStep, labPhaseMeta,
} from "./labStoryline";
import {
  PHASES, TOUR_STEPS, TourStep, phaseMeta,
} from "./storyline";
import {
  APP_TOUR_GROUPS,
  WORKSPACE_TOURS,
  WorkspaceTour,
  WsStep,
  workspaceTourById,
  workspaceTourForPath,
} from "./workspaceStorylines";

const STORAGE_KEY = "livis.tour.v1";
const PAD = 10;

type TourMode = "story" | "lab" | "workspace";
type AnyStep = TourStep | LabStep | WsStep;
type Rect = { top: number; left: number; width: number; height: number };
type Stored = { completed?: boolean; labCompleted?: boolean; dismissedIntro?: boolean };

function loadStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStored(patch: Stored) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadStored(), ...patch }));
}

function measure(selector?: string): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

function scrollTargetIntoView(selector?: string) {
  if (!selector) return;
  const el = document.querySelector(selector) as HTMLElement | null;
  el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
}

function cardPosition(
  rect: Rect | null,
  placement: AnyStep["placement"],
  cardW: number,
  cardH: number,
) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 16;
  let top = vh / 2 - cardH / 2;
  let left = vw / 2 - cardW / 2;

  if (!rect) {
    return {
      top: Math.max(16, Math.min(vh - cardH - 16, top)),
      left: Math.max(16, Math.min(vw - cardW - 16, left)),
    };
  }

  const prefer = placement === "auto" || !placement ? "bottom" : placement;
  const candidates: Record<string, { top: number; left: number }> = {
    bottom: { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2 - cardW / 2 },
    top: { top: rect.top - cardH - gap, left: rect.left + rect.width / 2 - cardW / 2 },
    right: { top: rect.top + rect.height / 2 - cardH / 2, left: rect.left + rect.width + gap },
    left: { top: rect.top + rect.height / 2 - cardH / 2, left: rect.left - cardW - gap },
  };

  const order = [prefer, "bottom", "top", "right", "left"].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  for (const key of order) {
    const c = candidates[key];
    if (!c) continue;
    const t = Math.max(12, Math.min(vh - cardH - 12, c.top));
    const l = Math.max(12, Math.min(vw - cardW - 12, c.left));
    if (c.top >= 8 && c.top + cardH <= vh - 8 && c.left >= 8 && c.left + cardW <= vw - 8) {
      return { top: t, left: l };
    }
    if (key === prefer) return { top: t, left: l };
  }
  return {
    top: Math.max(12, Math.min(vh - cardH - 12, top)),
    left: Math.max(12, Math.min(vw - cardW - 12, left)),
  };
}

function resolveSelector(step: AnyStep, artifacts: LabArtifacts): string | undefined {
  const lab = step as LabStep;
  if (lab.selectorFrom === "order" && artifacts.orderId) {
    return `[data-tour-order="${artifacts.orderId}"]`;
  }
  if (lab.selectorFrom === "agent" && artifacts.agentId) {
    return `[data-tour-agent="${artifacts.agentId}"]`;
  }
  return step.selector;
}

export default function GuidedTour() {
  const nav = useNavigate();
  const loc = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuApp, setMenuApp] = useState<WorkspaceTour["appId"] | "platform">("platform");
  const [intro, setIntro] = useState(false);
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<TourMode>("story");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pulse, setPulse] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [agentSuffix, setAgentSuffix] = useState("watch");
  const [artifacts, setArtifacts] = useState<LabArtifacts>(emptyLabArtifacts);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 400, h: 300 });

  const currentWs = useMemo(() => workspaceTourForPath(loc.pathname), [loc.pathname]);
  const activeWs = workspaceId ? workspaceTourById(workspaceId) : undefined;

  const steps: AnyStep[] = mode === "story"
    ? TOUR_STEPS
    : mode === "lab"
      ? LAB_STEPS
      : (activeWs?.steps ?? []);
  const step = steps[index] as AnyStep | undefined;
  const labStep = mode === "lab" ? (step as LabStep | undefined) : undefined;

  const phase = useMemo(() => {
    if (!step) return null;
    if (mode === "story") return phaseMeta((step as TourStep).phase);
    if (mode === "lab") return labPhaseMeta((step as LabStep).phase);
    return activeWs?.phases.find((p) => p.id === step.phase) || activeWs?.phases[0] || null;
  }, [step, mode, activeWs]);

  const phases = mode === "story"
    ? PHASES
    : mode === "lab"
      ? LAB_PHASES
      : (activeWs?.phases ?? []);

  const phaseProgress = useMemo(() => {
    if (!step) return [];
    return phases.map((p) => {
      const idxs = steps
        .map((s, i) => (("phase" in s && s.phase === p.id) ? i : -1))
        .filter((i) => i >= 0);
      const first = idxs[0] ?? 0;
      const last = idxs[idxs.length - 1] ?? 0;
      return {
        ...p,
        done: index > last,
        current: index >= first && index <= last,
      };
    });
  }, [index, step, phases, steps]);

  const inputValue = labStep?.input?.key === "agentSuffix"
    ? agentSuffix
    : artifacts.batchTag;

  const inputOk = !labStep?.requireInput || (
    labStep.input?.key === "batchTag"
      ? artifacts.batchTag.trim().length >= 3
      : agentSuffix.trim().length >= 2
  );

  const canNext = inputOk && !waiting;

  const refreshRect = useCallback(() => {
    if (!active || !step) return;
    setRect(measure(resolveSelector(step, artifacts)));
  }, [active, step, artifacts]);

  useEffect(() => {
    const s = loadStored();
    if (!s.completed && !s.labCompleted && !s.dismissedIntro) {
      const t = window.setTimeout(() => setIntro(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  // Lab completion notices
  useEffect(() => {
    if (!active || mode !== "lab") return;
    return onTourNotice((notice) => {
      if (notice.type === "order-created") {
        setArtifacts((a) => ({
          ...a,
          orderId: notice.order.id,
          orderRef: notice.order.erp_ref,
          lineId: notice.order.line_id,
          batchTag: a.batchTag || notice.order.erp_ref,
        }));
        tourCommand({ type: "highlight-order", orderId: notice.order.id });
        if (labStep?.waitFor === "order-created") {
          setWaiting(false);
          window.setTimeout(() => setIndex((i) => i + 1), 350);
        }
      }
      if (notice.type === "agent-created") {
        setArtifacts((a) => ({
          ...a,
          agentId: notice.agent.id,
          agentName: notice.agent.name,
        }));
        if (labStep?.waitFor === "agent-created") {
          setWaiting(false);
          window.setTimeout(() => setIndex((i) => i + 1), 350);
        }
      }
    });
  }, [active, mode, labStep?.waitFor, labStep?.id]);

  // Navigate + settle + emit commands
  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;

    const run = async () => {
      const route = step.route;
      if (route) {
        const underGraph =
          route === "/engineer/graph" && loc.pathname.startsWith("/engineer/graph");
        if (!underGraph && loc.pathname !== route) {
          nav(route);
        }
      }

      await new Promise((r) => setTimeout(r, step.settleMs ?? 320));
      if (cancelled) return;

      if (mode === "lab" && labStep) {
        const cmds = [
          ...(labStep.commands || []),
          ...(labStep.syncCommands?.({
            batchTag: artifacts.batchTag,
            agentSuffix,
            orderId: artifacts.orderId,
          }) || []),
        ];
        // Stagger so page mounts before open-modal commands
        for (const cmd of cmds) {
          tourCommand(cmd);
          await new Promise((r) => setTimeout(r, 40));
        }
        if (labStep.waitFor) setWaiting(true);
        else setWaiting(false);
        if (artifacts.orderId) {
          tourCommand({ type: "highlight-order", orderId: artifacts.orderId });
        }
      }

      const sel = resolveSelector(step, artifacts);
      scrollTargetIntoView(sel);
      await new Promise((r) => setTimeout(r, 220));
      if (cancelled) return;

      let tries = 0;
      const tick = () => {
        if (cancelled) return;
        const r = measure(resolveSelector(step, artifacts));
        setRect(r);
        setPulse(true);
        window.setTimeout(() => setPulse(false), 700);
        if (!r && tries < 10) {
          tries += 1;
          window.setTimeout(tick, 180);
        }
      };
      tick();
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, mode, step?.id]);

  useLayoutEffect(() => {
    if (!active) return;
    const onResize = () => refreshRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, refreshRect]);

  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    setCardSize({ w: r.width, h: r.height });
  }, [active, index, waiting, inputValue, mode]);

  const stop = (completed: boolean) => {
    setActive(false);
    setMenuOpen(false);
    setWaiting(false);
    tourCommand({ type: "highlight-order", orderId: null });
    if (completed) {
      saveStored(mode === "lab" ? { labCompleted: true, dismissedIntro: true } : { completed: true, dismissedIntro: true });
    } else {
      saveStored({ dismissedIntro: true });
    }
  };

  const start = (m: TourMode, wsId?: string) => {
    setIntro(false);
    setMenuOpen(false);
    setMode(m);
    setWorkspaceId(m === "workspace" ? (wsId || currentWs?.id || WORKSPACE_TOURS[0].id) : null);
    setIndex(0);
    setArtifacts(emptyLabArtifacts());
    setAgentSuffix("watch");
    setWaiting(false);
    setActive(true);
    saveStored({ dismissedIntro: true });
  };

  const startWorkspace = (id: string) => start("workspace", id);

  const next = () => {
    if (!canNext) return;
    if (index >= steps.length - 1) {
      stop(true);
      return;
    }
    // Sync inputs before leaving setup steps
    if (labStep?.syncCommands) {
      for (const cmd of labStep.syncCommands({
        batchTag: artifacts.batchTag,
        agentSuffix,
        orderId: artifacts.orderId,
      })) {
        tourCommand(cmd);
      }
    }
    setIndex((i) => i + 1);
  };

  const back = () => setIndex((i) => Math.max(0, i - 1));

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop(false);
      if ((e.key === "ArrowRight" || e.key === "Enter") && canNext && !labStep?.waitFor) next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onInputChange = (value: string) => {
    if (!labStep?.input) return;
    if (labStep.input.key === "batchTag") {
      const tag = value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 16);
      setArtifacts((a) => ({ ...a, batchTag: tag }));
      tourCommand({ type: "set-order-ref", erp_ref: tag });
    } else {
      const suffix = value.replace(/[^\w-]/g, "").slice(0, 20);
      setAgentSuffix(suffix);
      const name = `Batch radar ${artifacts.batchTag || "LAB"} ${suffix || "watch"}`.replace(/\s+/g, " ").trim();
      tourCommand({ type: "set-agent-name", name });
    }
  };

  const pos = cardPosition(rect, step?.placement ?? "auto", cardSize.w, cardSize.h);
  const pct = Math.round(((index + 1) / steps.length) * 100);

  const artifactChip = mode === "lab" && (artifacts.batchTag || artifacts.orderId) && (
    <div className="tour-artifacts">
      {artifacts.batchTag && (
        <span className="tour-artifact">tag <b>{artifacts.batchTag}</b></span>
      )}
      {artifacts.orderId && (
        <span className="tour-artifact">order <b>{artifacts.orderId}</b></span>
      )}
      {artifacts.agentName && (
        <span className="tour-artifact">agent <b>{artifacts.agentName}</b></span>
      )}
    </div>
  );

  return createPortal(
    <>
      <div className={`tour-fab-wrap ${menuOpen ? "open" : ""}`}>
        {menuOpen && !active && (
          <div className="tour-fab-menu" role="menu">
            <div className="tour-fab-section">Platform</div>
            <button type="button" role="menuitem" onClick={() => start("story")}>
              <strong>✦ Full storyline</strong>
              <span>Access → configure → run → quality → govern</span>
            </button>
            <button type="button" role="menuitem" className="lab" onClick={() => start("lab")}>
              <strong>◎ Interactive lab</strong>
              <span>Create a WO with your tag and trace it</span>
            </button>

            {currentWs && (
              <>
                <div className="tour-fab-section">This workspace</div>
                <button
                  type="button"
                  role="menuitem"
                  className="ws"
                  style={{ ["--ws" as any]: currentWs.color }}
                  onClick={() => startWorkspace(currentWs.id)}
                >
                  <strong>▸ {currentWs.label} tour</strong>
                  <span>{currentWs.short}</span>
                </button>
              </>
            )}

            <div className="tour-fab-section">Workspace tours</div>
            <div className="tour-fab-apps">
              <button
                type="button"
                className={`tour-fab-app ${menuApp === "platform" ? "on" : ""}`}
                onClick={() => setMenuApp("platform")}
              >
                All
              </button>
              {APP_TOUR_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`tour-fab-app ${menuApp === g.id ? "on" : ""}`}
                  style={{ ["--ws" as any]: g.color }}
                  onClick={() => setMenuApp(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="tour-fab-ws-list">
              {WORKSPACE_TOURS
                .filter((t) => menuApp === "platform" || t.appId === menuApp)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    className="ws"
                    style={{ ["--ws" as any]: t.color }}
                    onClick={() => startWorkspace(t.id)}
                  >
                    <strong>{t.label}</strong>
                    <span>{t.short}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className={`tour-fab ${active ? "tour-fab-active" : ""} ${intro ? "tour-fab-pulse" : ""}`}
          onClick={() => {
            if (active) stop(false);
            else {
              setMenuApp(currentWs?.appId || "platform");
              setMenuOpen((o) => !o);
            }
          }}
          title={active ? "End tour" : "Guided experiences"}
          aria-label={active ? "End tour" : "Open tour menu"}
          aria-expanded={menuOpen}
        >
          <span className="tour-fab-ring" aria-hidden />
          <span className="tour-fab-ico" aria-hidden>{active ? "✕" : "✦"}</span>
          <span className="tour-fab-label">{active ? "End tour" : "Tour"}</span>
        </button>
      </div>

      {intro && !active && (
        <div className="tour-intro" role="dialog" aria-modal="true">
          <div className="tour-intro-card">
            <div className="tour-intro-kicker">First time here?</div>
            <h2>Choose how you want to learn</h2>
            <p>
              Take the full platform storyline, run the interactive lab, or open a focused tour for any
              workspace — Context Graph, Assets, Twin, Agents, and more.
            </p>
            <div className="tour-intro-choices">
              <button type="button" className="tour-choice" onClick={() => start("story")}>
                <em>✦</em>
                <strong>Full storyline</strong>
                <span>Access, configure, operate, quality, and govern end-to-end.</span>
              </button>
              <button type="button" className="tour-choice lab" onClick={() => start("lab")}>
                <em>◎</em>
                <strong>Interactive lab</strong>
                <span>Prefill forms, enter a batch tag, and track that change across the plant.</span>
              </button>
              {currentWs && (
                <button
                  type="button"
                  className="tour-choice"
                  style={{ ["--phase" as any]: currentWs.color }}
                  onClick={() => startWorkspace(currentWs.id)}
                >
                  <em>▸</em>
                  <strong>{currentWs.label} tour</strong>
                  <span>{currentWs.short}</span>
                </button>
              )}
            </div>
            <div className="tour-intro-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => { setIntro(false); saveStored({ dismissedIntro: true }); }}
              >
                Not now
              </button>
              <button type="button" className="btn ghost" onClick={() => { setIntro(false); setMenuOpen(true); }}>
                Browse all tours
              </button>
            </div>
          </div>
        </div>
      )}

      {active && step && phase && (
        <div className={`tour-root ${mode === "lab" ? "is-lab" : ""}`} aria-live="polite">
          <svg className="tour-veil" width="100%" height="100%">
            <defs>
              <mask id="tour-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {rect && (
                  <rect
                    className={`tour-hole ${pulse ? "pulse" : ""}`}
                    x={rect.left}
                    y={rect.top}
                    width={rect.width}
                    height={rect.height}
                    rx="14"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0" y="0" width="100%" height="100%"
              fill="rgba(18, 22, 28, 0.58)"
              mask="url(#tour-mask)"
            />
          </svg>

          {rect && (
            <div
              className={`tour-spotlight ${pulse ? "pulse" : ""}`}
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }}
            />
          )}

          {/* Allow clicks through spotlight into modals/forms during lab waits */}
          {mode === "lab" && (labStep?.waitFor || labStep?.input) && rect && (
            <div
              className="tour-click-hole"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }}
            />
          )}

          <div
            ref={cardRef}
            className="tour-card"
            style={{
              top: pos.top,
              left: pos.left,
              ["--phase" as any]: phase.color,
            }}
          >
            <div className="tour-card-progress">
              <div className="tour-card-bar"><i style={{ width: `${pct}%` }} /></div>
              <span className="tour-card-count">{index + 1} / {steps.length}</span>
            </div>

            <div className="tour-mode-pill">
              {mode === "story" && "Full storyline"}
              {mode === "lab" && "Interactive lab"}
              {mode === "workspace" && `${activeWs?.label || "Workspace"} tour`}
            </div>

            <div className="tour-phases" role="list">
              {phaseProgress.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`tour-phase ${p.current ? "on" : ""} ${p.done ? "done" : ""}`}
                  style={{ ["--phase" as any]: p.color }}
                  title={p.blurb}
                  onClick={() => {
                    const first = steps.findIndex((s) => s.phase === p.id);
                    if (first >= 0 && (mode !== "lab" || first <= index)) setIndex(first);
                  }}
                >
                  <em />
                  <span>{p.label.split("·")[1]?.trim() || p.label}</span>
                </button>
              ))}
            </div>

            {artifactChip}

            <div className="tour-card-kicker">{phase.label} · {step.beat}</div>
            <h3 className="tour-card-title">{step.title}</h3>
            <p className="tour-card-body">{step.body}</p>
            {step.action && (
              <div className="tour-card-action">
                <span aria-hidden>→</span>
                {step.action}
              </div>
            )}

            {labStep?.input && (
              <label className="tour-input">
                <span>{labStep.input.label}</span>
                <input
                  value={inputValue}
                  placeholder={labStep.input.placeholder}
                  onChange={(e) => onInputChange(e.target.value)}
                  autoFocus
                />
                {labStep.input.hint && <em>{labStep.input.hint}</em>}
              </label>
            )}

            {waiting && (
              <div className="tour-waiting">
                <span className="tour-waiting-dot" />
                Waiting for you to submit the form…
              </div>
            )}

            <div className="tour-card-nav">
              <button type="button" className="btn ghost" onClick={() => stop(false)}>
                Skip
              </button>
              <div className="tour-card-nav-right">
                <button type="button" className="btn ghost" disabled={index === 0} onClick={back}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn tour-next"
                  disabled={!canNext || !!labStep?.waitFor}
                  onClick={next}
                >
                  {index >= steps.length - 1 ? "Finish" : labStep?.waitFor ? "Waiting…" : "Next"}
                </button>
              </div>
            </div>
            <div className="tour-card-keys">
              {mode === "lab"
                ? "Complete the highlighted form to advance"
                : <><kbd>←</kbd><kbd>→</kbd> navigate · <kbd>Esc</kbd> end</>}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
