"use client";
import { Shell } from "@/components/Shell";
import { AdminSubnav, Panel, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export default function LearningPage() {
  const [props, setProps] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);

  useEffect(() => {
    api("/knowledge/proposals").then((d) => setProps(d.items || []));
    api("/knowledge/search?q=bearing").then((d) => setCases(d.items || []));
  }, []);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Governed learning</h1>
        </div>
      </div>
      <AdminSubnav />
      <Tip>
        Learning only promotes through steward approval. Shadow evaluations and retrieval indexes update
        with provenance — prompts/policies/models never auto-edit production.
      </Tip>

      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        <Panel title="Detection model"><code>ewma+robustz-v1</code><p className="muted">Shadow gate: pass</p></Panel>
        <Panel title="PdM model"><code>bearing-degradation-v1</code><p className="muted">Health index + P(horizon)</p></Panel>
        <Panel title="Agent prompts"><code>rca-investigator/v1</code><p className="muted">Eval suite in tests/contract</p></Panel>
      </div>

      <Panel title="Pending knowledge promotions" style={{ marginBottom: 12 } as any}>
        <table className="table">
          <thead><tr><th>Proposal</th><th>Event</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {props.map((p) => (
              <tr key={p.id}>
                <td className="mono">{p.id.slice(0, 8)}</td>
                <td className="mono">{p.quality_event_id?.slice(0, 8)}</td>
                <td><span className="badge warn">{p.status}</span></td>
                <td>
                  {p.status === "Pending Approval" && (
                    <button
                      className="btn sm"
                      type="button"
                      onClick={async () => {
                        await api(`/knowledge/proposals/${p.id}/approve`, { method: "POST" });
                        const d = await api("/knowledge/proposals");
                        setProps(d.items || []);
                      }}
                    >
                      Steward approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!props.length && <tr><td colSpan={4} className="muted">No proposals — close a QE and run knowledge curator.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Panel title="Approved case index (sample)">
        <table className="table">
          <thead><tr><th>Title</th><th>Cause</th><th>Ver</th></tr></thead>
          <tbody>
            {cases.slice(0, 8).map((c) => (
              <tr key={c.id}><td>{c.title}</td><td>{c.confirmed_cause}</td><td>{c.version}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Shell>
  );
}
