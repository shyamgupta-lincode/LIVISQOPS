"use client";

import { Shell } from "@/components/Shell";
import { AdminSubnav, Drawer, Panel, Tip } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type EntityRef = { id: string; kind: string; label: string; scope?: string };
type AgentRow = {
  id: string;
  name: string;
  description?: string;
  mode?: string;
  ot_write?: boolean;
  status?: string;
  source?: string;
  agent_type?: string;
  prompt_key?: string;
  prompt_version?: string;
  allowed_tools?: string[];
  entity_refs?: EntityRef[];
  autonomy_level?: string;
  budgets?: { max_tokens?: number; max_tool_calls?: number; timeout_s?: number };
};

type RefCatalog = {
  items: EntityRef[];
  prompt_skills: { key: string; version: string; label: string }[];
  agent_types: { id: string; label: string }[];
  autonomy_levels: string[];
  allowed_tools: string[];
  denied_tools: string[];
  notes?: string;
};

const emptyForm = {
  name: "",
  description: "",
  agent_type: "custom",
  prompt_key: "custom",
  prompt_version: "v1",
  autonomy_level: "L1",
  allowed_tools: ["read_event_context", "read_graph_entities", "read_data_plane"] as string[],
  entity_ref_ids: [] as string[],
  max_tokens: 8000,
  max_tool_calls: 20,
  timeout_s: 60,
};

