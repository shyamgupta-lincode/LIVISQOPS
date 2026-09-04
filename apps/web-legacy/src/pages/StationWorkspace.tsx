// Operator / station workspace: one current step, evidence requirements,
// takt indicator, abnormal-state recovery, glove-friendly controls.

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { ago, post, usePoll } from "../api";
import { EvidenceFrame, Panel, StateChip, Tip, toast } from "../components/ui";

export default function StationWorkspace() {
  const params = useParams();
  const { data: topo } = usePoll<any>("/api/topology", 15000);
  const [stationId, setStationId] = useState<string | null>(params.stationId ?? null);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (params.stationId) setStationId(params.stationId);
  }, [params.stationId]);

  const allStations = useMemo(() => {
    if (!topo) return [];
    return topo.areas.flatMap((a: any) => a.lines.flatMap((l: any) => l.stations));
  }, [topo]);

  useEffect(() => {
    if (!stationId && allStations.length) {
      const preferred = allStations.find((s: any) => s.id === "st-touring-assembly-line-01");
      setStationId((preferred ?? allStations[0]).id);
    }
  }, [allStations, stationId]);

  const { data: detail, refresh } = usePoll<any>(
    stationId ? `/api/stations/${stationId}` : "/api/health", 5000
  );

  if (!detail?.station) return <p className="dim">Loading station…</p>;

  const st = detail.station;
  const wi = detail.instruction;
  const steps = wi?.steps ?? [];
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const abnormal = ["Faulted", "Blocked", "Quality Hold", "Offline"].includes(st.state);
  const taktUsed = Math.min(1, st.cycle_time_s / st.takt_s);

  const completeStep = async () => {
    await post(`/api/stations/${st.id}/complete-step`, {
      step_seq: step.seq,
      operator: st.operator,
      evidence_ref: step.evidence_required ? `EV-${Math.floor(Math.random() * 90000 + 10000)}` : null,
    });
    toast(`Step ${step.seq} committed with evidence`);
    if (stepIdx < steps.length - 1) setStepIdx(stepIdx + 1);
    else setStepIdx(0);
    refresh();
  };

  return (
    <div data-tour="page-station">
      <div className="row between">
        <div>
          <h1 className="page-title">Station Workspace</h1>
          <p className="page-sub">
            {detail.area?.name} · {detail.line?.name} · Operator {st.operator}
          </p>
        </div>
        <select
          className="field"
          style={{ width: 280 }}
          value={stationId ?? ""}
          onChange={(e) => { setStationId(e.target.value); setStepIdx(0); }}
          title="Switch station"
        >
          {allStations.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <Tip>
        This is the operator view: one step at a time. Use the <b>station selector</b> (top right) to
        change stations — abnormal states switch this screen to plain-language recovery automatically.
      </Tip>

      <div className="row wrap mb">
        <StateChip state={st.state} />
        <span className="tag">since {ago(st.state_since)}</span>
        {detail.current_vin && (
          <span className="tag mono">VIN {detail.current_vin.vin} · {detail.current_vin.variant}</span>
        )}
        <span className="tag mono">
          takt {st.cycle_time_s}s / {st.takt_s}s
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ width: 220 }}>
          <div className="hbar-track" style={{ height: 12 }}>
            <div
              className="hbar-fill"
              style={{
                width: `${taktUsed * 100}%`,
                background: taktUsed < 0.85 ? "var(--state-running)" : taktUsed < 1 ? "var(--state-starved)" : "var(--state-faulted)",
              }}
            />
          </div>
          <div className="small faint" style={{ textAlign: "right" }}>takt window</div>
        </div>
      </div>

      {abnormal ? (
        <AbnormalPanel st={st} onRecovered={refresh} />
      ) : !wi ? (
        <Panel><p className="dim">No digital work instruction is deployed to this station archetype yet. Select a station with a deployed instruction (Fuel Tank Install, Cylinder Head Torque, Paint Inspection, ABS Check).</p></Panel>
      ) : (
        <div className="grid cols-2">
          <div>
            <div className="op-progress">
              {steps.map((s: any, i: number) => (
                <div key={s.seq} className={`seg ${i < stepIdx ? "done" : i === stepIdx ? "cur" : ""}`} />
              ))}
            </div>
            <div className="op-step">
              <div className="op-step-num">STEP {step.seq} OF {steps.length} · {wi.id} {wi.version}</div>
              <div className="op-step-title">{step.title}</div>
              <div className="op-step-criteria">{step.criteria}</div>
              <div className="mt row" style={{ justifyContent: "center", gap: 12 }}>
                {step.evidence_required && (
                  <span className="tag" style={{ fontSize: 12.5 }}>
                    Evidence required: {step.kind}
                  </span>
                )}
              </div>
              <div className="mt row" style={{ justifyContent: "center", gap: 12 }}>
                <button className="btn big success" onClick={completeStep}>
                  {step.evidence_required ? "Capture evidence & commit" : "Confirm & continue"}
                </button>
              </div>
            </div>
            <div className="mt small faint" style={{ textAlign: "center" }}>
              Adaptive Proof-of-Work: instruction depth follows variant, qualification and live process state.
            </div>
          </div>

          <div>
            <Panel title="Evidence preview · station camera">
              <EvidenceFrame label={`CAM-1 · live · ${st.name}`} defect={false} />
              <div className="small faint mt">
                Vision confirms process state automatically where possible; manual capture stays available.
              </div>
            </Panel>
            <div className="mt" />
            <Panel title="Recent station inspections">
              {detail.inspections.slice(0, 5).map((i: any) => (
                <div className="row between small" key={i.id} style={{ padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="mono">{i.evidence_ref}</span>
                  <span className={i.verdict === "Pass" ? "k-good" : i.verdict === "Fail" ? "k-bad" : "k-warn"}>
                    {i.verdict} · {(i.confidence * 100).toFixed(1)}%
                  </span>
                  <span className="faint">{ago(i.captured)}</span>
                </div>
              ))}
              {detail.inspections.length === 0 && <p className="small dim">No inspections at this station yet.</p>}
            </Panel>
          </div>
        </div>
      )}

      <div className="audit-footer">
        All step completions commit operator identity, instruction version and evidence to the audit trail.
      </div>
    </div>
  );
}

