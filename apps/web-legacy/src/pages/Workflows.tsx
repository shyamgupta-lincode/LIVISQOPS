// Work Instruction & Interlock Builder — guided wizard (define → steps → evidence → validate → deploy).

import React, { useMemo, useState } from "react";

import { ago, post, usePoll } from "../api";
import TwinCompiler from "../components/TwinCompiler";
import { Drawer, Modal, Panel, Tip, toast } from "../components/ui";

const STEP_KINDS = ["scan", "pick", "manual", "tool", "vision", "confirm", "review"] as const;
const STEP_ICONS: Record<string, string> = {
  scan: "▤", pick: "✋", manual: "✎", tool: "🔧", vision: "◉",
  confirm: "✓", review: "👁",
};

const TEMPLATES = [
  { id: "presence", label: "Part presence / mix-up", steps: [
    { kind: "scan", title: "Scan VIN / build sheet", criteria: "Barcode matches dispatch order", evidence_required: true },
    { kind: "pick", title: "Confirm part presence", criteria: "Correct PN in nest; no mix-up", evidence_required: true },
    { kind: "confirm", title: "Operator confirm", criteria: "Ack before release", evidence_required: false },
  ]},
  { id: "torque", label: "Torque station", steps: [
    { kind: "scan", title: "Identify joint set", criteria: "Tool program matches WI", evidence_required: true },
    { kind: "tool", title: "Run torque sequence", criteria: "Nm + angle within window", evidence_required: true },
    { kind: "confirm", title: "Trace upload", criteria: "Curve stored to genealogy", evidence_required: true },
  ]},
  { id: "surface", label: "Surface inspection", steps: [
    { kind: "vision", title: "Capture inspection frame", criteria: "Lighting & ROI valid", evidence_required: true },
    { kind: "review", title: "Disposition", criteria: "Pass / rework / scrap with reason", evidence_required: true },
  ]},
  { id: "weld", label: "Weld verification", steps: [
    { kind: "manual", title: "Position frame", criteria: "Fixture sensors closed", evidence_required: false },
    { kind: "vision", title: "Weld bead check", criteria: "Bead continuity score ≥ gate", evidence_required: true },
    { kind: "confirm", title: "Release to next", criteria: "No open NC", evidence_required: false },
  ]},
  { id: "eol", label: "Leak / EOL test", steps: [
    { kind: "tool", title: "Pressure / functional test", criteria: "Within recipe limits", evidence_required: true },
    { kind: "confirm", title: "Print / mark result", criteria: "Result bound to VIN", evidence_required: true },
  ]},
  { id: "sequence", label: "Operator sequence", steps: [
    { kind: "manual", title: "Perform sequence step", criteria: "Follow standard work", evidence_required: false },
    { kind: "confirm", title: "Step complete", criteria: "Takt gate cleared", evidence_required: false },
  ]},
];

type DraftStep = {
  seq: number;
  kind: string;
  title: string;
  criteria: string;
  evidence_required: boolean;
};

type Draft = {
  name: string;
  station_id: string;
  template_id: string;
  version: string;
  target_instruction: string;
  workflow_id: string | null;
  steps: DraftStep[];
  evidence_policy: string;
  interlock_notes: string;
  handshake_required: boolean;
};

const WIZARD_STEPS = [
  { key: "basics", label: "Basics", blurb: "Name, station, template" },
  { key: "compose", label: "Compose", blurb: "Build step sequence" },
  { key: "evidence", label: "Evidence", blurb: "Proof & interlocks" },
  { key: "validate", label: "Validate", blurb: "Check before release" },
  { key: "deploy", label: "Deploy", blurb: "Approve & compile" },
] as const;

function emptyDraft(stationId = ""): Draft {
  return {
    name: "",
    station_id: stationId,
    template_id: "",
    version: "Rev A",
    target_instruction: "",
    workflow_id: null,
    steps: [],
    evidence_policy: "Require vision or tool evidence on every gated step; disagreements become training labels.",
    interlock_notes: "Allowlisted PLC handshake only. Safety logic cannot be authored in this builder.",
    handshake_required: true,
  };
}

