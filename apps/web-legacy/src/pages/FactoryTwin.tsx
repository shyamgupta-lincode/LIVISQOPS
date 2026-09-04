// Factory Twin: spatial navigation with rich line/cell cards, live counters
// that animate on change, inspector drawer, and Causal Time-Travel sidebar.
// Hierarchy spine (levels + object bindings) comes from the active Engineer
// context graph; live station metrics still flow from /api/topology.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ago, get, usePoll } from "../api";
import { Drawer, Modal, StateChip } from "../components/ui";

const CHART_STROKE = "var(--app-color, var(--accent))";
const CHART_MUTED = "var(--text-faint)";
const CHART_GRID = "var(--border)";

type SparkPoint = { i: number; v: number };

function sparkSeries(values: number[] | undefined | null): SparkPoint[] {
  if (!Array.isArray(values) || values.length < 2) return [];
  return values.map((v, i) => ({ i, v: Number(v) }));
}

function chartDomain(values: number[]): [number, number] | ["auto", "auto"] {
  if (!values.length) return ["auto", "auto"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.12, Math.abs(max) * 0.02, 0.5);
  return [min - pad, max + pad];
}

const LEGEND: [string, string][] = [
  ["Running", "var(--state-running)"], ["Starved", "var(--state-starved)"],
  ["Blocked", "var(--state-blocked)"], ["Faulted", "var(--state-faulted)"],
  ["Changeover", "var(--state-changeover)"], ["Maintenance", "var(--state-maintenance)"],
  ["Quality Hold", "var(--state-hold)"], ["Offline", "var(--state-offline)"],
];

const OVERLAYS = ["Live state", "Quality", "Cycle vs takt", "AI confidence"] as const;
type Overlay = (typeof OVERLAYS)[number];

const PLAY_TICK_MS = 700;
const HEALTH_KEYS = ["availability", "quality", "performance", "ai_confidence"] as const;

type LevelKey = "facility" | "area" | "line" | "station" | "device";

type SpineLevel = { key: LevelKey; label: string; required: boolean; id: string };

type Binding = {
  id: string;
  object_type: string;
  label: string;
  report_at: string;
  rollup_to?: string[];
  enabled?: boolean;
  protocol?: string;
  lenses?: string[];
};

const FALLBACK_LEVELS: SpineLevel[] = [
  { key: "facility", label: "Plant", required: true, id: "facility" },
  { key: "area", label: "Area", required: true, id: "area" },
  { key: "line", label: "Line", required: true, id: "line" },
  { key: "station", label: "Station", required: true, id: "station" },
  { key: "device", label: "Device", required: false, id: "device" },
];

const BINDING_GLYPH: Record<string, string> = {
  inspection: "◎",
  status: "●",
  defect: "▲",
  order: "▦",
  genealogy: "◈",
  timeseries: "∿",
  work_instruction: "☰",
};

function canonicalLevelKey(lv: any): LevelKey | null {
  if (!lv) return null;
  if (lv.id === "facility" || lv.entity === "site") return "facility";
  if (["area", "line", "station", "device"].includes(lv.entity)) return lv.entity;
  if (["facility", "area", "line", "station", "device"].includes(lv.id)) return lv.id;
  return null;
}

/** Derive twin drill spine from Engineer context-graph levels. */
function spineFromSchema(contextGraph: any | null | undefined): SpineLevel[] {
  const raw = contextGraph?.levels?.length ? contextGraph.levels : null;
  if (!raw) return FALLBACK_LEVELS;
  const out: SpineLevel[] = [];
  const seen = new Set<string>();
  for (const lv of raw) {
    const key = canonicalLevelKey(lv);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label: lv.label || key,
      required: !!lv.required,
      id: lv.id || key,
    });
  }
  return out.length ? out : FALLBACK_LEVELS;
}

function bindingsAt(bindings: Binding[], level: LevelKey, mode: "home" | "rollup" | "any" = "any") {
  return bindings.filter((b) => {
    if (b.enabled === false) return false;
    const home = b.report_at === level;
    const roll = (b.rollup_to || []).includes(level);
    if (mode === "home") return home;
    if (mode === "rollup") return roll && !home;
    return home || roll;
  });
}