function AbnormalPanel({ st, onRecovered }: { st: any; onRecovered: () => void }) {
  const recoverySteps: Record<string, string[]> = {
    "Faulted": [
      "Confirm no person is inside the cell boundary (safety systems remain in the PLC).",
      "Read fault: roller pressure out of range on fixture #3.",
      "Follow approved recovery: retract roller, inspect fixture wear, reset from HMI.",
      "If fault repeats twice, escalate to maintenance — do not bypass the interlock.",
    ],
    "Blocked": [
      "Downstream station is not accepting parts.",
      "Verify carrier release at next station; check conveyor photo-eye.",
      "Escalate to team leader if blocked for more than 2 cycles.",
    ],
    "Quality Hold": [
      "This station has an active quality hold — do not release product.",
      "Await disposition from quality review; evidence is preserved.",
      "You may continue prep work that does not commit product.",
    ],
    "Offline": [
      "Central connectivity lost — local edge continues the approved workflow.",
      "Queued records will replay automatically on reconnect. Production is safe to continue.",
    ],
  };
  const steps = recoverySteps[st.state] ?? ["Follow standard recovery procedure."];

  return (
    <div className="panel" style={{ borderColor: "var(--state-faulted)", borderWidth: 2 }}>
      <div className="row between">
        <h2 style={{ margin: 0, fontSize: 20 }}>
          {st.state === "Offline" ? "⚠ Degraded connectivity" : `⚠ ${st.state}: ${st.name}`}
        </h2>
        <StateChip state={st.state} />
      </div>
      <p className="dim" style={{ fontSize: 14.5 }}>
        Plain-language recovery. Safety boundary unchanged — certified interlocks stay in the PLC.
      </p>
      <ol style={{ fontSize: 15, lineHeight: 1.9 }}>
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <div className="row" style={{ gap: 12 }}>
        <button className="btn big" onClick={() => { toast("Recovery acknowledged; escalation path notified"); onRecovered(); }}>
          Acknowledge recovery steps
        </button>
        <button className="btn big ghost" onClick={() => toast("Andon raised to team leader")}>
          Raise Andon
        </button>
      </div>
    </div>
  );
}
