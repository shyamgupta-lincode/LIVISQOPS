// Vision AI: model registry, Production Fitness Passports, deployment rings,
// promote/rollback with segment fitness gates, drift triage.

import React, { useState } from "react";

import { ago, get, post, usePoll } from "../api";
import { Drawer, Panel, Spark, Tip, toast } from "../components/ui";

const RINGS = ["Bench", "Replay", "Shadow", "Assisted", "Canary", "Production"];

export default function VisionAI() {
  const { data: models, refresh } = usePoll<any[]>("/api/models", 8000);
  const { data: drift } = usePoll<any[]>("/api/drift", 10000);
  const [selected, setSelected] = useState<any>(null);

  const openModel = async (id: string) => setSelected(await get(`/api/models/${id}`));

  const promote = async (id: string) => {
    const res = await post(`/api/models/${id}/promote`);
    if (res.blocked_by_fitness) {
      toast(`Blocked: unfit segments — ${res.unfit_segments.map((s: any) => s.segment).join(", ")}`);
    } else {
      toast(`Promoted to ${res.model.stage} ring`);
    }
    refresh();
    openModel(id);
  };

  const rollback = async (id: string) => {
    const res = await post(`/api/models/${id}/rollback`);
    toast(`Rolled back to ${res.target}`);
    refresh();
    openModel(id);
  };

  if (!models) return <p className="dim">Loading vision platform…</p>;

  return (
    <div data-tour="page-vision">
      <h1 className="page-title">Vision AI · Model Deployment & Production Fitness</h1>
      <p className="page-sub">Is the model performing by line, variant, shift and environment? Release is governed by fitness, not accuracy alone.</p>
      <Tip>
        <b>Click a model row</b> to open its Production Fitness Passport — from there you can
        <b> promote</b> through deployment rings (fitness gates may block) or <b>rollback</b> instantly.
      </Tip>

      <div className="grid cols-2">
        <Panel title="Model registry">
          <table className="data">
            <thead><tr><th>Model</th><th>Ver</th><th>Ring</th><th>Recall</th><th>Drift</th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="clickable" onClick={() => openModel(m.id)}>
                  <td>{m.name}<div className="small faint">{m.architecture}</div></td>
                  <td className="mono">{m.version}</td>
                  <td>
                    <span className="tag" style={m.stage === "Production" ? { borderColor: "var(--state-running)", color: "var(--state-running)" } : {}}>
                      {m.stage}
                    </span>
                  </td>
                  <td className="mono">{(m.fitness_passport.locked_test_metrics.critical_recall * 100).toFixed(2)}%</td>
                  <td>
                    <span className={m.drift.status === "Healthy" ? "k-good small" : "k-warn small"}>
                      {m.drift.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div>
          <Panel title="Deployment rings">
            <div className="row wrap" style={{ gap: 6 }}>
              {RINGS.map((r, i) => (
                <React.Fragment key={r}>
                  <span className="tag" style={{ fontSize: 11.5 }}>
                    {r} <span className="faint">({models.filter((m) => m.stage === r).length})</span>
                  </span>
                  {i < RINGS.length - 1 && <span className="faint">→</span>}
                </React.Fragment>
              ))}
            </div>
            <p className="small faint mt">
              Signed approvals and automatic health gates at every ring; one-click rollback from any ring.
            </p>
          </Panel>

          <div className="mt" />
          <Panel title="Drift triage · routed to the right owner">
            {(drift ?? []).map((d) => (
              <div key={d.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="row between">
                  <strong style={{ fontSize: 13 }}>{d.kind}</strong>
                  <span className="tag">{d.status}</span>
                </div>
                <div className="small dim">{d.detail}</div>
                <div className="small faint">owner: {d.owner} · detected {ago(d.detected)}</div>
              </div>
            ))}
            <p className="small faint mt">
              Model drift is separated from camera, lighting, fixture and product-mix drift.
            </p>
          </Panel>
        </div>
      </div>

      {selected && (
        <Drawer onClose={() => setSelected(null)}>
          <h2 style={{ marginTop: 4, fontSize: 16 }}>{selected.name}</h2>
          <div className="small faint">{selected.slug}@{selected.version} · {selected.architecture} · trained {ago(selected.trained)}</div>
          <div className="mt row wrap">
            <span className="tag">{selected.stage} ring</span>
            <span className="tag">{selected.fitness_passport.hardware_profile}</span>
          </div>

          <div className="divider" />
          <div className="panel-title">Production Fitness Passport</div>
          <div className="row between small"><span className="dim">Critical recall (locked test)</span><span className="mono k-good">{(selected.fitness_passport.locked_test_metrics.critical_recall * 100).toFixed(2)}%</span></div>
          <div className="row between small"><span className="dim">False reject rate</span><span className="mono">{(selected.fitness_passport.locked_test_metrics.false_reject_rate * 100).toFixed(2)}%</span></div>
          <div className="row between small"><span className="dim">Approved by</span><span>{selected.fitness_passport.approved_by}</span></div>
          <div className="row between small"><span className="dim">Rollback target</span><span className="mono">{selected.fitness_passport.rollback_target}</span></div>

          <div className="divider" />
          <div className="panel-title">Segment scorecard · fitness gates</div>
          {selected.fitness_passport.segments.map((s: any) => (
            <div key={s.segment} className="row between small" style={{ padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <span>{s.segment}</span>
              <span className="mono">recall {(s.recall * 100).toFixed(1)}%</span>
              <span className={s.fit ? "k-good" : "k-bad"}>{s.fit ? "FIT" : "UNFIT"}</span>
            </div>
          ))}
          <p className="small faint mt">
            A model can be globally accurate yet blocked for a weak variant, camera or lighting segment.
          </p>

          <div className="divider" />
          <div className="panel-title">Threshold economics</div>
          <div className="row between small"><span className="dim">Escape cost</span><span className="mono">${selected.fitness_passport.cost_assumptions.escape_cost_usd}</span></div>
          <div className="row between small"><span className="dim">False reject cost</span><span className="mono">${selected.fitness_passport.cost_assumptions.false_reject_cost_usd}</span></div>
          <div className="row between small"><span className="dim">Re-inspect cost</span><span className="mono">${selected.fitness_passport.cost_assumptions.reinspect_cost_usd}</span></div>

          <div className="divider" />
          <div className="panel-title">Confidence trend (14 shifts)</div>
          <Spark values={selected.drift.confidence_trend} />

          <div className="divider" />
          <div className="row" style={{ gap: 10 }}>
            <button
              className="btn success"
              disabled={selected.stage === "Production"}
              onClick={() => promote(selected.id)}
            >
              Promote ring →
            </button>
            <button className="btn danger" onClick={() => rollback(selected.id)}>
              Rollback
            </button>
          </div>
          <div className="audit-footer">
            Signed release record: model + preprocessing + calibration + thresholds + hardware profile as one artifact.
          </div>
        </Drawer>
      )}
    </div>
  );
}
