"use client";
import { Shell } from "@/components/Shell";
import { ContextRibbon, Drawer, Panel, Spark, StateChip, Tip } from "@/components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Station = {
  id: string;
  line: string;
  cell?: string;
  name: string;
  state: string;
  health_index: number;
  issues: number;
  order_external_id?: string | null;
  product_name?: string | null;
  lot_code?: string | null;
  takt_s?: number;
};

type ActionItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  role: string;
  kind?: string;
  href?: string;
  asset_id?: string | null;
  source_event_id?: string | null;
  updated_at?: string | null;
};

type CriticalEvent = {
  id: string;
  title: string;
  severity: string;
  status: string;
  owner_role?: string | null;
  asset_id?: string | null;
  updated_at?: string | null;
  href?: string;
};

type Overview = {
  plant?: { id: string; name: string; code?: string; timezone?: string };
  shift?: string;
  refreshed_at?: string;
  kpis?: Record<string, number | null | undefined>;
  kpi_meta?: Record<string, string>;
  stations?: Station[];
  actions?: ActionItem[];
  critical_events?: CriticalEvent[];
  quality_pareto?: { label: string; n: number }[];
  production_trend?: number[];
  context?: { order_external_id?: string | null; product_name?: string | null; lot_code?: string | null };
  data_quality?: { status?: string; reasons?: string[]; telemetry_age_s?: number | null };
};

