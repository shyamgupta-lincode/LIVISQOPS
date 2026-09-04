// Warranty & Claims — VIN genealogy (context graph), reports, and datasheet.

import React, { useEffect, useMemo, useState } from "react";

import { ago, get, usePoll } from "../api";
import { StateChip } from "../components/ui";

type LevelKey = "facility" | "area" | "line" | "station" | "device";

type SpineLevel = { key: LevelKey; label: string; required: boolean; id: string };

type Binding = {
  id: string;
  object_type: string;
  label: string;
  report_at: string;
  rollup_to?: string[];
  enabled?: boolean;
  lenses?: string[];
  protocol?: string | null;
};

type Mode = "genealogy" | "reports" | "datasheet";

const OBJECT_STYLE: Record<string, { color: string; glyph: string }> = {
  order: { color: "#C4841D", glyph: "⬢" },
  genealogy: { color: "#1F9D5C", glyph: "◇" },
  work_instruction: { color: "#7B5BB0", glyph: "🗎" },
  inspection: { color: "#C94A7A", glyph: "◎" },
  defect: { color: "#D06A1E", glyph: "▲" },
  status: { color: "#1F9D5C", glyph: "●" },
  timeseries: { color: "#3E96F4", glyph: "∿" },
  hold: { color: "#C93C32", glyph: "⛨" },
};

const BINDING_SHORT: Record<string, string> = {
  status: "Status",
  order: "Production order",
  genealogy: "Genealogy",
  timeseries: "Time series",
  work_instruction: "Work instructions",
  inspection: "Inspection",
  defect: "Defect",
};

const FALLBACK_LEVELS: SpineLevel[] = [
  { key: "facility", label: "Facility", required: true, id: "facility" },
  { key: "area", label: "Area", required: true, id: "area" },
  { key: "line", label: "Line", required: true, id: "line" },
  { key: "station", label: "Station", required: true, id: "station" },
  { key: "device", label: "Device", required: false, id: "device" },
];

const TABS: { id: Mode; title: string; ico: string }[] = [
  { id: "genealogy", title: "Genealogy", ico: "◇" },
  { id: "reports", title: "Reports", ico: "▦" },
  { id: "datasheet", title: "Data sheet", ico: "☰" },
];

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

function BindingPills({ items }: { items: Binding[] }) {
  if (!items.length) return null;
  return (
    <div className="twin-bind-pills">
      {items.map((b) => {
        const st = OBJECT_STYLE[b.object_type] || { color: "#6B7275", glyph: "◇" };
        const short = BINDING_SHORT[b.object_type] || b.label;
        return (
          <span
            key={b.id}
            className="twin-bind-pill home"
            style={{ borderColor: `${st.color}55`, color: st.color }}
            title={`${b.label}${b.protocol ? ` · ${b.protocol}` : ""} @ ${b.report_at}`}
          >
            <span aria-hidden>{st.glyph}</span>
            {short}
            <em className="wc-bind-at">@{b.report_at}</em>
          </span>
        );
      })}
    </div>
  );
}

function eventKindStyle(kind: string) {
  if (kind === "defect") return OBJECT_STYLE.defect;
  if (kind === "inspection") return OBJECT_STYLE.inspection;
  if (kind === "hold") return OBJECT_STYLE.hold;
  return OBJECT_STYLE.genealogy;
}

