"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tip } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const VIEWS = [
  { id: "all", label: "All open" },
  { id: "critical", label: "Critical" },
  { id: "validation", label: "Awaiting validation" },
  { id: "investigation", label: "Investigation" },
  { id: "capa", label: "CAPA due" },
  { id: "closed", label: "Closed recently" },
];

const BOARD = [
  { id: "DETECTED", title: "Detected" },
  { id: "VALIDATION", title: "Validation" },
  { id: "INVESTIGATION", title: "Investigation" },
  { id: "CORRECTIVE_ACTION", title: "CAPA / close" },
];

export default function QualityPage() {
  const [items, setItems] = useState<any[]>([]);
  const [view, setView] = useState("all");
  const [mode, setMode] = useState<"table" | "board">("board");

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v) setView(v);
  }, []);

  const load = () => api("/quality/events").then((d) => setItems(d.items || []));
  useEffect(() => {
    load().catch(console.error);
    const t = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    return items.filter((e) => {
      if (view === "critical") return e.severity === "Critical" || e.severity === "High";
      if (view === "validation") return e.status === "VALIDATION" || e.status === "DETECTED";
      if (view === "investigation") return e.status === "INVESTIGATION" || e.status === "CONTAINMENT";
      if (view === "capa") return ["DISPOSITION", "CORRECTIVE_ACTION", "EFFECTIVENESS_CHECK"].includes(e.status);
      if (view === "closed") return e.status === "CLOSED";
      return e.status !== "CLOSED";
    });
  }, [items, view]);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Quality events</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={() => setMode(mode === "board" ? "table" : "board")}>
            {mode === "board" ? "Table view" : "Board view"}
          </Button>
          <Button
            size="sm"
            type="button"
            onClick={async () => {
              const qe = await api("/quality/events", {
                method: "POST",
                body: JSON.stringify({ characteristic: "Manual observation", severity: "Medium", origin: "manual" }),
              });
              location.href = `/quality/${qe.id}`;
            }}
          >
            Create event
          </Button>
        </div>
      </div>

      <Tip>
        QualityOps pattern: board for triage, dense table for SLA work, event workspace for digital thread
        (genealogy, evidence, RCA, CAPA, audit). Agents propose; humans commit transitions.
      </Tip>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className={`chip-btn ${view === v.id ? "active" : ""}`} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {mode === "board" ? (
        <div className="kanban">
          {BOARD.map((col) => {
            const cards = filtered.filter((e) => {
              if (col.id === "CORRECTIVE_ACTION") {
                return ["DISPOSITION", "CORRECTIVE_ACTION", "EFFECTIVENESS_CHECK", "CLOSED"].includes(e.status);
              }
              if (col.id === "INVESTIGATION") return ["CONTAINMENT", "INVESTIGATION"].includes(e.status);
              return e.status === col.id;
            });
            return (
              <div key={col.id} className="kanban-col">
                <h3>{col.title} · {cards.length}</h3>
                {cards.map((e) => (
                  <Link key={e.id} href={`/quality/${e.id}`} className="kanban-card">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span className={`badge ${e.severity === "Critical" ? "crit" : e.severity === "High" ? "warn" : ""}`}>{e.severity}</span>
                      <span className="mono muted">{e.id.slice(0, 8)}</span>
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 650 }}>{e.characteristic}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{e.status} · {e.origin}</div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <Panel>
          <table className="table">
            <thead>
              <tr>
                <th>Severity</th><th>Event</th><th>Status</th><th>Characteristic</th>
                <th>Origin</th><th>Owner</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td><span className={`badge ${e.severity === "Critical" ? "crit" : e.severity === "High" ? "warn" : ""}`}>{e.severity}</span></td>
                  <td><Link href={`/quality/${e.id}`} className="mono">{e.id.slice(0, 8)}</Link></td>
                  <td><span className="badge">{e.status}</span></td>
                  <td>{e.characteristic}</td>
                  <td>{e.origin}</td>
                  <td>{e.owner_role}</td>
                  <td className="muted">{e.updated_at}</td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="muted">No events in this view</td></tr>}
            </tbody>
          </table>
        </Panel>
      )}
    </Shell>
  );
}