function formatAge(iso?: string | null, nowMs?: number): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.floor(((nowMs ?? Date.now()) - t) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function formatKpi(key: string, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (key === "throughput_vs_target" || key === "first_pass_yield") {
    return `${(value * 100).toFixed(key === "first_pass_yield" ? 1 : 0)}%`;
  }
  return String(value);
}

function stationTone(state: string, health: number, issues: number): string {
  const key = (state || "").toLowerCase();
  if (key.includes("fault") || key.includes("crit") || health < 0.5) return "station-crit";
  if (key.includes("block") || key.includes("hold") || key.includes("warn") || issues > 0 || health < 0.75) {
    return "station-warn";
  }
  if (key.includes("run") || key.includes("ok")) return "station-ok";
  return "";
}

function priorityBadgeClass(priority: string) {
  if (priority === "Critical") return undefined;
  if (priority === "High") return "border-warn/40 bg-warn/10 text-warn";
  if (priority === "Medium") return "border-info/40 bg-info/10 text-info";
  return undefined;
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [range, setRange] = useState("8h");
  const [selected, setSelected] = useState<Station | null>(null);
  const [ackIds, setAckIds] = useState<Set<string>>(new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  const prevKpis = useRef<Record<string, number | null | undefined>>({});
  const prevStationSig = useRef<string>("");

  const load = useCallback(async () => {
    try {
      const next = await api<Overview>("/plant/overview");
      setData(next);
      setError(null);

      const k = next.kpis || {};
      const changed = new Set<string>();
      for (const key of Object.keys(k)) {
        if (prevKpis.current[key] !== undefined && prevKpis.current[key] !== k[key]) {
          changed.add(key);
        }
      }
      prevKpis.current = k;
      if (changed.size) {
        setFlashKeys(changed);
        window.setTimeout(() => setFlashKeys(new Set()), 900);
      }

      const sig = (next.stations || [])
        .map((s) => `${s.id}:${s.state}:${s.health_index.toFixed(3)}:${s.issues}`)
        .join("|");
      prevStationSig.current = sig;
    } catch (e: any) {
      setError(e?.message || "Failed to load plant overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      load();
    }, 4000);
    return () => clearInterval(t);
  }, [live, load]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && live) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [live, load]);

  const k = data?.kpis || {};
  const dq = data?.data_quality;
  const criticalEvents = (data?.critical_events || []).filter((e) => !ackIds.has(e.id));
  const primaryCritical = criticalEvents[0];

  const byLine = useMemo(() => {
    const map = new Map<string, Station[]>();
    for (const s of data?.stations || []) {
      if (!map.has(s.line)) map.set(s.line, []);
      map.get(s.line)!.push(s);
    }
    return [...map.entries()];
  }, [data]);

  const trend = data?.production_trend?.length
    ? data.production_trend.map((v) => v * 100)
    : null;
  const pareto = data?.quality_pareto || [];
  const paretoMax = Math.max(...pareto.map((p) => p.n), 1);

  const kpis = [
    {
      key: "throughput_vs_target",
      label: "Throughput vs target",
      value: formatKpi("throughput_vs_target", k.throughput_vs_target as number | null | undefined),
      href: "/live",
      hint: data?.kpi_meta?.throughput_vs_target,
    },
    {
      key: "first_pass_yield",
      label: "First-pass yield",
      value: formatKpi("first_pass_yield", k.first_pass_yield as number | null | undefined),
      href: "/quality",
      hint: data?.kpi_meta?.first_pass_yield,
    },
    {
      key: "open_critical_events",
      label: "Open critical events",
      value: formatKpi("open_critical_events", k.open_critical_events as number | null | undefined),
      href: "/quality?view=critical",
      hint: "Open Critical/High quality events",
    },
    {
      key: "unplanned_downtime_min",
      label: "Unplanned downtime (min)",
      value: formatKpi("unplanned_downtime_min", k.unplanned_downtime_min as number | null | undefined),
      href: "/reliability",
      hint: data?.kpi_meta?.unplanned_downtime_min,
    },
    {
      key: "assets_at_risk",
      label: "Assets at risk",
      value: formatKpi("assets_at_risk", k.assets_at_risk as number | null | undefined),
      href: "/reliability",
      hint: "Health index < 80%",
    },
  ] as const;

  const freshnessLabel = formatAge(data?.refreshed_at, nowMs);
  const dqState: "active" | "down" | "fixing" | "idle" =
    !data || error
      ? "down"
      : dq?.status === "stale"
        ? "down"
        : dq?.status === "degraded"
          ? "fixing"
          : live
            ? "active"
            : "idle";

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Command center</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={live ? "default" : "secondary"}
            className="gap-1.5"
            title={dq?.reasons?.join(", ") || "Freshness"}
          >
            <StatusIndicator state={dqState} size="sm" />
            {live ? "LIVE" : "PAUSED"} · {freshnessLabel}
          </Badge>
          <Button
            variant={live ? "outline" : "default"}
            size="sm"
            type="button"
            onClick={() => setLive((v) => !v)}
          >
            {live ? "Pause" : "Resume"}
          </Button>
          <Button variant="ghost" size="sm" type="button" onClick={() => load()}>
            Refresh
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/twin">Open factory twin</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/live">Live production</Link>
          </Button>
        </div>
      </div>

      <ContextRibbon
        plant={data?.plant?.name}
        shift={data?.shift}
        timeRange={range}
        live={live && !error}
        onTimeRange={setRange}
      />

      <Tip>
        Every KPI and station is bound to live plant context. Pause freezes polling; critical quality
        work stays as a persistent banner until acknowledged or cleared by workflow progress.
      </Tip>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertTitle>Command center degraded</AlertTitle>
          <AlertDescription>
            Could not refresh plant overview. Showing last known data if available.{" "}
            <button type="button" className="underline font-semibold" onClick={() => load()}>
              Retry
            </button>
            <span className="muted block mt-1 text-xs">{error}</span>
          </AlertDescription>
        </Alert>
      )}

      {primaryCritical && (
        <Alert variant="destructive" className="mb-3 operate-crit-banner">
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <StatusIndicator state="down" size="sm" />
            Critical / high quality work
            <Badge variant="destructive">{criticalEvents.length} open</Badge>
            <Badge variant="outline" className="border-crit/40 text-crit">
              {primaryCritical.status}
            </Badge>
          </AlertTitle>
          <AlertDescription className="mt-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong>{primaryCritical.title}</strong>
                <span className="muted">
                  {" "}
                  · {primaryCritical.owner_role || "unassigned"} · updated{" "}
                  {formatAge(primaryCritical.updated_at, nowMs)}
                </span>
                {criticalEvents.length > 1 && (
                  <div className="muted mt-1 text-xs">
                    +{criticalEvents.length - 1} more critical/high event
                    {criticalEvents.length - 1 === 1 ? "" : "s"} in queue
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={primaryCritical.href || `/quality/${primaryCritical.id}`}>Open event</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/quality?view=critical">Quality queue</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setAckIds((prev) => {
                      const next = new Set(prev);
                      next.add(primaryCritical.id);
                      return next;
                    })
                  }
                >
                  Acknowledge
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {loading && !data
          ? Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="h-full gap-1 py-4 shadow-sm">
                <CardContent className="px-4 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          : kpis.map((kpi, i) => (
              <Link key={kpi.key} href={kpi.href} className="kpi" style={{ animationDelay: `${i * 40}ms` }}>
                <Card
                  className={cn(
                    "h-full gap-1 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40",
                    flashKeys.has(kpi.key) && "kpi-flash",
                    kpi.value === "—" && "opacity-90",
                  )}
                >
                  <CardContent className="px-4">
                    <div className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                      {kpi.label}
                    </div>
                    <div className="font-display mt-1 text-2xl font-bold tabular-nums">{kpi.value}</div>
                    {kpi.value === "—" ? (
                      <div className="text-muted-foreground mt-1 text-[11px]">Unavailable · no source data</div>
                    ) : kpi.hint ? (
                      <div className="text-muted-foreground mt-1 text-[11px] line-clamp-1">{kpi.hint}</div>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            ))}
      </div>

      {(data?.context?.order_external_id || data?.context?.product_name) && (
        <div className="muted mt-2 flex flex-wrap gap-3 text-xs">
          {data.context.order_external_id && <span>Order <strong>{data.context.order_external_id}</strong></span>}
          {data.context.product_name && <span>Product <strong>{data.context.product_name}</strong></span>}
          {data.context.lot_code && <span>Lot <strong>{data.context.lot_code}</strong></span>}
          {typeof k.stations_running === "number" && typeof k.stations_total === "number" && (
            <span>
              Stations <strong>{k.stations_running}/{k.stations_total}</strong> running
            </span>
          )}
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Panel
          title="Line status map"
          action={
            <div className="flex items-center gap-2">
              <span className="muted text-xs">
                {data?.stations?.length ?? 0} stations · click for context
              </span>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/twin">Twin overlays</Link>
              </Button>
            </div>
          }
        >
          {loading && !byLine.length ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !byLine.length ? (
            <p className="muted">No station topology for this site. Check plant seed / site assignment.</p>
          ) : (
            <div className="twin-map">
              {byLine.map(([line, stations]) => (
                <div key={line} className="twin-line">
                  <h3>
                    {line}
                    <span className="muted font-normal">
                      {" "}
                      · {stations.filter((s) => /run/i.test(s.state)).length}/{stations.length} running
                    </span>
                  </h3>
                  <div className="twin-stations">
                    {stations.map((s) => {
                      const tone = stationTone(s.state, s.health_index, s.issues);
                      const active = selected?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={cn("station-card", tone, active && "station-selected")}
                          onClick={() => setSelected(s)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <StateChip state={s.state} />
                            {s.issues > 0 && (
                              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                                {s.issues}
                              </Badge>
                            )}
                          </div>
                          <div className="name">{s.name}</div>
                          <div className="muted">
                            Health {(s.health_index * 100).toFixed(0)}%
                            {s.product_name ? ` · ${s.product_name}` : ""}
                          </div>
                          {s.lot_code && <div className="muted mono">{s.lot_code}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="grid gap-3">
          <Panel
            title="Production vs target"
            action={
              <span className="muted text-xs">
                Window {range} · {freshnessLabel}
              </span>
            }
          >
            {trend ? (
              <>
                <Spark values={trend} height={56} />
                <p className="muted mt-2 text-xs">
                  Derived from recent vibration telemetry (higher vibration → lower operational score).
                  Not a fabricated OEE total.
                </p>
              </>
            ) : (
              <p className="muted">No production trend samples yet — waiting on telemetry.</p>
            )}
          </Panel>

          <Panel title="Quality Pareto">
            {!pareto.length ? (
              <p className="muted">No open quality / anomaly signals in the current window.</p>
            ) : (
              pareto.map((p) => (
                <div key={p.label} className="mb-2 grid grid-cols-[1fr_100px_32px] items-center gap-2">
                  <span className="truncate" title={p.label}>{p.label}</span>
                  <Progress value={(p.n / paretoMax) * 100} />
                  <strong className="tabular-nums">{p.n}</strong>
                </div>
              ))
            )}
          </Panel>

          <Panel
            title="Role action queue"
            action={
              <Button variant="link" size="sm" asChild>
                <Link href="/work">All work</Link>
              </Button>
            }
          >
            {!data?.actions?.length ? (
              <p className="muted">No open actions for this site — queue is clear.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Action</th>
                    <th>Role</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.actions.slice(0, 8).map((a) => (
                    <tr key={a.id} className="operate-action-row">
                      <td>
                        <Badge
                          variant={a.priority === "Critical" ? "destructive" : "outline"}
                          className={priorityBadgeClass(a.priority)}
                        >
                          {a.priority}
                        </Badge>
                      </td>
                      <td>
                        <div className="font-medium">{a.title}</div>
                        <div className="muted text-[11px]">
                          {a.kind || "work"} · {a.status}
                          {a.updated_at ? ` · ${formatAge(a.updated_at, nowMs)}` : ""}
                        </div>
                      </td>
                      <td className="muted">{a.role}</td>
                      <td>
                        <Button variant="link" size="sm" asChild>
                          <Link href={a.href || "/work"}>Open</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>

      {selected && (
        <Drawer onClose={() => setSelected(null)} title={selected.name} width={400}>
          <div className="space-y-3">
            <p className="mono muted text-xs">{selected.id}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StateChip state={selected.state} />
              <Badge variant="outline">{selected.cell}</Badge>
              <Badge variant="outline">{selected.line}</Badge>
            </div>
            <p>
              Health index <strong className="tabular-nums">{(selected.health_index * 100).toFixed(0)}%</strong>
            </p>
            <p>
              Open issues <strong className="tabular-nums">{selected.issues}</strong>
            </p>
            {selected.order_external_id && (
              <p className="muted text-sm">Order {selected.order_external_id}</p>
            )}
            {selected.product_name && (
              <p className="muted text-sm">Product {selected.product_name}</p>
            )}
            {selected.lot_code && (
              <p className="muted text-sm">Lot {selected.lot_code}</p>
            )}
            {selected.takt_s != null && (
              <p className="muted text-sm">Line takt {selected.takt_s}s</p>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Button size="sm" asChild>
                <Link href={`/assets/${selected.id}`}>Open asset</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/live">Live production</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/work">Station work</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/reliability">Reliability / PdM</Link>
              </Button>
            </div>
          </div>
        </Drawer>
      )}
    </Shell>
  );
}
