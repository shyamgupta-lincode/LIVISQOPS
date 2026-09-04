"use client";
import { Shell } from "@/components/Shell";
import { AdminSubnav, Panel, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export default function AdminDataPage() {
  const [health, setHealth] = useState<any>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    api("/admin/data-health").then(setHealth).catch(console.error);
  }, []);

  const plane = (health?.planes || []).find((p: any) => p.id === active) || health?.planes?.[0];

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Data planes</h1>
        </div>
      </div>
      <AdminSubnav />
      <Tip>
        Cognite / LIVIS data foundation: not one mega-database with AI on top. Time-series, ledger,
        lakehouse archive, knowledge, and backbone each have a job — linked by context IDs.
      </Tip>
      <p className="muted" style={{ marginBottom: 12 }}>{health?.contract}</p>

      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        {(health?.planes || []).map((p: any) => (
          <button
            key={p.id}
            type="button"
            className={`card plane-card ${plane?.id === p.id ? "active" : ""}`}
            style={{ textAlign: "left" }}
            onClick={() => setActive(p.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong>{p.name}</strong>
              {p.immutable && <span className="badge">append-only</span>}
            </div>
            <p className="muted" style={{ margin: "8px 0" }}>{p.responsibility}</p>
            <span className="mono muted">vol {p.volume}</span>
          </button>
        ))}
      </div>

      <div className="grid cols-2">
        <Panel title={plane ? `Plane · ${plane.name}` : "Plane detail"}>
          {plane ? (
            <>
              <p>{plane.responsibility}</p>
              <p className="muted">Layers: {(plane.layers || []).join(" · ")}</p>
              <p className="muted">Immutable: {String(plane.immutable)}</p>
            </>
          ) : <p className="muted">Select a plane</p>}
        </Panel>
        <Panel title="ISA-95 level aliases">
          <table className="table">
            <thead><tr><th>Level</th><th>ISA-95</th><th>Entity</th></tr></thead>
            <tbody>
              {(health?.isa95_levels || []).map((l: any) => (
                <tr key={l.level}><td>{l.level}</td><td>{l.isa95}</td><td>{l.entity}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Source health">
        <p>DQ score {((health?.data_quality_score || 0) * 100).toFixed(0)}% · unresolved context {health?.unresolved_context}</p>
        <table className="table">
          <thead><tr><th>Source</th><th>Status</th><th>Lag</th><th>Schema</th></tr></thead>
          <tbody>
            {(health?.sources || []).map((s: any) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td><span className="badge ok">{s.status}</span></td>
                <td>{s.lag_s}s</td>
                <td className="mono">{s.schema_version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Shell>
  );
}
