// Production — orders, WIP and genealogy framed by the active Context Graph.
// Structure follows Engineer bindings: order @ line, genealogy @ station.

import React, { useEffect, useMemo, useState } from "react";

import { ago, get, post, usePoll } from "../api";
import { onTourCommand, tourNotice } from "../tour/bridge";
import { Drawer, Field, Modal, StateChip, toast } from "../components/ui";

const SOURCES = ["All", "SAP", "ERP", "APS", "WMS", "Manual"] as const;

const VARIANTS = [
  "Street Glide Special", "Road Glide Limited", "Road King Special",
  "Fat Boy 114", "Softail Standard", "Sportster S", "Pan America 1250",
];
const COLORS = [
  "Vivid Black", "Whiskey Fire", "Billiard Gray", "Bright Billiard Blue",
  "Midnight Crimson", "White Onyx Pearl",
];

type LevelKey = "facility" | "area" | "line" | "station" | "device";

type SpineLevel = { key: LevelKey; label: string; required: boolean; id: string };

type Binding = {
  id: string;
  object_type: string;
  label: string;
  report_at: string;
  rollup_to?: string[];
  enabled?: boolean;
  protocol?: string | null;
  lenses?: string[];
};

type Mode = "orders" | "genealogy" | "context";

type OrderForm = {
  source: string;
  erp_ref: string;
  product: string;
  variant: string;
  color: string;
  qty: number;
  status: string;
  line_id: string;
  release: boolean;
};

const OBJECT_STYLE: Record<string, { color: string; glyph: string }> = {
  order: { color: "#C4841D", glyph: "⬢" },
  genealogy: { color: "#1F9D5C", glyph: "◇" },
  work_instruction: { color: "#7B5BB0", glyph: "🗎" },
  inspection: { color: "#C94A7A", glyph: "◎" },
  defect: { color: "#D06A1E", glyph: "▲" },
  status: { color: "#1F9D5C", glyph: "●" },
  timeseries: { color: "#3E96F4", glyph: "∿" },
};

/** Short labels for Production spine/pills — keep Engineer catalog labels intact. */
const BINDING_SHORT_LABEL: Record<string, string> = {
  status: "Status",
  order: "Production order",
  genealogy: "Genealogy",
  timeseries: "Time series",
  work_instruction: "Work instructions",
  inspection: "Inspection",
  defect: "Defect",
  document: "Documents",
  model: "Model",
};

const FALLBACK_LEVELS: SpineLevel[] = [
  { key: "facility", label: "Facility", required: true, id: "facility" },
  { key: "area", label: "Area", required: true, id: "area" },
  { key: "line", label: "Line", required: true, id: "line" },
  { key: "station", label: "Station", required: true, id: "station" },
];

const TABS: { id: Mode; title: string; ico: string }[] = [
  { id: "orders", title: "Orders", ico: "⬢" },
  { id: "genealogy", title: "WIP · Genealogy", ico: "◇" },
  { id: "context", title: "By context", ico: "❖" },
];

const emptyForm = (): OrderForm => ({
  source: "Manual",
  erp_ref: "",
  product: "Harley-Davidson Motorcycle",
  variant: VARIANTS[0],
  color: COLORS[0],
  qty: 12,
  status: "Planned",
  line_id: "line-touring-assembly-line",
  release: false,
});

function canonicalLevelKey(lv: any): LevelKey | null {
  if (!lv) return null;
  if (lv.id === "facility" || lv.entity === "site") return "facility";
  if (["area", "line", "station", "device"].includes(lv.entity)) return lv.entity;
  if (["facility", "area", "line", "station", "device"].includes(lv.id)) return lv.id;
  return null;
}

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

function BindingPills({ items, muted = false }: { items: Binding[]; muted?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="twin-bind-pills">
      {items.map((b) => {
        const st = OBJECT_STYLE[b.object_type] || { color: "#6B7275", glyph: "◇" };
        const short = BINDING_SHORT_LABEL[b.object_type] || b.label;
        return (
          <span
            key={b.id}
            className={`twin-bind-pill ${muted ? "rollup" : "home"}`}
            style={{ borderColor: `${st.color}55`, color: st.color }}
            title={`${b.label}${b.protocol ? ` · ${b.protocol}` : ""}${muted ? " (rollup)" : ""}`}
          >
            <span aria-hidden>{st.glyph}</span>
            {short}
          </span>
        );
      })}
    </div>
  );
}

