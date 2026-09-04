// Assets: hierarchy, station health scores, device inventory,
// Context-on-Click service lens.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ago, usePoll } from "../api";
import { Panel, StateChip, Tip } from "../components/ui";

export default function Assets() {
  const { data: topo } = usePoll<any>("/api/topology", 8000);
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const nav = useNavigate();

  const rows = useMemo(() => {
    if (!topo) return [];
    return topo.areas
      .filter((a: any) => areaFilter === "all" || a.id === areaFilter)
      .flatMap((a: any) =>
        a.lines.flatMap((l: any) =>
          l.stations.map((s: any) => ({ ...s, areaName: a.name, lineName: l.name }))
        )
      );
  }, [topo, areaFilter]);

  if (!topo) return <p className="dim">Loading assets…</p>;

  const healthScore = (s: any) =>
    (s.health.availability + s.health.quality + s.health.performance) / 3;

  const leaking = [...rows].sort((a: any, b: any) => healthScore(a) - healthScore(b)).slice(0, 5);

  return (
    <div data-tour="page-assets">
      <div className="row between">
        <div>
          <h1 className="page-title">Assets</h1>
          <p className="page-sub">Asset hierarchy, health and maintenance context. The plant manager immediately sees where money is leaking.</p>
        </div>
        <select className="field" style={{ width: 220 }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          <option value="all">All areas</option>
          {topo.areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <Tip>
        <b>Click any card or row</b> to open that station's live workspace in Operate.
        Health scores blend availability, quality and performance.
      </Tip>

      <div data-tour="assets-leaks">
      <Panel title="Where money is leaking · lowest composite health">
        <div className="grid cols-4" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          {leaking.map((s: any) => (
            <div
              key={s.id}
              className="panel"
              style={{ cursor: "pointer", borderColor: healthScore(s) < 0.9 ? "var(--state-faulted)" : "var(--border)" }}
              onClick={() => nav(`/operate/station/${s.id}`)}
              title="Open station workspace"
            >
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>{s.name}</div>
              <div className="small faint">{s.lineName}</div>
              <div
                style={{ fontSize: 26, fontWeight: 800, fontFamily: "var(--mono)", marginTop: 6 }}
                className={healthScore(s) > 0.93 ? "k-good" : healthScore(s) > 0.88 ? "k-warn" : "k-bad"}
              >
                {(healthScore(s) * 100).toFixed(0)}
              </div>
              <StateChip state={s.state} />
            </div>
          ))}
        </div>
      </Panel>
      </div>

      <div className="mt" />
      <div data-tour="assets-registry">
      <Panel title={`Station registry · ${rows.length} stations`}>
        <table className="data">
          <thead>
            <tr>
              <th>Station</th><th>Area / Line</th><th>State</th>
              <th>Avail</th><th>Quality</th><th>Perf</th><th>AI Conf</th><th>Safety</th><th>Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s: any) => (
              <tr key={s.id} className="clickable" onClick={() => nav(`/operate/station/${s.id}`)}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td className="small dim">{s.areaName} · {s.lineName}</td>
                <td><StateChip state={s.state} /></td>
                {(["availability", "quality", "performance", "ai_confidence", "safety"] as const).map((k) => (
                  <td key={k} className={`mono ${s.health[k] > 0.95 ? "k-good" : s.health[k] > 0.88 ? "" : "k-warn"}`}>
                    {(s.health[k] * 100).toFixed(1)}
                  </td>
                ))}
                <td className="small faint">{ago(s.state_since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      </div>
    </div>
  );
}