export default function WarrantyClaims() {
  const { data: topo } = usePoll<any>("/api/topology", 20000);
  const { data: vinIndex } = usePoll<any[]>("/api/warranty/vins", 12000);

  const [query, setQuery] = useState("");
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("genealogy");
  const [reportView, setReportView] = useState<"events" | "defects" | "inspections" | "holds">("events");

  const cg = topo?.context_graph || bundle?.context_graph || null;
  const spine = useMemo(() => spineFromSchema(cg), [cg]);
  const labelOf = (k: string) => spine.find((l) => l.key === k)?.label || k;

  const filtered = useMemo(() => {
    const list = vinIndex || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) =>
      (v.vin || "").toLowerCase().includes(q)
      || (v.order_id || "").toLowerCase().includes(q)
      || (v.variant || "").toLowerCase().includes(q)
      || (v.color || "").toLowerCase().includes(q),
    );
  }, [vinIndex, query]);

  // Prefer a VIN with defects for a richer first view; else first in index.
  useEffect(() => {
    if (selectedVin || !vinIndex?.length) return;
    const rich = vinIndex.find((v) => (v.defect_count || 0) > 0) || vinIndex[0];
    if (rich?.vin) setSelectedVin(rich.vin);
  }, [vinIndex, selectedVin]);

  useEffect(() => {
    if (!selectedVin) {
      setBundle(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setLoadError(null);
    get(`/api/warranty/vins/${encodeURIComponent(selectedVin)}`)
      .then((d) => { if (alive) setBundle(d); })
      .catch((e) => { if (alive) { setBundle(null); setLoadError(String(e.message || e)); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [selectedVin]);

  const geneHome = bundle?.genealogy?.home_level || "station";
  const reportSummary = bundle?.reports?.summary;
  const datasheet = bundle?.datasheet;
  const linkedBindings: Binding[] = bundle?.genealogy?.linked_bindings || [];

  const modeBanner = {
    genealogy: (
      <>
        Full VIN path along the active context graph spine. Genealogy homes at{" "}
        <b>{labelOf(geneHome)}</b>.
      </>
    ),
    reports: (
      <>
        Claim-oriented history: defects, inspections, holds and station events for the selected VIN.
      </>
    ),
    datasheet: (
      <>
        Structured build record — printable data sheet with order, metrics, components and serials.
      </>
    ),
  }[mode];

  return (
    <div className="prod-page wc-page" data-tour="page-warranty">
      <header className="cg-hero">
        <div>
          <div className="cg-hero-kicker">Operate · warranty & claims</div>
          <h1 className="cg-title">Warranty and Claims</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            VIN genealogy, reports and data sheet
            {cg?.name ? ` · ${cg.name}` : ""}.
          </p>
        </div>
        <div className="cg-hero-aside">
          <div className="cg-hero-stats">
            <div><em>{vinIndex?.length ?? "—"}</em><span>VINs indexed</span></div>
            <div><em>{reportSummary?.open_defects ?? "—"}</em><span>Open defects</span></div>
            <div><em>{reportSummary?.active_holds ?? "—"}</em><span>Active holds</span></div>
          </div>
        </div>
      </header>

      {spine.length > 0 && (
        <div className="twin-spine-bar" data-tour="warranty-spine">
          {spine.map((lv, i) => (
            <React.Fragment key={lv.id}>
              {i > 0 && <span className="twin-spine-arrow">→</span>}
              <span className={`twin-spine-chip ${lv.required ? "req" : ""}`}>
                {lv.label}
              </span>
            </React.Fragment>
          ))}
          {cg?.status && (
            <span className="tag mono" style={{ marginLeft: 8 }}>
              {cg.name || "context graph"} · {cg.status}
            </span>
          )}
        </div>
      )}

      <div className="wc-layout">
        <aside className="wc-vin-rail" data-tour="warranty-vin-search">
          <div className="prod-panel-head" style={{ marginBottom: 10 }}>
            <div className="prod-panel-title">VIN lookup</div>
          </div>
          <input
            className="field"
            placeholder="Search VIN, order, variant…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search VINs"
          />
          <div className="wc-vin-list">
            {filtered.length === 0 && (
              <div className="prod-empty">No VINs match.</div>
            )}
            {filtered.map((v) => (
              <button
                key={v.vin}
                type="button"
                className={`wc-vin-row ${selectedVin === v.vin ? "on" : ""}`}
                onClick={() => setSelectedVin(v.vin)}
              >
                <div className="prod-order-top">
                  <span className="mono prod-order-id">{v.vin}</span>
                  <StateChip state={v.status === "Complete" ? "Running" : "Changeover"} />
                </div>
                <div className="small faint">
                  {v.variant}
                  {v.color ? ` · ${v.color}` : ""}
                </div>
                <div className="wc-vin-meta">
                  <span className="tag mono">{v.order_id}</span>
                  {(v.defect_count || 0) > 0 && (
                    <span className="tag" style={{ color: OBJECT_STYLE.defect.color }}>
                      {v.defect_count} defect{v.defect_count === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="wc-main">
          <div className="q-tabs" role="tablist" aria-label="Warranty views" data-tour="warranty-modes">
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

          {!selectedVin && (
            <div className="prod-empty">Select a VIN to open genealogy, reports and data sheet.</div>
          )}
          {loading && <p className="dim">Loading warranty package…</p>}
          {loadError && <p className="dim" style={{ color: "var(--state-faulted)" }}>{loadError}</p>}

          {bundle && !loading && mode === "genealogy" && (
            <section className="prod-panel" data-tour="warranty-genealogy">
              <div className="prod-panel-head">
                <div className="prod-panel-title">
                  <span className="prod-obj-glyph" style={{ color: OBJECT_STYLE.genealogy.color }}>
                    {OBJECT_STYLE.genealogy.glyph}
                  </span>
                  VIN genealogy
                  <span className="tag mono">@{labelOf(geneHome)}</span>
                </div>
                <BindingPills items={linkedBindings} />
              </div>

              <div className="wc-vin-header">
                <div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>{bundle.vin}</div>
                  <div className="small faint">
                    {bundle.variant} · {bundle.color} · order {bundle.order_id}
                  </div>
                </div>
                <div>
                  <StateChip state={bundle.status === "Complete" ? "Running" : "Changeover"} />{" "}
                  <span className="small dim">{bundle.status}</span>
                </div>
              </div>

              {(bundle.genealogy?.current_path || []).filter((n: any) => n.level !== "device").length > 0 && (
                <div className="prod-path mt">
                  {(bundle.genealogy.current_path as any[])
                    .filter((n) => n.level !== "device")
                    .map((n, i) => (
                      <React.Fragment key={`${n.level}-${n.id}`}>
                        {i > 0 && <span className="twin-spine-arrow">→</span>}
                        <span className="prod-path-chip" title={labelOf(n.level)}>
                          <em>{labelOf(n.level)}</em> {n.name}
                        </span>
                      </React.Fragment>
                    ))}
                </div>
              )}

              {(bundle.genealogy?.current_path || []).some((n: any) => n.level === "device") && (
                <div className="wc-device-row mt">
                  <span className="small faint">Devices at current station</span>
                  <div className="twin-bind-pills">
                    {(bundle.genealogy.current_path as any[])
                      .filter((n) => n.level === "device")
                      .map((n) => (
                        <span key={n.id} className="twin-bind-pill home" style={{ color: "#3E96F4", borderColor: "#3E96F455" }}>
                          <span aria-hidden>⬡</span>
                          {n.name}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              <div className="divider" />
              <div className="panel-title">Station path · evidence</div>
              <div className="timeline">
                {(bundle.genealogy?.stations || []).length === 0 && (
                  <p className="small dim">No station trail yet for this VIN.</p>
                )}
                {(bundle.genealogy?.stations || []).map((st: any) => (
                  <div
                    className={`timeline-item ${st.op_status === "Completed" ? "done" : ""}`}
                    key={`${st.station_id}-${st.operation}`}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{st.operation}</div>
                    <div className="small faint">
                      {st.op_status}
                      {st.station_name ? ` · ${st.station_name}` : ""}
                      {st.line_name ? ` · ${st.line_name}` : ""}
                      {st.completed_at ? ` · ${ago(st.completed_at)}` : ""}
                    </div>
                    {(st.path || []).filter((p: any) => p.level !== "device").length > 0 && (
                      <div className="prod-path" style={{ marginTop: 6 }}>
                        {(st.path as any[])
                          .filter((p) => p.level !== "device")
                          .map((p, i) => (
                            <React.Fragment key={`${p.level}-${p.id}`}>
                              {i > 0 && <span className="twin-spine-arrow">→</span>}
                              <span className="prod-path-chip">{p.name}</span>
                            </React.Fragment>
                          ))}
                      </div>
                    )}
                    <div>
                      {(st.evidence || []).map((ev: any, i: number) => (
                        <span className="tag mono" key={i}>
                          {ev.type}:{ev.ref}
                          {ev.confidence ? ` (${(ev.confidence * 100).toFixed(1)}%)` : ""}
                          {ev.value_nm ? ` ${ev.value_nm}Nm` : ""}
                        </span>
                      ))}
                    </div>
                    {(st.devices || []).length > 0 && (
                      <div className="small dim" style={{ marginTop: 4 }}>
                        Devices: {(st.devices as any[]).map((d) => d.name).join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="divider" />
              <div className="panel-title">Component genealogy</div>
              {(bundle.genealogy?.components || []).map((c: any) => (
                <div className="row between small" key={c.serial} style={{ padding: "4px 0" }}>
                  <span>{c.part}</span>
                  <span className="mono faint">{c.serial} · lot {c.lot}</span>
                </div>
              ))}
            </section>
          )}

          {bundle && !loading && mode === "reports" && (
            <section className="prod-panel" data-tour="warranty-reports">
              <div className="prod-panel-head">
                <div className="prod-panel-title">
                  <span className="prod-obj-glyph" style={{ color: OBJECT_STYLE.defect.color }}>▦</span>
                  Claim reports
                </div>
                <div className="wc-report-stats">
                  <span className="tag mono">{reportSummary?.defect_count ?? 0} defects</span>
                  <span className="tag mono">{reportSummary?.fail_or_review ?? 0} fail/review</span>
                  <span className="tag mono">{reportSummary?.active_holds ?? 0} holds</span>
                </div>
              </div>

              <div className="wc-subtabs" role="tablist" aria-label="Report slices">
                {([
                  ["events", "Claim events"],
                  ["defects", "Defect history"],
                  ["inspections", "Inspections"],
                  ["holds", "Holds"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`wc-subtab ${reportView === id ? "on" : ""}`}
                    onClick={() => setReportView(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {reportView === "events" && (
                <div className="timeline mt">
                  {(bundle.reports?.claim_events || []).length === 0 && (
                    <p className="small dim">No claim-relevant events for this VIN.</p>
                  )}
                  {(bundle.reports?.claim_events || []).map((ev: any, i: number) => {
                    const st = eventKindStyle(ev.kind);
                    return (
                      <div className="timeline-item" key={`${ev.kind}-${i}-${ev.at}`}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          <span style={{ color: st.color, marginRight: 6 }}>{st.glyph}</span>
                          {ev.title}
                          <span className="tag mono" style={{ marginLeft: 8 }}>{ev.kind}</span>
                        </div>
                        <div className="small faint">
                          {ev.detail}
                          {ev.station_name ? ` · ${ev.station_name}` : ""}
                          {ev.at ? ` · ${ago(ev.at)}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {reportView === "defects" && (
                <div className="wc-table-wrap mt">
                  {(bundle.reports?.defect_history || []).length === 0 && (
                    <p className="small dim">No defects recorded on this VIN.</p>
                  )}
                  {(bundle.reports?.defect_history || []).map((d: any) => (
                    <div key={d.id} className="wc-table-row">
                      <div>
                        <span className="tag">{d.severity}</span>{" "}
                        <strong>{d.class}</strong>
                        <div className="small faint">
                          {d.status}
                          {d.disposition ? ` · ${d.disposition}` : ""}
                          {d.station_name ? ` · ${d.station_name}` : ""}
                          {d.detected ? ` · ${ago(d.detected)}` : ""}
                        </div>
                      </div>
                      <span className="mono faint">{d.id}</span>
                    </div>
                  ))}
                </div>
              )}

              {reportView === "inspections" && (
                <div className="wc-table-wrap mt">
                  {(bundle.reports?.inspections || []).length === 0 && (
                    <p className="small dim">No inspections linked to this VIN.</p>
                  )}
                  {(bundle.reports?.inspections || []).map((i: any) => (
                    <div key={i.id} className="wc-table-row">
                      <div>
                        <span className="tag">{i.verdict}</span>{" "}
                        <span className="mono">{i.evidence_ref}</span>
                        <div className="small faint">
                          conf {((i.confidence || 0) * 100).toFixed(1)}%
                          {i.station_name ? ` · ${i.station_name}` : ""}
                          {i.captured ? ` · ${ago(i.captured)}` : ""}
                        </div>
                      </div>
                      <span className="mono faint">{i.id}</span>
                    </div>
                  ))}
                </div>
              )}

              {reportView === "holds" && (
                <div className="wc-table-wrap mt">
                  {(bundle.reports?.holds || []).length === 0 && (
                    <p className="small dim">No related containment holds.</p>
                  )}
                  {(bundle.reports?.holds || []).map((h: any) => (
                    <div key={h.id} className="wc-table-row">
                      <div>
                        <span className="tag">{h.status}</span>{" "}
                        <strong>{h.defect_class || "Hold"}</strong>
                        <div className="small faint">{h.reason}</div>
                        <div className="small dim">{h.scope}</div>
                      </div>
                      <span className="mono faint">
                        {h.units_confirmed}/{h.units_estimated} units
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {bundle && !loading && mode === "datasheet" && datasheet && (
            <section className="prod-panel wc-datasheet" data-tour="warranty-datasheet">
              <div className="prod-panel-head">
                <div className="prod-panel-title">
                  <span className="prod-obj-glyph">☰</span>
                  VIN data sheet
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => window.print()}
                >
                  Print / export
                </button>
              </div>

              <div className="wc-sheet">
                <div className="wc-sheet-head">
                  <div>
                    <div className="cg-hero-kicker">LIVIS MES · Warranty data sheet</div>
                    <h2 className="mono" style={{ margin: "4px 0 0", fontSize: 18 }}>{datasheet.vin}</h2>
                    <div className="small faint">
                      {datasheet.product} · {datasheet.variant} · {datasheet.color}
                    </div>
                  </div>
                  <div className="wc-sheet-meta">
                    <div><span className="faint">Status</span> {datasheet.status}</div>
                    <div><span className="faint">Build</span> {datasheet.build_date ? ago(datasheet.build_date) : "—"}</div>
                    <div><span className="faint">Graph</span> {datasheet.context_graph_name || "—"}</div>
                  </div>
                </div>

                <div className="wc-sheet-grid">
                  <div>
                    <div className="panel-title">Context path</div>
                    <div className="prod-path">
                      {(datasheet.spine_path_labels || []).map((name: string, i: number) => (
                        <React.Fragment key={`${name}-${i}`}>
                          {i > 0 && <span className="twin-spine-arrow">→</span>}
                          <span className="prod-path-chip">{name}</span>
                        </React.Fragment>
                      ))}
                      {!(datasheet.spine_path_labels || []).length && (
                        <span className="small dim">No path resolved</span>
                      )}
                    </div>
                    <div className="small faint mt">
                      Facility {datasheet.facility || "—"} · Line {datasheet.line || "—"} · Station{" "}
                      {datasheet.current_station || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="panel-title">Order</div>
                    <div className="small">
                      <div><span className="faint">ID</span> <span className="mono">{datasheet.order?.id || "—"}</span></div>
                      <div><span className="faint">Source</span> {datasheet.order?.source || "—"} · Ref {datasheet.order?.erp_ref || "—"}</div>
                      <div><span className="faint">Status</span> {datasheet.order?.status || "—"} · {datasheet.order?.completed ?? 0}/{datasheet.order?.qty ?? "—"} units</div>
                      <div><span className="faint">Created by</span> {datasheet.order?.created_by || "—"}</div>
                    </div>
                  </div>
                </div>

                <div className="divider" />
                <div className="panel-title">Key metrics</div>
                <div className="wc-metric-row">
                  <div className="wc-metric">
                    <em>{datasheet.metrics?.operations_completed ?? 0}/{datasheet.metrics?.operations_total ?? 0}</em>
                    <span>Operations</span>
                  </div>
                  <div className="wc-metric">
                    <em>{datasheet.metrics?.components ?? 0}</em>
                    <span>Components</span>
                  </div>
                  <div className="wc-metric">
                    <em>{datasheet.metrics?.evidence_artifacts ?? 0}</em>
                    <span>Evidence</span>
                  </div>
                  <div className="wc-metric">
                    <em>{datasheet.metrics?.defects ?? 0}</em>
                    <span>Defects</span>
                  </div>
                  <div className="wc-metric">
                    <em>
                      {datasheet.metrics?.fpy_proxy != null
                        ? `${(datasheet.metrics.fpy_proxy * 100).toFixed(1)}%`
                        : "—"}
                    </em>
                    <span>FPY proxy</span>
                  </div>
                </div>

                <div className="divider" />
                <div className="panel-title">Components & serials</div>
                <table className="wc-sheet-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Serial</th>
                      <th>Lot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(datasheet.serials || []).map((c: any) => (
                      <tr key={c.serial}>
                        <td>{c.part}</td>
                        <td className="mono">{c.serial}</td>
                        <td className="mono">{c.lot}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="audit-footer">
                  Genealogy home @{datasheet.genealogy_home || "station"} · generated from active context graph bindings.
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