/** Animated live value — flashes green/red when numbers move, blue when text changes. */
function LiveValue({
  value, className = "", format,
}: {
  value: string | number; className?: string; format?: (v: number) => string;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | "change" | null>(null);

  useEffect(() => {
    if (prev.current === value) return;
    const a = Number(prev.current);
    const b = Number(value);
    if (!Number.isNaN(a) && !Number.isNaN(b) && a !== b) {
      setFlash(b > a ? "up" : "down");
    } else {
      setFlash("change");
    }
    prev.current = value;
    const t = setTimeout(() => setFlash(null), 560);
    return () => clearTimeout(t);
  }, [value]);

  const display = typeof value === "number" && format ? format(value) : String(value);
  const cls = flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : flash === "change" ? "flash-change" : "";
  return <span className={`live-val ${cls} ${className}`}>{display}</span>;
}

function lineStats(stations: any[], stateFor: (s: any) => string) {
  const total = stations.length;
  const running = stations.filter((s) => stateFor(s) === "Running").length;
  const abnormal = stations.filter((s) => !["Running", "Changeover"].includes(stateFor(s))).length;
  const avgCycle = stations.reduce((a, s) => a + s.cycle_time_s, 0) / Math.max(1, total);
  const avgQuality = stations.reduce((a, s) => a + s.health.quality, 0) / Math.max(1, total);
  const avgAi = stations.reduce((a, s) => a + s.health.ai_confidence, 0) / Math.max(1, total);
  const takt = stations[0]?.takt_s ?? 60;
  const throughput = Math.round((3600 / Math.max(avgCycle, 1)) * (running / Math.max(total, 1)));
  return { total, running, abnormal, avgCycle, avgQuality, avgAi, takt, throughput };
}

const STATE_PRIORITY = [
  "Faulted", "Blocked", "Quality Hold", "Starved", "Offline",
  "Maintenance", "Changeover", "Running", "Unknown",
];

function lineHeadlineState(stations: any[], stateFor: (s: any) => string): string {
  let best = "Running";
  let bestRank = STATE_PRIORITY.length;
  for (const st of stations) {
    const s = stateFor(st);
    const rank = STATE_PRIORITY.indexOf(s);
    const r = rank < 0 ? STATE_PRIORITY.length - 1 : rank;
    if (r < bestRank) {
      bestRank = r;
      best = s;
    }
  }
  return best;
}

function stateColor(state: string): string {
  return LEGEND.find(([n]) => n === state)?.[1] || "var(--state-unknown)";
}

function BindingPills({
  items, muted = false, stopClick = false,
}: {
  items: Binding[]; muted?: boolean; stopClick?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div
      className="twin-bind-pills"
      onClick={stopClick ? (e) => e.stopPropagation() : undefined}
    >
      {items.map((b) => (
        <span
          key={b.id}
          className={`twin-bind-pill ${muted ? "rollup" : "home"}`}
          title={`${b.label}${b.protocol ? ` · ${b.protocol}` : ""}${muted ? " (rollup)" : ""}`}
        >
          <span aria-hidden>{BINDING_GLYPH[b.object_type] || "◇"}</span>
          {b.label}
        </span>
      ))}
    </div>
  );
}

/** Pick the live data object for a twin device (PLC → timeseries, Camera → frames). */
function liveObjectForDevice(d: { id: string; kind?: string; protocol?: string }) {
  const kind = String(d.kind || "").toLowerCase();
  const protocol = String(d.protocol || "").toLowerCase();
  const isVision =
    kind.includes("camera")
    || protocol.includes("gige")
    || protocol.includes("vision")
    || protocol.includes("rtsp");
  if (isVision) {
    return {
      objectId: `data-${d.id}-frames`,
      mode: "vision" as const,
      modeLabel: "Live vision",
    };
  }
  return {
    objectId: `data-${d.id}-ts`,
    mode: "timeseries" as const,
    modeLabel: "Live time series",
  };
}

const MAX_STATION_DEV_ICONS = 5;

/** Compact glyph + style class for a device kind shown on the station card. */
function deviceKindIcon(kind?: string): { glyph: string; cls: string } {
  const k = String(kind || "").toLowerCase();
  if (k.includes("camera") || k.includes("vision")) return { glyph: "◎", cls: "cam" };
  if (k.includes("torque") || k.includes("tool")) return { glyph: "⟳", cls: "torque" };
  if (k.includes("plc") || k.includes("controller")) return { glyph: "⊞", cls: "plc" };
  if (k.includes("scan") || k.includes("barcode")) return { glyph: "▥", cls: "scan" };
  return { glyph: "◇", cls: "generic" };
}

/** Compact Recharts area used on metric cards. */
function MiniMetricChart({ values, gradId }: { values: number[]; gradId: string }) {
  const data = useMemo(() => sparkSeries(values), [values]);
  if (data.length < 2) return null;
  return (
    <div className="twin-mini-chart" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_STROKE} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART_STROKE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={CHART_STROKE}
            strokeWidth={1.6}
            fill={`url(#${gradId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Primary live time-series chart for the focused PLC tag / metric. */
function PrimaryMetricChart({
  label, unit, values, hint,
}: {
  label: string; unit?: string; values: number[]; hint?: string;
}) {
  const data = useMemo(() => sparkSeries(values), [values]);
  const domain = useMemo(() => chartDomain(data.map((d) => d.v)), [data]);
  const gradId = "twin-primary-fill";
  if (data.length < 2) {
    return <p className="dim twin-dev-chart-empty">Not enough samples for a trend yet.</p>;
  }
  return (
    <div className="twin-dev-chart">
      <div className="twin-dev-chart-head">
        <span className="twin-dev-chart-title mono" title={label}>
          {label}{unit ? ` (${unit})` : ""}
        </span>
        <span className="twin-dev-chart-hint">{hint || "Live trend"}</span>
      </div>
      <div className="twin-dev-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_STROKE} stopOpacity={0.28} />
                <stop offset="100%" stopColor={CHART_STROKE} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="i"
              tick={{ fill: CHART_MUTED, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: CHART_GRID }}
              tickFormatter={(i) => (i === 0 ? "oldest" : i === data.length - 1 ? "now" : "")}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              domain={domain}
              width={44}
              tick={{ fill: CHART_MUTED, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(n: number) =>
                Math.abs(n) >= 100 ? String(Math.round(n)) : Number(n).toFixed(1)
              }
            />
            <Tooltip
              cursor={{ stroke: CHART_STROKE, strokeWidth: 1, strokeDasharray: "4 4" }}
              contentStyle={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--night)",
                boxShadow: "var(--shadow-1)",
              }}
              labelFormatter={(i) => `Sample ${Number(i) + 1}`}
              formatter={(value: number) => [
                unit ? `${value} ${unit}` : value,
                label,
              ]}
            />
            <Area
              type="monotone"
              dataKey="v"
              name={label}
              stroke={CHART_STROKE}
              strokeWidth={2.2}
              fill={`url(#${gradId})`}
              isAnimationActive
              animationDuration={450}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: CHART_STROKE }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DeviceLiveModal({
  device, onClose,
}: {
  device: any;
  onClose: () => void;
}) {
  const { objectId, mode, modeLabel } = liveObjectForDevice(device);
  const [live, setLive] = useState<any>(null);
  const [tick, setTick] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  /** Accumulated polled history per metric/tag while the modal is open. */
  const [trendByKey, setTrendByKey] = useState<Record<string, number[]>>({});
  /** Edge+ live series for the focused tag (subscription to edge node buffer). */
  const [edgeLive, setEdgeLive] = useState<any>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    setFocusKey(null);
    setLive(null);
    setErr(null);
    setTrendByKey({});
    setEdgeLive(null);
    pollCount.current = 0;
  }, [objectId, device.id]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      get(`/api/graph/object/${encodeURIComponent(objectId)}?focus=${encodeURIComponent(device.id)}`)
        .then((d) => {
          if (!alive) return;
          setLive(d);
          setErr(null);
          setTick(true);
          setTimeout(() => alive && setTick(false), 480);
        })
        .catch(() => {
          if (!alive) return;
          setErr("Could not load live data");
        });
    };
    load();
    const id = setInterval(load, 2800);
    return () => { alive = false; clearInterval(id); };
  }, [objectId, device.id]);

  const metrics = useMemo(() => (live?.values || []).slice(0, 4) as any[], [live]);
  const tagMetrics = useMemo(
    () => metrics.filter((m) => m?.tag_key || String(m?.key || "").includes("ns=") || String(m?.key || "").startsWith("MID")),
    [metrics],
  );
  const focused = useMemo(() => {
    if (!metrics.length) return null;
    if (focusKey) {
      const hit = metrics.find((m) => m.key === focusKey);
      if (hit) return hit;
    }
    // Prefer first configured PLC tag over generic synthetic metrics.
    return tagMetrics[0] || metrics[0];
  }, [metrics, focusKey, tagMetrics]);

  // Subscribe to Edge+ node live buffer for the focused PLC tag.
  useEffect(() => {
    if (mode !== "timeseries") return;
    let alive = true;
    const tag = focused?.tag_key || focused?.key || "";
    const qs = tag ? `?tag=${encodeURIComponent(tag)}&limit=60` : "?limit=60";
    const load = () => {
      get(`/api/edge/devices/${encodeURIComponent(device.id)}/live${qs}`)
        .then((d) => {
          if (!alive) return;
          setEdgeLive(d);
        })
        .catch(() => {
          /* graceful: keep prior / fall back to station metrics */
        });
    };
    load();
    const id = setInterval(load, 1500);
    return () => { alive = false; clearInterval(id); };
  }, [device.id, mode, focused?.key, focused?.tag_key]);

  // Append each polled tag/metric value into a local trend buffer (modal session).
  useEffect(() => {
    if (!live?.values || mode !== "timeseries") return;
    pollCount.current += 1;
    const first = pollCount.current === 1;
    setTrendByKey((prev) => {
      const next = { ...prev };
      for (const v of live.values as any[]) {
        const num = Number(v.value);
        if (!Number.isFinite(num)) continue;
        const key = String(v.key);
        if (first) {
          const seed = (Array.isArray(v.spark) ? v.spark : [])
            .map((x: unknown) => Number(x))
            .filter((x: number) => Number.isFinite(x));
          next[key] = seed.length >= 2 ? seed : [...seed, num];
        } else {
          const cur = next[key] || prev[key] || [];
          next[key] = [...cur, num].slice(-60);
        }
      }
      return next;
    });
  }, [live, mode]);

  const edgeValues = useMemo(() => {
    const vals = Array.isArray(edgeLive?.values) ? edgeLive.values : [];
    return vals.map((x: unknown) => Number(x)).filter((x: number) => Number.isFinite(x));
  }, [edgeLive]);

  const fromEdge = Boolean(
    edgeLive?.bound && edgeLive?.source === "edge+" && edgeValues.length >= 2,
  );

  const chartValues = useMemo(() => {
    if (fromEdge) return edgeValues;
    if (!focused) return [];
    const local = trendByKey[focused.key];
    if (local && local.length >= 2) return local;
    return Array.isArray(focused.spark) ? focused.spark : [];
  }, [focused, trendByKey, fromEdge, edgeValues]);

  const chartLabel = focused?.tag_key || focused?.key || focused?.label || "Tag";
  const chartHint = fromEdge
    ? `${(focused?.tag_name || "TAG").toString().toUpperCase()} · Edge+ · LIVE`
    : edgeLive?.bound && edgeLive?.waiting
      ? "Waiting for Edge+ stream"
      : focused?.tag_name
        ? `${focused.tag_name} · live`
        : "Live trend";

  const trust = device.timestamp_trust != null
    ? Number(device.timestamp_trust).toFixed(2)
    : "—";
  const configuredTagCount = tagMetrics.length || (Array.isArray(device.tags) ? device.tags.length : 0);
  const subtitle = `${device.kind || "Device"} · ${device.protocol || "—"} · trust ${trust}`;

  return (
    <Modal
      title={device.name || device.id}
      subtitle={subtitle}
      onClose={onClose}
      wide
      footer={
        <div className="row between" style={{ width: "100%" }}>
          <span className="small faint mono">
            {fromEdge && edgeLive?.node_id
              ? `Edge+ ${edgeLive.node_id} · ${edgeLive.as_of ? ago(edgeLive.as_of) : "live"}`
              : live?.as_of ? `as of ${ago(live.as_of)}` : "polling…"}
            {" · "}{objectId}
          </span>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
      }
    >
      <div className={`twin-dev-live ${mode} ${tick ? "tick" : ""}`}>
        <div className="twin-dev-live-banner">
          <span className="twin-dev-live-pill">{modeLabel}</span>
          {fromEdge && (
            <span className="tag mono" title={edgeLive?.canonical || edgeLive?.node_id}>
              Edge+ · LIVE
            </span>
          )}
          {edgeLive?.bound && edgeLive?.waiting && !fromEdge && (
            <span className="tag mono faint">Waiting for Edge+</span>
          )}
          {live?.rel && <span className="small faint">{live.rel}</span>}
          {live?.kind && <span className="tag mono">{live.kind}</span>}
          {mode === "timeseries" && configuredTagCount > 0 && (
            <span className="tag mono">{configuredTagCount} PLC tags</span>
          )}
        </div>

        {err && !live && <p className="dim">{err}</p>}
        {!live && !err && (
          <p className="dim">
            Loading live {mode === "vision" ? "vision" : "PLC tag"} data…
          </p>
        )}

        {live && (
          <>
            {mode === "timeseries" && tagMetrics.length > 1 && (
              <div className="twin-dev-tag-select row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span className="small faint">Primary tag</span>
                <select
                  className="twin-dev-tag-select-input"
                  value={focused?.key || ""}
                  onChange={(e) => setFocusKey(e.target.value)}
                  aria-label="Select PLC tag for trend"
                >
                  {tagMetrics.map((m: any) => (
                    <option key={m.key} value={m.key}>
                      {(m.tag_name ? `${m.tag_name} — ` : "") + (m.tag_key || m.key)}
                      {m.unit ? ` (${m.unit})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="twin-dev-metrics">
              {metrics.map((v: any) => {
                const isFocus = focused?.key === v.key;
                const edgeSpark = isFocus && fromEdge ? edgeValues : null;
                const spark = edgeSpark && edgeSpark.length > 1
                  ? edgeSpark
                  : trendByKey[v.key]?.length > 1
                    ? trendByKey[v.key]
                    : (Array.isArray(v.spark) ? v.spark : []);
                const selectable = mode === "timeseries" && spark.length > 1;
                const active = selectable && focused?.key === v.key;
                const cardLabel = v.tag_name || v.label;
                const liveVal = isFocus && fromEdge && edgeLive?.value != null
                  ? edgeLive.value
                  : v.value;
                const body = (
                  <>
                    <div className="twin-dev-metric-top">
                      <span title={v.tag_key || v.key}>{cardLabel}</span>
                      {spark.length > 1 && (
                        <MiniMetricChart values={spark} gradId={`twin-mini-${encodeURIComponent(v.key)}`} />
                      )}
                    </div>
                    <div className="twin-dev-metric-val">
                      <LiveValue value={liveVal} />
                      {v.unit ? <small>{v.unit}</small> : null}
                    </div>
                    {v.tag_key && (
                      <div className="twin-dev-metric-key mono faint">{v.tag_key}</div>
                    )}
                  </>
                );
                if (selectable) {
                  return (
                    <button
                      key={v.key}
                      type="button"
                      className={`twin-dev-metric selectable ${active ? "active" : ""}`}
                      onClick={() => setFocusKey(v.key)}
                      aria-pressed={active}
                    >
                      {body}
                    </button>
                  );
                }
                return (
                  <div key={v.key} className="twin-dev-metric">
                    {body}
                  </div>
                );
              })}
            </div>

            {mode === "timeseries" && focused && chartValues.length > 0 && (
              <div className="twin-dev-primary">
                <div className="twin-dev-section">
                  Trend · <span className="mono">{chartLabel}</span>
                  {fromEdge && edgeLive?.node_id && (
                    <> · <span className="mono faint">{edgeLive.node_id}</span></>
                  )}
                </div>
                <PrimaryMetricChart
                  label={chartLabel}
                  unit={focused.unit || edgeLive?.unit}
                  values={chartValues}
                  hint={chartHint}
                />
              </div>
            )}

            {mode === "timeseries" && focused && chartValues.length < 2 && edgeLive?.waiting && (
              <p className="dim twin-dev-chart-empty">
                Waiting for Edge+ stream
                {edgeLive?.node_id ? ` on ${edgeLive.node_id}` : ""}.
                {" "}Station metrics will appear as a fallback once samples arrive.
              </p>
            )}

            {live.link && (
              <div className="twin-dev-link">
                <div className="twin-dev-section">Connectivity</div>
                <div className="twin-dev-link-grid">
                  <div><span>Protocol</span><strong>{live.link.protocol || device.protocol || "—"}</strong></div>
                  <div><span>Method</span><strong>{live.link.method || "—"}</strong></div>
                  <div>
                    <span>Status</span>
                    <strong className={live.link.status === "Degraded" ? "warn" : "ok"}>
                      {live.link.status || "Connected"}
                    </strong>
                  </div>
                  <div>
                    <span>Tags</span>
                    <strong>{configuredTagCount || live.link.tags || "—"}</strong>
                  </div>
                  {edgeLive?.bound && edgeLive?.node_id && (
                    <div>
                      <span>Edge+</span>
                      <strong className="mono">{edgeLive.node_id}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {live.samples?.length > 0 && mode === "vision" && (
              <div className="twin-dev-reports">
                <div className="twin-dev-section">
                  Last 5 inspection reports
                </div>
                <div className="twin-dev-report-list">
                  {live.samples.slice(0, 5).map((s: any) => {
                    const verdict = s.verdict || s.label || "Pass";
                    const confPct = s.confidence != null
                      ? `${(Number(s.confidence) * (Number(s.confidence) <= 1 ? 100 : 1)).toFixed(1)}%`
                      : null;
                    const img = s.image_url || s.thumbnail_url || s.photo_url;
                    return (
                      <article key={s.id} className={`twin-dev-report verdict-${String(verdict).toLowerCase()}`}>
                        <div className="twin-dev-report-thumb">
                          {img ? (
                            <img
                              src={img}
                              alt={`${verdict} inspection ${s.evidence_ref || s.id}`}
                              loading="lazy"
                            />
                          ) : (
                            <div className="twin-dev-report-thumb-empty" aria-hidden />
                          )}
                          <span className={`twin-dev-report-verdict ${String(verdict).toLowerCase()}`}>
                            {verdict}
                          </span>
                        </div>
                        <div className="twin-dev-report-body">
                          <div className="twin-dev-report-top">
                            <span className="mono twin-dev-report-id">{s.evidence_ref || s.id}</span>
                            {s.at && <span className="faint">{ago(s.at)}</span>}
                          </div>
                          <div className="twin-dev-report-meta">
                            {confPct && <span>Conf {confPct}</span>}
                            <span>VIN {s.vin || "—"}</span>
                            {s.camera && <span>{s.camera}</span>}
                          </div>
                          {(s.model_name || s.model_version || s.station_name) && (
                            <div className="twin-dev-report-model faint">
                              {[s.station_name, s.model_name, s.model_version && `v${s.model_version}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                          {s.notes && (
                            <div className="twin-dev-report-notes">{s.notes}</div>
                          )}
                          {s.lighting_recipe && (
                            <div className="twin-dev-report-foot mono faint">
                              {s.lighting_recipe}
                              {s.disposition ? ` · ${s.disposition}` : ""}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {live.samples?.length > 0 && mode !== "vision" && (
              <div className="twin-dev-samples">
                <div className="twin-dev-section">Configured tag samples</div>
                {live.samples.slice(0, 6).map((s: any) => (
                  <div key={s.id} className="twin-dev-sample">
                    <span className="mono">{s.id}</span>
                    <strong>{s.label}</strong>
                    <em>
                      {s.detail}
                      {s.at ? ` · ${ago(s.at)}` : ""}
                    </em>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function FactoryTwin() {
  const { data: topo } = usePoll<any>("/api/topology", 2500);
  const { data: history } = usePoll<any>("/api/twin/history", 8000);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("Live state");
  const [timeIndex, setTimeIndex] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const prevStates = useRef<Record<string, string>>({});
  const [flashed, setFlashed] = useState<Record<string, boolean>>({});
  const nav = useNavigate();

  const stationDetail = usePoll<any>(
    selected ? `/api/stations/${selected}` : "/api/health", 5000
  );

  const cg = topo?.context_graph || null;
  const spine = useMemo(() => spineFromSchema(cg), [cg]);
  const hasLevel = useMemo(() => {
    const set = new Set(spine.map((l) => l.key));
    return (k: LevelKey) => set.has(k);
  }, [spine]);
  const labelOf = (k: LevelKey) => spine.find((l) => l.key === k)?.label || k;
  const enabledBindings: Binding[] = useMemo(
    () => ((cg?.object_bindings || []) as Binding[]).filter((b) => b.enabled !== false),
    [cg],
  );
  const maxIndex = Math.max(0, (history?.count ?? 1) - 1);
  const isLive = timeIndex === null;

  const scrub = async (idx: number) => {
    const clamped = Math.max(0, Math.min(maxIndex, idx));
    setTimeIndex(clamped);
    try {
      setSnapshot(await get(`/api/twin/history/${clamped}`));
    } catch { /* ignore */ }
  };

  const returnToLive = () => {
    setPlaying(false);
    setTimeIndex(null);
    setSnapshot(null);
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setTimeIndex((cur) => {
        const next = (cur ?? -1) + 1;
        if (next >= maxIndex) {
          setPlaying(false);
          setSnapshot(null);
          return null;
        }
        get(`/api/twin/history/${next}`).then(setSnapshot).catch(() => {});
        return next;
      });
    }, PLAY_TICK_MS);
    return () => clearInterval(id);
  }, [playing, maxIndex]);

  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (isLive) void scrub(0);
    setPlaying(true);
  };

  const stateFor = (st: any): string => {
    if (isLive || !snapshot) return st.state;
    return snapshot.stations[st.id]?.state ?? "Unknown";
  };

  // Flash tiles when station state changes
  useEffect(() => {
    if (!topo) return;
    const nextFlash: Record<string, boolean> = {};
    let changed = false;
    topo.areas.forEach((area: any) => {
      area.lines.forEach((line: any) => {
        line.stations.forEach((st: any) => {
          const s = stateFor(st);
          if (prevStates.current[st.id] && prevStates.current[st.id] !== s) {
            nextFlash[st.id] = true;
            changed = true;
          }
          prevStates.current[st.id] = s;
        });
      });
    });
    if (changed) {
      setFlashed(nextFlash);
      const t = setTimeout(() => setFlashed({}), 600);
      return () => clearTimeout(t);
    }
  }, [topo, snapshot, isLive]);

  const twinBorder = (st: any): string => {
    const state = stateFor(st).replace(/\s/g, "");
    if (overlay === "Live state") return `bl-${state}`;
    if (overlay === "Quality") {
      return st.health.quality >= 0.97 ? "bl-Running" : st.health.quality >= 0.94 ? "bl-Starved" : "bl-Faulted";
    }
    if (overlay === "Cycle vs takt") {
      const d = st.cycle_time_s - st.takt_s;
      return d <= 0 ? "bl-Running" : d < 5 ? "bl-Starved" : "bl-Faulted";
    }
    if (overlay === "AI confidence") {
      return st.health.ai_confidence >= 0.95 ? "bl-Running" : st.health.ai_confidence >= 0.9 ? "bl-Starved" : "bl-Faulted";
    }
    return "";
  };

  const timelineEntries = useMemo(() => {
    const snaps: any[] = history?.snapshots ?? [];
    return snaps.slice(-40).reverse();
  }, [history]);

  /** Flatten hierarchy when a schema level is omitted from the spine. */
  const areaBlocks = useMemo(() => {
    if (!topo) return [];
    if (hasLevel("area")) {
      return topo.areas.map((area: any) => ({
        id: area.id,
        name: area.name,
        lines: area.lines,
        showAreaHead: true,
      }));
    }
    return [{
      id: "_plant",
      name: topo.site?.name || "Plant",
      lines: topo.areas.flatMap((a: any) => a.lines),
      showAreaHead: false,
    }];
  }, [topo, spine]);

  /** Flat line catalog for overview — every line visible at once. */
  const allLines = useMemo(() => {
    return areaBlocks.flatMap((area: any) => {
      if (!hasLevel("line")) {
        return [{
          id: `${area.id}-flat`,
          name: area.name,
          areaId: area.id,
          areaName: area.name,
          takt_seconds: area.lines[0]?.takt_seconds,
          stations: area.lines.flatMap((l: any) => l.stations),
        }];
      }
      return area.lines.map((line: any) => ({
        ...line,
        areaId: area.id,
        areaName: area.name,
      }));
    });
  }, [areaBlocks, spine]);

  const focusLine = useMemo(
    () => allLines.find((l: any) => l.id === focusLineId) || null,
    [allLines, focusLineId],
  );

  if (!topo) return <p className="dim">Loading factory twin…</p>;

  const schemaMissing = !cg;
  const status = cg?.status || "Fallback";
  const plantStats = lineStats(
    allLines.flatMap((l: any) => l.stations),
    stateFor,
  );

  const openLine = (lineId: string) => {
    setFocusLineId(lineId);
    setSelected(null);
  };

  const backToLines = () => {
    setFocusLineId(null);
    setSelected(null);
  };

  return (
    <div data-tour="page-twin" className="twin-page">
      <div className="twin-top">
        <div>
          <h1 className="page-title">Factory Twin</h1>
          <p className="page-sub">
            {focusLine
              ? `${focusLine.areaName} · ${focusLine.name}`
              : `${topo.site.name} · ${allLines.length} lines · ${plantStats.running}/${plantStats.total} stations running`}
          </p>
        </div>
        <div className="twin-overlays">
          {OVERLAYS.map((o) => (
            <button
              key={o}
              type="button"
              className={`twin-overlay-btn ${overlay === o ? "on" : ""}`}
              onClick={() => setOverlay(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="twin-chrome" data-tour="twin-spine">
        <div className="twin-spine-inline">
          {spine.map((lv, i) => (
            <React.Fragment key={lv.key}>
              {i > 0 && <span className="twin-spine-arrow" aria-hidden>→</span>}
              <span className={`twin-spine-chip ${lv.required ? "req" : ""}`}>{lv.label}</span>
            </React.Fragment>
          ))}
          {!schemaMissing && (
            <span className={`tag mono twin-schema-status status-${String(status).toLowerCase().replace(/\s/g, "-")}`}>
              {status}
            </span>
          )}
        </div>
        <div className="twin-legend-mini" title="Station state colors">
          {LEGEND.map(([name, color]) => (
            <span className="twin-lg-dot" key={name} title={name}>
              <i style={{ background: color }} />
            </span>
          ))}
        </div>
      </div>

      <div className="twin-layout">
        <div className="twin-main twin-canvas">
          {!focusLine && (
            <>
              <div className="twin-overview-head">
                <div>
                  <strong>All lines</strong>
                  <span className="faint">
                    {" "}· click a line to open stations
                    {plantStats.abnormal > 0 && (
                      <> · <b className="k-bad">{plantStats.abnormal} abnormal</b></>
                    )}
                  </span>
                </div>
                <span className="tag mono">
                  Q {(plantStats.avgQuality * 100).toFixed(1)}%
                </span>
              </div>

              <div className="twin-lines-grid">
                {allLines.map((line: any) => {
                  const ls = lineStats(line.stations, stateFor);
                  const headline = lineHeadlineState(line.stations, stateFor);
                  const tone = headline.replace(/\s/g, "");
                  return (
                    <button
                      key={line.id}
                      type="button"
                      className={`twin-line-card bl-${tone} ${ls.abnormal > 0 ? "has-alert" : ""}`}
                      onClick={() => openLine(line.id)}
                    >
                      <div className="tlc-top">
                        <div>
                          <div className="tlc-area">{line.areaName}</div>
                          <div className="tlc-name">{line.name}</div>
                        </div>
                        <StateChip state={headline} />
                      </div>

                      <div className="tlc-dots" aria-hidden>
                        {line.stations.map((st: any) => (
                          <i
                            key={st.id}
                            title={`${st.name}: ${stateFor(st)}`}
                            style={{ background: stateColor(stateFor(st)) }}
                          />
                        ))}
                      </div>

                      <div className="tlc-metrics">
                        <span>
                          <em><LiveValue value={ls.running} />/{ls.total}</em> run
                        </span>
                        <span>
                          <em><LiveValue value={+(ls.avgQuality * 100).toFixed(1)} format={(v) => v.toFixed(1)} />%</em> Q
                        </span>
                        <span>
                          <em><LiveValue value={+ls.avgCycle.toFixed(0)} /></em>s cyc
                        </span>
                        {ls.abnormal > 0 ? (
                          <span className="bad">
                            <em><LiveValue value={ls.abnormal} /></em> abn
                          </span>
                        ) : (
                          <span className="ok">clear</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {focusLine && (
            <>
              <div className="twin-crumb">
                <button type="button" className="linkish" onClick={backToLines}>
                  All lines
                </button>
                <span className="twin-spine-arrow">→</span>
                <span className="faint">{focusLine.areaName}</span>
                <span className="twin-spine-arrow">→</span>
                <strong>{focusLine.name}</strong>
              </div>

              <div className="twin-line-summary">
                <div className="twin-line-summary-main">
                  <StateChip state={lineHeadlineState(focusLine.stations, stateFor)} />
                  <span className="tag mono">
                    {focusLine.stations.length} {labelOf("station").toLowerCase()}s
                  </span>
                  {focusLine.takt_seconds != null && (
                    <span className="tag mono">takt {focusLine.takt_seconds}s</span>
                  )}
                  <BindingPills items={bindingsAt(enabledBindings, "line")} muted />
                </div>
                {(() => {
                  const ls = lineStats(focusLine.stations, stateFor);
                  return (
                    <div className="twin-line-summary-stats">
                      <span><em>{ls.running}/{ls.total}</em> running</span>
                      <span><em>{ls.avgCycle.toFixed(1)}s</em> avg cycle</span>
                      <span><em>{(ls.avgQuality * 100).toFixed(1)}%</em> quality</span>
                      <span className={ls.abnormal > 0 ? "bad" : ""}>
                        <em>{ls.abnormal}</em> abnormal
                      </span>
                    </div>
                  );
                })()}
              </div>

              {hasLevel("station") && (
                <div className="twin-stations twin-stations-detail">
                  {focusLine.stations.map((st: any) => {
                    const state = stateFor(st);
                    const cycle = isLive || !snapshot
                      ? st.cycle_time_s
                      : (snapshot.stations[st.id]?.cycle ?? st.cycle_time_s);
                    const delta = cycle - st.takt_s;
                    const vin = isLive || !snapshot
                      ? st.current_vin
                      : (snapshot.stations[st.id]?.vin ?? st.current_vin);
                    const devices = st.devices || [];
                    const visibleDevices = hasLevel("device")
                      ? devices.slice(0, MAX_STATION_DEV_ICONS)
                      : [];
                    const overflowDevices = hasLevel("device")
                      ? devices.slice(MAX_STATION_DEV_ICONS)
                      : [];

                    const primaryMetric = (() => {
                      switch (overlay) {
                        case "Quality":
                          return { label: "Quality", value: +(st.health.quality * 100).toFixed(1), suffix: "%", cls: st.health.quality >= 0.97 ? "ok" : "over" };
                        case "AI confidence":
                          return { label: "AI conf", value: +(st.health.ai_confidence * 100).toFixed(1), suffix: "%", cls: st.health.ai_confidence >= 0.95 ? "ok" : "over" };
                        case "Cycle vs takt":
                          return { label: "Δ takt", value: +delta.toFixed(1), suffix: "s", cls: delta <= 0 ? "ok" : "over" };
                        default:
                          return { label: "Cycle", value: +Number(cycle).toFixed(1), suffix: "s", cls: delta <= 0 ? "ok" : "over" };
                      }
                    })();

                    return (
                      <div
                        key={st.id}
                        className={`twin-station compact ${twinBorder(st)} ${selected === st.id ? "sel" : ""} ${flashed[st.id] ? "flash-state" : ""}`}
                        onClick={() => setSelected(st.id)}
                      >
                        <div className="tw-top">
                          <div>
                            <div className="tw-name">{st.name}</div>
                            <div className="tw-archetype">{labelOf("station")} {st.position}</div>
                          </div>
                          <StateChip state={state} />
                        </div>

                        <div className="tw-compact-metrics">
                          <div className={`tw-metric ${primaryMetric.cls} hot`}>
                            <div className="tm-label">{primaryMetric.label}</div>
                            <div className="tm-value">
                              <LiveValue
                                value={primaryMetric.value}
                                format={(v) => `${v.toFixed(1)}${primaryMetric.suffix}`}
                              />
                            </div>
                          </div>
                          <div className={`tw-metric ${st.health.quality >= 0.97 ? "ok" : "over"}`}>
                            <div className="tm-label">Q</div>
                            <div className="tm-value">
                              <LiveValue
                                value={+(st.health.quality * 100).toFixed(1)}
                                format={(v) => `${v.toFixed(1)}%`}
                              />
                            </div>
                          </div>
                          <div className={`tw-metric ${st.health.ai_confidence >= 0.95 ? "ok" : "over"}`}>
                            <div className="tm-label">AI</div>
                            <div className="tm-value">
                              <LiveValue
                                value={+(st.health.ai_confidence * 100).toFixed(1)}
                                format={(v) => `${v.toFixed(1)}%`}
                              />
                            </div>
                          </div>
                        </div>

                        {visibleDevices.length > 0 && (
                          <div
                            className="tw-dev-icons"
                            role="group"
                            aria-label={`${labelOf("device")}s`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {visibleDevices.map((d: any) => {
                              const icon = deviceKindIcon(d.kind);
                              const tip = [d.name, d.kind, d.protocol].filter(Boolean).join(" · ");
                              return (
                                <button
                                  key={d.id}
                                  type="button"
                                  className={`tw-dev-icon ${icon.cls}${selectedDevice?.id === d.id ? " sel" : ""}`}
                                  title={tip}
                                  aria-label={`Open ${tip}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDevice(d);
                                  }}
                                >
                                  <span aria-hidden>{icon.glyph}</span>
                                </button>
                              );
                            })}
                            {overflowDevices.length > 0 && (
                              <button
                                type="button"
                                className="tw-dev-icon more"
                                title={`${overflowDevices.length} more`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDevice(overflowDevices[0]);
                                }}
                              >
                                +{overflowDevices.length}
                              </button>
                            )}
                          </div>
                        )}

                        <div className="tw-foot">
                          <div className="tw-vin" title={vin || "No VIN"}>
                            {vin ? <LiveValue value={String(vin).slice(-10)} /> : "— idle —"}
                          </div>
                          <div className="tw-op">{st.operator}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <TimeTravelSidebar
          isLive={isLive}
          playing={playing}
          timeIndex={timeIndex}
          maxIndex={maxIndex}
          snapshot={snapshot}
          entries={timelineEntries}
          onSeek={(i) => { setPlaying(false); void scrub(i); }}
          onStep={(d) => { setPlaying(false); void scrub((timeIndex ?? maxIndex) + d); }}
          onTogglePlay={togglePlay}
          onLive={returnToLive}
        />
      </div>

      {selected && stationDetail.data?.station && (
        <Drawer onClose={() => setSelected(null)}>
          <InspectorContent
            detail={stationDetail.data}
            levelLabels={{
              station: labelOf("station"),
              device: labelOf("device"),
              area: labelOf("area"),
              line: labelOf("line"),
            }}
            showDevices={hasLevel("device")}
            onOpenStation={() => nav(`/operate/station/${selected}`)}
          />
        </Drawer>
      )}

      {selectedDevice && (
        <DeviceLiveModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
        />
      )}
    </div>
  );
}

/* ---------------- Causal Time-Travel sidebar ---------------- */

function TimeTravelSidebar({
  isLive, playing, timeIndex, maxIndex, snapshot, entries,
  onSeek, onStep, onTogglePlay, onLive,
}: {
  isLive: boolean;
  playing: boolean;
  timeIndex: number | null;
  maxIndex: number;
  snapshot: any;
  entries: any[];
  onSeek: (index: number) => void;
  onStep: (delta: number) => void;
  onTogglePlay: () => void;
  onLive: () => void;
}) {
  const effective = timeIndex ?? maxIndex;
  const pct = maxIndex > 0 ? (effective / maxIndex) * 100 : 100;
  const oldest = entries.length ? entries[entries.length - 1] : null;

  return (
    <aside className="tt-sidebar">
      <div className="tt-head">
        <span className="tt-title">⏱ Causal Time-Travel</span>
        {isLive
          ? <span className="tt-mode live">LIVE</span>
          : <span className="tt-mode replay">REPLAY</span>}
      </div>

      <div className="tt-controls">
        <button className="tt-btn" title="Jump to oldest snapshot" onClick={() => onSeek(0)}>⏮</button>
        <button className="tt-btn" title="Step back" disabled={effective <= 0} onClick={() => onStep(-1)}>⏴</button>
        <button
          className={`tt-btn play ${playing ? "playing" : ""}`}
          title={playing ? "Pause replay" : "Play replay"}
          onClick={onTogglePlay}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button className="tt-btn" title="Step forward" disabled={isLive} onClick={() => onStep(1)}>⏵</button>
        <button className="tt-btn" title="Jump to live" disabled={isLive} onClick={onLive}>⏭</button>
      </div>

      <input
        type="range"
        className="seek"
        min={0}
        max={maxIndex}
        value={effective}
        onChange={(e) => onSeek(Number(e.target.value))}
        style={{
          background: `linear-gradient(90deg, var(--accent) ${pct}%, var(--border) ${pct}%)`,
        }}
        aria-label="Seek through plant history"
      />
      <div className="tt-seek-labels">
        <span>{oldest ? ago(oldest.at) : "—"}</span>
        <span>{isLive ? "now" : `snapshot ${effective + 1}/${maxIndex + 1}`}</span>
      </div>

      <div className="tt-snapinfo">
        {isLive ? (
          <>Watching <b style={{ color: "var(--state-running)" }}>live</b> plant state.
            Drag the seek bar or press ▶ to replay history.</>
        ) : snapshot ? (
          <>Replaying <b>{ago(snapshot.at)}</b> · OEE{" "}
            <b className="mono">
              <LiveValue value={+((snapshot.kpis.oee ?? 0) * 100).toFixed(1)} format={(v) => `${v.toFixed(1)}%`} />
            </b> · units{" "}
            <b className="mono"><LiveValue value={snapshot.kpis.actual_units ?? 0} /></b></>
        ) : (
          <>Loading snapshot…</>
        )}
      </div>

      <div className="tt-timeline">
        <div className="tt-tl-label">Snapshot timeline · newest first</div>
        {entries.map((s: any) => (
          <div
            key={s.index}
            className={`tt-item ${!isLive && s.index === effective ? "active" : ""}`}
            onClick={() => onSeek(s.index)}
            title={`Replay snapshot from ${ago(s.at)}`}
          >
            <span>{ago(s.at)}</span>
            <span className="tt-oee">
              OEE <LiveValue value={+((s.kpis.oee ?? 0) * 100).toFixed(1)} format={(v) => `${v.toFixed(1)}%`} />
            </span>
          </div>
        ))}
        {entries.length === 0 && <div className="empty-state">No snapshots yet.</div>}
      </div>

      {!isLive && (
        <button className="btn tt-return" onClick={onLive}>⏭ Return to live</button>
      )}
    </aside>
  );
}

/* ---------------- Station inspector ---------------- */

function InspectorContent({
  detail, onOpenStation, levelLabels, showDevices,
}: {
  detail: any;
  onOpenStation: () => void;
  levelLabels: Record<string, string>;
  showDevices: boolean;
}) {
  const st = detail.station;
  const stationBindings: Binding[] = detail.station_bindings || [];
  return (
    <div>
      <h2 style={{ margin: "4px 0 2px", fontSize: 17 }}>{st.name}</h2>
      <div className="small faint">
        {detail.area?.name} · {detail.line?.name} · {levelLabels.station.toLowerCase()} {st.position}
      </div>
      <div className="mt row wrap">
        <StateChip state={st.state} />
        <span className="tag">since {ago(st.state_since)}</span>
        <span className="tag mono">
          cycle <LiveValue value={st.cycle_time_s} format={(v) => `${v.toFixed(1)}s`} /> / takt {st.takt_s}s
        </span>
      </div>

      {stationBindings.length > 0 && (
        <>
          <div className="divider" />
          <div className="panel-title">Bound objects · context graph</div>
          {stationBindings.map((b) => (
            <div className="row between small" key={b.id} style={{ padding: "4px 0" }}>
              <span>
                <span aria-hidden>{BINDING_GLYPH[b.object_type] || "◇"} </span>
                {b.label}
              </span>
              <span className="mono faint">{b.report_at}{b.protocol ? ` · ${b.protocol}` : ""}</span>
            </div>
          ))}
        </>
      )}

      <div className="divider" />
      <div className="panel-title">{levelLabels.station} health score</div>
      {Object.entries(st.health).map(([k, v]: [string, any]) => (
        <div className="hbar-row" key={k}>
          <div className="hbar-label" style={{ width: 140, textTransform: "capitalize" }}>
            {k.replace(/_/g, " ")}
          </div>
          <div className="hbar-track">
            <div
              className="hbar-fill"
              style={{
                width: `${v * 100}%`,
                background: v > 0.95 ? "var(--state-running)" : v > 0.88 ? "var(--state-starved)" : "var(--state-faulted)",
              }}
            />
          </div>
          <div className="hbar-value">
            <LiveValue value={+(v * 100).toFixed(1)} format={(x) => `${x.toFixed(1)}%`} />
          </div>
        </div>
      ))}

      {detail.current_vin && (
        <>
          <div className="divider" />
          <div className="panel-title">Current product</div>
          <div className="mono small"><LiveValue value={detail.current_vin.vin} /></div>
          <div className="small dim">{detail.current_vin.variant} · {detail.current_vin.color}</div>
        </>
      )}

      {showDevices && (
        <>
          <div className="divider" />
          <div className="panel-title">{levelLabels.device}s</div>
          {detail.devices.map((d: any) => (
            <div className="row between small" key={d.id} style={{ padding: "3px 0" }}>
              <span>{d.kind} <span className="faint">· {d.protocol}</span></span>
              <span className="mono faint">trust {d.timestamp_trust}</span>
            </div>
          ))}
        </>
      )}

      {(detail.inspections?.length > 0 || detail.defects?.length > 0) && (
        <>
          <div className="divider" />
          <div className="panel-title">Evidence</div>
          {detail.inspections?.slice(0, 3).map((i: any) => (
            <div key={i.id} className="small" style={{ marginBottom: 4 }}>
              Inspection · {i.verdict || i.result || "capture"} · {ago(i.captured)}
            </div>
          ))}
          {detail.defects?.slice(0, 3).map((d: any) => (
            <div key={d.id} className="small" style={{ marginBottom: 4 }}>
              Defect · {d.class || d.severity} · {d.status}
            </div>
          ))}
        </>
      )}

      {detail.events.length > 0 && (
        <>
          <div className="divider" />
          <div className="panel-title">Active events</div>
          {detail.events.map((e: any) => (
            <div key={e.id} className="small" style={{ marginBottom: 6 }}>
              <span className={`pri ${e.priority}`}>{e.priority}</span>{" "}
              {e.title}
            </div>
          ))}
        </>
      )}

      <div className="divider" />
      <button className="btn" style={{ width: "100%" }} onClick={onOpenStation}>
        Open station workspace →
      </button>
      <div className="audit-footer">
        Context-on-click · structure from Engineer context graph · live state, devices and evidence.
      </div>
    </div>
  );
}
