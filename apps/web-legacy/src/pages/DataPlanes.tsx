// Data Planes — specialized stores behind one semantic contract.

import React, { useState } from "react";

import { get, usePoll } from "../api";
import { Panel, Tip } from "../components/ui";

export default function DataPlanes() {
  const { data } = usePoll<any>("/api/stores", 10000);
  const [sample, setSample] = useState<any | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const openPlane = async (id: string) => {
    setActive(id);
    const d = await get(`/api/stores/${id}`);
    setSample(d);
  };

  return (
    <div data-tour="page-data-planes">
      <h1 className="page-title">Data Planes</h1>
      <p className="page-sub">
        Specialized stores behind one ObservationContext contract — not one large database
        with AI layered on top.
      </p>
      <Tip>
        Lakehouse and operational ledger are append-only. Corrections create new versions.
        Knowledge keeps immutable cases, approved lessons, and derived retrieval indexes separate.
      </Tip>

      <p className="small dim" style={{ marginBottom: 12 }}>{data?.contract}</p>

      <div className="grid cols-3">
        {(data?.planes || []).map((p: any) => (
          <div
            key={p.id}
            className="panel clickable"
            style={{ padding: 14, cursor: "pointer", outline: active === p.id ? "1px solid var(--accent)" : undefined }}
            onClick={() => openPlane(p.id)}
          >
            <div className="row between">
              <strong style={{ fontSize: 13 }}>{p.name}</strong>
              {p.immutable && <span className="tag">append-only</span>}
            </div>
            <p className="small faint" style={{ margin: "8px 0" }}>{p.responsibility}</p>
            <div className="row between">
              <span className="mono small">vol {p.volume}</span>
              <span className="small dim">{p.layers ? p.layers.join(" · ") : ""}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt" />
      <div className="grid cols-2">
        <Panel title="ISA-95 level aliases">
          <table className="data">
            <thead><tr><th>Level</th><th>ISA-95</th><th>Entity</th></tr></thead>
            <tbody>
              {(data?.isa95_levels || []).map((l: any) => (
                <tr key={l.id}>
                  <td>{l.label}</td>
                  <td className="small">{l.isa95}</td>
                  <td className="mono small">{l.entity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small faint" style={{ marginTop: 8 }}>Schema {data?.schema_version}</div>
        </Panel>
        <Panel title={sample ? `Sample · ${active}` : "Sample query"}>
          {!sample && <p className="dim small">Select a plane</p>}
          {sample && (
            <pre className="mono small" style={{ whiteSpace: "pre-wrap", maxHeight: 360, overflow: "auto" }}>
              {JSON.stringify(sample.sample, null, 2)}
            </pre>
          )}
        </Panel>
      </div>
    </div>
  );
}
