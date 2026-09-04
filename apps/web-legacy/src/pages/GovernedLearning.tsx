// Governed Learning — metrics, version registry, shadow gates.

import React from "react";

import { ago, fmtPct, post, usePoll } from "../api";
import { Panel, Tip, toast } from "../components/ui";

function pct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return fmtPct(v);
}
export default function GovernedLearning() {
  const { data: metrics, refresh } = usePoll<any>("/api/learning/metrics", 10000);
  const { data: versions } = usePoll<any>("/api/learning/versions", 10000);
  const { data: gates } = usePoll<any>("/api/learning/gates", 10000);

  const m = metrics?.metrics || {};

  const approve = async (id: string) => {
    await post(`/api/learning/versions/${id}/approve`, { actor: "Jordan Hale", note: "Promote from shadow" });
    toast("Version approved");
    refresh();
  };

  const reject = async (id: string) => {
    await post(`/api/learning/versions/${id}/reject`, { actor: "Jordan Hale", note: "Needs more evidence" });
    toast("Version rejected");
    refresh();
  };

  return (
    <div data-tour="page-learning">
      <h1 className="page-title">Governed Learning</h1>
      <p className="page-sub">
        Only authorized confirmed outcomes become truth. Shadow deploy and approval gates
        before rules or models affect operations.
      </p>
      <Tip>{gates?.policy}</Tip>

      <div className="kpi-strip">
        <div className="kpi"><div className="k-label">Event precision</div><div className="k-value">{pct(m.event_precision)}</div></div>
        <div className="kpi"><div className="k-label">False-alert rate</div><div className="k-value">{pct(m.false_alert_rate)}</div></div>
        <div className="kpi"><div className="k-label">Detect→contain (h)</div><div className="k-value">{m.detection_to_containment_hours ?? "—"}</div></div>
        <div className="kpi"><div className="k-label">Top-3 RCA accuracy</div><div className="k-value">{pct(m.top3_rca_hypothesis_accuracy)}</div></div>
        <div className="kpi"><div className="k-label">Context coverage</div><div className="k-value">{pct(m.pct_signals_with_valid_context)}</div></div>
        <div className="kpi"><div className="k-label">PdM precision</div><div className="k-value">{pct(m.pdm_precision)}</div></div>
      </div>

      <div className="grid cols-2">
        <Panel title="Additional KPIs">
          <table className="data">
            <tbody>
              <tr><td>Time to confirmed RCA (h)</td><td className="mono">{m.time_to_confirmed_rca_hours ?? "—"}</td></tr>
              <tr><td>Recurrence after CA</td><td className="mono">{pct(m.recurrence_after_corrective_action)}</td></tr>
              <tr><td>PdM lead time (h)</td><td className="mono">{m.pdm_lead_time_hours ?? "—"}</td></tr>
            </tbody>
          </table>
          <div className="small" style={{ marginTop: 10, fontWeight: 700 }}>Drift by product / recipe / mode</div>
          {(m.model_drift_by_segment || []).map((d: any, i: number) => (
            <div key={i} className="small faint">{d.product} · {d.recipe} · {d.mode} → {d.drift}</div>
          ))}
        </Panel>

        <Panel title="Shadow & pending approval gates">
          <div className="small dim" style={{ marginBottom: 8 }}>
            Shadow: {gates?.shadow?.length || 0} · Pending: {gates?.pending_approval?.length || 0}
          </div>
          {(gates?.pending_approval || []).map((v: any) => (
            <div key={v.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div className="row between">
                <strong style={{ fontSize: 12 }}>{v.name}</strong>
                <span className="tag">{v.kind}</span>
              </div>
              <div className="small faint">{v.ring} · {v.status} · {ago(v.created_at)}</div>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <button className="btn" onClick={() => approve(v.id)}>Approve</button>
                <button className="btn ghost" onClick={() => reject(v.id)}>Reject</button>
              </div>
            </div>
          ))}
          {!(gates?.pending_approval || []).length && <p className="dim small">No pending gates</p>}
        </Panel>
      </div>

      <div className="mt" />
      <Panel title="Version registry · datasets, prompts, models, features, knowledge">
        <table className="data">
          <thead><tr><th>Name</th><th>Kind</th><th>Ring</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {(versions?.versions || []).map((v: any) => (
              <tr key={v.id}>
                <td>{v.name}</td>
                <td className="small">{v.kind}</td>
                <td className="small">{v.ring}</td>
                <td className="small">{v.status}</td>
                <td className="small faint">{ago(v.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
