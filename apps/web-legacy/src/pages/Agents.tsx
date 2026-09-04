// AI Agent Workspace — Bounded Action Ledger + autonomy catalog.
// Agents recommend; high-impact actions require named human authority.

import React, { useEffect, useMemo, useState } from "react";

import { ago, get, post, usePoll } from "../api";
import { onTourCommand, tourNotice } from "../tour/bridge";
import { Drawer, Field, Modal, Tip, toast } from "../components/ui";
import AgentTypedPanels from "./AgentTypedPanels";

type Blast = {
  products_affected: number;
  reversible: boolean;
  downstream: string[];
};

type AgentAction = {
  id: string;
  agent_id: string;
  title: string;
  evidence_summary: string;
  evidence_links: string[];
  blast_radius: Blast;
  confidence: number;
  status: string;
  approver: string | null;
  created: string;
  outcome?: string | null;
  approved_at?: string;
};

type Agent = {
  id: string;
  name: string;
  autonomy: string;
  description: string;
  version: string;
  eval_score: number;
  evidence_link_coverage: number;
  status: string;
  permitted_tools: string[];
  prompt?: string;
  data_source_topics?: string[];
  created_by?: string;
  created_at?: string;
};

type AgentDetail = Agent & {
  ledger: AgentAction[];
  ledger_counts: {
    all: number;
    pending: number;
    approved: number;
    auto: number;
    rejected: number;
  };
};

type DataSourceTopic = {
  id: string;
  object_type: string;
  label: string;
  report_at?: string;
  lenses?: string[];
  protocol?: string;
};

type Filter = "all" | "Pending Approval" | "Approved" | "Auto-executed" | "Rejected";

type AgentForm = {
  name: string;
  autonomy: string;
  description: string;
  version: string;
  tools: string;
  prompt: string;
  data_source_topics: string[];
};

const APPROVER_DEFAULT = "Jordan Hale";

const AUTONOMY_OPTIONS = [
  "L0 · Retrieve",
  "L1 · Recommend",
  "L2 · Draft",
  "L3 · Execute with approval",
  "L4 · Bounded automation",
] as const;

const DEFAULT_TOOLS: Record<string, string[]> = {
  "L0 · Retrieve": ["search_events", "read_genealogy"],
  "L1 · Recommend": ["search_events", "read_genealogy", "rank_losses"],
  "L2 · Draft": ["search_events", "read_genealogy", "draft_artifact"],
  "L3 · Execute with approval": ["draft_hold", "apply_hold(approved)", "create_ncr(approved)"],
  "L4 · Bounded automation": ["trigger_recapture", "open_review_task"],
};

const TRUST = [
  { title: "Grounding", body: "Asset scope, sources and time window shown for every run." },
  { title: "Evidence", body: "Every conclusion links to images, series, genealogy or procedures." },
  { title: "Confidence", body: "Calibrated confidence or “insufficient evidence”; no fabricated precision." },
  { title: "Permission", body: "Read / recommend / draft / execute separated; high-impact needs human approval." },
  { title: "Audit", body: "Prompt, context, action and result stored with redaction." },
];

function statusClass(status: string) {
  if (status === "Pending Approval") return "pending";
  if (status === "Approved") return "approved";
  if (status === "Rejected") return "rejected";
  if (status === "Auto-executed") return "auto";
  return "neutral";
}

function agentSlug(agentId: string) {
  return agentId.replace(/^agent-/, "");
}

function autonomyLevel(autonomy: string) {
  const m = autonomy.match(/^(L\d)/);
  return m?.[1] ?? "L?";
}

function emptyAgentForm(): AgentForm {
  return {
    name: "",
    autonomy: "L1 · Recommend",
    description: "",
    version: "1.0",
    tools: DEFAULT_TOOLS["L1 · Recommend"].join(", "),
    prompt: "",
    data_source_topics: [],
  };
}

function topicLabel(topics: DataSourceTopic[] | undefined, id: string) {
  return topics?.find((t) => t.id === id)?.label ?? id;
}

