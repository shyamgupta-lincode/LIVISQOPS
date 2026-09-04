"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function RcaIndex() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api("/quality/events").then((d) => setItems(d.items || [])); }, []);
  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>RCA workspaces</h1>
        </div>
        <Link className="btn ghost sm" href="/admin/agents">Agents ledger</Link>
      </div>
      <Tip>Pick an event to open the three-pane RCA workspace with bounded agent hypotheses.</Tip>
      <Panel>
        <table className="table">
          <thead><tr><th>Event</th><th>Severity</th><th>Status</th><th>Characteristic</th><th></th></tr></thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.id.slice(0, 8)}</td>
                <td><span className={`badge ${e.severity === "Critical" ? "crit" : e.severity === "High" ? "warn" : ""}`}>{e.severity}</span></td>
                <td>{e.status}</td>
                <td>{e.characteristic}</td>
                <td><Link className="btn ghost sm" href={`/rca/${e.id}`}>Investigate</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Shell>
  );
}
