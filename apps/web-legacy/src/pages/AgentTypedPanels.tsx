// Typed agent panels: RCA hypotheses, knowledge curation, workflow orchestration.

import React, { useState } from "react";

import { get, post, usePoll } from "../api";
import { toast } from "../components/ui";

export default function AgentTypedPanels() {
  const { data: hyps, refresh: refreshH } = usePoll<any>("/api/rca/hypotheses", 12000);
  const { data: know, refresh: refreshK } = usePoll<any>("/api/knowledge/proposals", 12000);
  const [qeId, setQeId] = useState("qe-tank-seal-open");
  const [busy, setBusy] = useState(false);

  const runRca = async () => {
    setBusy(true);
    try {
      await post("/api/rca/investigate", { quality_event_id: qeId, actor: "RCA Investigator" });
      toast("RCA hypotheses drafted (not a definitive diagnosis)");
      refreshH();
    } catch (e: any) {
      toast(e.message || "RCA failed");
    } finally {
      setBusy(false);
    }
  };

  const curate = async () => {
    setBusy(true);
    try {
      await post("/api/knowledge/curate", { quality_event_id: "qe-tank-seal-closed", actor: "Knowledge Curation" });
      toast("Knowledge proposal sent to steward");
      refreshK();
    } catch (e: any) {
      toast(e.message || "Curate failed — close a QE first");
    } finally {
      setBusy(false);
    }
  };

  const approveLesson = async (pid: string) => {
    await post(`/api/knowledge/proposals/${pid}/approve`, { actor: "Jordan Hale" });
    toast("Lesson approved → retrieval index updated");
    refreshK();
  };

  const orchestrate = async () => {
    const r = await post<any>("/api/workflow/orchestrate", { actor: "Workflow Orchestrator" });
    toast(`Workflow agent: ${r.actions?.length || 0} deterministic actions (no PLC writes)`);
  };

  const bundles = (hyps?.hypotheses || []).filter((h: any) => h.hypotheses || h.rank === 1 || h.cause);

  return (
    <div className="panel" style={{ padding: 14, marginBottom: 16 }} data-tour="agent-typed">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div>
          <strong style={{ fontSize: 13 }}>Typed agents · RCA / Knowledge / Workflow</strong>
          <div className="small faint">Agents retrieve evidence and recommend — OT/PLC writes are denied by construction.</div>
        </div>
        <button className="btn ghost" disabled={busy} onClick={orchestrate}>Run workflow tick</button>
      </div>

      <div className="grid cols-3">
        <div>
          <div className="small" style={{ fontWeight: 700 }}>Production / RCA</div>
          <div className="row" style={{ gap: 6, margin: "8px 0" }}>
            <input className="input" style={{ flex: 1 }} value={qeId} onChange={(e) => setQeId(e.target.value)} />
            <button className="btn" disabled={busy} onClick={runRca}>Investigate</button>
          </div>
          {bundles.slice(0, 3).map((h: any) => (
            <div key={h.id || h.cause} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>#{h.rank || "—"} {h.cause}</div>
              <div className="small faint">confidence {h.confidence ?? "—"} · {h.uncertainty}</div>
              <div className="small">Support: {(h.supporting_evidence || []).slice(0, 2).join("; ")}</div>
              <div className="small faint">Contradict: {(h.contradictory_evidence || []).slice(0, 1).join("; ")}</div>
            </div>
          ))}
          <div className="small dim">Output is possible causes with evidence — never an unsupported definitive diagnosis.</div>
        </div>

        <div>
          <div className="small" style={{ fontWeight: 700 }}>Knowledge curation</div>
          <button className="btn ghost" style={{ margin: "8px 0" }} disabled={busy} onClick={curate}>
            Curate closed QE
          </button>
          {(know?.proposals || []).filter((p: any) => p.status === "Pending Approval").map((p: any) => (
            <div key={p.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12 }}>{p.title}</div>
              <div className="small faint">{(p.chain && `${p.chain.symptom} → ${p.chain.cause}`) || "—"}</div>
              <button className="btn" onClick={() => approveLesson(p.id)}>Steward approve</button>
            </div>
          ))}
          <div className="small faint">Approved lessons: {(know?.lessons || []).length}</div>
        </div>

        <div>
          <div className="small" style={{ fontWeight: 700 }}>Workflow (deterministic)</div>
          <p className="small faint" style={{ marginTop: 8 }}>
            Creates/routes events, enforces deadlines, requests evidence, escalates overdue items.
            State transitions remain in policy — not generative control.
          </p>
          <button
            className="btn ghost"
            style={{ marginTop: 8 }}
            onClick={async () => {
              const t = await get("/api/agent-types/rca");
              toast(`${(t as any).agents?.length || 0} RCA-typed agents`);
            }}
          >
            List RCA-typed agents
          </button>
        </div>
      </div>
    </div>
  );
}
