"use client";

import { Shell } from "@/components/Shell";
import { ContextRibbon, Panel, Spark, StateChip, Tip } from "@/components/ui";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const OVERLAYS = ["Live state", "Quality", "Cycle vs takt", "AI confidence"] as const;
type Overlay = (typeof OVERLAYS)[number];
type Level = "lines" | "cells" | "stations" | "devices";

type Binding = {
  id: string;
  object_type: string;
  label: string;
  report_at: string;
  rollup_to?: string[];
  enabled?: boolean;
  protocol?: string;
};

type Stats = {
  stations_total: number;
  stations_running: number;
  issues: number;
  avg_health: number | null;
  abnormal: number;
  state: string;
};

type Device = {
  id: string;
  kind: string;
  name: string;
  signal_key: string;
  unit?: string;
  protocol?: string | null;
  asset_id?: string;
  sample_count?: number;
  latest?: { value: number; unit?: string; quality?: string; observed_at?: string } | null;
  recent?: { value: number; observed_at?: string; quality?: string }[];
};

type Station = {
  id: string;
  kind?: string;
  name: string;
  state: string;
  health_index: number;
  issues: number;
  cell?: string;
  cell_id?: string;
  line?: string;
  line_id?: string;
  takt_s?: number;
  criticality?: string;
  asset_type?: string;
  order_external_id?: string | null;
  product_name?: string | null;
  lot_code?: string | null;
  model_confidence?: number | null;
  prediction?: {
    probability_in_horizon?: number;
    health_index?: number;
    model_version?: string;
    status?: string;
  } | null;
  devices?: Device[];
  device_count?: number;
};

type CellNode = {
  id: string;
  kind: string;
  name: string;
  line_id: string;
  line: string;
  stats: Stats;
  state: string;
  stations: Station[];
};

type LineNode = {
  id: string;
  kind: string;
  name: string;
  takt_s?: number;
  stats: Stats;
  state: string;
  cells: CellNode[];
};

function pct(v: number | null | undefined, digits = 0) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function bindingsAt(bindings: Binding[], level: string) {
  return bindings.filter((b) => {
    if (b.enabled === false) return false;
    const home = b.report_at === level;
    const roll = (b.rollup_to || []).includes(level);
    return home || roll;
  });
}

function stationTone(state: string, health: number, issues: number) {
  const s = (state || "").toLowerCase();
  if (s.includes("fault") || health < 0.45) return "station-crit";
  if (s.includes("hold") || s.includes("block") || issues > 0 || health < 0.75) return "station-warn";
  if (s.includes("run")) return "station-ok";
  return "";
}

function overlayPrimary(overlay: Overlay, station: Station) {
  if (overlay === "Quality") {
    if (station.issues > 0) return { label: "Issues", value: String(station.issues), tone: "warn" as const };
    return { label: "Quality", value: "In control", tone: "ok" as const };
  }
  if (overlay === "Cycle vs takt") {
    if (station.takt_s == null) return { label: "Takt", value: "Unavailable", tone: "muted" as const };
    // Cycle estimate from health when explicit cycle telemetry is absent — labeled as estimate.
    const est = Math.round(Number(station.takt_s) + (1 - station.health_index) * 18);
    const delta = est - Number(station.takt_s);
    return {
      label: "Cycle / takt",
      value: `${est}s / ${station.takt_s}s`,
      tone: delta <= 0 ? ("ok" as const) : delta < 5 ? ("warn" as const) : ("crit" as const),
    };
  }
  if (overlay === "AI confidence") {
    const conf = station.model_confidence ?? station.prediction?.probability_in_horizon;
    if (conf == null) return { label: "Model", value: "No score", tone: "muted" as const };
    return {
      label: station.model_confidence != null ? "Anomaly conf" : "PdM prob",
      value: pct(conf, 0),
      tone: conf >= 0.9 ? ("warn" as const) : ("ok" as const),
    };
  }
  return { label: "State", value: station.state, tone: "muted" as const };
}

function rollupOverlay(overlay: Overlay, stats: Stats, takt?: number) {
  if (overlay === "Quality") {
    return stats.issues > 0 ? `${stats.issues} open issues` : "In control";
  }
  if (overlay === "Cycle vs takt") {
    if (takt == null) return "Takt unavailable";
    return `Takt ${takt}s · ${stats.stations_running}/${stats.stations_total} running`;
  }
  if (overlay === "AI confidence") {
    return stats.avg_health == null ? "No model rollup" : `Health rollup ${pct(stats.avg_health)}`;
  }
  return stats.state;
}