export default function Agents() {
  const { data: agents, refresh: refreshAgents } = usePoll<Agent[]>("/api/agents", 12000);
  const { data: actions, refresh } = usePoll<AgentAction[]>("/api/agent-actions", 6000);
  const { data: topicPack } = usePoll<{
    topics: DataSourceTopic[];
    context_graph_name?: string;
  }>("/api/agent-data-source-topics", 30000);

  const [filter, setFilter] = useState<Filter>("all");
  const [agentFocus, setAgentFocus] = useState<string | null>(null);
  const [approver, setApprover] = useState(APPROVER_DEFAULT);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<AgentForm>(emptyAgentForm);
  const [saving, setSaving] = useState(false);
  const [labHighlight, setLabHighlight] = useState<string | null>(null);

  useEffect(() => onTourCommand((cmd) => {
    if (cmd.type === "open-create-agent") {
      const base = emptyAgentForm();
      setForm({
        ...base,
        ...cmd.prefill,
        name: cmd.prefill.name || "",
        description: cmd.prefill.description || "",
        tools: cmd.prefill.tools || base.tools,
        prompt: cmd.prefill.prompt || base.prompt,
        data_source_topics: cmd.prefill.data_source_topics || base.data_source_topics,
      });
      setCreating(true);
    }
    if (cmd.type === "set-agent-name") {
      setForm((f) => ({ ...f, name: cmd.name }));
    }
    if (cmd.type === "set-agent-description") {
      setForm((f) => ({ ...f, description: cmd.description }));
    }
  }), []);

  const topics = topicPack?.topics ?? [];
  const topicById = useMemo(() => {
    const m = new Map<string, DataSourceTopic>();
    topics.forEach((t) => m.set(t.id, t));
    return m;
  }, [topics]);

  const byId = useMemo(() => {
    const m = new Map<string, Agent>();
    (agents ?? []).forEach((a) => m.set(a.id, a));
    return m;
  }, [agents]);

  const toggleTopic = (id: string) => {
    setForm((f) => {
      const has = f.data_source_topics.includes(id);
      return {
        ...f,
        data_source_topics: has
          ? f.data_source_topics.filter((t) => t !== id)
          : [...f.data_source_topics, id],
      };
    });
  };

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, auto: 0, rejected: 0, all: 0 };
    for (const a of actions ?? []) {
      c.all += 1;
      if (a.status === "Pending Approval") c.pending += 1;
      else if (a.status === "Approved") c.approved += 1;
      else if (a.status === "Auto-executed") c.auto += 1;
      else if (a.status === "Rejected") c.rejected += 1;
    }
    return c;
  }, [actions]);

  const visible = useMemo(() => {
    let list = actions ?? [];
    if (filter !== "all") list = list.filter((a) => a.status === filter);
    if (agentFocus) list = list.filter((a) => a.agent_id === agentFocus);
    return list;
  }, [actions, filter, agentFocus]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      setDetail(await get<AgentDetail>(`/api/agents/${id}`));
    } catch (e) {
      toast(String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (id: string, verb: "approve" | "reject", comment?: string) => {
    const name = approver.trim() || APPROVER_DEFAULT;
    setBusyId(id);
    try {
      await post(`/api/agent-actions/${id}/${verb}`, {
        approver: name,
        comment: comment?.trim() || undefined,
      });
      toast(
        verb === "approve"
          ? `Approved by ${name} · outcome will be measured`
          : `Rejected by ${name}`,
      );
      setRejectingId(null);
      setRejectComment("");
      refresh();
      if (detail) openDetail(detail.id);
    } catch (e) {
      toast(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const createAgent = async () => {
    if (!form.name.trim() || form.description.trim().length < 8) {
      toast("Name and a short description are required");
      return;
    }
    setSaving(true);
    try {
      const tools = form.tools
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const created = await post<Agent>("/api/agents", {
        name: form.name.trim(),
        autonomy: form.autonomy,
        description: form.description.trim(),
        version: form.version.trim() || "1.0",
        permitted_tools: tools.length ? tools : undefined,
        prompt: form.prompt.trim(),
        data_source_topics: form.data_source_topics,
        created_by: approver.trim() || APPROVER_DEFAULT,
      });
      toast(`Added ${created.name} · ${created.autonomy}`);
      setCreating(false);
      setForm(emptyAgentForm());
      setLabHighlight(created.id);
      tourNotice({
        type: "agent-created",
        agent: { id: created.id, name: created.name, autonomy: created.autonomy },
      });
      refreshAgents();
      setAgentFocus(created.id);
      if (!document.querySelector(".tour-root.is-lab")) {
        await openDetail(created.id);
      }
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!agents || !actions) {
    return (
      <div className="agents-page">
        <p className="dim">Loading agent workspace…</p>
      </div>
    );
  }

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "Pending Approval", label: "Pending", count: counts.pending },
    { id: "Approved", label: "Approved", count: counts.approved },
    { id: "Auto-executed", label: "Auto", count: counts.auto },
    { id: "Rejected", label: "Rejected", count: counts.rejected },
  ];

  const detailLevel = detail ? autonomyLevel(detail.autonomy) : "L?";

  return (
    <div className="agents-page" data-tour="page-agents">
      <header className="agents-hero">
        <div>
          <h1 className="page-title">AI Agent Workspace</h1>
          <p className="page-sub">
            What does the contextual evidence suggest and what action is permitted?
            Agents recommend — they never silently control production.
          </p>
        </div>
        <div className="agents-authority">
          <label className="agents-authority-label" htmlFor="agents-approver">
            Named authority
          </label>
          <input
            id="agents-approver"
            className="agents-authority-input"
            value={approver}
            onChange={(e) => setApprover(e.target.value)}
            placeholder="Approver name"
          />
        </div>
      </header>

      <Tip>
        Items marked <b>Pending Approval</b> are waiting on you: review the evidence and blast radius,
        then <b>Approve</b> (with named authority) or <b>Reject</b>. Outcomes are measured after execution.
      </Tip>

      <AgentTypedPanels />

      <div className="agents-stats">
        <div className="agents-stat">
          <span className="agents-stat-n">{counts.pending}</span>
          <span className="agents-stat-l">Awaiting you</span>
        </div>
        <div className="agents-stat">
          <span className="agents-stat-n">{counts.auto}</span>
          <span className="agents-stat-l">Bounded auto</span>
        </div>
        <div className="agents-stat">
          <span className="agents-stat-n">{counts.approved}</span>
          <span className="agents-stat-l">Approved</span>
        </div>
        <div className="agents-stat">
          <span className="agents-stat-n">{agents.length}</span>
          <span className="agents-stat-l">Active agents</span>
        </div>
      </div>

      <div className="agents-layout">
        <section className="agents-ledger panel" data-tour="agents-ledger">
          <div className="panel-title">
            <span>Bounded Action Ledger</span>
            {counts.pending > 0 && (
              <span className="agents-pending-pill">{counts.pending} pending</span>
            )}
          </div>

          <div className="agents-filters">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`agents-filter ${filter === f.id ? "on" : ""}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <em>{f.count}</em>
              </button>
            ))}
            {agentFocus && (
              <button
                type="button"
                className="agents-filter clear"
                onClick={() => setAgentFocus(null)}
              >
                Clear agent · {agentSlug(agentFocus)}
              </button>
            )}
          </div>

          <div className="agents-ledger-list">
            {visible.length === 0 && (
              <div className="agents-empty">No ledger items for this filter.</div>
            )}
            {visible.map((a) => {
              const ag = byId.get(a.agent_id);
              const pending = a.status === "Pending Approval";
              const rejecting = rejectingId === a.id;
              return (
                <article key={a.id} className={`agents-card status-${statusClass(a.status)}`}>
                  <div className="agents-card-top">
                    <h3 className="agents-card-title">{a.title}</h3>
                    <span className={`agents-status ${statusClass(a.status)}`}>{a.status}</span>
                  </div>
                  <p className="agents-card-body">{a.evidence_summary}</p>

                  <div className="agents-meta">
                    <span className="agents-chip">
                      agent: {ag?.name.toLowerCase().replace(/\s+/g, "-") ?? agentSlug(a.agent_id)}
                    </span>
                    <span className="agents-chip mono">
                      confidence {(a.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="agents-chip">
                      blast radius: {a.blast_radius.products_affected} units
                    </span>
                    <span className={`agents-chip ${a.blast_radius.reversible ? "ok" : "warn"}`}>
                      {a.blast_radius.reversible ? "reversible" : "NOT reversible"}
                    </span>
                  </div>

                  <div className="agents-evidence">
                    <span>
                      Downstream:{" "}
                      {a.blast_radius.downstream.length
                        ? a.blast_radius.downstream.join(" · ")
                        : "none"}
                    </span>
                    <span className="agents-ev-links">
                      evidence:{" "}
                      {a.evidence_links.map((ev) => (
                        <button
                          key={ev}
                          type="button"
                          className="agents-ev"
                          onClick={() => toast(`Evidence ${ev} · open in Quality Review`)}
                        >
                          {ev}
                        </button>
                      ))}
                    </span>
                  </div>

                  {a.outcome && (
                    <div className="agents-outcome">Outcome: {a.outcome}</div>
                  )}

                  {pending && !rejecting && (
                    <div className="agents-actions">
                      <button
                        type="button"
                        className="btn success"
                        disabled={busyId === a.id}
                        onClick={() => decide(a.id, "approve")}
                      >
                        Approve (named authority)
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        disabled={busyId === a.id}
                        onClick={() => {
                          setRejectingId(a.id);
                          setRejectComment("");
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {pending && rejecting && (
                    <div className="agents-reject">
                      <input
                        className="agents-reject-input"
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        placeholder="Optional reason for rejection"
                        autoFocus
                      />
                      <div className="agents-actions">
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busyId === a.id}
                          onClick={() => decide(a.id, "reject", rejectComment)}
                        >
                          Confirm reject
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setRejectingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <footer className="agents-card-foot">
                    {a.approver
                      ? `decision: ${a.approver} · created ${ago(a.created)}`
                      : `created ${ago(a.created)}`}
                  </footer>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="agents-side">
          <section className="panel agents-catalog" data-tour="agents-catalog">
            <div className="panel-title">
              <span>Agent catalog · autonomy levels L0–L4</span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setForm(emptyAgentForm());
                  setCreating(true);
                }}
              >
                + Add AI agent
              </button>
            </div>
            <div className="agents-catalog-list">
              {agents.map((ag) => {
                const level = autonomyLevel(ag.autonomy);
                const on = agentFocus === ag.id;
                return (
                  <div
                    key={ag.id}
                    className={`agents-agent ${on ? "on" : ""} ${labHighlight === ag.id ? "lab-hit" : ""}`}
                    data-tour-agent={ag.id}
                  >
                    <div className="agents-agent-top">
                      <strong>
                        {ag.name}{" "}
                        <span className="agents-ver">v{ag.version}</span>
                      </strong>
                      <span className={`agents-level L${level.slice(1)}`}>{ag.autonomy}</span>
                    </div>
                    <p>{ag.description}</p>
                    <div className="agents-meta">
                      <span className="agents-chip mono">
                        eval {(ag.eval_score * 100).toFixed(1)}%
                      </span>
                      <span className="agents-chip mono">
                        evidence coverage {(ag.evidence_link_coverage * 100).toFixed(1)}%
                      </span>
                      {(ag.data_source_topics?.length ?? 0) > 0 && (
                        <span className="agents-chip">
                          {(ag.data_source_topics!.length === 1
                            ? topicLabel(topics, ag.data_source_topics![0])
                            : `${ag.data_source_topics!.length} data topics`)}
                        </span>
                      )}
                    </div>
                    <div className="agents-tools">
                      <span className="faint">tools:</span>{" "}
                      {ag.permitted_tools.join(", ")}
                    </div>
                    <div className="agents-agent-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => openDetail(ag.id)}
                        disabled={detailLoading}
                      >
                        View detail
                      </button>
                      <button
                        type="button"
                        className={`btn ${on ? "" : "ghost"}`}
                        onClick={() => setAgentFocus(on ? null : ag.id)}
                      >
                        {on ? "Clear filter" : "Filter ledger"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="audit-footer">
              Excluded by policy: unbounded autonomous control, safety decisions,
              releasing quality holds without authority.
            </div>
          </section>

          <section className="panel agents-trust" data-tour="agents-trust">
            <div className="panel-title">Trust controls</div>
            <ul className="agents-trust-list">
              {TRUST.map((t) => (
                <li key={t.title}>
                  <strong>{t.title}</strong>
                  <span> — {t.body}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {creating && (
        <Modal
          title="Add AI agent"
          subtitle="Register a bounded agent. Autonomy above L2 still requires human approval for high-impact actions."
          wide
          onClose={() => setCreating(false)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="button" className="btn" disabled={saving} onClick={createAgent}>
                {saving ? "Adding…" : "Add AI agent"}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Name" required>
              <input
                className="field"
                value={form.name}
                placeholder="e.g. Fixture Wear Sentinel"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Version">
              <input
                className="field"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
              />
            </Field>
            <Field label="Autonomy level" required>
              <select
                className="field"
                value={form.autonomy}
                onChange={(e) => {
                  const autonomy = e.target.value;
                  setForm({
                    ...form,
                    autonomy,
                    tools: DEFAULT_TOOLS[autonomy]?.join(", ") || form.tools,
                  });
                }}
              >
                {AUTONOMY_OPTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </Field>
            <Field label="Created by">
              <input className="field" value={approver} readOnly />
            </Field>
            <div className="span-2">
              <Field label="Description" required hint="What the agent detects or drafts, and its bounds.">
                <textarea
                  className="field"
                  value={form.description}
                  placeholder="Detects… drafts… never silently controls…"
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
            </div>
            <div className="span-2">
              <Field
                label="Prompt"
                hint="System / task prompt grounding how the agent uses selected data topics."
              >
                <textarea
                  className="field agents-prompt-input"
                  value={form.prompt}
                  placeholder="Watch… correlate… recommend only — never silently control…"
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                />
              </Field>
            </div>
            <div className="span-2">
              <Field
                label="Data source topics"
                hint={
                  topicPack?.context_graph_name
                    ? `From context graph · ${topicPack.context_graph_name}`
                    : "Object bindings from the active context graph"
                }
              >
                {topics.length === 0 ? (
                  <p className="small dim agents-topics-empty">
                    No enabled object bindings on the active context graph.
                  </p>
                ) : (
                  <div className="agents-topic-picker" role="group" aria-label="Data source topics">
                    {topics.map((t) => {
                      const on = form.data_source_topics.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`agents-topic-chip ${on ? "on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggleTopic(t.id)}
                          title={t.object_type}
                        >
                          {t.label}
                          {t.report_at ? <em>@{t.report_at}</em> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>
            </div>
            <div className="span-2">
              <Field label="Permitted tools" hint="Comma-separated. Defaults update when autonomy changes.">
                <input
                  className="field mono"
                  value={form.tools}
                  onChange={(e) => setForm({ ...form, tools: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Drawer onClose={() => setDetail(null)}>
          <div className="agents-detail-kicker">Agent detail</div>
          <div className="agents-detail-head">
            <div>
              <h2 style={{ margin: "4px 0 2px", fontSize: 18 }}>
                {detail.name}{" "}
                <span className="agents-ver">v{detail.version}</span>
              </h2>
              <div className="small faint mono">{detail.id}</div>
            </div>
            <span className={`agents-level L${detailLevel.slice(1)}`}>{detail.autonomy}</span>
          </div>
          <p className="agents-detail-desc">{detail.description}</p>

          <div className="agents-meta">
            <span className="agents-chip">{detail.status}</span>
            <span className="agents-chip mono">
              eval {(detail.eval_score * 100).toFixed(1)}%
            </span>
            <span className="agents-chip mono">
              evidence coverage {(detail.evidence_link_coverage * 100).toFixed(1)}%
            </span>
          </div>

          <div className="divider" />
          <div className="panel-title">Prompt</div>
          {detail.prompt?.trim() ? (
            <pre className="agents-detail-prompt">{detail.prompt}</pre>
          ) : (
            <p className="small dim">No prompt configured.</p>
          )}

          <div className="divider" />
          <div className="panel-title">
            <span>Data source topics</span>
            <span className="tag mono">{(detail.data_source_topics || []).length}</span>
          </div>
          {(detail.data_source_topics || []).length === 0 ? (
            <p className="small dim">No context-graph topics selected.</p>
          ) : (
            <div className="agents-meta">
              {(detail.data_source_topics || []).map((tid) => {
                const t = topicById.get(tid);
                return (
                  <span key={tid} className="agents-chip" title={t?.object_type || tid}>
                    {t?.label || tid}
                    {t?.report_at ? ` · @${t.report_at}` : ""}
                  </span>
                );
              })}
            </div>
          )}

          <div className="divider" />
          <div className="panel-title">Permitted tools</div>
          <div className="agents-meta">
            {detail.permitted_tools.map((t) => (
              <span key={t} className="agents-chip mono">{t}</span>
            ))}
          </div>

          <div className="divider" />
          <div className="panel-title">
            <span>Ledger activity</span>
            <span className="tag mono">{detail.ledger_counts.all} items</span>
          </div>
          <div className="agents-detail-counts">
            <span><em>{detail.ledger_counts.pending}</em> pending</span>
            <span><em>{detail.ledger_counts.approved}</em> approved</span>
            <span><em>{detail.ledger_counts.auto}</em> auto</span>
            <span><em>{detail.ledger_counts.rejected}</em> rejected</span>
          </div>
          {detail.ledger.length === 0 && (
            <p className="small dim">No ledger proposals from this agent yet.</p>
          )}
          {detail.ledger.slice(0, 8).map((a) => (
            <div key={a.id} className="agents-detail-ledger">
              <div className="row between">
                <strong className="small">{a.title}</strong>
                <span className={`agents-status ${statusClass(a.status)}`}>{a.status}</span>
              </div>
              <div className="small faint">{ago(a.created)} · conf {(a.confidence * 100).toFixed(0)}%</div>
            </div>
          ))}

          <div className="agents-actions mt">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setAgentFocus(detail.id);
                setDetail(null);
              }}
            >
              Filter ledger to this agent
            </button>
          </div>

          {(detail.created_by || detail.created_at) && (
            <div className="small faint mt">
              {detail.created_by ? `Registered by ${detail.created_by}` : "Registered"}
              {detail.created_at ? ` · ${ago(detail.created_at)}` : ""}
            </div>
          )}
          <div className="audit-footer">
            Autonomy is bounded by policy — agents recommend; they never silently control production.
          </div>
        </Drawer>
      )}
    </div>
  );
}
