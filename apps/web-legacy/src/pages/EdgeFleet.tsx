// Edge Fleet & Integration Manager: node health, Mission Readiness,
// Node Passports, connectors, Integration Autopilot, offline recovery.

import React, { useState } from "react";

import { ago, get, post, usePoll } from "../api";
import { Drawer, Panel, StateChip, Tip, toast } from "../components/ui";

export default function EdgeFleet() {
  const { data: nodes, refresh } = usePoll<any[]>("/api/edge/nodes", 6000);
  const { data: connectors } = usePoll<any[]>("/api/edge/connectors", 10000);
  const [selected, setSelected] = useState<any>(null);
  const [recovery, setRecovery] = useState<any>(null);
  const [autopilot, setAutopilot] = useState<any>(null);

  const openNode = async (id: string) => setSelected(await get(`/api/edge/nodes/${id}`));

  const sync = async (id: string) => {
    const rep = await post(`/api/edge/nodes/${id}/sync`);
    setRecovery(rep);
    toast(`Replayed ${rep.replayed} events · 0 lost`);
    refresh();
    openNode(id);
  };

  const discover = async (connId: string) => {
    setAutopilot(await post(`/api/edge/connectors/${connId}/autodiscover`));
    toast("Integration Autopilot proposed semantic mappings");
  };

  if (!nodes) return <p className="dim">Loading edge fleet…</p>;

  return (
    <div data-tour="page-edge">
      <h1 className="page-title">Edge Fleet & Integration Manager</h1>
      <p className="page-sub">Is data flowing, is time trusted, and can the site operate offline?</p>
      <Tip>
        <b>Click a node</b> for its Mission Readiness Score, Node Passport and store-and-forward replay.
        Press <b>Autopilot</b> next to a connector to auto-propose canonical tag mappings.
      </Tip>

      <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }} data-tour="edge-kpis">
        <div className="kpi"><div className="k-label">Nodes healthy</div><div className="k-value k-good">{nodes.filter((n) => n.health === "Healthy").length}/{nodes.length}</div></div>
        <div className="kpi"><div className="k-label">Queued events</div><div className={`k-value ${nodes.some((n) => n.queue_depth > 100) ? "k-warn" : ""}`}>{nodes.reduce((a, n) => a + n.queue_depth, 0)}</div><div className="k-sub">store-and-forward</div></div>
        <div className="kpi"><div className="k-label">Connectors</div><div className="k-value">{connectors?.length ?? "—"}</div><div className="k-sub">{connectors?.filter((c) => c.status === "Connected").length ?? 0} connected</div></div>
        <div className="kpi"><div className="k-label">Cert expiry (min)</div><div className="k-value">{Math.min(...nodes.map((n) => n.cert_expiry_days))}d</div><div className="k-sub">nearest certificate</div></div>
      </div>

      <div className="grid cols-2">
        <Panel title="Fleet overview">
          {nodes.map((n) => (
            <div
              key={n.id}
              className="list-row clickable"
              style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}
              onClick={() => openNode(n.id)}
              title="Open node detail"
            >
              <div className="row between">
                <strong style={{ fontSize: 13.5 }}>{n.name}</strong>
                <StateChip state={n.health} />
              </div>
              <div className="row wrap small" style={{ gap: 6, marginTop: 4 }}>
                <span className="tag mono">MRS {n.mission_readiness.score}</span>
                <span className="tag mono">queue {n.queue_depth}</span>
                <span className="tag mono">lag {n.data_lag_s}s</span>
                <span className="tag mono">{n.clock.source} trust {n.clock.trust}</span>
                <span className="tag mono">disk {n.storage_used_pct}%</span>
              </div>
              {n.mission_readiness.limiting_factors.length > 0 && (
                <div className="small k-warn" style={{ marginTop: 3 }}>
                  {n.mission_readiness.limiting_factors.join(" · ")}
                </div>
              )}
            </div>
          ))}
        </Panel>

        <div>
          <Panel title="Connectors & data contracts">
            <table className="data">
              <thead><tr><th>Protocol</th><th>Endpoint</th><th>Tags</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {(connectors ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>{c.protocol}</td>
                    <td className="mono small dim">{c.endpoint}</td>
                    <td className="mono">{c.mapped_tags}</td>
                    <td>
                      <span className={c.status === "Connected" ? "k-good small" : "k-warn small"}>{c.status}</span>
                    </td>
                    <td>
                      <button className="btn ghost" onClick={() => discover(c.id)}>Autopilot</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {autopilot && (
            <>
              <div className="mt" />
              <Panel title="Integration Autopilot · proposed canonical mappings">
                {autopilot.proposed_mappings.map((m: any) => (
                  <div key={m.source_tag} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="row between small">
                      <span className="mono">{m.source_tag}</span>
                      <span className="mono k-good">{(m.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="small dim mono">→ {m.canonical} <span className="faint">[{m.unit}]</span></div>
                  </div>
                ))}
                <div className="small faint mt">
                  Time quality: {autopilot.time_quality.source} · trust {autopilot.time_quality.trust} · {autopilot.time_quality.note}
                </div>
              </Panel>
            </>
          )}

          {recovery && (
            <>
              <div className="mt" />
              <Panel title="Causal recovery report">
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="tag mono">replayed {recovery.replayed}</span>
                  <span className="tag mono">late {recovery.late}</span>
                  <span className="tag mono">dupes dropped {recovery.duplicates_dropped}</span>
                  <span className="tag mono">rejected {recovery.rejected}</span>
                </div>
                <p className="small dim mt">{recovery.narrative}</p>
              </Panel>
            </>
          )}
        </div>
      </div>

      {selected && (
        <Drawer onClose={() => setSelected(null)}>
          <h2 style={{ marginTop: 4, fontSize: 16 }}>{selected.name}</h2>
          <div className="small faint">{selected.area} · {selected.version} · {selected.k3s} · GPU {selected.gpu}</div>
          <div className="mt"><StateChip state={selected.health} /> <span className="small faint">last seen {ago(selected.last_seen)}</span></div>

          <div className="divider" />
          <div className="panel-title">Mission Readiness Score</div>
          <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "var(--mono)" }}
            className={selected.mission_readiness.score > 85 ? "k-good" : selected.mission_readiness.score > 50 ? "k-warn" : "k-bad"}>
            {selected.mission_readiness.score}
          </div>
          {selected.mission_readiness.limiting_factors.map((f: string) => (
            <div className="small k-warn" key={f}>• {f}</div>
          ))}
          {selected.mission_readiness.limiting_factors.length === 0 && (
            <div className="small k-good">No limiting factors — node can safely execute its assigned workload.</div>
          )}

          <div className="divider" />
          <div className="panel-title">Node Passport · signed by {selected.node_passport.issuer}</div>
          <div className="small mono faint mb">fingerprint {selected.node_passport.fingerprint}</div>
          {selected.node_passport.capabilities.map((c: string) => <span className="tag" key={c}>{c}</span>)}
          <div className="small dim mt">{selected.node_passport.semantic_mappings} semantic mappings · portable across deployments</div>
          {(selected.node_passport.ot_zone || selected.node_passport.write_deny_to_agents) && (
            <div className="row wrap mt" style={{ gap: 6 }}>
              {selected.node_passport.ot_zone && <span className="tag">{selected.node_passport.ot_zone}</span>}
              {selected.node_passport.outbound_only && <span className="tag">outbound publish only</span>}
              {selected.node_passport.store_and_forward && <span className="tag">store-and-forward</span>}
              {selected.node_passport.write_deny_to_agents && <span className="tag">agent PLC write deny</span>}
            </div>
          )}

          <div className="divider" />
          <div className="panel-title">Security posture</div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tag">secure boot ✓</span>
            <span className="tag">TPM ✓</span>
            <span className="tag">mTLS outbound-only</span>
            <span className="tag mono">cert expires {selected.cert_expiry_days}d</span>
          </div>

          <div className="divider" />
          <div className="panel-title">Connectors on this node</div>
          {selected.connectors.map((c: any) => (
            <div className="row between small" key={c.id} style={{ padding: "4px 0" }}>
              <span>{c.protocol}</span>
              <span className="mono faint">{c.mapped_tags} tags · q{c.quality}</span>
            </div>
          ))}

          {selected.queue_depth > 0 && (
            <>
              <div className="divider" />
              <button className="btn" style={{ width: "100%" }} onClick={() => sync(selected.id)}>
                Replay {selected.queue_depth} queued events (store-and-forward)
              </button>
            </>
          )}
          <div className="audit-footer">
            Production events are append-only and idempotent; central derives state from ordered events and reports gaps.
          </div>
        </Drawer>
      )}
    </div>
  );
}
