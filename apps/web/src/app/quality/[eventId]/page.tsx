"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tabs, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const STEPS = ["DETECTED","VALIDATION","CONTAINMENT","INVESTIGATION","DISPOSITION","CORRECTIVE_ACTION","EFFECTIVENESS_CHECK","CLOSED"];

export default function QualityEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [qe, setQe] = useState<any>(null);
  const [tab, setTab] = useState("overview");
  const [audit, setAudit] = useState<any[]>([]);
  const load = () => api(`/quality/events/${eventId}`).then(setQe);
  useEffect(() => {
    load().catch(console.error);
    api("/admin/audit").then((d) => setAudit((d.items || []).filter((a: any) => a.target_id === eventId)));
  }, [eventId]);

  const idx = STEPS.indexOf(qe?.status);
  const next = STEPS[idx + 1];

  async function transition(to: string) {
    const body: any = { to_status: to, expected_version: qe.version };
    if (to === "CONTAINMENT") body.containment = "Hold affected lot; notify WMS";
    if (to === "DISPOSITION") body.disposition = "Repair / rework";
    if (to === "CORRECTIVE_ACTION") body.corrective_action = "Replace bearing; restore lubrication; verify alignment";
    if (to === "EFFECTIVENESS_CHECK" || to === "CLOSED") body.effectiveness = "No recurrence 14d";
    setQe(await api(`/quality/events/${eventId}/transition`, { method: "POST", body: JSON.stringify(body) }));
  }

  if (!qe) return <Shell><p>Loading digital thread…</p></Shell>;

  return (
    <Shell>
      <Tip>
        Digital thread workspace: sticky lifecycle, investigation tabs, and a 360° context rail
        (asset · order · lot · unit · anomaly). Named transitions require role + version checks.
      </Tip>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="mono muted">{qe.id}</div>
            <h1 style={{ margin: "4px 0" }}>{qe.characteristic}</h1>
            <span className={`badge ${qe.severity === "Critical" ? "crit" : "warn"}`}>{qe.severity}</span>{" "}
            <span className="badge">{qe.status}</span>{" "}
            <span className="muted">v{qe.version} · {qe.origin}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="btn ghost sm" href={`/rca/${qe.id}`}>Open RCA</Link>
            <Link className="btn ghost sm" href="/work">Work</Link>
            {next && <button className="btn sm" type="button" onClick={() => transition(next)}>Advance → {next}</button>}
          </div>
        </div>
        <div className="stepper">
          {STEPS.map((s, i) => (
            <span key={s} className={`badge ${i <= idx ? "ok" : ""}`}>{s}</span>
          ))}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 320px", gap: 12 }}>
        <div>
          <Tabs
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "evidence", label: "Evidence" },
              { id: "rca", label: "RCA" },
              { id: "genealogy", label: "Genealogy" },
              { id: "actions", label: "Actions" },
              { id: "audit", label: "Audit" },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === "overview" && (
            <Panel>
              <p>Measured <strong>{qe.measured_value}</strong> {qe.units} · Spec {qe.specification}</p>
              <p>Containment: {qe.containment || "—"}</p>
              <p>Disposition: {qe.disposition || "—"}</p>
              <p>RCA: {qe.rca_summary || "—"}</p>
              <p>CAPA: {qe.corrective_action || "—"}</p>
              <p>Effectiveness: {qe.effectiveness || "—"}</p>
            </Panel>
          )}
          {tab === "evidence" && (
            <Panel title="Evidence bundle">
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(qe.evidence, null, 2)}</pre>
            </Panel>
          )}
          {tab === "rca" && (
            <Panel title="RCA link" action={<Link href={`/rca/${qe.id}`}>Workspace →</Link>}>
              <p className="muted">Generate bounded hypotheses with citations; confirm only after discriminating tests.</p>
              <p>{qe.rca_summary || "No confirmed cause yet."}</p>
            </Panel>
          )}
          {tab === "genealogy" && (
            <Panel title="Affected scope / genealogy">
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(qe.affected_scope, null, 2)}</pre>
              <p className="muted">Upstream materials / downstream units marked affected · possibly affected · cleared.</p>
            </Panel>
          )}
          {tab === "actions" && (
            <Panel>
              <p>Owner role: <strong>{qe.owner_role}</strong></p>
              <Link className="btn ghost sm" href="/work">Open related work tasks</Link>
            </Panel>
          )}
          {tab === "audit" && (
            <Panel>
              <table className="table">
                <thead><tr><th>When</th><th>Actor</th><th>Action</th></tr></thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}><td className="mono">{a.at}</td><td>{a.actor}</td><td>{a.action}</td></tr>
                  ))}
                  {!audit.length && <tr><td colSpan={3} className="muted">No audit rows for this event yet</td></tr>}
                </tbody>
              </table>
            </Panel>
          )}
        </div>

        <Panel title="360° context">
          <p><strong>Site</strong> <span className="mono">{qe.site_id?.slice(0, 8)}</span></p>
          <p><strong>Asset</strong> <Link href={`/assets/${qe.asset_id}`}>{qe.asset_id?.slice(0, 8)}</Link></p>
          <p><strong>Order</strong> <span className="mono">{qe.order_id?.slice(0, 8) || "—"}</span></p>
          <p><strong>Lot / unit</strong> <span className="mono">{qe.lot_id?.slice(0, 8) || "—"} / {qe.unit_id?.slice(0, 8) || "—"}</span></p>
          <p><strong>Anomaly</strong> <span className="mono">{qe.anomaly_id?.slice(0, 8) || "—"}</span></p>
          <h3 style={{ marginTop: 12, fontSize: 12 }}>Context payload</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{JSON.stringify(qe.context, null, 2)}</pre>
          <Link className="btn ghost sm" href="/graph" style={{ marginTop: 8, display: "inline-flex" }}>View on context graph</Link>
        </Panel>
      </div>
    </Shell>
  );
}
