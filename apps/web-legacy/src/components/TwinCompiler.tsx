import React, { useEffect, useMemo, useState } from "react";

import { ago, post } from "../api";
import { Modal, toast } from "./ui";

const ARTIFACT_META: Record<string, { glyph: string; tone: string }> = {
  operator_guidance: { glyph: "▦", tone: "blue" },
  edge_state_machine: { glyph: "⧉", tone: "navy" },
  evidence_schema: { glyph: "◉", tone: "gold" },
  plc_handshake_tests: { glyph: "⚡", tone: "green" },
  simulation_scenario: { glyph: "◎", tone: "slate" },
};

type TwinCompilerProps = {
  workflowId: string | null;
  workflowName?: string;
  initialResult?: any;
  onClose: () => void;
  onCompiled?: (result: any) => void;
};

export function TwinCompiler({
  workflowId,
  workflowName,
  initialResult,
  onClose,
  onCompiled,
}: TwinCompilerProps) {
  const [phase, setPhase] = useState<"running" | "done" | "error">(
    initialResult ? "done" : "running"
  );
  const [result, setResult] = useState<any>(initialResult ?? null);
  const [stageIdx, setStageIdx] = useState(initialResult ? 99 : -1);
  const [activeKind, setActiveKind] = useState<string>(
    initialResult?.artifacts?.[0]?.kind ?? "operator_guidance"
  );
  const [error, setError] = useState<string | null>(null);

  const stages = useMemo(
    () =>
      result?.stages ?? [
        { id: "resolve", label: "Resolve design & station context", detail: "…" },
        { id: "guidance", label: "Generate operator guidance", detail: "…" },
        { id: "state_machine", label: "Compile edge state machine", detail: "…" },
        { id: "evidence", label: "Emit evidence schema", detail: "…" },
        { id: "handshake", label: "Run PLC handshake tests", detail: "…" },
        { id: "simulate", label: "Build simulation scenario", detail: "…" },
        { id: "sign", label: "Sign deployable package", detail: "…" },
      ],
    [result]
  );

  useEffect(() => {
    if (initialResult || !workflowId) return;
    let alive = true;
    let timers: number[] = [];

    const run = async () => {
      setPhase("running");
      setStageIdx(0);
      setError(null);

      // Staged progress while the request runs
      for (let i = 0; i < 6; i++) {
        timers.push(
          window.setTimeout(() => {
            if (alive) setStageIdx(i);
          }, 220 + i * 260)
        );
      }

      try {
        const res = await post(`/api/workflows/${workflowId}/compile`);
        if (!alive) return;
        setResult(res);
        setActiveKind(res.artifacts?.[0]?.kind ?? "operator_guidance");
        setStageIdx(res.stages?.length ?? 99);
        setPhase("done");
        onCompiled?.(res);
        toast("Twin package signed and ready");
      } catch (e: any) {
        if (!alive) return;
        setError(String(e?.message || e));
        setPhase("error");
        toast(String(e?.message || e));
      }
    };

    run();
    return () => {
      alive = false;
      timers.forEach((t) => clearTimeout(t));
    };
    // Intentionally omit onCompiled — parent may pass an unstable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, initialResult]);

  const active = result?.artifacts?.find((a: any) => a.kind === activeKind) ?? result?.artifacts?.[0];
  const title =
    phase === "running"
      ? "Executable Twin Compiler"
      : phase === "error"
        ? "Compile failed"
        : `Twin package · ${result?.package_id || "ready"}`;

  return (
    <Modal
      xl
      title={title}
      subtitle={
        workflowName || result?.workflow?.name
          ? `${workflowName || result?.workflow?.name} → operator guidance, edge runtime, evidence, handshake tests, simulation`
          : "One design becomes a signed, deployable twin package"
      }
      onClose={onClose}
      footer={
        <>
          <span className="small faint" style={{ marginRight: "auto" }}>
            {phase === "done" && result?.signature
              ? `Signed · ${result.signature.signer} · ${ago(result.signature.signed_at)}`
              : phase === "running"
                ? "Compiling deployable twin…"
                : null}
          </span>
          <button type="button" className="btn ghost" onClick={onClose}>
            {phase === "done" ? "Close" : "Cancel"}
          </button>
          {phase === "done" && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                toast(`Package ${result.package_id} queued for edge deploy`);
                onClose();
              }}
            >
              Deploy to edge →
            </button>
          )}
        </>
      }
    >
      {phase === "running" && (
        <div className="twin-run">
          <div className="twin-run-hero">
            <div className="twin-run-orb" aria-hidden>
              <span />
            </div>
            <div>
              <h3>Compiling executable twin</h3>
              <p>
                Binding work instruction steps to edge state, evidence contracts and allowlisted PLC
                handshakes. Safety logic cannot be authored here.
              </p>
            </div>
          </div>
          <ol className="twin-stages">
            {stages.map((s: any, i: number) => {
              const state = i < stageIdx ? "done" : i === stageIdx ? "active" : "todo";
              return (
                <li key={s.id} className={state}>
                  <span className="twin-stage-mark">
                    {state === "done" ? "✓" : state === "active" ? "●" : "○"}
                  </span>
                  <div>
                    <strong>{s.label}</strong>
                    <em>{s.detail}</em>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {phase === "error" && (
        <div className="twin-error">
          <strong>Compile could not finish</strong>
          <p>{error}</p>
        </div>
      )}

      {phase === "done" && result && (
        <TwinCompilerResult
          result={result}
          activeKind={active?.kind ?? activeKind}
          onSelectKind={setActiveKind}
          active={active}
        />
      )}
    </Modal>
  );
}

function TwinCompilerResult({
  result,
  activeKind,
  onSelectKind,
  active,
}: {
  result: any;
  activeKind: string;
  onSelectKind: (k: string) => void;
  active: any;
}) {
  const sum = result.summary || {};
  return (
    <div className="twin-result">
      <div className="twin-summary">
        <div>
          <span className="faint">Instruction</span>
          <strong>{result.instruction?.name || result.workflow?.name}</strong>
          <em className="mono">{result.instruction?.id} · {result.instruction?.version}</em>
        </div>
        <div>
          <span className="faint">Station</span>
          <strong>{sum.station || result.instruction?.station_name || "—"}</strong>
        </div>
        <div>
          <span className="faint">Artifacts</span>
          <strong>{sum.artifacts ?? result.artifacts?.length ?? 0}</strong>
        </div>
        <div>
          <span className="faint">Handshake</span>
          <strong className="k-good">
            {sum.tests_passed ?? 0}/{sum.tests_total ?? 0}
          </strong>
        </div>
        <div>
          <span className="faint">Compile</span>
          <strong className="mono">{sum.duration_ms ? `${sum.duration_ms} ms` : "—"}</strong>
        </div>
      </div>

      <div className="twin-layout">
        <nav className="twin-art-nav" aria-label="Compiler artifacts">
          {result.artifacts.map((a: any) => {
            const meta = ARTIFACT_META[a.kind] || { glyph: "■", tone: "slate" };
            return (
              <button
                key={a.kind}
                type="button"
                className={`twin-art-btn tone-${meta.tone} ${a.kind === activeKind ? "on" : ""}`}
                onClick={() => onSelectKind(a.kind)}
              >
                <span className="twin-art-glyph">{meta.glyph}</span>
                <span className="twin-art-copy">
                  <strong>{a.label || a.kind.replace(/_/g, " ")}</strong>
                  <em>{a.status}</em>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="twin-art-pane">
          {active && (
            <>
              <div className="twin-art-head">
                <div>
                  <h3>{active.label}</h3>
                  <p>{active.blurb}</p>
                </div>
                <code className="mono">{active.ref}</code>
              </div>
              <ArtifactPreview kind={active.kind} preview={active.preview} />
            </>
          )}
        </div>
      </div>

      <div className="twin-sign">
        <span className="twin-sign-seal" aria-hidden>✓</span>
        <div>
          <strong>Package signed</strong>
          <div className="small faint">
            {result.signature?.algorithm} · {result.signature?.digest} · {result.package_id}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtifactPreview({ kind, preview }: { kind: string; preview: any }) {
  if (!preview) return <p className="small faint">No preview</p>;

  if (kind === "operator_guidance") {
    return (
      <div className="twin-preview-list">
        {(preview.steps || []).map((s: any) => (
          <div key={s.seq} className="twin-preview-row">
            <span className="mono faint">{s.seq}</span>
            <div>
              <strong>{s.title}</strong>
              <em>{s.prompt || s.criteria}</em>
            </div>
            {s.evidence_required ? (
              <span className="tag" style={{ color: "var(--accent)" }}>evidence</span>
            ) : (
              <span className="tag">optional</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (kind === "edge_state_machine") {
    const nodes = preview.nodes || [];
    return (
      <div className="twin-sm">
        <div className="twin-sm-flow">
          {nodes.map((n: any, i: number) => (
            <React.Fragment key={n.id}>
              <div className={`twin-sm-node type-${n.type}`}>
                <span>{n.label}</span>
                {n.kind && <em>{n.kind}{n.evidence ? " · evidence" : ""}</em>}
              </div>
              {i < nodes.length - 1 && <span className="twin-sm-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="twin-preview-list compact">
          {(preview.edges || []).map((e: any) => (
            <div key={`${e.from}-${e.to}`} className="twin-preview-row">
              <span className="mono faint">{e.from}</span>
              <div>
                <strong>on {e.on}</strong>
                <em>→ {e.to}</em>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "evidence_schema") {
    return (
      <table className="data twin-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Source</th>
            <th>Required</th>
          </tr>
        </thead>
        <tbody>
          {(preview.fields || []).map((f: any) => (
            <tr key={f.key}>
              <td className="mono">{f.key}</td>
              <td>{f.type}</td>
              <td className="small dim">{f.source || (f.values || []).join(" / ") || "—"}</td>
              <td>{f.required ? <span className="k-good">yes</span> : <span className="faint">no</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (kind === "plc_handshake_tests") {
    return (
      <div>
        <div className="twin-test-banner">
          <strong className="k-good">
            {preview.passed}/{preview.total} passed
          </strong>
          <span className="small faint">Allowlisted contracts only — safety logic not writable</span>
        </div>
        <div className="twin-preview-list compact">
          {(preview.tests || []).map((t: any) => (
            <div key={t.id} className="twin-preview-row">
              <span className="mono faint">{t.id}</span>
              <div>
                <strong>{t.name}</strong>
                <em>{t.latency_ms} ms</em>
              </div>
              <span className="k-good">pass</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "simulation_scenario") {
    return (
      <div className="twin-sim">
        <div className="twin-sim-grid">
          <div>
            <span className="faint">Scenario</span>
            <strong className="mono">{preview.scenario}</strong>
          </div>
          <div>
            <span className="faint">Takt</span>
            <strong>{preview.takt_s}s</strong>
          </div>
          <div>
            <span className="faint">Units</span>
            <strong>{preview.units}</strong>
          </div>
          <div>
            <span className="faint">Expected OEE Δ</span>
            <strong className="k-good">+{preview.expected_oee_delta} pts</strong>
          </div>
        </div>
        <div className="twin-sim-paths">
          {(preview.paths || []).map((p: string) => (
            <span key={p} className="tag">{p.replace(/_/g, " ")}</span>
          ))}
        </div>
      </div>
    );
  }

  return <pre className="twin-json">{JSON.stringify(preview, null, 2)}</pre>;
}

export default TwinCompiler;
