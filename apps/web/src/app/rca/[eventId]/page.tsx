"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function RcaEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [data, setData] = useState<any>(null);
  const [qe, setQe] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setData(await api(`/rca/${eventId}`));
    setQe(await api(`/quality/events/${eventId}`));
  };
  useEffect(() => { load().catch(console.error); }, [eventId]);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>RCA workspace</h1>
          <p className="muted mono">{eventId}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn ghost sm" href={`/quality/${eventId}`}>Quality event</Link>
          <button
            className="btn sm"
            disabled={busy}
            type="button"
            onClick={async () => {
              setBusy(true);
              try {
                await api("/rca/investigate", { method: "POST", body: JSON.stringify({ quality_event_id: eventId }) });
                await load();
              } finally { setBusy(false); }
            }}
          >
            {busy ? "Running tools…" : "Generate hypotheses"}
          </button>
        </div>
      </div>

      <Tip>
        Three-pane investigation: evidence catalog, causal canvas, hypothesis panel.
        Agents may only draft; confirmation requires humans after discriminating tests.
      </Tip>

      <div className="grid rca-layout">
        <Panel title="Evidence catalog">
          <ul style={{ paddingLeft: 16, margin: 0, lineHeight: 1.7, fontSize: 13 }}>
            <li>Feature window / anomaly features</li>
            <li>Telemetry vibration · temp · torque</li>
            <li>Order / lot / unit genealogy</li>
            <li>Similar approved knowledge cases</li>
            <li>Maintenance / calibration history</li>
          </ul>
          <p className="muted" style={{ marginTop: 10 }}>Asset {qe?.asset_id?.slice(0, 8) || "—"}</p>
          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{JSON.stringify(qe?.evidence || [], null, 2)}</pre>
        </Panel>

        <div className="grid" style={{ gap: 12 }}>
          <Panel title="Draft analysis (not definitive)">
            {data?.analysis ? (
              <>
                <p>{data.analysis.summary}</p>
                <p className="muted">
                  Confidence {((data.analysis.overall_confidence || 0) * 100).toFixed(0)}% · {data.analysis.status}
                </p>
              </>
            ) : (
              <p className="muted">Run Generate hypotheses to invoke MockAgentProvider (or OpenAI when configured).</p>
            )}
          </Panel>
          <Panel title="Causal map (symbols)">
            <div className="chip-row">
              <span className="badge">◎ observation</span>
              <span className="badge warn">▲ symptom</span>
              <span className="badge info">◇ hypothesis</span>
              <span className="badge ok">● confirmed</span>
              <span className="badge">→ action</span>
            </div>
            <p style={{ marginTop: 12 }}>
              Vibration ↑ → temp ↑ → lubrication starvation? → bearing_wear → replace bearing / restore grease
            </p>
          </Panel>
        </div>

        <Panel title="Hypotheses">
          {(data?.hypotheses || []).map((h: any) => (
            <div key={h.id} className="kanban-card" style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                <strong>#{h.rank} {h.cause_code}</strong>
                <span className="badge">{(h.confidence * 100).toFixed(0)}%</span>
              </div>
              <div style={{ marginTop: 4 }}>{h.cause}</div>
              <div className="muted">Ev {(h.evidence_ids || []).length} · Counter {(h.counter_evidence_ids || []).length} · {h.status}</div>
              <button className="btn ghost sm" type="button" style={{ marginTop: 6 }} onClick={() => setExpanded(expanded === h.id ? null : h.id)}>
                {expanded === h.id ? "Hide" : "Expand"}
              </button>
              {expanded === h.id && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <p>{h.rationale}</p>
                  <p className="muted">Assumptions: {(h.assumptions || []).join("; ") || "—"}</p>
                  <p className="muted">Tests: {(h.confirm_tests || []).join("; ") || "—"}</p>
                  <button
                    className="btn sm"
                    type="button"
                    style={{ marginTop: 6 }}
                    onClick={async () => {
                      await api(`/rca/hypotheses/${h.id}/decide`, { method: "POST", body: JSON.stringify({ status: "confirmed" }) });
                      await load();
                    }}
                  >
                    Confirm cause
                  </button>
                </div>
              )}
            </div>
          ))}
          {!data?.hypotheses?.length && <p className="muted">No hypotheses yet</p>}
        </Panel>
      </div>
    </Shell>
  );
}
