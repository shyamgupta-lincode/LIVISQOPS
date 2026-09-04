"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tip } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

const COLS = ["New", "Accepted", "In progress", "Awaiting review", "Blocked", "Done"];

export default function WorkPage() {
  const [items, setItems] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null);
  const [mode, setMode] = useState<"board" | "station">("station");
  const load = () => api("/work/tasks").then((d) => {
    const rows = d.items || [];
    setItems(rows);
    if (!active && rows.length) setActive(rows.find((t: any) => t.status !== "Done") || rows[0]);
  });
  useEffect(() => { load(); }, []);

  async function completeFinding() {
    if (!active) return;
    await api(`/work/tasks/${active.id}`, {
      method: "POST",
      body: JSON.stringify({
        status: "Done",
        finding: "Confirmed outer race spalling / grease degradation (bearing_wear)",
      }),
    });
    await load();
  }

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Work / station</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "station" ? "default" : "ghost"} type="button" onClick={() => setMode("station")}>Station</Button>
          <Button size="sm" variant={mode === "board" ? "default" : "ghost"} type="button" onClick={() => setMode("board")}>Board</Button>
        </div>
      </div>

      <Tip>
        Frontline apps pattern: show one clear step, capture structured evidence, escalate with Andon,
        and write findings that become ground truth for PdM / RCA — never free-form chaos.
      </Tip>

      {mode === "station" ? (
        <div className="station-exec">
          <div className="station-step">
            <Badge variant="outline" className="border-info/40 bg-info/10 text-info">Active step</Badge>
            <h2 className="my-2.5 text-xl font-bold">
              {active?.title || "No open station task"}
            </h2>
            <p className="muted">Role {active?.role || "—"} · Priority {active?.priority || "—"}</p>
            <ol className="mt-4 leading-relaxed">
              <li>Verify lockout / tagout and spindle safe state</li>
              <li>Inspect lubrication path and bearing housing temperature</li>
              <li>Capture vibration snapshot + photo evidence</li>
              <li>Record finding (failure mode code if confirmed)</li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" disabled={!active || active.status === "Done"} onClick={completeFinding}>
                Complete with bearing finding
              </Button>
              <Button variant="outline" type="button">Andon — call quality</Button>
              <Button variant="outline" type="button">Attach evidence</Button>
            </div>
            {active?.finding && (
              <p style={{ marginTop: 16 }}><strong>Finding:</strong> {active.finding}</p>
            )}
          </div>
          <Panel title="Station queue">
            {items.map((t) => (
              <button
                key={t.id}
                type="button"
                className="kanban-card"
                style={{ width: "100%", textAlign: "left", outline: active?.id === t.id ? "2px solid var(--accent)" : undefined }}
                onClick={() => setActive(t)}
              >
                <div className="flex justify-between gap-2">
                  <Badge variant={t.priority === "Critical" ? "destructive" : "outline"} className={t.priority === "High" ? "border-warn/40 bg-warn/10 text-warn" : undefined}>{t.priority}</Badge>
                  <Badge variant="secondary">{t.status}</Badge>
                </div>
                <div style={{ marginTop: 6, fontWeight: 650 }}>{t.title}</div>
                <div className="muted">{t.role}</div>
              </button>
            ))}
            {!items.length && <p className="muted">No tasks — open a quality event into investigation.</p>}
          </Panel>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS.length}, minmax(140px, 1fr))` }}>
          {COLS.map((c) => (
            <div key={c} className="card">
              <strong>{c}</strong>
              {items.filter((t) => t.status === c).map((t) => (
                <div key={t.id} style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
                  <div>{t.title}</div>
                  <div className="muted">{t.role} · {t.priority}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
