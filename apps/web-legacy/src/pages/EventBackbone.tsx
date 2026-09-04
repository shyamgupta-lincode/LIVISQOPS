// Event Backbone — topics, live stream, envelope inspector, replay, lag.

import React, { useState } from "react";

import { ago, usePoll } from "../api";
import { Panel, Tip } from "../components/ui";

export default function EventBackbone() {
  const { data: topics } = usePoll<any>("/api/backbone/topics", 30000);
  const { data: lag } = usePoll<any>("/api/backbone/lag", 5000);
  const [topic, setTopic] = useState<string>("");
  const { data: stream } = usePoll<any>(
    `/api/backbone/stream?limit=40${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`,
    4000,
  );
  const { data: replay } = usePoll<any>("/api/backbone/replay?from_seq=0&limit=30", 15000);
  const [sel, setSel] = useState<any | null>(null);

  const events = stream?.events || [];

  return (
    <div data-tour="page-backbone">
      <h1 className="page-title">Event Backbone</h1>
      <p className="page-sub">
        OT edge + IT systems publish into one envelope bus. Detection and agents consume
        candidates — not a single database with AI layered on top.
      </p>
      <Tip>
        Every envelope can carry an ObservationContext (plant→component, order/lot/serial,
        mode/cycle/phase, time triad, schema version, source-system ref).
      </Tip>

      <div className="kpi-strip">
        <div className="kpi">
          <div className="k-label">Head seq</div>
          <div className="k-value">{lag?.head_seq ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="k-label">Buffered</div>
          <div className="k-value">{lag?.buffered ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="k-label">Topics</div>
          <div className="k-value">{topics?.topics?.length ?? "—"}</div>
        </div>
        <div className="kpi">
          <div className="k-label">Bus health</div>
          <div className={`k-value ${lag?.healthy ? "k-good" : "k-bad"}`}>
            {lag?.healthy ? "OK" : "Degraded"}
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <Panel title="Topic catalog">
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <button className={`btn ghost ${!topic ? "active" : ""}`} onClick={() => setTopic("")}>All</button>
          </div>
          <table className="data">
            <thead><tr><th>Topic</th><th>Plane</th><th></th></tr></thead>
            <tbody>
              {(topics?.topics || []).map((t: any) => (
                <tr key={t.id}>
                  <td className="mono small">{t.id}</td>
                  <td className="small">{t.plane}</td>
                  <td><button className="btn ghost" onClick={() => setTopic(t.id)}>Filter</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title={`Live stream ${topic ? `· ${topic}` : ""}`}>
          {events.length === 0 && <p className="dim small">Waiting for envelopes…</p>}
          {events.slice().reverse().map((e: any) => (
            <div
              key={e.event_id}
              className="list-row clickable"
              style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
              onClick={() => setSel(e)}
            >
              <div className="row between">
                <span className="mono small">{e.topic}</span>
                <span className="small faint">#{e.seq} · {ago(e.ingested_at || e.produced_at)}</span>
              </div>
            </div>
          ))}
        </Panel>
      </div>

      <div className="mt" />
      <div className="grid cols-2">
        <Panel title="Replay (from seq 0)">
          <div className="small faint">{replay?.events?.length || 0} events available for consumer replay</div>
          <ul className="small" style={{ marginTop: 8 }}>
            {(replay?.events || []).slice(0, 8).map((e: any) => (
              <li key={e.event_id} className="mono">{e.seq} · {e.topic}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Envelope inspector">
          {!sel && <p className="dim small">Select a stream event</p>}
          {sel && (
            <pre className="mono small" style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>
              {JSON.stringify(sel, null, 2)}
            </pre>
          )}
        </Panel>
      </div>
    </div>
  );
}