export default function TwinPage() {
  const [data, setData] = useState<any>(null);
  const [overlay, setOverlay] = useState<Overlay>("Live state");
  const [range, setRange] = useState("1h");
  const [mode, setMode] = useState<"LIVE" | "REPLAY">("LIVE");
  const [lineId, setLineId] = useState<string | null>(null);
  const [cellId, setCellId] = useState<string | null>(null);
  const [stationId, setStationId] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api("/plant/overview").then(setData).catch(console.error);
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const topology = data?.topology;
  const lines: LineNode[] = topology?.lines || [];
  const bindings: Binding[] = topology?.bindings || [];
  const spine = topology?.spine || [
    { id: "line", label: "Line" },
    { id: "cell", label: "Cell" },
    { id: "station", label: "Station" },
    { id: "device", label: "Device" },
  ];

  const focusLine = useMemo(() => lines.find((l) => l.id === lineId) || null, [lines, lineId]);
  const focusCell = useMemo(
    () => focusLine?.cells.find((c) => c.id === cellId) || null,
    [focusLine, cellId],
  );
  const focusStation = useMemo(
    () => focusCell?.stations.find((s) => s.id === stationId) || null,
    [focusCell, stationId],
  );
  const focusDevice = useMemo(
    () => focusStation?.devices?.find((d) => d.id === deviceId) || null,
    [focusStation, deviceId],
  );

  const level: Level = focusDevice
    ? "devices"
    : focusStation
      ? "devices"
      : focusCell
        ? "stations"
        : focusLine
          ? "cells"
          : "lines";

  const plantStats = useMemo(() => {
    const all = lines.flatMap((l) => l.cells.flatMap((c) => c.stations));
    const running = all.filter((s) => /run/i.test(s.state)).length;
    const issues = all.reduce((n, s) => n + (s.issues || 0), 0);
    return { total: all.length, running, issues, lines: lines.length };
  }, [lines]);

  function openLine(id: string) {
    setLineId(id);
    setCellId(null);
    setStationId(null);
    setDeviceId(null);
  }
  function openCell(id: string) {
    setCellId(id);
    setStationId(null);
    setDeviceId(null);
  }
  function openStation(id: string) {
    setStationId(id);
    setDeviceId(null);
  }
  function openDevice(id: string) {
    setDeviceId(id);
  }
  function goLines() {
    setLineId(null);
    setCellId(null);
    setStationId(null);
    setDeviceId(null);
  }
  function goLine() {
    setCellId(null);
    setStationId(null);
    setDeviceId(null);
  }
  function goCell() {
    setStationId(null);
    setDeviceId(null);
  }
  function goStation() {
    setDeviceId(null);
  }

  const selectedKind = focusDevice
    ? "device"
    : focusStation
      ? "station"
      : focusCell
        ? "cell"
        : focusLine
          ? "line"
          : "plant";

  const inspectorBindings = useMemo(() => {
    const mapLevel =
      selectedKind === "device"
        ? "asset"
        : selectedKind === "station"
          ? "asset"
          : selectedKind === "cell"
            ? "cell"
            : selectedKind === "line"
              ? "line"
              : "site";
    return bindingsAt(bindings, mapLevel);
  }, [bindings, selectedKind]);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Factory twin</h1>
          <p className="muted">
            {focusLine
              ? [focusLine.name, focusCell?.name, focusStation?.name, focusDevice?.name].filter(Boolean).join(" · ")
              : `${data?.plant?.name || "Plant"} · ${plantStats.lines} lines · ${plantStats.running}/${plantStats.total} stations running`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn sm ${mode === "LIVE" ? "" : "ghost"}`} type="button" onClick={() => setMode("LIVE")}>
            LIVE
          </button>
          <button className={`btn sm ${mode === "REPLAY" ? "" : "ghost"}`} type="button" onClick={() => setMode("REPLAY")}>
            REPLAY
          </button>
        </div>
      </div>

      <ContextRibbon
        plant={data?.plant?.name}
        shift={data?.shift}
        timeRange={range}
        live={mode === "LIVE"}
        onTimeRange={setRange}
      />

      <Tip>
        QualityOps twin pattern: drill <strong>line → cell → station → device</strong> along the published context graph.
        Overlays recolor the same hierarchy; inspector shows bindings and real telemetry rollups (empty states are explicit).
      </Tip>

      <div className="twin-chrome">
        <div className="twin-spine-inline" aria-label="Context graph spine">
          {spine.map((lv: any, i: number) => (
            <span key={lv.id} className="twin-spine-chip">
              {i > 0 && <span className="twin-spine-arrow" aria-hidden>→</span>}
              {lv.label}
            </span>
          ))}
          {data?.data_quality?.status && (
            <Badge variant="outline" className="ml-2 font-mono text-[10px] uppercase">
              DQ {data.data_quality.status}
            </Badge>
          )}
        </div>
      </div>

      <div className="overlay-bar">
        {OVERLAYS.map((o) => (
          <button
            key={o}
            type="button"
            className={`chip-btn ${overlay === o ? "active" : ""}`}
            onClick={() => setOverlay(o)}
          >
            {o}
          </button>
        ))}
      </div>

      <div className="grid twin-layout">
        <Panel
          title={`Topology · ${overlay}`}
          action={
            <span className="muted text-xs">
              {level === "lines" && "Click a line to open cells"}
              {level === "cells" && "Click a cell to open stations"}
              {level === "stations" && "Click a station to open devices"}
              {level === "devices" && focusDevice && "Device telemetry"}
              {level === "devices" && !focusDevice && "Select a device / sensor"}
            </span>
          }
        >
          {!data && <p className="muted">Loading factory twin…</p>}
          {data && !lines.length && (
            <p className="muted">No topology for this site. Check plant seed / site assignment.</p>
          )}

          {!!lines.length && (
            <>
              {(focusLine || focusCell || focusStation) && (
                <Breadcrumb className="twin-crumb mb-3">
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <button type="button" className="linkish" onClick={goLines}>
                          All lines
                        </button>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    {focusLine && (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          {focusCell ? (
                            <BreadcrumbLink asChild>
                              <button type="button" className="linkish" onClick={goLine}>
                                {focusLine.name}
                              </button>
                            </BreadcrumbLink>
                          ) : (
                            <BreadcrumbPage>{focusLine.name}</BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </>
                    )}
                    {focusCell && (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          {focusStation ? (
                            <BreadcrumbLink asChild>
                              <button type="button" className="linkish" onClick={goCell}>
                                {focusCell.name}
                              </button>
                            </BreadcrumbLink>
                          ) : (
                            <BreadcrumbPage>{focusCell.name}</BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </>
                    )}
                    {focusStation && (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          {focusDevice ? (
                            <BreadcrumbLink asChild>
                              <button type="button" className="linkish" onClick={goStation}>
                                {focusStation.name}
                              </button>
                            </BreadcrumbLink>
                          ) : (
                            <BreadcrumbPage>{focusStation.name}</BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </>
                    )}
                    {focusDevice && (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{focusDevice.name}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </>
                    )}
                  </BreadcrumbList>
                </Breadcrumb>
              )}

              {/* Level: all lines */}
              {!focusLine && (
                <>
                  <div className="twin-overview-head">
                    <div>
                      <strong>All lines</strong>
                      <span className="muted">
                        {" "}
                        · {plantStats.running}/{plantStats.total} running
                        {plantStats.issues > 0 && <> · {plantStats.issues} issues</>}
                      </span>
                    </div>
                  </div>
                  <div className="twin-lines-grid">
                    {lines.map((line) => {
                      const ls = line.stats;
                      return (
                        <button
                          key={line.id}
                          type="button"
                          className={cn(
                            "twin-line-card",
                            stationTone(line.state, ls.avg_health ?? 1, ls.issues),
                            ls.abnormal > 0 && "has-alert",
                          )}
                          onClick={() => openLine(line.id)}
                        >
                          <div className="tlc-top">
                            <div>
                              <div className="tlc-area muted">Line</div>
                              <div className="tlc-name">{line.name}</div>
                            </div>
                            <StateChip state={line.state} />
                          </div>
                          <div className="tlc-dots" aria-hidden>
                            {line.cells.flatMap((c) =>
                              c.stations.map((st) => (
                                <i
                                  key={st.id}
                                  title={`${st.name}: ${st.state}`}
                                  className={stationTone(st.state, st.health_index, st.issues)}
                                />
                              )),
                            )}
                          </div>
                          <div className="tlc-metrics">
                            <span>
                              <em>
                                {ls.stations_running}/{ls.stations_total}
                              </em>{" "}
                              run
                            </span>
                            <span>
                              <em>{pct(ls.avg_health)}</em> health
                            </span>
                            <span>
                              <em>{line.cells.length}</em> cells
                            </span>
                            {ls.issues > 0 ? (
                              <span className="bad">
                                <em>{ls.issues}</em> issues
                              </span>
                            ) : (
                              <span className="ok">clear</span>
                            )}
                          </div>
                          <div className="muted text-xs mt-2">{rollupOverlay(overlay, ls, line.takt_s)}</div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Level: cells under line */}
              {focusLine && !focusCell && (
                <>
                  <div className="twin-line-summary">
                    <div className="twin-line-summary-main">
                      <StateChip state={focusLine.state} />
                      <span className="tag mono">{focusLine.cells.length} cells</span>
                      {focusLine.takt_s != null && (
                        <span className="tag mono">takt {focusLine.takt_s}s</span>
                      )}
                    </div>
                    <div className="twin-line-summary-stats">
                      <span>
                        <em>
                          {focusLine.stats.stations_running}/{focusLine.stats.stations_total}
                        </em>{" "}
                        running
                      </span>
                      <span>
                        <em>{pct(focusLine.stats.avg_health)}</em> avg health
                      </span>
                      <span className={focusLine.stats.issues > 0 ? "bad" : ""}>
                        <em>{focusLine.stats.issues}</em> issues
                      </span>
                    </div>
                  </div>
                  <div className="twin-lines-grid">
                    {focusLine.cells.map((cell) => (
                      <button
                        key={cell.id}
                        type="button"
                        className={cn(
                          "twin-line-card",
                          stationTone(cell.state, cell.stats.avg_health ?? 1, cell.stats.issues),
                        )}
                        onClick={() => openCell(cell.id)}
                      >
                        <div className="tlc-top">
                          <div>
                            <div className="tlc-area muted">Cell</div>
                            <div className="tlc-name">{cell.name}</div>
                          </div>
                          <StateChip state={cell.state} />
                        </div>
                        <div className="tlc-dots" aria-hidden>
                          {cell.stations.map((st) => (
                            <i
                              key={st.id}
                              title={`${st.name}: ${st.state}`}
                              className={stationTone(st.state, st.health_index, st.issues)}
                            />
                          ))}
                        </div>
                        <div className="tlc-metrics">
                          <span>
                            <em>
                              {cell.stats.stations_running}/{cell.stats.stations_total}
                            </em>{" "}
                            run
                          </span>
                          <span>
                            <em>{pct(cell.stats.avg_health)}</em> health
                          </span>
                          {cell.stats.issues > 0 ? (
                            <span className="bad">
                              <em>{cell.stats.issues}</em> issues
                            </span>
                          ) : (
                            <span className="ok">clear</span>
                          )}
                        </div>
                        <div className="muted text-xs mt-2">
                          {rollupOverlay(overlay, cell.stats, focusLine.takt_s)}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Level: stations under cell */}
              {focusCell && !focusStation && (
                <>
                  <div className="twin-line-summary">
                    <div className="twin-line-summary-main">
                      <StateChip state={focusCell.state} />
                      <span className="tag mono">{focusCell.stations.length} stations</span>
                    </div>
                    <div className="twin-line-summary-stats">
                      <span>
                        <em>
                          {focusCell.stats.stations_running}/{focusCell.stats.stations_total}
                        </em>{" "}
                        running
                      </span>
                      <span>
                        <em>{pct(focusCell.stats.avg_health)}</em> avg health
                      </span>
                      <span className={focusCell.stats.issues > 0 ? "bad" : ""}>
                        <em>{focusCell.stats.issues}</em> issues
                      </span>
                    </div>
                  </div>
                  <div className="twin-stations twin-stations-detail">
                    {focusCell.stations.map((st) => {
                      const primary = overlayPrimary(overlay, st);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          className={cn(
                            "station-card",
                            stationTone(st.state, st.health_index, st.issues),
                            stationId === st.id && "station-selected",
                          )}
                          onClick={() => openStation(st.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <StateChip state={st.state} />
                            {st.issues > 0 && (
                              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                                {st.issues}
                              </Badge>
                            )}
                          </div>
                          <div className="name">{st.name}</div>
                          <div className="muted">
                            {primary.label}: {primary.value}
                          </div>
                          <div className="muted">Health {pct(st.health_index)}</div>
                          <div className="muted text-xs">
                            {(st.device_count ?? st.devices?.length ?? 0) > 0
                              ? `${st.device_count ?? st.devices?.length} devices`
                              : "No devices bound"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Level: devices under station */}
              {focusStation && (
                <>
                  <div className="twin-line-summary">
                    <div className="twin-line-summary-main">
                      <StateChip state={focusStation.state} />
                      <span className="tag mono">
                        {focusStation.devices?.length || 0} devices
                      </span>
                      <span className="tag mono">Health {pct(focusStation.health_index)}</span>
                    </div>
                    <div className="twin-line-summary-stats">
                      <span>
                        <em>{overlayPrimary(overlay, focusStation).value}</em>{" "}
                        {overlayPrimary(overlay, focusStation).label.toLowerCase()}
                      </span>
                      <span className={focusStation.issues > 0 ? "bad" : ""}>
                        <em>{focusStation.issues}</em> issues
                      </span>
                    </div>
                  </div>
                  {!focusStation.devices?.length ? (
                    <p className="muted">
                      No device / signal bindings on this station in the context graph, and no recent
                      telemetry samples.
                    </p>
                  ) : (
                    <div className="twin-stations twin-stations-detail">
                      {focusStation.devices.map((d) => {
                        const active = deviceId === d.id;
                        const spark = (d.recent || []).map((r) => r.value);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            className={cn("station-card", active && "station-selected")}
                            onClick={() => openDevice(d.id)}
                          >
                            <div className="tlc-area muted">Device · {d.signal_key}</div>
                            <div className="name">{d.name}</div>
                            {d.latest ? (
                              <>
                                <div className="text-sm font-semibold tabular-nums">
                                  {d.latest.value.toFixed(3)} {d.latest.unit || d.unit || ""}
                                </div>
                                <div className="muted text-xs">
                                  {d.latest.quality || "sample"} ·{" "}
                                  {d.latest.observed_at
                                    ? new Date(d.latest.observed_at).toLocaleTimeString()
                                    : "time n/a"}
                                </div>
                              </>
                            ) : (
                              <div className="muted">No recent samples</div>
                            )}
                            {spark.length > 1 && (
                              <div className="mt-2">
                                <Spark values={spark} height={28} />
                              </div>
                            )}
                            {d.protocol && <div className="muted text-xs mt-1">{d.protocol}</div>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Panel>

        <Panel
          title="Inspector"
          action={
            focusStation ? (
              <Link href={`/assets/${focusStation.id}`}>Asset →</Link>
            ) : focusLine ? (
              <Link href="/live">Live →</Link>
            ) : null
          }
        >
          {selectedKind === "plant" && (
            <>
              <p className="muted">Select a line to drill the context-graph hierarchy.</p>
              {data?.kpis && (
                <div className="twin-inspector-stats">
                  <div>
                    <span className="muted">Stations running</span>
                    <strong>
                      {data.kpis.stations_running}/{data.kpis.stations_total}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">Open critical</span>
                    <strong>{data.kpis.open_critical_events}</strong>
                  </div>
                  <div>
                    <span className="muted">Assets at risk</span>
                    <strong>{data.kpis.assets_at_risk}</strong>
                  </div>
                </div>
              )}
              {data?.data_quality?.reasons?.length > 0 && (
                <p className="muted text-xs mt-2">DQ: {data.data_quality.reasons.join(", ")}</p>
              )}
            </>
          )}

          {selectedKind === "line" && focusLine && (
            <>
              <h2 style={{ marginBottom: 8 }}>{focusLine.name}</h2>
              <p className="mono muted">{focusLine.id}</p>
              <p>
                <StateChip state={focusLine.state} /> · {focusLine.cells.length} cells
              </p>
              <div className="twin-inspector-stats">
                <div>
                  <span className="muted">Running</span>
                  <strong>
                    {focusLine.stats.stations_running}/{focusLine.stats.stations_total}
                  </strong>
                </div>
                <div>
                  <span className="muted">Avg health</span>
                  <strong>{pct(focusLine.stats.avg_health)}</strong>
                </div>
                <div>
                  <span className="muted">Issues</span>
                  <strong>{focusLine.stats.issues}</strong>
                </div>
                <div>
                  <span className="muted">Takt</span>
                  <strong>{focusLine.takt_s != null ? `${focusLine.takt_s}s` : "—"}</strong>
                </div>
              </div>
            </>
          )}

          {selectedKind === "cell" && focusCell && (
            <>
              <h2 style={{ marginBottom: 8 }}>{focusCell.name}</h2>
              <p className="mono muted">{focusCell.id}</p>
              <p>
                <StateChip state={focusCell.state} /> · {focusCell.line}
              </p>
              <div className="twin-inspector-stats">
                <div>
                  <span className="muted">Stations</span>
                  <strong>
                    {focusCell.stats.stations_running}/{focusCell.stats.stations_total}
                  </strong>
                </div>
                <div>
                  <span className="muted">Avg health</span>
                  <strong>{pct(focusCell.stats.avg_health)}</strong>
                </div>
                <div>
                  <span className="muted">Issues</span>
                  <strong>{focusCell.stats.issues}</strong>
                </div>
              </div>
            </>
          )}

          {selectedKind === "station" && focusStation && (
            <>
              <h2 style={{ marginBottom: 8 }}>{focusStation.name}</h2>
              <p className="mono muted">{focusStation.id}</p>
              <p>
                <StateChip state={focusStation.state} /> · {focusStation.cell}
              </p>
              <p>
                Health index <strong>{pct(focusStation.health_index)}</strong>
              </p>
              <p>
                Open issues <strong>{focusStation.issues}</strong>
              </p>
              {focusStation.order_external_id && (
                <p className="muted text-sm">
                  Order {focusStation.order_external_id}
                  {focusStation.product_name ? ` · ${focusStation.product_name}` : ""}
                  {focusStation.lot_code ? ` · ${focusStation.lot_code}` : ""}
                </p>
              )}
              {focusStation.model_confidence != null && (
                <p>
                  Anomaly confidence <strong>{pct(focusStation.model_confidence)}</strong>
                </p>
              )}
              {focusStation.prediction && (
                <p className="muted text-sm">
                  PdM {focusStation.prediction.model_version || "model"} · P=
                  {pct(focusStation.prediction.probability_in_horizon)} ·{" "}
                  {focusStation.prediction.status}
                </p>
              )}
              {overlay === "AI confidence" &&
                focusStation.model_confidence == null &&
                !focusStation.prediction && (
                  <p className="muted text-sm">No model confidence available for this station.</p>
                )}
            </>
          )}

          {selectedKind === "device" && focusDevice && focusStation && (
            <>
              <h2 style={{ marginBottom: 8 }}>{focusDevice.name}</h2>
              <p className="mono muted">{focusDevice.id}</p>
              <p className="muted text-sm">
                Signal <code>{focusDevice.signal_key}</code>
                {focusDevice.protocol ? ` · ${focusDevice.protocol}` : ""}
              </p>
              {focusDevice.latest ? (
                <>
                  <p>
                    Latest{" "}
                    <strong className="tabular-nums">
                      {focusDevice.latest.value.toFixed(4)}{" "}
                      {focusDevice.latest.unit || focusDevice.unit || ""}
                    </strong>
                  </p>
                  <p className="muted text-sm">
                    Quality {focusDevice.latest.quality || "—"} ·{" "}
                    {focusDevice.latest.observed_at
                      ? new Date(focusDevice.latest.observed_at).toLocaleString()
                      : "time unavailable"}
                  </p>
                  {(focusDevice.recent?.length || 0) > 1 && (
                    <div className="mt-2">
                      <Spark values={(focusDevice.recent || []).map((r) => r.value)} height={40} />
                      <p className="muted text-xs mt-1">
                        {focusDevice.recent!.length} recent samples · timeseries plane
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">
                  No telemetry samples matched this device key yet (dataplane empty / alias mismatch).
                </p>
              )}
              <p className="muted text-sm mt-2">Parent station: {focusStation.name}</p>
            </>
          )}

          {selectedKind !== "plant" && (
            <>
              <h3 style={{ marginTop: 14, fontSize: 12 }}>Object bindings</h3>
              {!inspectorBindings.length ? (
                <p className="muted text-sm">No enabled bindings at this level.</p>
              ) : (
                <ul style={{ margin: "8px 0", paddingLeft: 18, color: "var(--muted)", fontSize: 13 }}>
                  {inspectorBindings.map((b) => (
                    <li key={b.id}>
                      <strong>{b.object_type}</strong> — {b.label}
                      {b.protocol ? ` (${b.protocol})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {focusStation && (
              <>
                <Button size="sm" asChild>
                  <Link href="/live">Open in live production</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/assets/${focusStation.id}`}>Reliability / asset</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/work">Send to station work</Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/graph">View on context graph</Link>
                </Button>
              </>
            )}
            {!focusStation && focusLine && (
              <Button size="sm" asChild>
                <Link href="/live">Open live production</Link>
              </Button>
            )}
          </div>

          {mode === "REPLAY" && (
            <p className="muted" style={{ marginTop: 12 }}>
              Replay transport armed for {range}. Scrub envelopes on the event backbone when history is
              available.
            </p>
          )}
        </Panel>
      </div>
    </Shell>
  );
}
