"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Engineer Assets index — detail routes live at `/assets/[assetId]`. */
export default function AssetsIndexPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api("/reliability/assets").then((d) => setItems(d.items || [])).catch(console.error);
  }, []);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Assets</h1>
        </div>
        <Link className="btn ghost sm" href="/reliability">Predictive maintenance</Link>
      </div>
      <Tip>
        Engineer owns asset detail under <code>/assets/*</code>. Use PdM for failure-mode horizons;
        open an asset for the 360° health view.
      </Tip>
      <Panel title="Fleet">
        <table className="table">
          <thead>
            <tr><th>Asset</th><th>State</th><th>Health</th><th>Failure mode</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/assets/${a.id}`}>{a.name}</Link></td>
                <td><span className={`badge ${a.operating_state === "Running" ? "ok" : "warn"}`}>{a.operating_state}</span></td>
                <td style={{ fontWeight: 700 }}>{(a.health_index * 100).toFixed(0)}%</td>
                <td>{a.failure_mode?.name || "—"}</td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan={4} className="muted">No assets loaded.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </Shell>
  );
}
