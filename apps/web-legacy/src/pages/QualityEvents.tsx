// Quality Events — first-class lifecycle board (Detected → … → Closed).

import React, { useMemo, useState } from "react";

import { ago, get, post, usePoll } from "../api";
import { Drawer, Tip, toast } from "../components/ui";

const LIFECYCLE = [
  "Detected", "Validation", "Containment", "Investigation",
  "Disposition", "CorrectiveAction", "EffectivenessCheck", "Closed",
];

export default function QualityEvents() {
  const { data, refresh } = usePoll<any>("/api/quality-events/board", 8000);
  const { data: candData } = usePoll<any>("/api/quality-events/candidates?status=Open", 10000);
  const [sel, setSel] = useState<any | null>(null);
  const [actor, setActor] = useState("A. Kowalski");

  const columns = data?.columns || {};
  const candidates = candData?.candidates || [];

  const openDetail = async (id: string) => {
    try {
      const qe = await get(`/api/quality-events/${id}`);
      setSel(qe);
    } catch (e: any) {
      toast(e.message || "Failed to load quality event");
    }
  };

  const transition = async (to: string) => {
    if (!sel) return;
    const body: any = { to_status: to, actor, role: "Quality Lead", note: `Move to ${to}` };
    if (to === "Containment") body.containment = "Hold affected carriers; notify WMS/ERP/QMS";
    if (to === "Disposition") body.disposition = "Repair";
    if (to === "CorrectiveAction") body.corrective_action = "Replace Fixt #3 pads; recalibrate";
    if (to === "EffectivenessCheck" || to === "Closed") body.effectiveness = "Verify 14d no recurrence";
    const qe = await post(`/api/quality-events/${sel.id}/transition`, body);
    setSel(qe);
    toast(`Quality event → ${to}`);
    refresh();
  };

  const fromCandidate = async () => {
    const c = candidates[0];
    if (!c) {
      toast("No open candidates");
      return;
    }
    const qe = await post(`/api/quality-events/from-candidate/${c.id}`);
    setSel(qe);
    toast("Quality event created from detection candidate");
    refresh();
  };

  const idx = useMemo(() => (sel ? LIFECYCLE.indexOf(sel.status) : -1), [sel]);

  return (
    <div data-tour="page-quality-events">
      <h1 className="page-title">Quality Events</h1>
      <p className="page-sub">
        First-class business objects with a governed lifecycle — detection candidates become
        validated events; approved outcomes feed the digital thread.
      </p>
      <Tip>
        Lifecycle: Detected → Validation → Containment → Investigation → Disposition →
        Corrective action → Effectiveness → Closed. Named authority on closure triggers knowledge curation.
      </Tip>

      <div className="row between" style={{ marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8 }}>
          <label className="small dim">Actor</label>
          <input className="input" style={{ width: 160 }} value={actor} onChange={(e) => setActor(e.target.value)} />
          <span className="small faint">{candidates.length} open candidates</span>
        </div>
        <button className="btn" onClick={fromCandidate}>Create from candidate</button>
      </div>

      <div
        className="qe-board"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${LIFECYCLE.length}, minmax(128px, 1fr))`,
          gap: 8,
          overflowX: "auto",
        }}
      >
        {LIFECYCLE.map((col) => (
          <div key={col} className="panel" style={{ padding: 8, minHeight: 220 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>{col}</div>
            {(columns[col] || []).map((qe: any) => (
              <div
                key={qe.id}
                className="list-row clickable"
                style={{ padding: "8px 6px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                onClick={() => openDetail(qe.id)}
              >
                <div style={{ fontSize: 12, fontWeight: 600 }}>{qe.characteristic}</div>
                <div className="small faint">{qe.serial || qe.lot || "—"} · {qe.severity}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {sel && (
        <Drawer onClose={() => setSel(null)}>
          <div className="panel-title">{sel.characteristic || "Quality event"}</div>
          <div className="small dim">Status · {sel.status}</div>
          <p style={{ fontSize: 13 }}>
            {sel.product} · {sel.recipe || "—"} · {sel.operation}
          </p>
          <div className="small">Spec: {sel.specification} · Measured: {String(sel.measured_value)} {sel.units}</div>
          <div className="small faint" style={{ marginTop: 6 }}>Scope: {sel.affected_scope}</div>
          {sel.context && (
            <div className="panel" style={{ marginTop: 12, padding: 10 }}>
              <div className="small" style={{ fontWeight: 700 }}>Digital thread context</div>
              <div className="mono small">
                {[sel.context.plant_name, sel.context.area_name, sel.context.line_name, sel.context.cell_name]
                  .filter(Boolean).join(" / ")}
              </div>
              <div className="small faint">
                Order {sel.context.production_order_id || "—"} · Serial {sel.context.serial || "—"} ·
                Mode {sel.context.machine_mode} · Shift {sel.context.shift}
              </div>
              <div className="small faint">Schema {sel.context.schema_version} · {sel.context.source_system_ref}</div>
            </div>
          )}
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {LIFECYCLE.map((s, i) => (
              <button key={s} className="btn ghost" disabled={i <= idx} onClick={() => transition(s)}>
                → {s}
              </button>
            ))}
          </div>
          <div className="audit-footer" style={{ marginTop: 12 }}>
            Opened {ago(sel.opened_at)} · {sel.audit?.length || 0} audit entries
            {sel.knowledge_case_id ? ` · case ${sel.knowledge_case_id}` : ""}
          </div>
        </Drawer>
      )}
    </div>
  );
}
