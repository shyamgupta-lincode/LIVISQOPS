"use client";
import { Shell } from "@/components/Shell";
import { AdminSubnav, Panel, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export default function BackbonePage() {
  const [health, setHealth] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    api("/admin/data-health").then((d) => {
      setHealth(d);
      setSelected((d.topics || [])[0] || null);
    });
  }, []);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Event backbone</h1>
        </div>
      </div>
      <AdminSubnav />
      <Tip>
        LIVIS backbone pattern: every message is an ObservationContext envelope (tenant, site, asset, order, correlation).
        DLQs and MinIO archive make replay safe; consumers are idempotent.
      </Tip>

      <div className="grid cols-2">
        <Panel title="Topics">
          <table className="table">
            <thead><tr><th>Topic</th><th>Lag</th><th>Rate</th></tr></thead>
            <tbody>
              {(health?.topics || []).map((t: any) => (
                <tr key={t.name} style={{ cursor: "pointer" }} onClick={() => setSelected(t)}>
                  <td className="mono">{t.name}</td>
                  <td>{t.lag_ms} ms</td>
                  <td>{t.rate_hz} Hz</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Envelope inspector">
          {selected ? (
            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", background: "var(--surface-2)", padding: 12, borderRadius: 6 }}>
{JSON.stringify({
  event_id: "019f…demo",
  event_type: selected.name.includes("quality") ? "quality.event.transition" : "telemetry.sample",
  schema_version: "1.0.0",
  tenant_id: "11111111-…",
  site_id: "22222222-…",
  source: { system: "stream-worker", external_id: null },
  correlation_id: "corr-…",
  data_quality: { status: "good", reasons: [] },
  payload: { topic: selected.name, lag_ms: selected.lag_ms },
}, null, 2)}
            </pre>
          ) : <p className="muted">Select a topic</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn ghost sm" type="button">Replay last 15m</button>
            <button className="btn ghost sm" type="button">Open DLQ</button>
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