export default function AdminAgentsPage() {
  const [data, setData] = useState<any>(null);
  const [catalog, setCatalog] = useState<RefCatalog | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [refQuery, setRefQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api("/admin/agents").then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    api<RefCatalog>("/admin/agents/references")
      .then(setCatalog)
      .catch((e) => setError(String(e)));
  }, [open]);

  const filteredRefs = useMemo(() => {
    const q = refQuery.trim().toLowerCase();
    const items = catalog?.items || [];
    if (!q) return items.slice(0, 80);
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.kind.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q),
    ).slice(0, 80);
  }, [catalog, refQuery]);

  function toggleTool(tool: string) {
    setForm((f) => ({
      ...f,
      allowed_tools: f.allowed_tools.includes(tool)
        ? f.allowed_tools.filter((t) => t !== tool)
        : [...f.allowed_tools, tool],
    }));
  }

  function toggleRef(id: string) {
    setForm((f) => ({
      ...f,
      entity_ref_ids: f.entity_ref_ids.includes(id)
        ? f.entity_ref_ids.filter((x) => x !== id)
        : [...f.entity_ref_ids, id],
    }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const byId = new Map((catalog?.items || []).map((i) => [i.id, i]));
      const entity_refs = form.entity_ref_ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((i) => ({ id: i!.id, kind: i!.kind, label: i!.label, scope: "read" }));
      await api("/admin/agents", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          agent_type: form.agent_type,
          prompt_key: form.prompt_key,
          prompt_version: form.prompt_version,
          allowed_tools: form.allowed_tools,
          entity_refs,
          autonomy_level: form.autonomy_level,
          budgets: {
            max_tokens: form.max_tokens,
            max_tool_calls: form.max_tool_calls,
            timeout_s: form.timeout_s,
          },
        }),
      });
      setOpen(false);
      setForm(emptyForm);
      setRefQuery("");
      load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  const agents: AgentRow[] = data?.agents || [];

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Agents ledger</h1>
        </div>
      </div>
      <AdminSubnav
        trailing={
          <Button size="sm" type="button" onClick={() => { setOpen(true); setError(null); }}>
            Create AI Agent
          </Button>
        }
      />
      <Tip>
        Quality & AI owns the agents ledger (<code>/admin/agents</code>); Govern opens the same UI
        at <code>/admin/agent-governance</code>. Agents draft RCA / knowledge; humans confirm. No PLC /
        recipe / disposition writes. New agents start as <strong>Draft</strong> — promotion is a separate
        human step.
      </Tip>

      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        <Panel title="Provider"><code>{data?.provider || "mock"}</code></Panel>
        <Panel title="Autonomy"><Badge variant="outline">{data?.autonomy_level || "L1"}</Badge></Panel>
        <Panel title="OT write"><Badge className="border-ok/40 bg-ok/10 text-ok" variant="outline">DENIED</Badge></Panel>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 12 }}>
        {agents.map((a) => (
          <Panel
            key={a.id}
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                {a.name}
                {a.source === "custom" ? <Badge variant="secondary">custom</Badge> : <Badge variant="outline">system</Badge>}
                {a.status ? <Badge variant={a.status === "Draft" ? "secondary" : "outline"}>{a.status}</Badge> : null}
              </span>
            }
          >
            {a.description ? <p className="muted text-sm mb-2">{a.description}</p> : null}
            <p>Mode: {a.mode || "read + draft"}</p>
            <p>Type: <code>{a.agent_type || a.id}</code></p>
            <p>Autonomy: {a.autonomy_level || "L1"}</p>
            <p>OT write: <strong>{String(a.ot_write ?? false)}</strong></p>
            {a.prompt_key ? (
              <p className="muted">
                Prompt <code>prompts/{a.prompt_key}/{a.prompt_version || "v1"}</code>
              </p>
            ) : (
              <p className="muted">
                Prompts under <code>prompts/{a.id.includes("knowledge") ? "knowledge-curator" : "rca-investigator"}</code>
              </p>
            )}
            {a.entity_refs?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {a.entity_refs.slice(0, 6).map((r) => (
                  <Badge key={r.id} variant="outline" className="max-w-[14rem] truncate" title={r.label}>
                    {r.kind}: {r.label}
                  </Badge>
                ))}
                {a.entity_refs.length > 6 ? (
                  <Badge variant="secondary">+{a.entity_refs.length - 6}</Badge>
                ) : null}
              </div>
            ) : null}
          </Panel>
        ))}
      </div>

      <Panel title="Action ledger" action={<Link href="/rca">RCA workspaces</Link>}>
        <table className="table">
          <thead><tr><th>When</th><th>Agent</th><th>Target</th><th>Status</th><th>Conf.</th><th>Summary</th></tr></thead>
          <tbody>
            {(data?.ledger || []).map((row: any) => (
              <tr key={row.id}>
                <td className="mono muted">{(row.at || "").slice(0, 19)}</td>
                <td>{row.agent}</td>
                <td><Link className="mono" href={`/rca/${row.target}`}>{row.target?.slice(0, 8)}</Link></td>
                <td><Badge variant="outline">{row.status}</Badge></td>
                <td>{row.confidence != null ? `${(row.confidence * 100).toFixed(0)}%` : "—"}</td>
                <td>{row.summary}</td>
              </tr>
            ))}
            {!data?.ledger?.length && <tr><td colSpan={6} className="muted">No agent runs yet — generate RCA from a quality event.</td></tr>}
          </tbody>
        </table>
      </Panel>

      {open ? (
        <Drawer onClose={() => !saving && setOpen(false)} title="Create AI Agent" width={480}>
          <p className="muted text-sm mb-3">
            Persists a <strong>Draft</strong> agent config. References are read-scoped. OT / safety writes stay denied.
            Humans must promote before production use.
          </p>
          {error ? (
            <div className="mb-3 rounded-md border border-crit/40 bg-crit/10 px-3 py-2 text-sm text-crit">{error}</div>
          ) : null}

          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Line 1 dimensional scout"
              required
            />
          </label>

          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium">Description</span>
            <textarea
              className="border-input bg-transparent focus-visible:border-ring focus-visible:ring-ring/50 w-full min-h-[72px] rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this agent proposes and which plant context it reads"
            />
          </label>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Agent type</span>
              <Select value={form.agent_type} onValueChange={(v) => setForm({ ...form, agent_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(catalog?.agent_types || [
                    { id: "rca_investigator", label: "RCA Investigator" },
                    { id: "knowledge_curator", label: "Knowledge Curator" },
                    { id: "custom", label: "Custom" },
                  ]).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Autonomy</span>
              <Select value={form.autonomy_level} onValueChange={(v) => setForm({ ...form, autonomy_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(catalog?.autonomy_levels || ["L0", "L1", "L2"]).map((l) => (
                    <SelectItem key={l} value={l}>{l} · propose only</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium">Prompt / skill</span>
            <Select
              value={`${form.prompt_key}@${form.prompt_version}`}
              onValueChange={(v) => {
                const [key, ver] = v.split("@");
                setForm({ ...form, prompt_key: key, prompt_version: ver || "v1" });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(catalog?.prompt_skills || [
                  { key: "rca-investigator", version: "v1", label: "RCA Investigator v1" },
                  { key: "knowledge-curator", version: "v1", label: "Knowledge Curator v1" },
                  { key: "custom", version: "v1", label: "Custom" },
                ]).map((s) => (
                  <SelectItem key={`${s.key}@${s.version}`} value={`${s.key}@${s.version}`}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="mb-3">
            <div className="mb-1 text-sm font-medium">Allowed tools (read scopes)</div>
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-auto rounded-md border p-2">
              {(catalog?.allowed_tools || emptyForm.allowed_tools).map((tool) => {
                const on = form.allowed_tools.includes(tool);
                return (
                  <Button
                    key={tool}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() => toggleTool(tool)}
                  >
                    {tool}
                  </Button>
                );
              })}
            </div>
            <p className="muted mt-1 text-xs">Denied: {(catalog?.denied_tools || []).slice(0, 6).join(", ") || "write_plc, set_recipe, …"}</p>
          </div>

          <div className="mb-3">
            <div className="mb-1 text-sm font-medium">Entity references</div>
            <Input
              className="mb-2"
              value={refQuery}
              onChange={(e) => setRefQuery(e.target.value)}
              placeholder="Search graph nodes, planes, topics, assets…"
            />
            <div className="flex max-h-44 flex-col gap-1 overflow-auto rounded-md border p-2">
              {filteredRefs.map((r) => {
                const on = form.entity_ref_ids.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`flex items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${on ? "bg-primary/10" : ""}`}
                    onClick={() => toggleRef(r.id)}
                  >
                    <Badge variant="outline" className="shrink-0">{r.kind}</Badge>
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {on ? <Badge variant="secondary">read</Badge> : null}
                  </button>
                );
              })}
              {!filteredRefs.length ? <p className="muted text-xs">No matches — open Context Graph / Data Planes if catalog is empty.</p> : null}
            </div>
            <p className="muted mt-1 text-xs">{form.entity_ref_ids.length} selected · scope forced to read</p>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <label className="block text-xs">
              <span className="mb-1 block font-medium">Max tokens</span>
              <Input
                type="number"
                value={form.max_tokens}
                onChange={(e) => setForm({ ...form, max_tokens: Number(e.target.value) || 8000 })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium">Tool calls</span>
              <Input
                type="number"
                value={form.max_tool_calls}
                onChange={(e) => setForm({ ...form, max_tool_calls: Number(e.target.value) || 20 })}
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium">Timeout (s)</span>
              <Input
                type="number"
                value={form.timeout_s}
                onChange={(e) => setForm({ ...form, timeout_s: Number(e.target.value) || 60 })}
              />
            </label>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Badge variant="secondary">Status: Draft</Badge>
            <Badge className="border-ok/40 bg-ok/10 text-ok" variant="outline">OT write: DENIED</Badge>
          </div>

          <div className="flex gap-2">
            <Button type="button" disabled={saving || form.name.trim().length < 2} onClick={submit}>
              {saving ? "Saving…" : "Save draft agent"}
            </Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </Drawer>
      ) : null}
    </Shell>
  );
}
