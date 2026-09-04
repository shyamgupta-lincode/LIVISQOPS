"use client";
import { Shell } from "@/components/Shell";
import { ContextRibbon, Drawer, Panel, Spark, Tip } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_SIGNALS = ["vibration_mm_s", "temperature_c", "torque_nm"];
const LAM_SIGNALS = ["helium_leak_rate_sccm", "seal_void_score", "flange_torque_nm", "chamber_pressure_mTorr"];

function formatValue(signal: string, value: number) {
  if (signal.includes("helium") || Math.abs(value) < 0.001) return value.toExponential(2);
  if (signal.includes("score")) return value.toFixed(3);
  return value.toFixed(2);
}

export default function LivePage() {
  const [anoms, setAnoms] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [telemetry, setTelemetry] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [line, setLine] = useState("all");
  const [range, setRange] = useState("15m");
  const [activeSignal, setActiveSignal] = useState<string>("");

  const stream = overview?.stream;
  const signals: string[] = stream?.primary_signals?.length
    ? stream.primary_signals
    : overview?.plant?.code === "LR-FCO"
      ? LAM_SIGNALS
      : DEFAULT_SIGNALS;
  const scenario = stream?.scenario || (overview?.plant?.code === "LR-FCO" ? "gas_box_seal_void" : "bearing_wear");
  const primaryAssetId = stream?.primary_asset_id as string | undefined;

  useEffect(() => {
    if (signals.length && !activeSignal) setActiveSignal(signals[0]);
  }, [signals, activeSignal]);

  useEffect(() => {
    const load = () => {
      api("/anomalies").then((d) => setAnoms(d.items || [])).catch(console.error);
      api("/plant/overview").then(setOverview).catch(console.error);
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!primaryAssetId || !activeSignal) return;
    const loadTel = () => {
      api(`/assets/${primaryAssetId}/telemetry?signal=${encodeURIComponent(activeSignal)}&limit=48`)
        .then(setTelemetry)
        .catch(console.error);
    };
    loadTel();
    const t = setInterval(loadTel, 4000);
    return () => clearInterval(t);
  }, [primaryAssetId, activeSignal]);

  const lines = useMemo(() => {
    const set = new Set<string>();
    for (const s of overview?.stations || []) set.add(String(s.line));
    return [...set];
  }, [overview]);

  const filteredAnoms = useMemo(() => {
    if (line === "all") return anoms;
    const assetIds = new Set(
      (overview?.stations || []).filter((s: any) => s.line === line).map((s: any) => s.id),
    );
    return anoms.filter((a) => assetIds.has(a.asset_id));
  }, [anoms, line, overview]);

  const series = useMemo(() => {
    const samples = telemetry?.samples || [];
    const forSignal = samples
      .filter((s: any) => s.signal === activeSignal)
      .map((s: any) => Number(s.value))
      .reverse();
    if (forSignal.length >= 3) return forSignal.slice(-24);
    const trend = overview?.production_trend;
    if (Array.isArray(trend) && trend.length) return trend;
    const base = selected?.features?.mean || (scenario === "gas_box_seal_void" ? 1e-7 : 2.2);
    return Array.from({ length: 24 }, (_, i) => base * (1 + i * 0.02) + Math.sin(i / 3) * base * 0.05);
  }, [telemetry, activeSignal, overview, selected, scenario]);

  const dq = overview?.data_quality?.status || "ok";
  const dqClass =
    dq === "ok" ? "border-ok/40 bg-ok/10 text-ok" : dq === "stale" ? "border-crit/40 bg-crit/10 text-crit" : "border-warn/40 bg-warn/10 text-warn";

  const latestSample = telemetry?.samples?.[0];
  const calibrationLabel =
    scenario === "gas_box_seal_void" ? "Helium leak sensor · Gas Box Seal" : "Spindle accelerometer · OK";

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Live production</h1>
          {scenario && (
            <p className="muted text-sm">
              Stream scenario: <code className="font-mono">{scenario}</code>
              {overview?.data_quality?.telemetry_age_s != null && (
                <> · telemetry age {overview.data_quality.telemetry_age_s}s</>
              )}
            </p>
          )}
        </div>
        <Badge variant="outline" className="gap-1.5 border-ok/40 bg-ok/10 text-ok">
          <StatusIndicator state="active" size="sm" />
          Streaming
        </Badge>
      </div>

      <ContextRibbon plant={overview?.plant?.name} shift={overview?.shift} timeRange={range} onTimeRange={setRange} />
      <Tip>
        Live telemetry from the plant simulator is site-scoped. Lam Fremont streams helium leak, seal void, flange
        torque, and chamber pressure on the Gas Box Seal station; Midwest streams vibration/temperature/torque on the
        spindle bearing path.
      </Tip>

      <div className="grid live-layout">
        <Panel title="Filters">
          <div className="filter-rail space-y-2">
            <label className="text-xs font-semibold">Line</label>
            <Select value={line} onValueChange={setLine}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lines</SelectItem>
                {lines.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="text-xs font-semibold">Shift</label>
            <Input value={overview?.shift || "A"} readOnly />
            <label className="text-xs font-semibold">Signals</label>
            <div className="chip-row flex flex-wrap gap-1">
              {signals.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip-btn text-xs ${activeSignal === s ? "active" : ""}`}
                  onClick={() => setActiveSignal(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <div className="grid gap-3">
          <Panel title={`Contextualized series · ${activeSignal || "—"}`}>
            {latestSample && (
              <p className="muted mb-2 text-xs">
                Latest:{" "}
                <strong className="text-foreground font-mono">
                  {formatValue(activeSignal, Number(latestSample.value))} {latestSample.unit}
                </strong>
              </p>
            )}
            <Spark values={series} height={72} />
          </Panel>
          <Panel title="Anomalies">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Signal</th>
                  <th>Severity</th>
                  <th>Conf.</th>
                  <th>Model</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAnoms.map((a) => (
                  <tr key={a.id}>
                    <td className="mono muted">{(a.created_at || "").slice(11, 19)}</td>
                    <td className="font-semibold">{a.signal}</td>
                    <td>
                      <Badge
                        variant={a.severity === "Critical" ? "destructive" : "outline"}
                        className={a.severity !== "Critical" ? "border-warn/40 bg-warn/10 text-warn" : undefined}
                      >
                        {a.severity}
                      </Badge>
                    </td>
                    <td>{(a.confidence * 100).toFixed(0)}%</td>
                    <td className="muted">{a.model_version}</td>
                    <td>
                      <Button variant="ghost" size="sm" type="button" onClick={() => setSelected(a)}>
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
                {!filteredAnoms.length && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Waiting for simulator / stream-worker…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>

        <Panel title="Context panel">
          <p>
            <strong>Order</strong> {overview?.context?.order_external_id || "—"}
          </p>
          <p>
            <strong>Lot / unit</strong> {overview?.context?.lot_code || "—"} / {overview?.context?.unit_serial || "—"}
          </p>
          <p>
            <strong>Product</strong> {overview?.context?.product_name || "—"}
          </p>
          <p>
            <strong>Station</strong> {telemetry?.asset?.name || (scenario === "gas_box_seal_void" ? "Gas Box Seal" : "Spindle bearing")}
          </p>
          <p>
            <strong>Mode</strong> {telemetry?.asset?.operating_state || "Running"}
          </p>
          <p>
            <strong>Calibration</strong> {calibrationLabel}
          </p>
          <p className="flex items-center gap-2">
            <strong>Data quality</strong>{" "}
            <Badge className={dqClass} variant="outline">
              {dq}
            </Badge>
          </p>
          <Separator className="my-3" />
          <Button variant="outline" size="sm" asChild>
            <Link href="/graph">Open context graph</Link>
          </Button>
        </Panel>
      </div>

      {selected && (
        <Drawer title={<>Anomaly · {selected.signal}</>} onClose={() => setSelected(null)} width={440}>
          <p className="flex flex-wrap gap-1.5">
            <Badge
              variant={selected.severity === "Critical" ? "destructive" : "outline"}
              className={selected.severity !== "Critical" ? "border-warn/40 bg-warn/10 text-warn" : undefined}
            >
              {selected.severity}
            </Badge>
            <Badge variant="secondary">{selected.status}</Badge>
          </p>
          <p className="mono muted">{selected.id}</p>
          <h3 className="mt-3 text-sm font-bold">Contributing features</h3>
          <pre className="bg-secondary mt-1 rounded-md p-2.5 text-[11px] whitespace-pre-wrap">
            {JSON.stringify(selected.features, null, 2)}
          </pre>
          <p>
            Model <code>{selected.model_version}</code>
          </p>
          <p>
            Baseline <code>{selected.baseline_version || (scenario === "gas_box_seal_void" ? "lam-fco-v1" : "bearing-baseline-v1")}</code>
          </p>
          <div className="mt-3.5 flex flex-col gap-2">
            <Button
              type="button"
              onClick={async () => {
                const qe = await api(`/anomalies/${selected.id}/create-quality-event`, { method: "POST" });
                location.href = `/quality/${qe.id}`;
              }}
            >
              Create quality event
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/rca?event=${selected.id}`}>Request RCA</Link>
            </Button>
          </div>
        </Drawer>
      )}
    </Shell>
  );
}
