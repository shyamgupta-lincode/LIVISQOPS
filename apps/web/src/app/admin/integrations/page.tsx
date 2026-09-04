"use client";
import { Shell } from "@/components/Shell";
import { AdminSubnav, Panel, StateChip, Tip } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { api } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type Connector = {
  id: string;
  name: string;
  kind: string;
  status: string;
  endpoint_url: string;
  secret_ref?: string | null;
  enabled: boolean;
  version: number;
  last_success_at?: string | null;
  last_error_at?: string | null;
  throughput_per_min: number;
  success_count: number;
  error_count: number;
  description?: string | null;
  config?: Record<string, unknown>;
};

type TestResult = {
  ok: boolean;
  latency_ms: number;
  message: string;
  details?: Record<string, unknown>;
  tested_at?: string;
  target?: string;
};

function statusState(status: string): "active" | "down" | "fixing" | "idle" {
  const s = (status || "").toLowerCase();
  if (s === "healthy") return "active";
  // Map degraded/warning → fixing (amber pulse) — StatusIndicator has no "warning" state
  if (s === "degraded" || s === "warning") return "fixing";
  if (s === "error") return "down";
  return "idle";
}

export default function AdminIntegrationsPage() {
  const [items, setItems] = useState<Connector[]>([]);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<Connector | null>(null);
  const [errors, setErrors] = useState<any[]>([]);
  const [endpointDraft, setEndpointDraft] = useState("");
  const [secretDraft, setSecretDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await api<{ items: Connector[]; notes?: string }>("/admin/integrations");
    setItems(data.items || []);
    setNotes(data.notes || "");
    setSelected((prev) => {
      if (!prev) return data.items?.[0] || null;
      return data.items?.find((c) => c.id === prev.id) || data.items?.[0] || null;
    });
  }, []);

  useEffect(() => {
    refresh().catch((e) => setMsg(String(e)));
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    setEndpointDraft(selected.endpoint_url);
    setSecretDraft(selected.secret_ref || "");
    setTestResult(null);
    api<{ items: any[] }>(`/admin/integrations/${selected.id}/errors`)
      .then((d) => setErrors(d.items || []))
      .catch(() => setErrors([]));
  }, [selected?.id]);

  async function saveConfig() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const updated = await api<Connector>(`/admin/integrations/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          endpoint_url: endpointDraft,
          secret_ref: secretDraft || null,
          expected_version: selected.version,
        }),
      });
      setMsg("Configuration saved (secret value never returned).");
      await refresh();
      setSelected(updated);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runTest() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    setTestResult(null);
    try {
      const out = await api<{ connector: Connector; result: TestResult }>(
        `/admin/integrations/${selected.id}/test`,
        { method: "POST" }
      );
      setTestResult(out.result);
      setMsg(out.result.ok ? "Connection test succeeded." : "Connection test failed.");
      await refresh();
      setSelected(out.connector);
      const err = await api<{ items: any[] }>(`/admin/integrations/${selected.id}/errors`);
      setErrors(err.items || []);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled() {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api<Connector>(`/admin/integrations/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !selected.enabled, expected_version: selected.version }),
      });
      await refresh();
      setSelected(updated);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Integrations</h1>
        </div>
      </div>
      <AdminSubnav />
      <Tip>
        Adapters use production-shaped OPC UA / MES / QMS / CMMS contracts. Local one-shot targets
        the API connector-sim substitutes; credentials are referenced (`secret:…` / `env:…`), never
        shown as values.
      </Tip>
      {notes ? <p className="muted" style={{ marginBottom: 12 }}>{notes}</p> : null}
      {msg ? (
        <p className="muted" role="status" style={{ marginBottom: 12 }}>
          {msg}
        </p>
      ) : null}

      <div className="grid cols-2" style={{ gap: 12, alignItems: "start" }}>
        <Panel title="Connectors">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Throughput</th>
                <th>Last success</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  className={selected?.id === c.id ? "active" : ""}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(c)}
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <StatusIndicator state={statusState(c.status)} size="sm" />
                      <strong>{c.name}</strong>
                      {!c.enabled ? <Badge variant="secondary">off</Badge> : null}
                    </div>
                  </td>
                  <td className="mono">{c.kind}</td>
                  <td><StateChip state={c.status} /></td>
                  <td className="tabular-nums">{(c.throughput_per_min || 0).toFixed(1)}/min</td>
                  <td className="mono muted">{(c.last_success_at || "—").toString().slice(0, 19)}</td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5} className="muted">No connectors seeded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        <div style={{ display: "grid", gap: 12 }}>
          <Panel
            title={selected ? selected.name : "Connector detail"}
            action={
              selected ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" variant="outline" disabled={busy} onClick={toggleEnabled}>
                    {selected.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" disabled={busy || !selected.enabled} onClick={runTest}>
                    Test connection
                  </Button>
                </div>
              ) : null
            }
          >
            {selected ? (
              <>
                <p className="muted">{selected.description}</p>
                <div className="grid cols-2" style={{ gap: 8, marginBottom: 12 }}>
                  <div>
                    <div className="muted text-xs">Kind</div>
                    <code>{selected.kind}</code>
                  </div>
                  <div>
                    <div className="muted text-xs">Version</div>
                    <span className="mono">{selected.version}</span>
                  </div>
                  <div>
                    <div className="muted text-xs">Success / errors</div>
                    <span className="tabular-nums">
                      {selected.success_count} / {selected.error_count}
                    </span>
                  </div>
                  <div>
                    <div className="muted text-xs">Last error</div>
                    <span className="mono muted">
                      {(selected.last_error_at || "—").toString().slice(0, 19)}
                    </span>
                  </div>
                </div>

                <label className="muted text-xs" htmlFor="endpoint">Endpoint URL</label>
                <Input
                  id="endpoint"
                  value={endpointDraft}
                  onChange={(e) => setEndpointDraft(e.target.value)}
                  className="mb-2 font-mono text-xs"
                />
                <label className="muted text-xs" htmlFor="secret">Secret reference</label>
                <Input
                  id="secret"
                  value={secretDraft}
                  onChange={(e) => setSecretDraft(e.target.value)}
                  placeholder="secret:demo-mes-token or env:MES_API_TOKEN"
                  className="mb-2 font-mono text-xs"
                />
                <Button size="sm" variant="secondary" disabled={busy} onClick={saveConfig}>
                  Save configuration
                </Button>

                {testResult ? (
                  <div style={{ marginTop: 12 }}>
                    <StateChip state={testResult.ok ? "healthy" : "error"} />
                    <p style={{ marginTop: 8 }}>{testResult.message}</p>
                    <p className="muted mono">
                      {testResult.latency_ms} ms · {testResult.target}
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">Select a connector</p>
            )}
          </Panel>

          <Panel title="Error history">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.id}>
                    <td className="mono muted">{(e.at || "").slice(0, 19)}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
                {!errors.length && (
                  <tr>
                    <td colSpan={2} className="muted">No recorded connector errors.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
