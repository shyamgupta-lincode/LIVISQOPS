// Entity Manager — full CRUD for core LIVIS MES entities.
// Catalog nav → searchable table → create / edit modal → delete confirm.
// Edge Nodes: create from context-graph device definition (+ Edge+ recipe).

import React, { useEffect, useMemo, useState } from "react";

import { del, get, post, put, usePoll } from "../api";
import { Field, Modal, PageHeader, Panel, toast } from "../components/ui";
import FlashUsbWizard from "./FlashUsbWizard";

const ENTITY_ICONS: Record<string, string> = {
  stations: "▣",
  orders: "⚙",
  users: "👤",
  holds: "⛔",
  edge_nodes: "⇄",
  work_instructions: "⧉",
  models: "◉",
  defects: "✓",
  actions: "⚑",
};

const EDGEPLUS_PROTOCOLS = ["mqtt", "opcua", "vision", "livis_edge", "mes", "sap"] as const;

type FieldDef = {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
};

type CtxDevice = {
  id: string;
  name?: string;
  kind?: string;
  protocol?: string;
  tag_count?: number;
};

type CtxStation = {
  id: string;
  name?: string;
  archetype?: string;
  state?: string;
  devices: CtxDevice[];
};

type CtxLine = { id: string; name?: string; stations: CtxStation[] };
type CtxArea = { id: string; name?: string; code?: string; lines: CtxLine[] };

type ContextOptions = {
  site?: { id: string; name?: string; code?: string } | null;
  areas: CtxArea[];
  context_graph?: {
    id?: string;
    name?: string;
    status?: string;
    levels?: { id: string; label: string }[];
  } | null;
  protocols?: string[];
};

type RecipePreview = {
  recipe_id?: string;
  recipe_version?: string;
  schema_version?: string;
  station?: Record<string, string>;
  devices?: {
    id: string;
    name: string;
    device_type: string;
    protocol: string;
    tag_count: number;
    placeholder?: boolean;
  }[];
  metadata?: Record<string, unknown>;
};

