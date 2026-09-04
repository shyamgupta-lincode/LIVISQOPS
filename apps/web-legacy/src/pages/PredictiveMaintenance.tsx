// Predictive Maintenance by failure mode.

import React, { useState } from "react";

import { ago, post, usePoll } from "../api";
import { Panel, Tip, toast } from "../components/ui";

export default function PredictiveMaintenance() {
  const { data: assets, refresh } = usePoll<any>("/api/pdm/assets", 10000);
  const { data: preds } = usePoll<any>("/api/pdm/predictions", 8000);
  const [detail, setDetail] = useState<any | null>(null);
  const [finding, setFinding] = useState("");

  const openAsset = async (id: string) => {
    const d = await fetch(`/api/pdm/assets/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("livis_token")}` },
    }).then((r) => r.json());
    setDetail(d);
  };

  const routeWO = async (predId: string) => {
    await post(`/api/pdm/predictions/${predId}/work-order`, { prediction_id: predId, actor: "Maintenance" });
    toast("Routed to maintenance workflow");
    refresh();
    if (detail?.asset?.id) openAsset(detail.asset.id);
  };

  const capture = async (predId: string) => {
    if (!finding.trim()) {
      toast("Enter finding text");
      return;
    }
    await post(`/api/pdm/predictions/${predId}/finding`, {
      actor: "Tech · Maintenance",
      finding,
      confirms_failure_mode_id: detail?.predictions?.[0]?.failure_mode_id,
    });
    toast("Finding captured as ground truth");
    setFinding("");
    if (detail?.asset?.id) openAsset(detail.asset.id);
  };

  return (
    <div data-tour="page-pdm">
      <h1 className="page-title">Predictive Maintenance</h1>
      <p className="page-sub">
        Failure-mode specific models with actionable lead time — not a generic machine-health AI.
      </p>
      <Tip>
        Predictions route into the existing maintenance workflow. Technician findings become ground truth.
        RUL only where run-to-failure history exists; otherwise health scores and inspections.
      </Tip>

      <div className="grid cols-2">
        <Panel title="Critical assets">
          {(assets?.assets || []).map((a: any) => (
            <div
              key={a.id}
              className="list-row clickable"
              style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
              onClick={() => openAsset(a.id)}
            >
              <div className="row between">
                <strong style={{ fontSize: 13 }}>{a.name}</strong>
                <span className="mono small">{Math.round((a.health_score || 0) * 100)}%</span>
              </div>
              <div className="small faint">
                {a.criticality} · mode-aware {a.mode_aware ? "yes" : "no"} · RTF history {a.run_to_failure_history ? "yes" : "no"}
              </div>
            </div>
          ))}
          {!(assets?.assets || []).length && <p className="dim small">No PdM assets seeded for this tenant.</p>}
        </Panel>

        <Panel title="Open predictions">
          {(preds?.predictions || []).map((p: any) => (
            <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div className="row between">
                <strong style={{ fontSize: 12 }}>{p.failure_mode_name || p.failure_mode_id}</strong>
                <span className="small">{p.status}</span>
              </div>
              <div className="small faint">{p.kind} · horizon {p.horizon_hours}h · {ago(p.created_at)}</div>
              <div className="small">{p.rationale}</div>
              {p.status === "Open" && (
                <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => routeWO(p.id)}>
                  Route to maintenance
                </button>
              )}
            </div>
          ))}
        </Panel>
      </div>

      {detail && (
        <>
          <div className="mt" />
          <Panel title={`${detail.asset.name} · failure modes`}>
            <table className="data">
              <thead><tr><th>Failure mode</th><th>Lead time</th><th>Preferred work</th></tr></thead>
              <tbody>
                {(detail.failure_modes || []).map((f: any) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td className="mono">{f.actionable_lead_time_hours}h</td>
                    <td className="small">{f.preferred_work}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Technician finding…"
                value={finding}
                onChange={(e) => setFinding(e.target.value)}
              />
              <button
                className="btn"
                disabled={!detail.predictions?.[0]}
                onClick={() => detail.predictions?.[0] && capture(detail.predictions[0].id)}
              >
                Capture finding
              </button>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