function progressPct(o: { completed: number; qty: number }) {
  return (o.completed / Math.max(1, o.qty)) * 100;
}

function stationPath(
  topo: any,
  stationId: string | null | undefined,
  labels: (k: LevelKey) => string,
): { key: LevelKey; label: string; name: string }[] {
  if (!topo || !stationId) return [];
  for (const area of topo.areas || []) {
    for (const line of area.lines || []) {
      const st = (line.stations || []).find((s: any) => s.id === stationId);
      if (!st) continue;
      return [
        { key: "facility", label: labels("facility"), name: topo.site?.name || "Facility" },
        { key: "area", label: labels("area"), name: area.name },
        { key: "line", label: labels("line"), name: line.name },
        { key: "station", label: labels("station"), name: st.name },
      ];
    }
  }
  return [];
}

export default function Production() {
  const { data: orders, refresh } = usePoll<any[]>("/api/orders", 8000);
  const { data: topo } = usePoll<any>("/api/topology", 20000);
  const { data: vins } = usePoll<any[]>("/api/vins", 10000);

  const [mode, setMode] = useState<Mode>("orders");
  const [vinDetail, setVinDetail] = useState<any>(null);
  const [orderDetail, setOrderDetail] = useState<any>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("All");
  const [lineFocus, setLineFocus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [labHighlight, setLabHighlight] = useState<string | null>(null);
  const [labLock, setLabLock] = useState<string[]>([]);

  useEffect(() => onTourCommand((cmd) => {
    if (cmd.type === "production-mode") setMode(cmd.mode);
    if (cmd.type === "focus-line") setLineFocus(cmd.lineId);
    if (cmd.type === "highlight-order") setLabHighlight(cmd.orderId);
    if (cmd.type === "set-order-ref") {
      setForm((f) => ({ ...f, erp_ref: cmd.erp_ref }));
    }
    if (cmd.type === "open-create-order") {
      setMode("orders");
      setLabLock(cmd.lockFields || []);
      setForm({
        ...emptyForm(),
        ...cmd.prefill,
        erp_ref: cmd.prefill.erp_ref ?? "",
        release: cmd.prefill.release ?? false,
        status: cmd.prefill.release ? "Released" : (cmd.prefill.status || "Planned"),
      });
      setCreating(true);
    }
  }), []);

  const cg = topo?.context_graph || null;
  const spine = useMemo(() => spineFromSchema(cg), [cg]);
  const labelOf = (k: LevelKey) => spine.find((l) => l.key === k)?.label || k;

  const enabledBindings: Binding[] = useMemo(
    () => (cg?.object_bindings || []).filter((b: Binding) => b.enabled !== false),
    [cg],
  );

  const prodBindings = useMemo(
    () => enabledBindings.filter((b) =>
      ["order", "genealogy", "work_instruction"].includes(b.object_type)
      || (b.lenses || []).includes("production"),
    ),
    [enabledBindings],
  );

  const lineIndex = useMemo(() => {
    const map = new Map<string, { id: string; name: string; areaId: string; areaName: string }>();
    for (const area of topo?.areas || []) {
      for (const line of area.lines || []) {
        map.set(line.id, {
          id: line.id,
          name: line.name,
          areaId: area.id,
          areaName: area.name,
        });
      }
    }
    return map;
  }, [topo]);

  const lines = useMemo(
    () => [...lineIndex.values()].map((l) => ({
      id: l.id,
      name: `${l.areaName} · ${l.name}`,
    })),
    [lineIndex],
  );

  const openOrder = async (id: string) => {
    setOrderDetail(await get(`/api/orders/${id}`));
  };
  const openVin = async (vin: string) => {
    setVinDetail(await get(`/api/vins/${vin}`));
  };

  const filtered = useMemo(() => {
    if (!orders) return [];
    let list = orders;
    if (sourceFilter !== "All") list = list.filter((o) => (o.source || "ERP") === sourceFilter);
    if (lineFocus) list = list.filter((o) => o.line_id === lineFocus);
    return list;
  }, [orders, sourceFilter, lineFocus]);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { All: orders?.length ?? 0 };
    for (const s of SOURCES) {
      if (s === "All") continue;
      counts[s] = (orders || []).filter((o) => (o.source || "ERP") === s).length;
    }
    return counts;
  }, [orders]);

  const byLine = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const o of filtered) {
      const key = o.line_id || "unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }
    return [...groups.entries()].sort((a, b) => {
      const an = lineIndex.get(a[0])?.name || a[0];
      const bn = lineIndex.get(b[0])?.name || b[0];
      return an.localeCompare(bn);
    });
  }, [filtered, lineIndex]);

  const contextTree = useMemo(() => {
    if (!topo?.areas || !orders) return [];
    return topo.areas.map((area: any) => {
      const areaOrders = orders.filter((o) =>
        area.lines.some((l: any) => l.id === o.line_id),
      );
      return {
        ...area,
        orderCount: areaOrders.length,
        released: areaOrders.filter((o) => o.status === "Released").length,
        lines: area.lines.map((line: any) => {
          const lineOrders = orders.filter((o) => o.line_id === line.id);
          return {
            ...line,
            orders: lineOrders,
            released: lineOrders.filter((o) => o.status === "Released").length,
            planned: lineOrders.filter((o) => o.status === "Planned").length,
            completed: lineOrders.filter((o) => o.status === "Completed").length,
            wip: (vins || []).filter((v) =>
              lineOrders.some((o) => o.id === v.order_id) && v.status !== "Complete",
            ).length,
          };
        }),
      };
    });
  }, [topo, orders, vins]);

  const createOrder = async () => {
    if (!form.variant.trim() || form.qty < 1) {
      toast("Variant and quantity are required");
      return;
    }
    setSaving(true);
    try {
      const created = await post("/api/orders", {
        ...form,
        erp_ref: form.erp_ref.trim() || null,
        status: form.release ? "Released" : form.status,
      });
      toast(`Created ${created.id} from ${created.source}`);
      setCreating(false);
      setForm(emptyForm());
      setLabLock([]);
      setLabHighlight(created.id);
      tourNotice({
        type: "order-created",
        order: {
          id: created.id,
          erp_ref: created.erp_ref,
          line_id: created.line_id,
          source: created.source,
          qty: created.qty,
        },
      });
      refresh();
      setMode("orders");
      // Keep the canvas clear during Interactive Lab coaching
      if (!document.querySelector(".tour-root.is-lab")) {
        setOrderDetail(await get(`/api/orders/${created.id}`));
      }
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!orders) return <p className="dim">Loading production…</p>;

  const released = orders.filter((o) => o.status === "Released");
  const planned = orders.filter((o) => o.status === "Planned");
  const completed = orders.filter((o) => o.status === "Completed");
  const wipCount = (vins || []).filter((v) => v.status !== "Complete").length;
  const schemaStatus = String(cg?.status || "draft").toLowerCase().replace(/\s+/g, "-");
  const orderHome = prodBindings.find((b) => b.object_type === "order")?.report_at || "line";
  const geneHome = prodBindings.find((b) => b.object_type === "genealogy")?.report_at || "station";

  const modeBanner = {
    orders: (
      <>
        Production order objects home at <b>{labelOf(orderHome as LevelKey)}</b>.
        Filter by source, or create a work order and release it to the line.
      </>
    ),
    genealogy: (
      <>
        VIN / component genealogy homes at <b>{labelOf(geneHome as LevelKey)}</b>.
        Open a unit for the storyline, evidence and component path.
      </>
    ),
    context: (
      <>
        Roll up along the active spine from{" "}
        <b>{cg?.name || "context graph"}</b>. Click a line to focus Orders.
      </>
    ),
  }[mode];

  return (
    <div className="prod-page" data-tour="page-production">
      <header className="cg-hero">
        <div>
          <div className="cg-hero-kicker">Operate · production context</div>
          <h1 className="cg-title">Production</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Orders, WIP and genealogy
            {cg?.name ? ` · ${cg.name}` : ""}.
          </p>
        </div>
        <div className="cg-hero-aside">
          <div className="cg-hero-stats">
            <div><em>{released.length}</em><span>Released</span></div>
            <div><em>{planned.length}</em><span>Planned</span></div>
            <div><em>{completed.length}</em><span>Completed</span></div>
            <div><em>{wipCount}</em><span>WIP units</span></div>
          </div>
        </div>
      </header>

      <div className="prod-spine twin-spine-bar" data-tour="prod-spine">
        {spine.map((lv, i) => (
          <React.Fragment key={lv.key}>
            {i > 0 && <span className="twin-spine-arrow" aria-hidden>→</span>}
            <span className={`twin-spine-chip ${lv.required ? "req" : ""}`}>{lv.label}</span>
          </React.Fragment>
        ))}
        <BindingPills items={prodBindings} />
        {cg && (
          <span className={`tag mono twin-schema-status status-${schemaStatus}`}>
            {cg.status || "draft"} · v{cg.version ?? "—"}
          </span>
        )}
      </div>

      <div className="q-tabs" role="tablist" aria-label="Production views" data-tour="prod-modes">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mode === t.id}
            className={`q-tab ${mode === t.id ? "on" : ""}`}
            onClick={() => setMode(t.id)}
          >
            <span className="q-tab-ico" aria-hidden>{t.ico}</span>
            <span className="q-tab-label">{t.title}</span>
          </button>
        ))}
      </div>

      <div className="q-tab-hint">{modeBanner}</div>

      {mode === "orders" && (
        <section className="prod-panel">
          <div className="prod-panel-head">
            <div className="prod-panel-title">
              <span className="prod-obj-glyph" style={{ color: OBJECT_STYLE.order.color }}>
                {OBJECT_STYLE.order.glyph}
              </span>
              Production order objects
              <span className="tag mono">@{labelOf(orderHome as LevelKey)}</span>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => { setForm(emptyForm()); setCreating(true); }}
            >
              + Create work order
            </button>
          </div>

          <div className="prod-toolbar">
            <div className="source-filters">
              {SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`source-chip ${sourceFilter === s ? "active" : ""}`}
                  onClick={() => setSourceFilter(s)}
                >
                  {s}
                  <em>{sourceCounts[s] ?? 0}</em>
                </button>
              ))}
            </div>
            {lineFocus && (
              <button
                type="button"
                className="source-chip active"
                onClick={() => setLineFocus(null)}
              >
                Clear {labelOf("line").toLowerCase()} · {lineIndex.get(lineFocus)?.name || lineFocus}
              </button>
            )}
          </div>

          <div className="prod-line-groups">
            {byLine.length === 0 && (
              <div className="prod-empty">No orders for this filter.</div>
            )}
            {byLine.map(([lineId, lineOrders]) => {
              const meta = lineIndex.get(lineId);
              return (
                <div key={lineId} className="prod-line-block">
                  <div className="prod-line-head">
                    <div>
                      <div className="twin-level-kicker">{labelOf("line")}</div>
                      <strong>{meta?.name || lineId}</strong>
                      {meta && (
                        <div className="small faint">
                          {labelOf("area")} · {meta.areaName}
                        </div>
                      )}
                    </div>
                    <div className="prod-line-meta">
                      <BindingPills items={bindingsAt(prodBindings, "line")} />
                      <span className="tag mono">{lineOrders.length} orders</span>
                    </div>
                  </div>
                  <div className="prod-order-grid">
                    {lineOrders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={`prod-order-card ${labHighlight === o.id ? "lab-hit" : ""}`}
                        data-tour-order={o.id}
                        data-tour-ref={o.erp_ref}
                        onClick={() => openOrder(o.id)}
                      >
                        <div className="prod-order-top">
                          <span className="mono prod-order-id">{o.id}</span>
                          <span className={`tag status-${o.status.toLowerCase().replace(/\s+/g, "-")}`}>
                            {o.status}
                          </span>
                        </div>
                        <div className="prod-order-product">
                          {o.product}
                          <em>{o.variant} · {o.color}</em>
                        </div>
                        <div className="prod-order-meta">
                          <span className={`source-badge source-${(o.source || "ERP").toLowerCase()}`}>
                            {o.source || "ERP"}
                          </span>
                          <span className="mono faint">{o.erp_ref}</span>
                        </div>
                        <div className="prod-progress">
                          <div className="hbar-track">
                            <div
                              className="hbar-fill"
                              style={{
                                width: `${progressPct(o)}%`,
                                background: o.status === "Completed"
                                  ? "var(--state-running)"
                                  : "var(--app-color, var(--accent))",
                              }}
                            />
                          </div>
                          <span className="mono faint">{o.completed}/{o.qty}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {mode === "genealogy" && (
        <section className="prod-panel">
          <div className="prod-panel-head">
            <div className="prod-panel-title">
              <span className="prod-obj-glyph" style={{ color: OBJECT_STYLE.genealogy.color }}>
                {OBJECT_STYLE.genealogy.glyph}
              </span>
              VIN / component genealogy
              <span className="tag mono">@{labelOf(geneHome as LevelKey)}</span>
            </div>
            <BindingPills items={bindingsAt(prodBindings, "station", "home")} />
          </div>

          <div className="prod-vin-grid">
            {(vins || []).length === 0 && (
              <div className="prod-empty">No WIP units yet — release an order to dispatch VINs.</div>
            )}
            {(vins || []).map((v) => {
              const path = stationPath(topo, v.current_station, labelOf);
              const order = orders.find((o) => o.id === v.order_id);
              return (
                <button
                  key={v.vin}
                  type="button"
                  className="prod-vin-card"
                  onClick={() => openVin(v.vin)}
                >
                  <div className="prod-order-top">
                    <span className="mono prod-order-id">{v.vin}</span>
                    <StateChip state={v.status === "Complete" ? "Running" : "Changeover"} />
                  </div>
                  <div className="prod-order-product">
                    {v.variant}
                    <em>{v.color} · order {v.order_id}</em>
                  </div>
                  {order && (
                    <span className={`source-badge source-${(order.source || "ERP").toLowerCase()}`}>
                      {order.source || "ERP"}
                    </span>
                  )}
                  {path.length > 0 && (
                    <div className="prod-path">
                      {path.map((p, i) => (
                        <React.Fragment key={p.key}>
                          {i > 0 && <span className="twin-spine-arrow">→</span>}
                          <span className="prod-path-chip" title={p.label}>{p.name}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                  <div className="small faint">
                    {v.status} · {(v.operations || []).length} ops · {(v.components || []).length} components
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {mode === "context" && (
        <section className="prod-panel">
          <div className="prod-panel-head">
            <div className="prod-panel-title">
              <span className="prod-obj-glyph">❖</span>
              Rollups by context path
            </div>
            <span className="tag mono">{topo?.site?.name || "Facility"}</span>
          </div>

          <div className="prod-context-tree">
            <div className="prod-facility">
              <div className="twin-facility-kicker">{labelOf("facility")}</div>
              <strong>{topo?.site?.name || "York Vehicle Ops"}</strong>
              <BindingPills items={bindingsAt(prodBindings, "facility")} muted />
            </div>

            {contextTree.map((area: any) => (
              <div key={area.id} className="prod-area">
                <div className="prod-area-head">
                  <div>
                    <div className="twin-level-kicker">{labelOf("area")}</div>
                    <strong>{area.name}</strong>
                  </div>
                  <div className="prod-line-meta">
                    <BindingPills items={bindingsAt(prodBindings, "area")} muted />
                    <span className="tag mono">{area.orderCount} orders</span>
                    <span className="tag mono">{area.released} released</span>
                  </div>
                </div>
                <div className="prod-context-lines">
                  {area.lines.map((line: any) => (
                    <button
                      key={line.id}
                      type="button"
                      className={`prod-context-line ${lineFocus === line.id ? "on" : ""} ${labHighlight && line.orders.some((o: any) => o.id === labHighlight) ? "lab-hit" : ""}`}
                      data-tour={line.id === "line-touring-assembly-line" ? "prod-context-touring" : undefined}
                      data-tour-line={line.id}
                      onClick={() => {
                        setLineFocus(line.id);
                        setMode("orders");
                      }}
                    >
                      <div className="prod-order-top">
                        <div>
                          <div className="twin-level-kicker">{labelOf("line")}</div>
                          <strong>{line.name}</strong>
                        </div>
                        <span className="tag mono">{line.orders.length}</span>
                      </div>
                      <BindingPills items={bindingsAt(prodBindings, "line")} />
                      <div className="prod-context-stats">
                        <span><em>{line.released}</em> released</span>
                        <span><em>{line.planned}</em> planned</span>
                        <span><em>{line.completed}</em> done</span>
                        <span><em>{line.wip}</em> WIP</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {creating && (
        <Modal
          title="Create work order"
          subtitle={`Homes at ${labelOf(orderHome as LevelKey)} · simulate ingest from SAP / ERP / APS / WMS or enter manually`}
          wide
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button type="button" className="btn" disabled={saving} onClick={createOrder}>
                {saving ? "Creating…" : "Create work order"}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Source system" required>
              <select
                className="field"
                value={form.source}
                disabled={labLock.includes("source")}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              >
                {SOURCES.filter((s) => s !== "All").map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field
              label="External reference"
              hint={labLock.length ? "Your interactive-lab batch tag" : "Leave blank to auto-generate"}
            >
              <input
                className="field"
                data-tour="order-erp-ref"
                placeholder="e.g. SAP-HD-920100"
                value={form.erp_ref}
                onChange={(e) => setForm({ ...form, erp_ref: e.target.value })}
              />
            </Field>
            <Field label="Product" required>
              <input
                className="field"
                value={form.product}
                onChange={(e) => setForm({ ...form, product: e.target.value })}
              />
            </Field>
            <Field label="Variant" required>
              <select
                className="field"
                value={form.variant}
                onChange={(e) => setForm({ ...form, variant: e.target.value })}
              >
                {VARIANTS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Color">
              <select
                className="field"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              >
                {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Quantity" required>
              <input
                className="field"
                type="number"
                min={1}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label={`${labelOf("line")} (order home)`} required>
              <select
                className="field"
                value={form.line_id}
                disabled={labLock.includes("line_id")}
                onChange={(e) => setForm({ ...form, line_id: e.target.value })}
              >
                {(lines.length ? lines : [
                  { id: "line-touring-assembly-line", name: "Touring Assembly" },
                  { id: "line-softail-assembly-line", name: "Softail Assembly" },
                ]).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className="field"
                value={form.status}
                disabled={form.release}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="Planned">Planned</option>
                <option value="Released">Released</option>
                <option value="On Hold">On Hold</option>
              </select>
            </Field>
            <div className="span-2">
              <label className="wizard-check">
                <input
                  type="checkbox"
                  checked={form.release}
                  onChange={(e) => setForm({
                    ...form,
                    release: e.target.checked,
                    status: e.target.checked ? "Released" : form.status,
                  })}
                />
                Release to the {labelOf("line").toLowerCase()} immediately
              </label>
            </div>
          </div>
        </Modal>
      )}

      {orderDetail && (
        <Drawer onClose={() => setOrderDetail(null)}>
          <div className="cg-hero-kicker">Production order object</div>
          <h2 style={{ marginTop: 4, fontSize: 17 }}>{orderDetail.id}</h2>
          <div className="small faint">{orderDetail.product} · {orderDetail.variant} · {orderDetail.color}</div>
          <div className="mt row wrap">
            <span className={`source-badge source-${(orderDetail.source || "ERP").toLowerCase()}`}>
              {orderDetail.source || "ERP"}
            </span>
            <span className="tag">Ref {orderDetail.erp_ref}</span>
            <span className="tag">{orderDetail.status}</span>
            <span className="tag mono">{orderDetail.completed}/{orderDetail.qty} units</span>
          </div>
          {lineIndex.get(orderDetail.line_id) && (
            <div className="prod-path mt">
              <span className="prod-path-chip">{labelOf("area")} · {lineIndex.get(orderDetail.line_id)!.areaName}</span>
              <span className="twin-spine-arrow">→</span>
              <span className="prod-path-chip">{labelOf("line")} · {lineIndex.get(orderDetail.line_id)!.name}</span>
            </div>
          )}
          <BindingPills items={bindingsAt(prodBindings, "line")} />
          {orderDetail.created_by && (
            <div className="small faint mt">Created by {orderDetail.created_by}</div>
          )}
          <div className="divider" />
          <div className="panel-title">
            <span>
              <span style={{ color: OBJECT_STYLE.genealogy.color, marginRight: 6 }}>
                {OBJECT_STYLE.genealogy.glyph}
              </span>
              VIN / genealogy units
            </span>
          </div>
          {orderDetail.vins.length === 0 && <p className="small dim">No VINs dispatched yet.</p>}
          {orderDetail.vins.map((v: any) => (
            <div
              key={v.vin}
              className="row between small list-row clickable"
              style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}
              onClick={() => { setOrderDetail(null); openVin(v.vin); }}
              title="Open VIN storyline"
            >
              <span className="mono">{v.vin}</span>
              <span className="faint">{v.status} · {v.operations.length} ops</span>
            </div>
          ))}
        </Drawer>
      )}

      {vinDetail && (
        <Drawer onClose={() => setVinDetail(null)}>
          <div className="cg-hero-kicker">VIN / component genealogy</div>
          <h2 style={{ marginTop: 4, fontSize: 16 }} className="mono">{vinDetail.vin}</h2>
          <div className="small faint">{vinDetail.variant} · {vinDetail.color} · order {vinDetail.order_id}</div>
          <div className="mt">
            <StateChip state={vinDetail.status === "Complete" ? "Running" : "Changeover"} />{" "}
            <span className="small dim">{vinDetail.status}</span>
          </div>
          {(() => {
            const path = stationPath(topo, vinDetail.current_station, labelOf);
            if (!path.length) return null;
            return (
              <div className="prod-path mt">
                {path.map((p, i) => (
                  <React.Fragment key={p.key}>
                    {i > 0 && <span className="twin-spine-arrow">→</span>}
                    <span className="prod-path-chip" title={p.label}>
                      <em>{p.label}</em> {p.name}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            );
          })()}

          <div className="divider" />
          <div className="panel-title">VIN Storyline · execution + proof</div>
          <div className="timeline">
            {vinDetail.operations.map((op: any) => (
              <div className={`timeline-item ${op.status === "Completed" ? "done" : ""}`} key={op.id}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{op.name}</div>
                <div className="small faint">
                  {op.status} · {op.operator} · {ago(op.completed_at)}
                </div>
                <div className="small dim">
                  WI {op.instruction_version} · model {op.model_version}
                </div>
                <div>
                  {op.evidence.map((ev: any, i: number) => (
                    <span className="tag mono" key={i}>
                      {ev.type}:{ev.ref}
                      {ev.confidence ? ` (${(ev.confidence * 100).toFixed(1)}%)` : ""}
                      {ev.value_nm ? ` ${ev.value_nm}Nm` : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="divider" />
          <div className="panel-title">Component genealogy</div>
          {vinDetail.components.map((c: any) => (
            <div className="row between small" key={c.serial} style={{ padding: "4px 0" }}>
              <span>{c.part}</span>
              <span className="mono faint">{c.serial} · lot {c.lot}</span>
            </div>
          ))}

          {vinDetail.defects.length > 0 && (
            <>
              <div className="divider" />
              <div className="panel-title">Quality history</div>
              {vinDetail.defects.map((d: any) => (
                <div className="small" key={d.id} style={{ marginBottom: 5 }}>
                  <span className="tag">{d.severity}</span> {d.class}
                  <span className="faint"> · {d.status}{d.disposition ? ` · ${d.disposition}` : ""}</span>
                </div>
              ))}
            </>
          )}
          <div className="audit-footer">
            Every operation carries instruction version, model version and multimodal evidence.
          </div>
        </Drawer>
      )}
    </div>
  );
}
