"use client";

import { Shell } from "@/components/Shell";
import { BackplaneForm } from "@/components/graph/BackplaneForm";
import { FlowTreeCanvas } from "@/components/graph/FlowTreeCanvas";
import { Panel, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import {
  BackplaneConfig,
  FlowForest,
  FlowNode,
  clearBackplaneOverride,
  dataplaneStyle,
  findPath,
  flattenForest,
  loadBackplaneOverride,
  mergeBackplane,
  rebuildForestClient,
  saveBackplaneOverride,
} from "@/lib/graphBackplane";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const LENS_HINT: Record<string, string> = {
  isa95_spine: "Hierarchy spine only",
  quality_thread: "Emphasize quality / genealogy dataplanes",
  maintenance: "Emphasize health, failure modes, timeseries",
};

export default function GraphPage() {
  const [data, setData] = useState<any>(null);
  const [lens, setLens] = useState("isa95_spine");
  const [siteFilter, setSiteFilter] = useState<"midwest" | "harley" | "hero" | "lam" | "all">("midwest");
  const [selected, setSelected] = useState<FlowNode | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showDesigner, setShowDesigner] = useState(false);
  const [backplane, setBackplane] = useState<BackplaneConfig | null>(null);
  const [override, setOverride] = useState<BackplaneConfig | null>(null);

  const load = useCallback(async (site: string) => {
    const q = site === "all" ? "all" : site;
    const payload = await api(`/graph?site=${encodeURIComponent(q)}`);
    setData(payload);
    const seeded = payload.backplane as BackplaneConfig;
    const stored = loadBackplaneOverride();
    setOverride(stored);
    setBackplane(mergeBackplane(seeded, stored));
    // Default-collapse deep device clusters under stations with many children
    const forest = payload.tree as FlowForest;
    const nextCollapsed: Record<string, boolean> = {};
    flattenForest(forest?.roots || []).forEach((n) => {
      if (n.level === "station" && (n.children || []).length > 4) {
        nextCollapsed[n.id] = true;
      }
    });
    setCollapsed(nextCollapsed);
    setSelected(null);
  }, []);

  useEffect(() => {
    load(siteFilter).catch(console.error);
  }, [load, siteFilter]);

  const activeBackplane = backplane;

  const forest: FlowForest | null = useMemo(() => {
    if (!data || !activeBackplane) return null;
    const seeded = data.backplane as BackplaneConfig;
    const merged = mergeBackplane(seeded, override);
    // If override only toggles enablement vs seed tree, rebuild client-side for snappy form feedback.
    const siteId =
      siteFilter === "all"
        ? null
        : (data.site_id as string) ||
          (data.tree?.sites || []).find((s: any) =>
            siteFilter === "harley"
              ? /harley|york/i.test(s.label)
              : siteFilter === "hero"
                ? /hero|dharuhera/i.test(s.label)
                : siteFilter === "lam"
                  ? /lam|fremont|lr-fco/i.test(s.label)
                  : /midwest/i.test(s.label),
          )?.id ||
          null;
    return rebuildForestClient(data.nodes || [], data.edges || [], merged, siteId);
  }, [data, activeBackplane, override, siteFilter]);

  // Preserve live enrichment from server tree onto rebuilt nodes.
  const displayForest = useMemo(() => {
    if (!forest || !data?.tree) return forest;
    const liveMap = new Map<string, FlowNode>();
    flattenForest(data.tree.roots || []).forEach((n: FlowNode) => liveMap.set(n.id, n));
    const stamp = (n: FlowNode): FlowNode => {
      const live = liveMap.get(n.id);
      return {
        ...n,
        live: live?.live || n.live,
        link: live?.link || n.link,
        attachments:
          live?.attachments && live.attachments.length >= (n.attachments || []).length
            ? live.attachments
            : n.attachments,
        attachment_count: live?.attachment_count ?? n.attachment_count,
        children: (n.children || []).map(stamp),
      };
    };
    return { ...forest, roots: forest.roots.map(stamp) };
  }, [forest, data]);

  const levelHeaders = useMemo(() => {
    if (!activeBackplane) return [];
    return activeBackplane.levels
      .filter((l) => l.enabled !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((l) => ({ id: l.id, label: l.label }));
  }, [activeBackplane]);

  const path = useMemo(() => {
    if (!selected || !displayForest) return [];
    return findPath(displayForest.roots, selected.id) || [];
  }, [selected, displayForest]);

  const onBackplaneChange = (next: BackplaneConfig) => {
    setOverride(next);
    setBackplane(next);
    saveBackplaneOverride(next);
  };

  const onResetBackplane = () => {
    clearBackplaneOverride();
    setOverride(null);
    if (data?.backplane) setBackplane(data.backplane);
  };

  const lensFilteredAttachments = (node: FlowNode) => {
    const atts = node.attachments || [];
    if (lens === "quality_thread") {
      return atts.filter((a) =>
        ["inspection", "defect", "quality_event", "genealogy", "order"].includes(a.object_type),
      );
    }
    if (lens === "maintenance") {
      return atts.filter((a) =>
        ["timeseries", "failure_mode", "status", "lesson"].includes(a.object_type),
      );
    }
    return atts;
  };

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Context graph</h1>
          <p className="muted">
            {(data?.nodes || []).length} nodes · {(data?.edges || []).length} edges
            {displayForest ? ` · ${displayForest.stats.nodes} in tree` : ""}
          </p>
        </div>
        <div className="chip-row">
          <button
            type="button"
            className={`chip-btn ${showDesigner ? "active" : ""}`}
            onClick={() => setShowDesigner((v) => !v)}
          >
            Backplane form
          </button>
          <Link className="btn ghost sm" href="/twin">
            Twin
          </Link>
          <Link className="btn ghost sm" href="/admin/data">
            Data planes
          </Link>
        </div>
      </div>

      <Tip>
        Hierarchy is driven by the backplane form (columns + dataplane attachments), rendered from
        published graph edges. Edge labels show how each child connects (OPC UA, MQTT/Sparkplug, MES
        REST, Kafka…). Empty binding slots show as “empty” — metrics are never fabricated.
      </Tip>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        {(["midwest", "harley", "hero", "lam", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`chip-btn ${siteFilter === s ? "active" : ""}`}
            onClick={() => setSiteFilter(s)}
          >
            {s === "midwest"
              ? "Midwest Hybrid"
              : s === "harley"
                ? "Harley York"
                : s === "hero"
                  ? "Hero Dharuhera"
                  : s === "lam"
                    ? "Lam Fremont"
                    : "All sites"}
          </button>
        ))}
        <span className="muted" style={{ margin: "0 6px" }}>
          ·
        </span>
        {(["isa95_spine", "quality_thread", "maintenance"] as const).map((l) => (
          <button
            key={l}
            type="button"
            className={`chip-btn ${lens === l ? "active" : ""}`}
            title={LENS_HINT[l]}
            onClick={() => setLens(l)}
          >
            {l}
          </button>
        ))}
      </div>

      <div
        className="grid graph-page-grid"
        style={{
          gridTemplateColumns: showDesigner ? "320px 1fr 300px" : "1fr 300px",
          gap: 12,
        }}
      >
        {showDesigner && activeBackplane && (
          <BackplaneForm
            value={activeBackplane}
            onChange={onBackplaneChange}
            onReset={onResetBackplane}
          />
        )}

        <FlowTreeCanvas
          roots={displayForest?.roots || []}
          levels={levelHeaders}
          selectedId={selected?.id || null}
          onSelect={setSelected}
          direction={activeBackplane?.direction || "ltr"}
          collapsed={collapsed}
          onToggle={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
        />

        <div className="grid" style={{ gap: 12, alignContent: "start" }}>
          <Panel title={selected ? selected.label : "Inspector"}>
            {!selected && (
              <p className="muted" style={{ fontSize: 12 }}>
                Select a plant, area, line, station, or device to inspect bindings and related
                dataplanes.
              </p>
            )}
            {selected && (
              <>
                <div className="muted" style={{ textTransform: "uppercase", fontSize: 10, fontWeight: 700 }}>
                  {selected.level} · {selected.kind}
                </div>
                {path.length > 1 && (
                  <div className="flow-path muted" style={{ fontSize: 11, margin: "6px 0 10px" }}>
                    {path.map((p) => p.label).join(" → ")}
                  </div>
                )}

                {selected.props?.health_index != null && (
                  <div style={{ marginBottom: 8 }}>
                    Health index{" "}
                    <strong>{((selected.props.health_index as number) * 100).toFixed(0)}%</strong>
                    {selected.props.state ? (
                      <span className="muted"> · {String(selected.props.state)}</span>
                    ) : null}
                    {selected.props.demo_scenario ? (
                      <span className="muted"> · {String(selected.props.demo_scenario)}</span>
                    ) : null}
                  </div>
                )}

                {selected.link?.protocol && (
                  <div className="flow-link-card">
                    <strong>Ingress · {selected.link.protocol}</strong>
                    <div className="muted">
                      {(selected.link.direction || "publish").toUpperCase()}
                      {selected.link.transport ? ` · ${selected.link.transport}` : ""}
                      {selected.link.connector_kind ? ` · ${selected.link.connector_kind}` : ""}
                    </div>
                    {selected.link.topic ? (
                      <div className="mono muted">topic {selected.link.topic}</div>
                    ) : null}
                    {selected.link.endpoint ? (
                      <div className="mono muted">endpoint {selected.link.endpoint}</div>
                    ) : null}
                  </div>
                )}

                {selected.live && (
                  <div className="chip-row" style={{ marginBottom: 10 }}>
                    <span className="chip-btn">
                      Anomalies {selected.live.open_anomalies ?? 0}
                    </span>
                    <span className="chip-btn">
                      Quality events {selected.live.open_quality_events ?? 0}
                    </span>
                    <span className="chip-btn">
                      Signals {selected.live.distinct_signals ?? 0}
                    </span>
                  </div>
                )}

                <h4 className="form-section">Binding slots</h4>
                {(selected.binding_slots || []).length === 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>No dataplanes attach at this level.</p>
                )}
                {(selected.binding_slots || []).map((s) => {
                  const st = dataplaneStyle(s.object_type);
                  const att = (selected.attachments || []).find((a) => a.object_type === s.object_type);
                  return (
                    <div key={s.id} className="cg-obj-row">
                      <span style={{ color: st.color }}>{st.glyph}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{s.label}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {s.mode}
                          {s.protocol ? ` · ${s.protocol}` : ""}
                          {!att?.count ? " · empty" : ` · ${att.count}`}
                        </div>
                      </div>
                      <span className="mono">{att?.count ?? "—"}</span>
                    </div>
                  );
                })}

                <h4 className="form-section">Related dataplanes</h4>
                {lensFilteredAttachments(selected).length === 0 && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    No bound instances
                    {lens !== "isa95_spine" ? ` for lens ${lens}` : ""}.
                  </p>
                )}
                {lensFilteredAttachments(selected).map((a) => {
                  const st = dataplaneStyle(a.object_type);
                  return (
                    <div key={a.object_type} style={{ marginBottom: 10 }}>
                      <div className="row between" style={{ marginBottom: 4 }}>
                        <strong style={{ color: st.color, fontSize: 12 }}>
                          {st.glyph} {a.object_type}
                        </strong>
                        <span className="mono muted">{a.count}</span>
                      </div>
                      {(a.items || []).slice(0, 8).map((item) => (
                        <div key={item.id} className="muted" style={{ fontSize: 12, paddingLeft: 8 }}>
                          {item.label}
                          {item.props?.unit ? ` · ${String(item.props.unit)}` : ""}
                          {item.props?.key ? (
                            <span className="mono"> · {String(item.props.key)}</span>
                          ) : null}
                        </div>
                      ))}
                      {!a.items?.length && a.count > 0 && (
                        <div className="muted" style={{ fontSize: 11, paddingLeft: 8 }}>
                          {a.count} live record{a.count === 1 ? "" : "s"}
                          {a.source ? ` (${a.source})` : ""} — no graph child nodes
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="chip-row" style={{ marginTop: 12 }}>
                  {(selected.level === "device" || selected.kind === "asset") && (
                    <Link className="btn sm" href={`/assets/${selected.id}`}>
                      Open asset
                    </Link>
                  )}
                  <Link
                    className="btn ghost sm"
                    href={`/twin${selected.site_id ? `?focus=${selected.id}` : ""}`}
                  >
                    Open twin
                  </Link>
                  {(selected.level === "device" || selected.kind === "asset") && (
                    <Link className="btn ghost sm" href={`/live?asset=${selected.id}`}>
                      Live
                    </Link>
                  )}
                </div>
              </>
            )}
          </Panel>

          <Panel title="Tree stats">
            <p className="muted" style={{ fontSize: 12 }}>
              {displayForest?.stats.nodes ?? 0} nodes · {displayForest?.stats.attachments ?? 0}{" "}
              attachments · lens {lens}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {levelHeaders.map((l) => (
                  <tr key={l.id}>
                    <td>{l.label}</td>
                    <td>{displayForest?.stats.by_level?.[l.id] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
