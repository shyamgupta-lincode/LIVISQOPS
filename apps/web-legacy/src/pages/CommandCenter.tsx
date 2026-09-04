// Command Center: KPI strip, Constraint Radar, priority queue, AI shift brief, action list.

import React from "react";
import { useNavigate } from "react-router-dom";

import { ago, fmtPct, fmtUsd, post, usePoll } from "../api";
import { HBar, Panel, Pri, Spark, Tip, toast } from "../components/ui";

export default function CommandCenter() {
  const { data, refresh } = usePoll<any>("/api/command-center", 5000);
  const nav = useNavigate();

  if (!data) return <p className="dim">Loading command center…</p>;
  const k = data.kpis;

  const ack = async (id: string) => {
    await post(`/api/events/${id}/ack`, { actor: "Jordan Hale" });
    toast("Event acknowledged");
    refresh();
  };
  const complete = async (id: string) => {
    await post(`/api/actions/${id}/complete`, { actor: "Jordan Hale", evidence: "Verified in command center" });
    toast("Action completed with evidence");
    refresh();
  };

  return (
    <div data-tour="page-command">
      <h1 className="page-title">Command Center</h1>
      <p className="page-sub">Are we on plan, where is the constraint, and who owns the next action?</p>
      <Tip>
        KPI cards with a <b>hover arrow</b> open their workspace. Click a <b>Constraint Radar</b> row to
        jump straight to that station.
      </Tip>

      <div className="kpi-strip" data-tour="cc-kpis">
        <div className="kpi linked" onClick={() => nav("/operate/production")}>
          <span className="k-hint">Production →</span>
          <div className="k-label">Actual vs Plan</div>
          <div className={`k-value ${k.actual_units >= k.plan_units * 0.95 ? "k-good" : "k-warn"}`}>
            {k.actual_units}<span className="dim" style={{ fontSize: 14 }}>/{k.plan_units}</span>
          </div>
          <div className="k-sub">units · shift A</div>
        </div>
        <div className="kpi">
          <div className="k-label">OEE</div>
          <div className={`k-value ${k.oee > 0.75 ? "k-good" : "k-warn"}`}>{fmtPct(k.oee)}</div>
          <Spark values={k.oee_trend.slice(-14)} height={26} />
        </div>
        <div className="kpi linked" onClick={() => nav("/quality")}>
          <span className="k-hint">Quality →</span>
          <div className="k-label">FPY</div>
          <div className={`k-value ${k.fpy > 0.95 ? "k-good" : "k-bad"}`}>{fmtPct(k.fpy)}</div>
          <Spark values={k.fpy_trend.slice(-14)} height={26} />
        </div>
        <div className="kpi linked" onClick={() => nav("/operate/twin")}>
          <span className="k-hint">Twin →</span>
          <div className="k-label">Open Stops</div>
          <div className={`k-value ${k.open_stops === 0 ? "k-good" : "k-bad"}`}>{k.open_stops}</div>
          <div className="k-sub">{data.abnormal_stations} of {data.total_stations} stations abnormal</div>
        </div>
        <div className="kpi linked" onClick={() => nav("/quality")}>
          <span className="k-hint">Quality →</span>
          <div className="k-label">Escapes MTD</div>
          <div className={`k-value ${k.escapes_mtd === 0 ? "k-good" : "k-bad"}`}>{k.escapes_mtd}</div>
          <div className="k-sub">customer escapes</div>
        </div>
        <div className="kpi linked" onClick={() => nav("/govern")}>
          <span className="k-hint">Proof Engine →</span>
          <div className="k-label">Money Saved Today</div>
          <div className="k-value k-good">{fmtUsd(k.money_saved_today_usd)}</div>
          <div className="k-sub">Proof Engine value ledger</div>
        </div>
      </div>

      <div className="grid cols-2">
        <div>
          <div data-tour="cc-radar">
          <Panel title="Constraint Radar · impact-ranked emerging losses">
            {data.constraint_radar.length === 0 && <p className="dim small">No emerging constraints detected.</p>}
            {data.constraint_radar.map((r: any) => (
              <div
                key={r.station_id}
                className="list-row clickable"
                style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}
                onClick={() => nav(`/operate/station/${r.station_id}`)}
                title="Open station workspace"
              >
                <div className="row between">
                  <strong style={{ fontSize: 13 }}>{r.station}</strong>
                  <span className="mono small k-bad">−{r.predicted_loss_units} units predicted</span>
                </div>
                <HBar label={r.state} value={r.impact_score} max={100} display={`impact ${r.impact_score}`} />
                <div className="small faint">{r.reasons.join(" · ")}</div>
              </div>
            ))}
          </Panel>
          </div>

          <div className="mt" />
          <Panel title="Action list · owned, due, evidence-closed">
            <table className="data">
              <thead><tr><th>Action</th><th>Owner</th><th>Pri</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {data.actions.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <div>{a.title}</div>
                      <div className="small faint">{a.context}</div>
                    </td>
                    <td>{a.owner}</td>
                    <td><Pri p={a.priority} /></td>
                    <td className="small dim">{a.status}</td>
                    <td>
                      {a.status !== "Completed" && (
                        <button className="btn ghost" onClick={() => complete(a.id)}>Complete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <div>
          <Panel
            title={<>AI Shift Brief <span className="faint">· {data.shift_brief.agent}</span></>}
          >
            <p style={{ fontSize: 14.5, fontWeight: 600, margin: "0 0 10px" }}>
              {data.shift_brief.headline}
            </p>
            {data.shift_brief.sections.map((s: any) => (
              <div key={s.title} style={{ marginBottom: 10 }}>
                <div className="small" style={{ fontWeight: 700, color: "var(--accent)" }}>{s.title}</div>
                <div style={{ fontSize: 13 }}>{s.body}</div>
                <div>
                  {s.evidence.map((e: string) => <span className="tag mono" key={e}>{e}</span>)}
                </div>
              </div>
            ))}
            <div className="audit-footer">
              Grounded summary · every claim links to source events · generated {ago(data.shift_brief.generated)}
            </div>
          </Panel>

          <div className="mt" />
          <Panel title="Priority queue · unowned P1 cannot be hidden">
            {data.events.map((e: any) => (
              <div key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="row between">
                  <span className="row" style={{ gap: 8 }}>
                    <Pri p={e.priority} />
                    <strong style={{ fontSize: 12.5 }}>{e.title}</strong>
                  </span>
                </div>
                <div className="row between mt" style={{ marginTop: 5 }}>
                  <span className="small faint">
                    {e.impact} · owner {e.owner} · {ago(e.created)}
                  </span>
                  {!e.acknowledged
                    ? <button className="btn ghost" onClick={() => ack(e.id)}>Acknowledge</button>
                    : <span className="small k-good">✓ acked</span>}
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      <div className="mt" />
      <Panel title="Output by hour · plan band">
        <div className="row" style={{ alignItems: "flex-end", gap: 6, height: 90 }}>
          {k.output_by_hour.map((v: number, i: number) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  width: "100%",
                  height: `${(v / 60) * 80}px`,
                  background: v >= k.plan_by_hour[i] ? "var(--state-running)" : "var(--state-starved)",
                  borderRadius: "3px 3px 0 0",
                  opacity: 0.85,
                }}
                title={`${v} units (plan ${k.plan_by_hour[i]})`}
              />
              <span className="small faint mono">{String(6 + i).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