export default function Workflows() {
  const { data: instructions } = usePoll<any[]>("/api/work-instructions", 12000);
  const { data: workflows, refresh } = usePoll<any[]>("/api/workflows", 8000);
  const { data: topo } = usePoll<any>("/api/topology", 20000);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [selected, setSelected] = useState<any>(null);
  const [compileResult, setCompileResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [compilerOpen, setCompilerOpen] = useState(false);
  const [compilerWfId, setCompilerWfId] = useState<string | null>(null);
  const [compilerWfName, setCompilerWfName] = useState<string | undefined>();
  const [compilerSeed, setCompilerSeed] = useState<any>(null);

  const stations = useMemo(() => {
    if (!topo?.areas) return [];
    return topo.areas.flatMap((a: any) =>
      a.lines.flatMap((l: any) =>
        l.stations.map((s: any) => ({ ...s, lineName: l.name, areaName: a.name }))
      )
    );
  }, [topo]);

  const checks = useMemo(() => {
    const hasName = draft.name.trim().length >= 3;
    const hasStation = !!draft.station_id;
    const hasSteps = draft.steps.length >= 2;
    const titled = draft.steps.every((s) => s.title.trim() && s.criteria.trim());
    const evidenceOk = draft.steps.some((s) => s.evidence_required) || !draft.handshake_required;
    return [
      { ok: hasName, label: "Instruction name is set" },
      { ok: hasStation, label: "Target station selected" },
      { ok: hasSteps, label: "At least two composable steps" },
      { ok: titled, label: "Every step has title and criteria" },
      { ok: evidenceOk, label: "Evidence or handshake policy defined" },
      { ok: draft.handshake_required, label: "PLC handshake contract acknowledged" },
    ];
  }, [draft]);

  const allValid = checks.every((c) => c.ok);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const applyTemplate = (templateId: string) => {
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    setDraft((d) => ({
      ...d,
      template_id: templateId,
      name: d.name || t.label,
      steps: t.steps.map((s, i) => ({
        seq: i + 1,
        kind: s.kind,
        title: s.title,
        criteria: s.criteria,
        evidence_required: s.evidence_required,
      })),
    }));
  };

  const openWithTemplate = (templateId: string) => {
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    setDraft({
      ...emptyDraft(stations[0]?.id || ""),
      template_id: templateId,
      name: t.label,
      steps: t.steps.map((s, i) => ({
        seq: i + 1,
        kind: s.kind,
        title: s.title,
        criteria: s.criteria,
        evidence_required: s.evidence_required,
      })),
    });
    setCompileResult(null);
    setWizardStep(0);
    setBuilderOpen(true);
  };

  const loadFromInstruction = (wi: any, workflowId: string | null = null) => {
    setDraft({
      name: wi.name,
      station_id: wi.station_id,
      template_id: "",
      version: wi.version || "Rev A",
      target_instruction: wi.id,
      workflow_id: workflowId,
      steps: (wi.steps || []).map((s: any, i: number) => ({
        seq: s.seq ?? i + 1,
        kind: s.kind,
        title: s.title,
        criteria: s.criteria,
        evidence_required: !!s.evidence_required,
      })),
      evidence_policy: "Require vision or tool evidence on every gated step; disagreements become training labels.",
      interlock_notes: "Allowlisted PLC handshake only. Safety logic cannot be authored in this builder.",
      handshake_required: true,
    });
    setCompileResult(null);
    setWizardStep(0);
    setBuilderOpen(true);
    toast(`Loaded ${wi.id} into builder`);
  };

  const openNewBuilder = () => {
    setDraft(emptyDraft(stations[0]?.id || ""));
    setCompileResult(null);
    setWizardStep(0);
    setBuilderOpen(true);
  };

  const loadFromWorkflow = (wf: any) => {
    const wi = instructions?.find((x) => x.id === wf.target_instruction);
    if (wi) loadFromInstruction(wi, wf.id);
    else {
      patch({
        name: wf.name,
        target_instruction: wf.target_instruction,
        workflow_id: wf.id,
      });
      setWizardStep(0);
      setBuilderOpen(true);
      toast(`Opened change: ${wf.name}`);
    }
  };

  const approveOnly = async (id: string) => {
    await post(`/api/workflows/${id}/approve`);
    toast("Workflow approved");
    refresh();
  };

  const openTwinCompiler = (wf: { id: string; name?: string }, seed: any = null) => {
    setCompilerWfId(wf.id);
    setCompilerWfName(wf.name);
    setCompilerSeed(seed);
    setCompilerOpen(true);
  };

  const compileOnly = (id: string) => {
    const wf = workflows?.find((w) => w.id === id);
    openTwinCompiler({ id, name: wf?.name });
  };

  const addStep = () => {
    patch({
      steps: [
        ...draft.steps,
        {
          seq: draft.steps.length + 1,
          kind: "manual",
          title: "New step",
          criteria: "Define acceptance criteria",
          evidence_required: false,
        },
      ],
    });
  };

  const updateStep = (idx: number, p: Partial<DraftStep>) => {
    const steps = draft.steps.map((s, i) => (i === idx ? { ...s, ...p } : s));
    patch({ steps });
  };

  const removeStep = (idx: number) => {
    patch({
      steps: draft.steps
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, seq: i + 1 })),
    });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[idx], steps[j]] = [steps[j], steps[idx]];
    patch({ steps: steps.map((s, i) => ({ ...s, seq: i + 1 })) });
  };

  const canNext = () => {
    if (wizardStep === 0) return draft.name.trim().length >= 3 && !!draft.station_id;
    if (wizardStep === 1) return draft.steps.length >= 1;
    if (wizardStep === 2) return draft.handshake_required;
    if (wizardStep === 3) return allValid;
    return true;
  };

  const approveAndCompile = async () => {
    if (!allValid) {
      toast("Resolve validation checks first");
      return;
    }
    setBusy(true);
    try {
      let wfId = draft.workflow_id;
      if (!wfId) {
        // Prefer an open pipeline item targeting the same instruction, else first In Review/Draft.
        const match =
          workflows?.find((w) => w.target_instruction === draft.target_instruction && ["Draft", "In Review", "Approved"].includes(w.status)) ||
          workflows?.find((w) => ["Draft", "In Review", "Approved"].includes(w.status));
        wfId = match?.id ?? null;
      }
      if (!wfId) {
        toast("No change-pipeline item available to approve — open an existing change first");
        setBusy(false);
        return;
      }
      const wf = workflows?.find((w) => w.id === wfId);
      if (wf && (wf.status === "Draft" || wf.status === "In Review")) {
        await post(`/api/workflows/${wfId}/approve`);
        toast("Change approved");
      }
      patch({ workflow_id: wfId });
      setWizardStep(4);
      setBuilderOpen(false);
      openTwinCompiler({ id: wfId, name: wf?.name || draft.name });
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const resetWizard = () => {
    setDraft(emptyDraft(stations[0]?.id || ""));
    setCompileResult(null);
    setWizardStep(0);
  };

  const canReach = (i: number) => {
    if (i <= wizardStep) return true;
    if (i === 1) return draft.name.trim().length >= 3 && !!draft.station_id;
    if (i === 2) return draft.steps.length >= 1;
    if (i === 3) return draft.handshake_required;
    if (i === 4) return allValid;
    return false;
  };

  if (!instructions || !workflows) return <p className="dim">Loading workflows…</p>;

  return (
    <div data-tour="page-workflows">
      <div className="row between wrap" style={{ gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">Work Instruction & Interlock Builder</h1>
          <p className="page-sub">
            How do I define, validate, approve and deploy standard work? One design compiles to instructions, edge logic and tests.
          </p>
        </div>
        <button type="button" className="btn" onClick={openNewBuilder}>
          + Open builder
        </button>
      </div>
      <Tip>
        <b>Click an instruction row</b> to inspect its steps. Use <b>Edit in wizard</b> or <b>Open builder</b> for the
        guided create/change flow. In the change pipeline, <b>Approve</b> a draft, then <b>Compile</b> to generate
        operator UI, edge state machine, evidence schema and PLC handshake tests.
      </Tip>

      <div className="grid cols-2">
        <div data-tour="wf-instructions">
        <Panel title="Deployed work instructions">
          <table className="data">
            <thead>
              <tr><th>Instruction</th><th>Station</th><th>Ver</th><th>Steps</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {instructions.map((wi) => (
                <tr key={wi.id}>
                  <td className="mono clickable" onClick={() => setSelected(wi)}>
                    {wi.id}
                    <div className="small faint" style={{ fontFamily: "var(--font)" }}>{wi.name}</div>
                  </td>
                  <td className="small dim">{wi.station_id.replace("st-", "")}</td>
                  <td className="mono">{wi.version}</td>
                  <td className="mono">{wi.steps.length}</td>
                  <td><span className="tag">{wi.status}</span></td>
                  <td>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={(e) => { e.stopPropagation(); loadFromInstruction(wi); }}
                    >
                      Edit in wizard
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="audit-footer">
            Interlock safety: writes use allowlisted contracts + two-way handshakes. Safety logic cannot be authored here.
          </div>
        </Panel>
        </div>

        <div data-tour="wf-pipeline">
          <Panel title="Change pipeline · draft → review → approved → deployed">
            {workflows.map((wf) => (
              <div key={wf.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="row between">
                  <strong style={{ fontSize: 13 }}>{wf.name}</strong>
                  <span className="tag">{wf.status}</span>
                </div>
                <div className="small faint">
                  targets {wf.target_instruction} · {wf.author} · {ago(wf.created)}
                </div>
                <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
                  {(wf.status === "In Review" || wf.status === "Draft") && (
                    <button type="button" className="btn ghost sm" onClick={() => approveOnly(wf.id)}>Approve</button>
                  )}
                  {(wf.status === "Approved" || wf.status === "Compiled") && (
                    <button type="button" className="btn sm" onClick={() => compileOnly(wf.id)}>
                      Compile with Twin Compiler
                    </button>
                  )}
                  {wf.status === "Compiled" && compileResult?.workflow?.id === wf.id && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => openTwinCompiler(wf, compileResult)}
                    >
                      View package
                    </button>
                  )}
                  <button type="button" className="btn ghost sm" onClick={() => loadFromWorkflow(wf)}>
                    Open in builder
                  </button>
                </div>
              </div>
            ))}
          </Panel>

          {compileResult && !builderOpen && !compilerOpen && (
            <>
              <div className="mt" />
              <Panel title={`Twin package · ${compileResult.package_id || compileResult.workflow.name}`}>
                <p className="small dim" style={{ marginTop: 0 }}>
                  Last compile signed by {compileResult.signature.signer} · {ago(compileResult.signature.signed_at)}
                </p>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {(compileResult.artifacts || []).map((a: any) => (
                    <span key={a.kind} className="tag">{a.label || a.kind.replace(/_/g, " ")}</span>
                  ))}
                </div>
                <div className="mt">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => openTwinCompiler(compileResult.workflow, compileResult)}
                  >
                    Open Twin Compiler
                  </button>
                </div>
              </Panel>
            </>
          )}

          <div className="mt" />
          <Panel title="Station archetype templates">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tag"
                style={{ fontSize: 12, cursor: "pointer", border: "1px solid var(--border)", background: "var(--white)" }}
                onClick={() => openWithTemplate(t.id)}
              >
                {t.label}
              </button>
            ))}
            <p className="small faint mt">
              Templates open the builder with starter steps, evidence rules and handshake contracts.
            </p>
          </Panel>
        </div>
      </div>

      {builderOpen && (
        <Modal
          xl
          title="Instruction builder"
          subtitle="Basics → Compose → Evidence → Validate → Deploy"
          onClose={() => setBuilderOpen(false)}
          footer={
            <>
              <button
                type="button"
                className="btn ghost"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((s) => Math.max(0, s - 1))}
              >
                ← Back
              </button>
              <span className="small faint" style={{ marginRight: "auto", marginLeft: 12 }}>
                Step {wizardStep + 1} of {WIZARD_STEPS.length}
              </span>
              {wizardStep < WIZARD_STEPS.length - 1 ? (
                <button
                  type="button"
                  className="btn"
                  disabled={!canNext()}
                  onClick={() => setWizardStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
                >
                  Continue →
                </button>
              ) : (
                <button type="button" className="btn success" disabled={busy || !allValid} onClick={approveAndCompile}>
                  {busy ? "Compiling…" : "Approve & Compile"}
                </button>
              )}
            </>
          }
        >
          <div className="wizard-stepper" role="list">
            {WIZARD_STEPS.map((s, i) => {
              const state = i < wizardStep ? "done" : i === wizardStep ? "active" : "todo";
              return (
                <button
                  key={s.key}
                  type="button"
                  role="listitem"
                  className={`wizard-step ${state}`}
                  onClick={() => { if (canReach(i)) setWizardStep(i); }}
                  disabled={!canReach(i)}
                >
                  <span className="wizard-num">{i < wizardStep ? "✓" : i + 1}</span>
                  <span className="wizard-meta">
                    <span className="wizard-label">{s.label}</span>
                    <span className="wizard-blurb">{s.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="wizard-panel">
            {wizardStep === 0 && (
              <BasicsStep
                draft={draft}
                stations={stations}
                workflows={workflows}
                instructions={instructions}
                onPatch={patch}
                onTemplate={applyTemplate}
                onLoadWorkflow={loadFromWorkflow}
                onLoadInstruction={(wi) => loadFromInstruction(wi)}
              />
            )}
            {wizardStep === 1 && (
              <ComposeStep
                draft={draft}
                onAdd={addStep}
                onUpdate={updateStep}
                onRemove={removeStep}
                onMove={moveStep}
              />
            )}
            {wizardStep === 2 && (
              <EvidenceStep draft={draft} onPatch={patch} />
            )}
            {wizardStep === 3 && (
              <ValidateStep draft={draft} checks={checks} stations={stations} />
            )}
            {wizardStep === 4 && (
              <DeployStep
                draft={draft}
                compileResult={compileResult}
                busy={busy}
                allValid={allValid}
                onDeploy={approveAndCompile}
                onReset={resetWizard}
                onOpenPackage={() => {
                  if (compileResult?.workflow) {
                    setBuilderOpen(false);
                    openTwinCompiler(compileResult.workflow, compileResult);
                  }
                }}
              />
            )}
          </div>
        </Modal>
      )}

      {compilerOpen && compilerWfId && (
        <TwinCompiler
          key={`${compilerWfId}-${compilerSeed ? "view" : "run"}-${compilerOpen}`}
          workflowId={compilerWfId}
          workflowName={compilerWfName}
          initialResult={compilerSeed}
          onClose={() => {
            setCompilerOpen(false);
            setCompilerSeed(null);
          }}
          onCompiled={(res) => {
            setCompileResult(res);
            refresh();
          }}
        />
      )}

      {selected && (
        <Drawer onClose={() => setSelected(null)}>
          <h2 style={{ marginTop: 4, fontSize: 16 }}>{selected.name}</h2>
          <div className="small faint">
            {selected.id} {selected.version} · approved by {selected.approved_by} · effective {ago(selected.effective)}
          </div>
          <div className="divider" />
          <div className="panel-title">Composable steps</div>
          {selected.steps.map((s: any) => (
            <div key={s.seq} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 16 }}>{STEP_ICONS[s.kind] ?? "•"}</span>
                <strong style={{ fontSize: 13 }}>{s.seq}. {s.title}</strong>
              </div>
              <div className="small dim" style={{ marginLeft: 26 }}>{s.criteria}</div>
              <div style={{ marginLeft: 26 }}>
                <span className="tag">{s.kind}</span>
                {s.evidence_required && <span className="tag" style={{ color: "var(--accent)" }}>evidence required</span>}
              </div>
            </div>
          ))}
          <div className="mt">
            <button type="button" className="btn" onClick={() => { setSelected(null); loadFromInstruction(selected); }}>
              Edit in wizard
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

/* ── Wizard step panels ─────────────────────────────────────────── */

function BasicsStep({
  draft, stations, workflows, instructions, onPatch, onTemplate, onLoadWorkflow, onLoadInstruction,
}: {
  draft: Draft;
  stations: any[];
  workflows: any[];
  instructions: any[];
  onPatch: (p: Partial<Draft>) => void;
  onTemplate: (id: string) => void;
  onLoadWorkflow: (wf: any) => void;
  onLoadInstruction: (wi: any) => void;
}) {
  return (
    <div className="wizard-body">
      <h2 className="wizard-heading">1 · Basics</h2>
      <p className="wizard-lead">Name the instruction, pick the station, and optionally start from a template or open change.</p>

      <div className="form-grid">
        <div className="field-wrap span-2">
          <label className="field-label">Instruction name <em>*</em></label>
          <input
            className="field"
            value={draft.name}
            placeholder="e.g. Fuel Tank Install & Seal"
            onChange={(e) => onPatch({ name: e.target.value })}
          />
        </div>
        <div className="field-wrap">
          <label className="field-label">Target station <em>*</em></label>
          <select
            className="field"
            value={draft.station_id}
            onChange={(e) => onPatch({ station_id: e.target.value })}
          >
            <option value="">Select station…</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.areaName} · {s.name}</option>
            ))}
          </select>
        </div>
        <div className="field-wrap">
          <label className="field-label">Version</label>
          <input className="field" value={draft.version} onChange={(e) => onPatch({ version: e.target.value })} />
        </div>
        <div className="field-wrap">
          <label className="field-label">Based on deployed WI</label>
          <select
            className="field"
            value={draft.target_instruction}
            onChange={(e) => {
              const wi = instructions.find((x) => x.id === e.target.value);
              if (wi) onLoadInstruction(wi);
              else onPatch({ target_instruction: e.target.value });
            }}
          >
            <option value="">Start blank / new</option>
            {instructions.map((wi) => (
              <option key={wi.id} value={wi.id}>{wi.id} · {wi.name}</option>
            ))}
          </select>
        </div>
        <div className="field-wrap">
          <label className="field-label">Open change (pipeline)</label>
          <select
            className="field"
            value={draft.workflow_id || ""}
            onChange={(e) => {
              const wf = workflows.find((w) => w.id === e.target.value);
              if (wf) onLoadWorkflow(wf);
              else onPatch({ workflow_id: null });
            }}
          >
            <option value="">None</option>
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>{wf.name} · {wf.status}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel-title" style={{ marginTop: 8 }}>Station archetype templates</div>
      <div className="wizard-templates">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`wizard-template ${draft.template_id === t.id ? "active" : ""}`}
            onClick={() => onTemplate(t.id)}
          >
            <strong>{t.label}</strong>
            <span className="small faint">{t.steps.length} starter steps</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ComposeStep({
  draft, onAdd, onUpdate, onRemove, onMove,
}: {
  draft: Draft;
  onAdd: () => void;
  onUpdate: (i: number, p: Partial<DraftStep>) => void;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="wizard-body">
      <div className="row between">
        <div>
          <h2 className="wizard-heading">2 · Compose steps</h2>
          <p className="wizard-lead">Sequence operators will execute. Each step can require evidence.</p>
        </div>
        <button type="button" className="btn" onClick={onAdd}>+ Add step</button>
      </div>

      {draft.steps.length === 0 && (
        <p className="dim">No steps yet — add one or go back and pick a template.</p>
      )}

      <div className="wizard-steps-list">
        {draft.steps.map((s, i) => (
          <div key={i} className="wizard-step-card">
            <div className="wizard-step-card-head">
              <span className="wizard-step-seq">{s.seq}</span>
              <span className="wizard-step-ico">{STEP_ICONS[s.kind] ?? "•"}</span>
              <select
                className="field"
                style={{ maxWidth: 140 }}
                value={s.kind}
                onChange={(e) => onUpdate(i, { kind: e.target.value })}
              >
                {STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
                <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => onMove(i, -1)}>↑</button>
                <button type="button" className="btn ghost sm" disabled={i === draft.steps.length - 1} onClick={() => onMove(i, 1)}>↓</button>
                <button type="button" className="btn danger sm" onClick={() => onRemove(i)}>Remove</button>
              </div>
            </div>
            <div className="form-grid">
              <div className="field-wrap span-2">
                <label className="field-label">Title</label>
                <input className="field" value={s.title} onChange={(e) => onUpdate(i, { title: e.target.value })} />
              </div>
              <div className="field-wrap span-2">
                <label className="field-label">Acceptance criteria</label>
                <input className="field" value={s.criteria} onChange={(e) => onUpdate(i, { criteria: e.target.value })} />
              </div>
            </div>
            <label className="wizard-check">
              <input
                type="checkbox"
                checked={s.evidence_required}
                onChange={(e) => onUpdate(i, { evidence_required: e.target.checked })}
              />
              Evidence required before step can complete
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceStep({ draft, onPatch }: { draft: Draft; onPatch: (p: Partial<Draft>) => void }) {
  const gated = draft.steps.filter((s) => s.evidence_required).length;
  return (
    <div className="wizard-body">
      <h2 className="wizard-heading">3 · Evidence & interlocks</h2>
      <p className="wizard-lead">
        Bind proof requirements and PLC handshake policy. Safety-rated logic stays outside this builder.
      </p>

      <div className="wizard-stat-row">
        <div className="wizard-stat">
          <span className="wizard-stat-val">{draft.steps.length}</span>
          <span className="wizard-stat-lbl">Steps</span>
        </div>
        <div className="wizard-stat">
          <span className="wizard-stat-val">{gated}</span>
          <span className="wizard-stat-lbl">Evidence-gated</span>
        </div>
        <div className="wizard-stat">
          <span className="wizard-stat-val">{draft.handshake_required ? "On" : "Off"}</span>
          <span className="wizard-stat-lbl">Handshake</span>
        </div>
      </div>

      <div className="field-wrap">
        <label className="field-label">Evidence policy</label>
        <textarea
          className="field"
          value={draft.evidence_policy}
          onChange={(e) => onPatch({ evidence_policy: e.target.value })}
        />
      </div>
      <div className="field-wrap">
        <label className="field-label">Interlock / handshake notes</label>
        <textarea
          className="field"
          value={draft.interlock_notes}
          onChange={(e) => onPatch({ interlock_notes: e.target.value })}
        />
        <span className="field-hint">Writes use allowlisted contracts + two-way handshakes only.</span>
      </div>
      <label className="wizard-check">
        <input
          type="checkbox"
          checked={draft.handshake_required}
          onChange={(e) => onPatch({ handshake_required: e.target.checked })}
        />
        Require PLC handshake test pack before deployment
      </label>
    </div>
  );
}

function ValidateStep({
  draft, checks, stations,
}: {
  draft: Draft;
  checks: { ok: boolean; label: string }[];
  stations: any[];
}) {
  const station = stations.find((s) => s.id === draft.station_id);
  return (
    <div className="wizard-body">
      <h2 className="wizard-heading">4 · Validate</h2>
      <p className="wizard-lead">Confirm the design is ready for approval. All checks must pass to deploy.</p>

      <div className="wizard-summary">
        <div><span className="faint">Name</span><strong>{draft.name || "—"}</strong></div>
        <div><span className="faint">Station</span><strong>{station?.name || draft.station_id || "—"}</strong></div>
        <div><span className="faint">Version</span><strong>{draft.version}</strong></div>
        <div><span className="faint">Steps</span><strong>{draft.steps.length}</strong></div>
      </div>

      <ul className="wizard-checks">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "ok" : "bad"}>
            <span>{c.ok ? "✓" : "○"}</span> {c.label}
          </li>
        ))}
      </ul>

      <div className="panel-title">Step preview</div>
      {draft.steps.map((s) => (
        <div key={s.seq} className="row between small" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
          <span>
            <span className="mono faint">{s.seq}</span>{" "}
            {STEP_ICONS[s.kind]} {s.title}
          </span>
          {s.evidence_required ? <span className="tag" style={{ color: "var(--accent)" }}>evidence</span> : <span className="tag">optional</span>}
        </div>
      ))}
    </div>
  );
}

function DeployStep({
  draft, compileResult, busy, allValid, onDeploy, onReset, onOpenPackage,
}: {
  draft: Draft;
  compileResult: any;
  busy: boolean;
  allValid: boolean;
  onDeploy: () => void;
  onReset: () => void;
  onOpenPackage?: () => void;
}) {
  return (
    <div className="wizard-body">
      <h2 className="wizard-heading">5 · Approve & deploy</h2>
      <p className="wizard-lead">
        Approve the change and compile with the Executable Twin Compiler — one design becomes operator guidance, edge state machine, evidence schema, handshake tests and a simulation scenario.
      </p>

      {!compileResult ? (
        <div className="wizard-deploy-cta">
          <div>
            <strong>{draft.name}</strong>
            <div className="small faint">{draft.version} · {draft.steps.length} steps · {draft.target_instruction || "new instruction"}</div>
          </div>
          <button type="button" className="btn big success" disabled={busy || !allValid} onClick={onDeploy}>
            {busy ? "Working…" : "Approve & Compile with Twin Compiler"}
          </button>
        </div>
      ) : (
        <div className="wizard-deploy-cta">
          <div>
            <strong>Package {compileResult.package_id || "ready"}</strong>
            <div className="small faint">
              Signed by {compileResult.signature.signer} · {ago(compileResult.signature.signed_at)}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={onOpenPackage}>Open Twin Compiler</button>
            <button type="button" className="btn ghost" onClick={onReset}>Start another</button>
          </div>
        </div>
      )}
    </div>
  );
}
