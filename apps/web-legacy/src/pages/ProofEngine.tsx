// Proof Engine: Value Ledger, executive dashboard (dollars not precision/recall),
// Continuous Value Validation stages.

import React from "react";

import { fmtUsd, usePoll } from "../api";
import { HBar, Panel, Tip } from "../components/ui";

export default function ProofEngine() {
  const { data: summary } = usePoll<any>("/api/value/summary", 6000);
  const { data: daily } = usePoll<any[]>("/api/value/daily", 15000);
  const { data: cvv } = usePoll<any>("/api/value/cvv", 0);

  if (!summary) return <p className="dim">Loading Proof Engine…</p>;

  const maxCat = Math.max(...summary.by_category.map((c: any) => c.value_usd));
  const maxWf = Math.max(...summary.by_workflow.map((w: any) => w.value_usd));
  const maxDay = daily ? Math.max(...daily.map((d) => d.value_usd)) : 1;

  return (
    <div data-tour="page-proof">
      <h1 className="page-title">Proof Engine · Value Ledger</h1>
      <p className="page-sub">
        Not "is the AI accurate?" but "how much value has the AI created today?" Every entry links to evidence.
      </p>
      <Tip>
        Read top-to-bottom: <b>today's live counters</b>, then value split <b>by category and workflow</b>,
        then the <b>CVV lifecycle</b> showing how the pilot earned autonomy. Hover the daily bars for exact values.
      </Tip>

      <div className="kpi-strip" data-tour="proof-kpis">
        <div className="kpi"><div className="k-label">Money Saved Today</div><div className="k-value k-good">{fmtUsd(summary.money_saved_today_usd)}</div><div className="k-sub">live counter</div></div>
        <div className="kpi"><div className="k-label">Hours Saved Today</div><div className="k-value">{summary.hours_saved_today}</div><div className="k-sub">operator + engineering</div></div>
        <div className="kpi"><div className="k-label">Scrap Prevented</div><div className="k-value">{summary.scrap_prevented_today}</div><div className="k-sub">units today</div></div>
        <div className="kpi"><div className="k-label">CO₂ Saved</div><div className="k-value">{summary.co2_saved_kg}kg</div><div className="k-sub">today</div></div>
        <div className="kpi"><div className="k-label">Time to Payback</div><div className="k-value k-good">{summary.payback_months}mo</div><div className="k-sub">measured, not promised</div></div>
        <div className="kpi"><div className="k-label">Projected Annual</div><div className="k-value k-good">{fmtUsd(summary.projected_annual_value_usd)}</div><div className="k-sub">from 21-day run rate</div></div>
      </div>

      <div className="grid cols-2">
        <div>
          <Panel title={`Value by category · last ${summary.period_days} days · total ${fmtUsd(summary.total_value_usd)}`}>
            {summary.by_category.map((c: any) => (
              <HBar
                key={c.category}
                label={c.category}
                value={c.value_usd}
                max={maxCat}
                display={fmtUsd(c.value_usd)}
              />
            ))}
          </Panel>

          <div className="mt" />
          <Panel title="Value by ROI workflow">
            {summary.by_workflow.map((w: any) => (
              <HBar key={w.workflow} label={w.workflow} value={w.value_usd} max={maxWf} display={fmtUsd(w.value_usd)} />
            ))}
            <div className="audit-footer">
              Workflows 1–10 from the blueprint: part inspection, process monitoring, work instructions,
              predictive maintenance, OT integration, vision model reuse, RCA, twin health, AI supervisor, executive value.
            </div>
          </Panel>
        </div>

        <div>
          <Panel title="Daily value · cumulative financial benefit">
            <div className="row" style={{ alignItems: "flex-end", gap: 3, height: 110 }}>
              {(daily ?? []).map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${fmtUsd(d.value_usd)} (cum ${fmtUsd(d.cumulative_usd)})`}
                  style={{
                    flex: 1,
                    height: `${(d.value_usd / maxDay) * 100}%`,
                    background: "var(--accent)",
                    opacity: 0.8,
                    borderRadius: "2px 2px 0 0",
                  }}
                />
              ))}
            </div>
            <div className="small faint mt">
              {daily && daily.length > 0 && (
                <>Cumulative {fmtUsd(daily[daily.length - 1].cumulative_usd)} over {daily.length} days</>
              )}
            </div>
          </Panel>

          <div className="mt" />
          {cvv && (
            <Panel title="Continuous Value Validation · pilot lifecycle">
              <div className="small dim mb">
                <strong>Hypothesis:</strong> {cvv.value_hypothesis.business_problem}
              </div>
              <div className="timeline">
                {cvv.stages.map((s: any) => (
                  <div className={`timeline-item ${s.status === "Complete" ? "done" : ""}`} key={s.stage}>
                    <div className="row between">
                      <strong style={{ fontSize: 13 }}>{s.stage}</strong>
                      <span className="tag">{s.status} · {s.duration}</span>
                    </div>
                    <div className="small dim">{s.detail}</div>
                    {s.metrics && (
                      <div className="row wrap" style={{ gap: 4, marginTop: 3 }}>
                        {Object.entries(s.metrics).map(([k, v]: [string, any]) => (
                          <span className="tag mono" key={k}>{k.replace(/_/g, " ")}: {v}</span>
                        ))}
                      </div>
                    )}
                    {s.policy && (
                      <div className="small faint">
                        auto-accept &gt;{s.policy.auto_accept_above} · review {s.policy.review_band.join("–")} · escalate &lt;{s.policy.escalate_below}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="audit-footer">
                Baseline → Digital Shadow → Assisted → Autonomous. Every disagreement in assisted mode became training data.
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
