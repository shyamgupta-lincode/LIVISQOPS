"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function ReliabilityPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    const load = () => api("/reliability/assets").then((d) => setItems(d.items || []));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const atRisk = items.filter((a) => a.health_index < 0.85 || a.prediction);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Reliability / PdM</h1>
        </div>
        <Link className="btn ghost sm" href="/work">Route to work</Link>
      </div>

      <Tip>
        Not generic “AI health.” Each card is an explicit asset + failure mode + horizon
        (LIVIS PdM / Cognite asset performance style). Humans convert recommendations into work orders.
      </Tip>

      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        {atRisk.slice(0, 6).map((a) => (
          <Panel key={a.id} className="plane-card" title={<Link href={`/assets/${a.id}`}>{a.name}</Link>}>
            <p><span className={`badge ${a.health_index < 0.75 ? "crit" : "warn"}`}>HI {(a.health_index * 100).toFixed(0)}%</span></p>
            <p style={{ marginTop: 8 }}><strong>{a.failure_mode?.name || "No modeled mode"}</strong></p>
            <p className="muted">{a.failure_mode?.code || "—"} · horizon {a.failure_mode?.horizon_hours || "—"}h</p>
            {a.prediction ? (
              <>
                <p style={{ marginTop: 8 }}>
                  P(horizon) <strong>{(a.prediction.probability_in_horizon * 100).toFixed(0)}%</strong>
                </p>
                <p className="muted">{a.prediction.model_version} · {a.prediction.status}</p>
              </>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>No open prediction</p>
            )}
            <button
              className="btn ghost sm"
              style={{ marginTop: 10 }}
              type="button"
              onClick={() => { location.href = "/work"; }}
            >
              Recommend inspection WO
            </button>
          </Panel>
        ))}
        {!atRisk.length && <Panel><p className="muted">No assets currently below health threshold.</p></Panel>}
      </div>

      <Panel title="Fleet table">
        <table className="table">
          <thead>
            <tr><th>Asset</th><th>State</th><th>Health</th><th>Failure mode</th><th>P(horizon)</th><th>Model</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/assets/${a.id}`}>{a.name}</Link></td>
                <td><span className={`badge ${a.operating_state === "Running" ? "ok" : "warn"}`}>{a.operating_state}</span></td>
                <td style={{ fontWeight: 700 }}>{(a.health_index * 100).toFixed(0)}%</td>
                <td>{a.failure_mode?.name || "—"}</td>
                <td>{a.prediction ? `${(a.prediction.probability_in_horizon * 100).toFixed(0)}% / ${a.prediction.horizon_hours}h` : "—"}</td>
                <td className="muted">{a.prediction?.model_version || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Shell>
  );
}