export default function EntityManager() {
  const { data: catalog, refresh: refreshCatalog } = usePoll<any[]>("/api/entities", 8000);
  const [entity, setEntity] = useState<string>("stations");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [mode, setMode] = useState<"create" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [schema, setSchema] = useState<FieldDef[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  // Edge+ create-from-context state
  const [ctxOptions, setCtxOptions] = useState<ContextOptions | null>(null);
  const [edgeAreaId, setEdgeAreaId] = useState("");
  const [edgeLineId, setEdgeLineId] = useState("");
  const [edgeStationId, setEdgeStationId] = useState("");
  const [edgeDeviceId, setEdgeDeviceId] = useState("");
  const [edgeNodeId, setEdgeNodeId] = useState("");
  const [edgeName, setEdgeName] = useState("");
  const [edgeProtocols, setEdgeProtocols] = useState<string[]>([...EDGEPLUS_PROTOCOLS]);
  const [edgePreview, setEdgePreview] = useState<RecipePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [usbFlashOpen, setUsbFlashOpen] = useState(false);
  const [usbFlashNodeId, setUsbFlashNodeId] = useState<string | undefined>();
  const [usbFlashStationId, setUsbFlashStationId] = useState<string | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 220);
    return () => clearTimeout(t);
  }, [q]);

  const listPath = useMemo(() => {
    const qs = debouncedQ ? `?q=${encodeURIComponent(debouncedQ)}` : "";
    return `/api/entities/${entity}${qs}`;
  }, [entity, debouncedQ]);

  const { data: list, refresh } = usePoll<any>(listPath, 6000);

  useEffect(() => {
    get<{ fields: FieldDef[] }>(`/api/entities/${entity}/schema`)
      .then((s) => setSchema(s.fields))
      .catch(() => setSchema([]));
  }, [entity]);

  const activeLabel = catalog?.find((c) => c.key === entity)?.label ?? entity;
  const fields = list?.fields ?? [];
  const items = list?.items ?? [];
  const isEdgeCreate = entity === "edge_nodes" && mode === "create";

  const edgeAreas = ctxOptions?.areas ?? [];
  const edgeLines = edgeAreas.find((a) => a.id === edgeAreaId)?.lines ?? [];
  const edgeStations = edgeLines.find((l) => l.id === edgeLineId)?.stations ?? [];
  const edgeDevices = edgeStations.find((s) => s.id === edgeStationId)?.devices ?? [];
  const selectedStation = edgeStations.find((s) => s.id === edgeStationId);

  const resetEdgeForm = () => {
    setEdgeAreaId("");
    setEdgeLineId("");
    setEdgeStationId("");
    setEdgeDeviceId("");
    setEdgeNodeId("");
    setEdgeName("");
    setEdgeProtocols([...EDGEPLUS_PROTOCOLS]);
    setEdgePreview(null);
  };

  const openCreate = async () => {
    if (entity === "edge_nodes") {
      resetEdgeForm();
      setSelected(null);
      setMode("create");
      try {
        const opts = await get<ContextOptions>("/api/edge/context-options");
        setCtxOptions(opts);
        const firstArea = opts.areas?.[0];
        if (firstArea) {
          setEdgeAreaId(firstArea.id);
          const firstLine = firstArea.lines?.[0];
          if (firstLine) {
            setEdgeLineId(firstLine.id);
            const firstSt = firstLine.stations?.[0];
            if (firstSt) {
              setEdgeStationId(firstSt.id);
              setEdgeName(`${firstSt.name} · Edge+`);
              setEdgeNodeId(`edge-${firstSt.id.replace(/^st-/, "")}`);
            }
          }
        }
      } catch (e: any) {
        toast(String(e.message || e));
      }
      return;
    }
    const blank: Record<string, any> = {};
    schema.forEach((f) => {
      blank[f.name] = f.type === "boolean" ? true : f.type === "number" ? "" : (f.options?.[0] ?? "");
    });
    setForm(blank);
    setSelected(null);
    setMode("create");
  };

  const openEdit = async (row: any) => {
    try {
      const full = await get(`/api/entities/${entity}/${row.id}`);
      const next: Record<string, any> = {};
      schema.forEach((f) => {
        const v = full[f.name];
        next[f.name] = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : v;
      });
      setForm(next);
      setSelected(full);
      setMode("edit");
    } catch (e: any) {
      toast(String(e.message || e));
    }
  };

  const openDelete = (row: any) => {
    setSelected(row);
    setMode("delete");
  };

  const setField = (name: string, value: any) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const payloadFromForm = () => {
    const data: Record<string, any> = {};
    schema.forEach((f) => {
      let v = form[f.name];
      if (f.type === "number") {
        if (v === "" || v === null || v === undefined) return;
        v = Number(v);
      }
      if (f.type === "boolean") v = Boolean(v);
      if (v === "" && f.name === "disposition") v = null;
      data[f.name] = v;
    });
    return data;
  };

  const toggleProtocol = (p: string) => {
    setEdgeProtocols((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  useEffect(() => {
    if (!isEdgeCreate || !edgeStationId) {
      setEdgePreview(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const preview = await post<RecipePreview>("/api/edge/preview-recipe", {
          station_id: edgeStationId,
          device_id: edgeDeviceId || null,
          node_id: edgeNodeId || undefined,
          name: edgeName || undefined,
          protocols: edgeProtocols.length ? edgeProtocols : [...EDGEPLUS_PROTOCOLS],
          actor: "Jordan Hale",
        });
        if (!cancelled) setEdgePreview(preview);
      } catch {
        if (!cancelled) setEdgePreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isEdgeCreate, edgeStationId, edgeDeviceId, edgeNodeId, edgeName, edgeProtocols]);

  const saveEdgeNode = async () => {
    if (!edgeStationId) {
      toast("Select a station from the context graph");
      return;
    }
    if (!edgeProtocols.length) {
      toast("Select at least one Edge+ protocol adapter");
      return;
    }
    setSaving(true);
    try {
      const res = await post<{
        ok: boolean;
        node: { id: string };
        recipe: { recipe_id: string; recipe_version: string; device_count: number };
      }>("/api/edge/nodes", {
        station_id: edgeStationId,
        device_id: edgeDeviceId || null,
        node_id: edgeNodeId || null,
        name: edgeName || null,
        protocols: edgeProtocols,
        actor: "Jordan Hale",
      });
      toast(
        `Created ${res.node.id} · Edge+ recipe ${res.recipe.recipe_id} v${res.recipe.recipe_version} (${res.recipe.device_count} devices)`
      );
      setMode(null);
      refresh();
      refreshCatalog();
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (isEdgeCreate) {
      await saveEdgeNode();
      return;
    }
    setSaving(true);
    try {
      const data = payloadFromForm();
      if (mode === "create") {
        await post(`/api/entities/${entity}`, { data, actor: "Jordan Hale" });
        toast(`Created ${activeLabel.slice(0, -1) || "record"}`);
      } else if (mode === "edit" && selected) {
        await put(`/api/entities/${entity}/${selected.id}`, { data, actor: "Jordan Hale" });
        toast(`Updated ${selected.id}`);
      }
      setMode(null);
      refresh();
      refreshCatalog();
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await del(`/api/entities/${entity}/${selected.id}?actor=${encodeURIComponent("Jordan Hale")}`);
      toast(`Deleted ${selected.id}`);
      setMode(null);
      refresh();
      refreshCatalog();
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (row: any, field: string) => {
    const v = row[field];
    if (v === null || v === undefined) return <span className="faint">—</span>;
    if (field === "edgeplus_ready") {
      return v ? <span className="tag edgeplus-ready">Edge+</span> : <span className="faint">legacy</span>;
    }
    if (Array.isArray(v)) return v.map((x) => <span className="tag" key={String(x)}>{String(x)}</span>);
    if (typeof v === "boolean") return v ? <span className="k-good">yes</span> : <span className="faint">no</span>;
    if (field === "state" || field === "health") {
      const cls = String(v).replace(/\s/g, "");
      return <span className={`chip ${cls}`}>{v}</span>;
    }
    if (field === "priority") return <span className={`pri ${v}`}>{v}</span>;
    if (field === "status" || field === "stage" || field === "severity" || field === "recipe_version") {
      return <span className="tag">{v}</span>;
    }
    const s = String(v);
    return s.length > 42 ? <span title={s}>{s.slice(0, 40)}…</span> : s;
  };

  const onAreaChange = (id: string) => {
    setEdgeAreaId(id);
    const area = edgeAreas.find((a) => a.id === id);
    const line = area?.lines?.[0];
    setEdgeLineId(line?.id || "");
    const st = line?.stations?.[0];
    setEdgeStationId(st?.id || "");
    setEdgeDeviceId("");
    if (st) {
      setEdgeName(`${st.name} · Edge+`);
      setEdgeNodeId(`edge-${st.id.replace(/^st-/, "")}`);
    }
  };

  const onLineChange = (id: string) => {
    setEdgeLineId(id);
    const line = edgeLines.find((l) => l.id === id);
    const st = line?.stations?.[0];
    setEdgeStationId(st?.id || "");
    setEdgeDeviceId("");
    if (st) {
      setEdgeName(`${st.name} · Edge+`);
      setEdgeNodeId(`edge-${st.id.replace(/^st-/, "")}`);
    }
  };

  const onStationChange = (id: string) => {
    setEdgeStationId(id);
    setEdgeDeviceId("");
    const st = edgeStations.find((s) => s.id === id);
    if (st) {
      setEdgeName(`${st.name} · Edge+`);
      setEdgeNodeId(`edge-${st.id.replace(/^st-/, "")}`);
    }
  };

  return (
    <div data-tour="page-entities">
      <PageHeader
        title="Entity Manager"
        sub="Create, read, update and delete core manufacturing records. Mutations are audited."
        tip={
          <>
            Pick an entity on the left, then use <b>New</b>, <b>Edit</b> or <b>Delete</b>.
            Edge Nodes are commissioned from the active context graph device definition (Edge+ recipe).
          </>
        }
        actions={
          <div className="em-crud-badges">
            <span className="crud-badge c">C create</span>
            <span className="crud-badge r">R read</span>
            <span className="crud-badge u">U update</span>
            <span className="crud-badge d">D delete</span>
          </div>
        }
      />

      <div className="em-layout">
        <nav className="em-nav">
          <div className="nav-section-label" style={{ padding: "4px 8px 8px" }}>Entities</div>
          {(catalog ?? []).map((c) => (
            <button
              key={c.key}
              className={`em-nav-item ${entity === c.key ? "active" : ""}`}
              onClick={() => { setEntity(c.key); setQ(""); setMode(null); }}
            >
              <span>{ENTITY_ICONS[c.key] ?? "•"}</span>
              <span>{c.label}</span>
              <span className="count">{c.count}</span>
            </button>
          ))}
          {!catalog && <div className="small faint" style={{ padding: 10 }}>Loading…</div>}
        </nav>

        <div className="em-main">
          <div className="em-toolbar">
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{activeLabel}</div>
              <div className="small faint">{list?.count ?? 0} records</div>
            </div>
            <div className="search">
              <input
                className="field"
                placeholder={`Search ${activeLabel.toLowerCase()}…`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button className="btn" onClick={openCreate}>+ New {activeLabel.replace(/s$/, "")}</button>
            {entity === "edge_nodes" && (
              <button
                className="btn ghost"
                onClick={() => {
                  setUsbFlashNodeId(undefined);
                  setUsbFlashStationId(undefined);
                  setUsbFlashOpen(true);
                }}
              >
                Flash USB
              </button>
            )}
            <button className="btn ghost" onClick={() => { refresh(); refreshCatalog(); }}>Refresh</button>
          </div>

          <div className="em-table-wrap">
            {items.length === 0 ? (
              <div className="empty-state" style={{ margin: 20 }}>
                <strong>No {activeLabel.toLowerCase()} found</strong>
                {debouncedQ
                  ? "Try a different search, or clear the filter."
                  : "Create the first record with the New button above."}
              </div>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    {fields.map((f: string) => (
                      <th key={f}>{f.replace(/_/g, " ")}</th>
                    ))}
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row: any) => (
                    <tr key={row.id}>
                      {fields.map((f: string) => (
                        <td key={f} className={f === "id" ? "mono small" : undefined}>
                          {renderCell(row, f)}
                        </td>
                      ))}
                      <td>
                        <div className="em-actions">
                          <button className="btn ghost sm" onClick={() => openEdit(row)} title="Edit">Edit</button>
                          {entity === "edge_nodes" && (
                            <button
                              className="btn ghost sm"
                              title="Flash USB"
                              onClick={() => {
                                setUsbFlashNodeId(row.id);
                                setUsbFlashStationId(row.station_id);
                                setUsbFlashOpen(true);
                              }}
                            >
                              USB
                            </button>
                          )}
                          <button className="btn danger sm" onClick={() => openDelete(row)} title="Delete">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Panel title="How to use">
            <div className="row wrap" style={{ gap: 16 }}>
              <span className="small dim"><b className="crud-badge c">C</b> New → fill form → Save creates a record</span>
              <span className="small dim"><b className="crud-badge r">R</b> Table + search reads live store</span>
              <span className="small dim"><b className="crud-badge u">U</b> Edit → change fields → Save updates</span>
              <span className="small dim"><b className="crud-badge d">D</b> Delete → confirm removes + audits</span>
              {entity === "edge_nodes" && (
                <span className="small dim">
                  Edge Nodes bind Facility→Area→Line→Station→Device from the context graph.
                  Use <b>Flash USB</b> to push a station recipe onto a device over USB / sim.
                </span>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {isEdgeCreate && (
        <Modal
          title="Create Edge Node"
          subtitle="Bind a context-graph station/device and materialize an Edge+ recipe (livis-edge-plus schema)."
          onClose={() => setMode(null)}
          wide
          footer={
            <>
              <button className="btn ghost" onClick={() => setMode(null)} disabled={saving}>Cancel</button>
              <button className="btn success" onClick={save} disabled={saving || !edgeStationId}>
                {saving ? "Creating…" : "Create Edge+ node"}
              </button>
            </>
          }
        >
          <div className="em-edge-create">
            <div className="em-edge-banner">
              <span className="tag edgeplus-ready">Edge+ ready</span>
              <span className="small dim">
                {ctxOptions?.context_graph?.name || "Active context graph"}
                {ctxOptions?.site ? ` · ${ctxOptions.site.name}` : ""}
              </span>
            </div>

            <div className="form-grid">
              <div>
                <Field label="Facility" required>
                  <input
                    className="field"
                    value={ctxOptions?.site?.name || "—"}
                    disabled
                  />
                </Field>
              </div>
              <div>
                <Field label="Area" required>
                  <select
                    className="field"
                    value={edgeAreaId}
                    onChange={(e) => onAreaChange(e.target.value)}
                  >
                    {edgeAreas.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div>
                <Field label="Line" required>
                  <select
                    className="field"
                    value={edgeLineId}
                    onChange={(e) => onLineChange(e.target.value)}
                  >
                    {edgeLines.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div>
                <Field label="Station" required>
                  <select
                    className="field"
                    value={edgeStationId}
                    onChange={(e) => onStationChange(e.target.value)}
                  >
                    {edgeStations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.archetype} ({s.devices?.length || 0} devices)
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="span-2">
                <Field label="Device (optional — focus one context device)">
                  <select
                    className="field"
                    value={edgeDeviceId}
                    onChange={(e) => setEdgeDeviceId(e.target.value)}
                  >
                    <option value="">All station devices from context definition</option>
                    {edgeDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.kind} / {d.protocol}
                        {d.tag_count ? ` · ${d.tag_count} tags` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div>
                <Field label="Edge+ node id">
                  <input
                    className="field mono"
                    value={edgeNodeId}
                    onChange={(e) => setEdgeNodeId(e.target.value)}
                    placeholder="edge-touring-assembly-line-01"
                  />
                </Field>
              </div>
              <div>
                <Field label="Display name">
                  <input
                    className="field"
                    value={edgeName}
                    onChange={(e) => setEdgeName(e.target.value)}
                    placeholder="Station · Edge+"
                  />
                </Field>
              </div>
              <div className="span-2">
                <Field label="Protocol adapters (Edge+ placeholders)">
                  <div className="em-proto-row">
                    {EDGEPLUS_PROTOCOLS.map((p) => (
                      <label key={p} className={`em-proto-chip ${edgeProtocols.includes(p) ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={edgeProtocols.includes(p)}
                          onChange={() => toggleProtocol(p)}
                        />
                        {p}
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
            </div>

            <div className="em-edge-preview">
              <div className="em-edge-preview-head">
                <strong>Recipe preview</strong>
                <span className="small faint">
                  {previewLoading
                    ? "Building…"
                    : edgePreview
                      ? `${edgePreview.schema_version || "1.0"} · ${edgePreview.recipe_id} · v${edgePreview.recipe_version}`
                      : "Select a station"}
                </span>
              </div>
              {selectedStation && (
                <div className="small dim" style={{ marginBottom: 8 }}>
                  Context path:{" "}
                  <span className="mono">
                    {ctxOptions?.site?.id}/{edgeAreaId}/{edgeLineId}/{edgeStationId}
                    {edgeDeviceId ? `/${edgeDeviceId}` : ""}
                  </span>
                </div>
              )}
              {edgePreview?.devices && edgePreview.devices.length > 0 ? (
                <table className="data em-edge-dev-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Type</th>
                      <th>Protocol</th>
                      <th>Tags</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edgePreview.devices.map((d) => (
                      <tr key={d.id}>
                        <td>{d.name}</td>
                        <td><span className="tag">{d.device_type}</span></td>
                        <td><span className="tag">{d.protocol}</span></td>
                        <td className="mono small">{d.tag_count}</td>
                        <td className="small faint">{d.placeholder ? "adapter stub" : "context device"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="small faint">No devices yet — pick a station with context devices.</div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {(mode === "create" || mode === "edit") && !isEdgeCreate && (
        <Modal
          title={mode === "create" ? `Create ${activeLabel.replace(/s$/, "")}` : `Edit ${selected?.id}`}
          subtitle={mode === "create" ? "Required fields marked with *" : "ID is immutable; other fields can change."}
          onClose={() => setMode(null)}
          wide
          footer={
            <>
              <button className="btn ghost" onClick={() => setMode(null)} disabled={saving}>Cancel</button>
              <button className="btn success" onClick={save} disabled={saving}>
                {saving ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
              </button>
            </>
          }
        >
          <div className="form-grid">
            {schema.map((f) => (
              <div key={f.name} className={f.type === "textarea" || f.name === "scope" || f.name === "reason" || f.name === "context" ? "span-2" : ""}>
                <Field label={f.label} required={f.required}>
                  {f.type === "select" ? (
                    <select
                      className="field"
                      value={form[f.name] ?? ""}
                      onChange={(e) => setField(f.name, e.target.value)}
                    >
                      {f.options?.map((o) => (
                        <option key={o || "(none)"} value={o}>{o || "— none —"}</option>
                      ))}
                    </select>
                  ) : f.type === "boolean" ? (
                    <select
                      className="field"
                      value={form[f.name] ? "true" : "false"}
                      onChange={(e) => setField(f.name, e.target.value === "true")}
                    >
                      <option value="true">Active / true</option>
                      <option value="false">Inactive / false</option>
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      className="field"
                      value={form[f.name] ?? ""}
                      onChange={(e) => setField(f.name, e.target.value)}
                    />
                  ) : (
                    <input
                      className="field"
                      type={f.type === "number" ? "number" : "text"}
                      value={form[f.name] ?? ""}
                      onChange={(e) => setField(f.name, e.target.value)}
                      disabled={mode === "edit" && f.name === "id"}
                    />
                  )}
                </Field>
              </div>
            ))}
          </div>
          {mode === "edit" && entity === "edge_nodes" && selected?.edgeplus_ready && (
            <div className="em-edge-banner" style={{ marginTop: 12 }}>
              <span className="tag edgeplus-ready">Edge+</span>
              <span className="small dim">
                Recipe {selected.recipe_id || "—"} · v{selected.recipe_version || "—"}
                {selected.station_id ? ` · bound to ${selected.station_id}` : ""}
              </span>
            </div>
          )}
        </Modal>
      )}

      {mode === "delete" && selected && (
        <Modal
          title="Delete record?"
          subtitle="This cannot be undone in the current session store."
          onClose={() => setMode(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setMode(null)} disabled={saving}>Cancel</button>
              <button className="btn danger" onClick={confirmDelete} disabled={saving}>
                {saving ? "Deleting…" : "Delete permanently"}
              </button>
            </>
          }
        >
          <div className="confirm-box">
            Delete <strong>{selected.id}</strong> from <strong>{activeLabel}</strong>?
            An audit event will be written.
          </div>
        </Modal>
      )}

      {usbFlashOpen && (
        <FlashUsbWizard
          initialNodeId={usbFlashNodeId}
          initialStationId={usbFlashStationId}
          onClose={() => setUsbFlashOpen(false)}
          onDone={() => {
            refresh();
            refreshCatalog();
          }}
        />
      )}
    </div>
  );
}
