// Context Graph — Explore live graph, Compose schema, organize Reporting structure.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";

import { ago, del, get, post, put, usePoll } from "../api";
import { GraphCategoryIcon, GraphNodeIcon } from "../components/GraphIcons";
import { Panel, Tip, toast } from "../components/ui";
import { useCopilotPageBridge } from "../copilot";

type LeafFlyout = {
  label: string;
  sub: string;
  proto: string;
  top: number;
  left: number;
  width: number;
};

const KIND_STYLE: Record<string, { glyph: string; color: string; label: string }> = {
  facility: { glyph: "🏭", color: "#1F9D5C", label: "Facility" },
  area: { glyph: "▦", color: "#1F9D5C", label: "Area" },
  line: { glyph: "⋯", color: "#1F9D5C", label: "Line" },
  station: { glyph: "▣", color: "#1F9D5C", label: "Station" },
  device: { glyph: "⚙", color: "#167A45", label: "Device" },
  model: { glyph: "◉", color: "#C94A7A", label: "Vision model" },
  doc: { glyph: "🗎", color: "#7B5BB0", label: "Document" },
  image: { glyph: "🖼", color: "#C94A7A", label: "Image evidence" },
  timeseries: { glyph: "∿", color: "#1F9D5C", label: "Time series" },
  production: { glyph: "⬢", color: "#C4841D", label: "Production data" },
  event: { glyph: "⚡", color: "#D06A1E", label: "Events" },
  maintenance: { glyph: "🔧", color: "#2A8A52", label: "Maintenance" },
  map: { glyph: "🗺", color: "#1F9D5C", label: "Map data" },
  source: { glyph: "⇄", color: "#6B7275", label: "Source system" },
};

const OBJECT_STYLE: Record<string, { color: string; glyph: string }> = {
  inspection: { color: "#C94A7A", glyph: "🖼" },
  status: { color: "#1F9D5C", glyph: "●" },
  defect: { color: "#D06A1E", glyph: "⚡" },
  order: { color: "#C4841D", glyph: "⬢" },
  genealogy: { color: "#1F9D5C", glyph: "◇" },
  timeseries: { color: "#1F9D5C", glyph: "∿" },
  work_instruction: { color: "#7B5BB0", glyph: "🗎" },
  document: { color: "#7B5BB0", glyph: "📄" },
  model: { color: "#C94A7A", glyph: "◉" },
  custom: { color: "#6B7275", glyph: "◇" },
};

/** Protocol → datatype / format standards used when defining property objects. */
const PROTOCOL_STANDARDS: Record<string, {
  standard: string;
  types: string[];
  formats: string[];
}> = {
  "OPC UA": {
    standard: "OPC UA Part 3 · Built-in DataTypes",
    types: [
      "Boolean", "SByte", "Byte", "Int16", "Int32", "Int64",
      "UInt16", "UInt32", "UInt64", "Float", "Double", "String",
      "DateTime", "ByteString", "NodeId", "LocalizedText", "StatusCode",
    ],
    formats: ["", "EngineeringUnits", "EURange", "InstrumentRange", "ValuePrecision"],
  },
  "MQTT Sparkplug B": {
    standard: "Eclipse Sparkplug B · Metric datatypes",
    types: [
      "Int8", "Int16", "Int32", "Int64", "UInt8", "UInt16", "UInt32", "UInt64",
      "Float", "Double", "Boolean", "String", "DateTime", "Text", "UUID",
      "DataSet", "Bytes", "File", "Template", "PropertySet",
    ],
    formats: ["", "Metric", "PropertyValue", "Alias", "Historical"],
  },
  "GigE Vision": {
    standard: "GigE Vision / GenICam · Feature types",
    types: ["Boolean", "Integer", "Float", "String", "Enumeration", "Command", "Image", "Blob", "Register"],
    formats: ["", "Mono8", "BayerRG8", "RGB8", "PayloadSize", "PixelFormat"],
  },
  "Open Protocol": {
    standard: "Atlas Copco Open Protocol · MID fields",
    types: ["Integer", "String", "Boolean", "Hex", "Float", "Revision", "MID"],
    formats: ["", "ASCII", "Packed", "Variable"],
  },
  "REST/JSON": {
    standard: "JSON Schema · draft 2020-12 types",
    types: ["string", "number", "integer", "boolean", "object", "array", "null"],
    formats: ["", "date-time", "date", "time", "uri", "uuid", "email", "binary", "byte"],
  },
  "HTTPS": {
    standard: "JSON / HTTP entity types",
    types: ["string", "number", "integer", "boolean", "object", "array", "null"],
    formats: ["", "date-time", "uri", "uuid", "binary", "json"],
  },
  "MES Context": {
    standard: "MES context object · JSON typed fields",
    types: ["string", "number", "integer", "boolean", "object", "array", "enum"],
    formats: ["", "date-time", "id", "code", "uri"],
  },
};

const PROTOCOL_OPTIONS = Object.keys(PROTOCOL_STANDARDS);

type PropDef = {
  id: string;
  key: string;
  label: string;
  data_type: string;
  format?: string;
  unit?: string;
  required?: boolean;
};

function defaultPropsFor(
  objectType: string,
  protocol: string,
): PropDef[] {
  const types = PROTOCOL_STANDARDS[protocol]?.types || [];
  const pick = (...candidates: string[]) =>
    candidates.find((t) => types.includes(t)) || types[0] || "String";

  const mk = (key: string, label: string, data_type: string, extra: Partial<PropDef> = {}): PropDef => ({
    id: `prop-${key}`,
    key,
    label,
    data_type,
    format: "",
    unit: "",
    required: false,
    ...extra,
  });

  switch (objectType) {
    case "inspection":
      return [
        mk("image_ref", "Image / payload", pick("Image", "ByteString", "Bytes", "binary", "string"), { required: true, format: protocol === "GigE Vision" ? "Mono8" : "" }),
        mk("verdict", "Verdict", pick("Enumeration", "String", "string", "enum"), { required: true }),
        mk("confidence", "Confidence", pick("Float", "Double", "number"), { unit: "%" }),
        mk("captured_at", "Captured at", pick("DateTime", "date-time", "string"), { required: true, format: protocol.includes("JSON") || protocol === "HTTPS" || protocol === "REST/JSON" || protocol === "MES Context" ? "date-time" : "" }),
      ];
    case "status":
      return [
        mk("state", "State", pick("String", "LocalizedText", "Text", "string", "enum"), { required: true }),
        mk("cycle_time_s", "Cycle time", pick("Float", "Double", "number"), { unit: "s", required: true }),
        mk("availability", "Availability", pick("Float", "Double", "number"), { unit: "%" }),
        mk("ts", "Timestamp", pick("DateTime", "date-time", "string"), { required: true }),
      ];
    case "defect":
      return [
        mk("class", "Defect class", pick("String", "Text", "string", "enum"), { required: true }),
        mk("severity", "Severity", pick("String", "Enumeration", "string", "enum"), { required: true }),
        mk("status", "Status", pick("String", "string", "enum"), { required: true }),
        mk("detected_at", "Detected at", pick("DateTime", "date-time", "string"), { required: true }),
      ];
    case "order":
      return [
        mk("order_id", "Order id", pick("String", "string"), { required: true, format: protocol === "REST/JSON" || protocol === "MES Context" ? "id" : "" }),
        mk("qty", "Quantity", pick("Int32", "Integer", "integer", "number"), { required: true }),
        mk("completed", "Completed", pick("Int32", "Integer", "integer", "number")),
        mk("status", "Status", pick("String", "string", "enum"), { required: true }),
      ];
    case "genealogy":
      return [
        mk("vin", "VIN / serial", pick("String", "string"), { required: true }),
        mk("variant", "Variant", pick("String", "string")),
        mk("status", "Status", pick("String", "string", "enum"), { required: true }),
        mk("ops_count", "Operations", pick("Int16", "Integer", "integer", "number")),
      ];
    case "timeseries":
      return [
        mk("value", "Value", pick("Double", "Float", "number"), { required: true, format: protocol === "OPC UA" ? "EngineeringUnits" : "" }),
        mk("quality", "Quality / status", pick("StatusCode", "Int16", "String", "string")),
        mk("source_timestamp", "Source timestamp", pick("DateTime", "date-time", "string"), { required: true }),
        mk("eng_unit", "Engineering unit", pick("String", "LocalizedText", "string"), { format: protocol === "OPC UA" ? "EngineeringUnits" : "" }),
      ];
    case "work_instruction":
      return [
        mk("wi_id", "Instruction id", pick("String", "string"), { required: true, format: "id" }),
        mk("version", "Version", pick("String", "string"), { required: true }),
        mk("step_count", "Steps", pick("Int16", "Integer", "integer", "number")),
        mk("status", "Status", pick("String", "string", "enum"), { required: true }),
      ];
    case "document":
      return [
        mk("doc_id", "Document id", pick("String", "string"), { required: true }),
        mk("title", "Title", pick("String", "LocalizedText", "Text", "string"), { required: true }),
        mk("uri", "URI", pick("String", "string"), { format: "uri" }),
        mk("revision", "Revision", pick("String", "Revision", "string")),
      ];
    case "model":
      return [
        mk("model_id", "Model id", pick("String", "string"), { required: true }),
        mk("version", "Version", pick("String", "string"), { required: true }),
        mk("fitness", "Fitness score", pick("Float", "Double", "number"), { unit: "%" }),
        mk("stage", "Release stage", pick("String", "Enumeration", "string", "enum"), { required: true }),
      ];
    default:
      return [
        mk("id", "Id", pick("String", "string"), { required: true }),
        mk("value", "Value", pick("String", "Double", "string", "number")),
        mk("ts", "Timestamp", pick("DateTime", "date-time", "string")),
      ];
  }
}

const DEFAULT_PROTOCOL_BY_TYPE: Record<string, string> = {
  inspection: "GigE Vision",
  status: "OPC UA",
  defect: "MQTT Sparkplug B",
  order: "REST/JSON",
  genealogy: "MES Context",
  timeseries: "OPC UA",
  work_instruction: "MES Context",
  document: "HTTPS",
  model: "REST/JSON",
  quality_event: "MES Context",
  candidate_event: "MES Context",
  failure_mode: "MES Context",
  lesson: "MES Context",
};

/** Catalog of data objects that can be selected into a context model. */
const OBJECT_CATALOG: {
  object_type: string;
  label: string;
  description: string;
  report_at: string;
  rollup_to: string[];
  lenses: string[];
  protocol: string;
}[] = [
  {
    object_type: "inspection",
    label: "Inspection / evidence objects",
    description: "Vision captures and dispositions roll up the hierarchy for quality reporting.",
    report_at: "station",
    rollup_to: ["line", "area", "facility"],
    lenses: ["quality"],
    protocol: "GigE Vision",
  },
  {
    object_type: "status",
    label: "Station / line status objects",
    description: "Live state, cycle, takt and health metrics for operations reporting.",
    report_at: "station",
    rollup_to: ["line", "area"],
    lenses: ["production", "maintenance"],
    protocol: "OPC UA",
  },
  {
    object_type: "defect",
    label: "Defect / NCR objects",
    description: "Quality events and holds organized by station context.",
    report_at: "station",
    rollup_to: ["line", "area", "facility"],
    lenses: ["quality"],
    protocol: "MQTT Sparkplug B",
  },
  {
    object_type: "order",
    label: "Production order objects",
    description: "ERP/SAP work orders dispatched to lines.",
    report_at: "line",
    rollup_to: ["area", "facility"],
    lenses: ["production", "supply_chain"],
    protocol: "REST/JSON",
  },
  {
    object_type: "genealogy",
    label: "VIN / component genealogy",
    description: "Product identity and component serials through the process path.",
    report_at: "station",
    rollup_to: ["line", "facility"],
    lenses: ["production", "supply_chain", "quality"],
    protocol: "MES Context",
  },
  {
    object_type: "timeseries",
    label: "Process time series",
    description: "Historian tags and cycle series attached to instruments.",
    report_at: "device",
    rollup_to: ["station", "line"],
    lenses: ["production", "maintenance"],
    protocol: "OPC UA",
  },
  {
    object_type: "work_instruction",
    label: "Work instruction objects",
    description: "Standard work governing station execution.",
    report_at: "station",
    rollup_to: ["line"],
    lenses: ["production", "quality"],
    protocol: "MES Context",
  },
  {
    object_type: "document",
    label: "Documents & procedures",
    description: "SOPs, passports and controlled documents linked to the hierarchy.",
    report_at: "station",
    rollup_to: ["line", "area"],
    lenses: ["quality", "production"],
    protocol: "HTTPS",
  },
  {
    object_type: "model",
    label: "Vision / AI model objects",
    description: "Model registry entries and fitness passports for gated release.",
    report_at: "station",
    rollup_to: ["line", "area", "facility"],
    lenses: ["quality"],
    protocol: "REST/JSON",
  },
  {
    object_type: "quality_event",
    label: "Quality event objects",
    description: "First-class quality-event lifecycle objects with digital-thread context.",
    report_at: "station",
    rollup_to: ["line", "area", "facility"],
    lenses: ["quality"],
    protocol: "MES Context",
  },
  {
    object_type: "candidate_event",
    label: "Detection candidate objects",
    description: "Detection-plane candidate events (not raw HF streams) for agent intake.",
    report_at: "station",
    rollup_to: ["line", "area", "facility"],
    lenses: ["quality"],
    protocol: "MES Context",
  },
  {
    object_type: "failure_mode",
    label: "Failure mode objects",
    description: "Asset failure modes linking PdM health scores to maintenance actions.",
    report_at: "device",
    rollup_to: ["line", "area", "facility"],
    lenses: ["quality", "maintenance"],
    protocol: "MES Context",
  },
  {
    object_type: "lesson",
    label: "Approved lesson objects",
    description: "Steward-approved knowledge lessons derived from closed RCA cases.",
    report_at: "facility",
    rollup_to: ["line", "area", "facility"],
    lenses: ["quality", "maintenance"],
    protocol: "MES Context",
  },
];

const LENSES = [
  { id: "production", label: "Production", color: "#1F9D5C" },
  { id: "maintenance", label: "Maintenance", color: "#2A8A52" },
  { id: "supply_chain", label: "Supply chain", color: "#C4841D" },
  { id: "quality", label: "Product quality", color: "#C94A7A" },
];

const LEVELS = ["facility", "area", "line", "station", "device"] as const;

const LEVEL_ENTITY_OPTIONS = [
  { id: "site", label: "site" },
  { id: "area", label: "area" },
  { id: "line", label: "line" },
  { id: "station", label: "station" },
  { id: "device", label: "device" },
  { id: "custom", label: "custom" },
] as const;

const MODES = [
  { id: "compose", label: "Compose", blurb: "Hierarchy · object bindings", icon: "✎" },
  { id: "explore", label: "Explore", blurb: "Live twin · inspect values", icon: "◈" },
  { id: "reporting", label: "Reporting", blurb: "Rollups by context path", icon: "▤" },
] as const;

type Mode = (typeof MODES)[number]["id"];
type UiMode = "view" | "edit";

export default function ContextGraph() {
  const nav = useNavigate();
  const { graphId } = useParams<{ graphId?: string }>();
  const inWorkflow = !!graphId;

  const [mode, setMode] = useState<Mode>("compose");
  const [uiMode, setUiMode] = useState<UiMode>("edit");
  const [focus, setFocus] = useState<string | null>(null);
  const [lens, setLens] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [activating, setActivating] = useState(false);

  const { data: g } = usePoll<any>(
    inWorkflow
      ? (focus ? `/api/graph?focus=${encodeURIComponent(focus)}` : "/api/graph")
      : null,
    8000
  );
  const { data: sources } = usePoll<any[]>(inWorkflow ? "/api/graph/sources" : null, 20000);
  const { data: schema, refresh: refreshSchema } = usePoll<any>(
    inWorkflow ? "/api/graph/schema" : null,
    12000
  );
  const { data: reporting, refresh: refreshReporting } = usePoll<any>(
    inWorkflow ? "/api/graph/reporting" : null,
    10000
  );
  const { data: contexts, refresh: refreshContexts } = usePoll<any>("/api/graph/contexts", 15000);

  const refreshAll = () => {
    refreshSchema();
    refreshReporting();
    refreshContexts();
  };

  const activeId = contexts?.active_id || schema?.id;
  const graphs: any[] = contexts?.items || [];
  const openedGraph = graphs.find((item) => item.id === graphId) || null;

  // Activate the opened graph so compose/explore/reporting bind to it.
  useEffect(() => {
    if (!graphId || !contexts) return;
    if (contexts.active_id === graphId) return;
    if (!contexts.items?.some((item: any) => item.id === graphId)) {
      toast("Context graph not found");
      nav("/engineer/graph", { replace: true });
      return;
    }
    let alive = true;
    setActivating(true);
    post(`/api/graph/contexts/${encodeURIComponent(graphId)}/activate`)
      .then(() => { if (alive) refreshAll(); })
      .catch((e: any) => {
        if (!alive) return;
        toast(String(e.message || e));
        nav("/engineer/graph", { replace: true });
      })
      .finally(() => { if (alive) setActivating(false); });
    return () => { alive = false; };
  }, [graphId, contexts?.active_id, contexts?.items?.length]);

  const openGraph = async (id: string, nextUi: UiMode = uiMode) => {
    if (!id) return;
    setBusy(true);
    try {
      if (id !== activeId) {
        await post(`/api/graph/contexts/${encodeURIComponent(id)}/activate`);
        refreshAll();
      }
      setUiMode(nextUi);
      setMode(nextUi === "view" ? "explore" : "compose");
      setFocus(null);
      setSelected(null);
      nav(`/engineer/graph/${encodeURIComponent(id)}`);
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const createGraph = async () => {
    const name = nameDraft.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await post("/api/graph/contexts", {
        name,
        clone_from: activeId || undefined,
        actor: "Jordan Hale",
      });
      await post(`/api/graph/contexts/${encodeURIComponent(created.id)}/activate`);
      toast(`Created “${created.name}”`);
      setCreateOpen(false);
      setNameDraft("");
      setUiMode("edit");
      setMode("compose");
      refreshAll();
      nav(`/engineer/graph/${encodeURIComponent(created.id)}`);
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const renameGraph = async () => {
    const id = graphId || activeId;
    if (!id) return;
    const name = nameDraft.trim();
    if (!name) return;
    setBusy(true);
    try {
      await put(`/api/graph/contexts/${encodeURIComponent(id)}`, {
        name,
        actor: "Jordan Hale",
      });
      toast("Context graph renamed");
      setRenameOpen(false);
      setNameDraft("");
      refreshAll();
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const deleteGraph = async (id?: string, label?: string) => {
    const targetId = id || graphId || activeId;
    if (!targetId || graphs.length <= 1) {
      toast("Keep at least one context graph");
      return;
    }
    const title = label || openedGraph?.name || schema?.name || "this graph";
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await del(`/api/graph/contexts/${encodeURIComponent(targetId)}`);
      toast("Context graph deleted");
      refreshAll();
      if (graphId === targetId) nav("/engineer/graph");
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!contexts) return <p className="dim">Loading context graphs…</p>;

  const readOnly = uiMode === "view";
  const neighborCount = g?.neighbors?.length ?? 0;
  const entityCount = g?.neighbors?.filter((n: any) => n.node.focusable).length ?? 0;
  const dataCount = neighborCount - entityCount;
  const graphTitle = openedGraph?.name || schema?.name || "Context graph";
  const graphStatus = openedGraph?.status || schema?.status;

  /* ── Page 1 · library ─────────────────────────────────────────── */
  if (!inWorkflow) {
    return (
      <div className="cg-page cg-library-page" data-tour="page-context-graph">
        <header className="cg-hero">
          <div className="cg-hero-copy">
            <div className="cg-hero-kicker">Context plane · plant knowledge model</div>
            <h1 className="page-title cg-title">Context Graph</h1>
            <p className="page-sub">
              Choose a context graph to compose hierarchy and bindings, explore live context, or
              report along the plant path.
            </p>
          </div>
          <div className="cg-hero-aside">
            <div className="cg-hero-stats">
              <div><em>{graphs.length}</em><span>models</span></div>
              <div><em>{graphs.filter((x) => x.status === "Published").length}</em><span>published</span></div>
              <div><em>{graphs.filter((x) => x.status === "Draft").length}</em><span>drafts</span></div>
            </div>
          </div>
        </header>

        <section className="cg-library" aria-label="Context graph library" data-tour="cg-library">
          <div className="cg-library-head">
            <div className="cg-library-main">
              <span className="cg-library-label">Context graphs</span>
              <span className="cg-library-meta">
                {graphs.length} model{graphs.length === 1 ? "" : "s"} in the library
              </span>
            </div>
            <div className="cg-library-actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setNameDraft(`Copy of ${graphs.find((x) => x.active)?.name || "context graph"}`);
                  setCreateOpen(true);
                }}
              >
                + New context graph
              </button>
            </div>
          </div>

          <div className="cg-library-grid" role="list">
            {graphs.map((item) => {
              const isActive = item.id === activeId || !!item.active;
              const statusClass = String(item.status || "Draft").toLowerCase().replace(/\s/g, "-");
              return (
                <article
                  key={item.id}
                  className={`cg-graph-card ${isActive ? "is-active" : ""}`}
                  role="listitem"
                >
                  <button
                    type="button"
                    className="cg-graph-card-hit"
                    disabled={busy}
                    onClick={() => openGraph(item.id, "edit")}
                  >
                    <div className="cg-graph-card-top">
                      <span className={`tag cg-schema-status ${statusClass}`}>{item.status || "Draft"}</span>
                      {isActive && <span className="cg-graph-card-active">Active</span>}
                    </div>
                    <strong className="cg-graph-card-title">{item.name}</strong>
                    {item.description ? (
                      <p className="cg-graph-card-desc">{item.description}</p>
                    ) : (
                      <p className="cg-graph-card-desc faint">Plant knowledge model</p>
                    )}
                    <div className="cg-graph-card-stats">
                      <span><em>v{item.version || "1.0"}</em></span>
                      <span><em>{item.enabled_bindings ?? 0}</em> / {item.binding_count ?? 0} bindings</span>
                      {item.updated_at && <span>Updated {ago(item.updated_at)}</span>}
                    </div>
                  </button>
                  <div className="cg-graph-card-foot">
                    <button
                      type="button"
                      className="btn sm"
                      disabled={busy}
                      onClick={() => openGraph(item.id, "edit")}
                    >
                      Open workflow →
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={busy}
                      onClick={() => openGraph(item.id, "view")}
                    >
                      View
                    </button>
                  </div>
                </article>
              );
            })}
            <button
              type="button"
              className="cg-graph-card is-new"
              disabled={busy}
              onClick={() => {
                setNameDraft(`Copy of ${graphs.find((x) => x.active)?.name || "context graph"}`);
                setCreateOpen(true);
              }}
            >
              <span className="cg-graph-card-plus">+</span>
              <strong>New context graph</strong>
              <p className="cg-graph-card-desc">Clone a model and open its Compose → Explore → Reporting workflow</p>
            </button>
          </div>
        </section>

        {createOpen && (
          <div className="cg-library-dialog">
            <strong>New context graph</strong>
            <input
              className="field"
              value={nameDraft}
              autoFocus
              placeholder="Context graph name"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createGraph();
                if (e.key === "Escape") setCreateOpen(false);
              }}
            />
            <div className="cg-library-dialog-actions">
              <button type="button" className="btn ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button type="button" className="btn" disabled={busy || !nameDraft.trim()} onClick={createGraph}>
                Create & open
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Page 2 · workflow inside a graph ─────────────────────────── */
  if (activating || contexts.active_id !== graphId || !schema || !g) {
    return <p className="dim">Opening context graph…</p>;
  }

  return (
    <div
      className={`cg-page ${mode === "explore" ? "is-explore" : ""} ui-${uiMode}`}
      data-tour="page-context-graph"
    >
      <header className="cg-hero">
        <div className="cg-hero-copy">
          <button type="button" className="cg-back" onClick={() => nav("/engineer/graph")}>
            ← All context graphs
          </button>
          <div className="cg-hero-kicker">Context plane · workflow</div>
          <h1 className="page-title cg-title">{graphTitle}</h1>
          <p className="page-sub">
            Compose the hierarchy, explore live context, then report along the path for this model.
          </p>
        </div>
        <div className="cg-hero-aside">
          {graphStatus && (
            <span className={`tag cg-schema-status ${String(graphStatus).toLowerCase().replace(/\s/g, "-")}`}>
              Schema · {graphStatus}
            </span>
          )}
          <div className="cg-hero-stats">
            <div><em>{neighborCount}</em><span>linked now</span></div>
            <div><em>{entityCount}</em><span>entities</span></div>
            <div><em>{dataCount}</em><span>data objects</span></div>
          </div>
        </div>
      </header>

      <div className="cg-workflow-chrome">
        <div className="cg-library-actions">
          <div className="cg-ui-toggle" role="group" aria-label="View or edit mode">
            <button
              type="button"
              className={uiMode === "view" ? "on" : ""}
              onClick={() => { setUiMode("view"); if (mode === "compose") setMode("explore"); }}
            >
              View
            </button>
            <button
              type="button"
              className={uiMode === "edit" ? "on" : ""}
              onClick={() => { setUiMode("edit"); setMode("compose"); }}
            >
              Edit
            </button>
          </div>
          <button
            type="button"
            className="btn ghost"
            disabled={busy || readOnly}
            onClick={() => { setNameDraft(graphTitle); setRenameOpen(true); }}
          >
            Rename
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy || readOnly || graphs.length <= 1}
            onClick={() => deleteGraph(graphId, graphTitle)}
          >
            Delete
          </button>
        </div>
      </div>

      {renameOpen && (
        <div className="cg-library-dialog">
          <strong>Rename context graph</strong>
          <input
            className="field"
            value={nameDraft}
            autoFocus
            placeholder="Context graph name"
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") renameGraph();
              if (e.key === "Escape") setRenameOpen(false);
            }}
          />
          <div className="cg-library-dialog-actions">
            <button type="button" className="btn ghost" onClick={() => setRenameOpen(false)}>Cancel</button>
            <button type="button" className="btn" disabled={busy || !nameDraft.trim()} onClick={renameGraph}>
              Save name
            </button>
          </div>
        </div>
      )}

      <div className="cg-modes" role="tablist" data-tour="cg-modes">
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={`cg-mode ${mode === m.id ? "active" : ""}`}
            onClick={() => setMode(m.id)}
          >
            <span className="cg-mode-ico">{m.icon}</span>
            <span className="cg-mode-copy">
              <strong><i>0{i + 1}</i> {m.label}</strong>
              <span>{m.blurb}</span>
            </span>
          </button>
        ))}
      </div>

      <div className={`cg-mode-banner ${uiMode}`}>
        {uiMode === "edit" ? (
          <span>Edit mode · Compose and publish bindings for <b>{graphTitle}</b>.</span>
        ) : (
          <span>View mode · Inspect Explore and Reporting without changing the model.</span>
        )}
      </div>

      {mode === "compose" && (
        <ComposeView
          schema={schema}
          readOnly={readOnly}
          onSaved={refreshAll}
          onRequestEdit={() => setUiMode("edit")}
        />
      )}
      {mode === "explore" && (
        <ExploreView
          g={g}
          sources={sources}
          reporting={reporting}
          lens={lens}
          setLens={setLens}
          selected={selected}
          setSelected={setSelected}
          setFocus={setFocus}
        />
      )}
      {mode === "reporting" && (
        <ReportingView
          reporting={reporting}
          onFocusEntity={(id) => { setFocus(id); setMode("explore"); }}
        />
      )}
    </div>
  );
}

/* ── Explore · overview radial + cinema drill + AI dock ───────────── */

const GRAPH_CATEGORIES = [
  { id: "entities", label: "Entities", icon: "▣", color: "#C94A7A", match: (n: any) => n.node.focusable },
  { id: "inspections", label: "Inspections", icon: "🖼", color: "#C94A7A", match: (n: any) => !n.node.focusable && n.node.kind === "image" },
  { id: "quality", label: "Quality events", icon: "⚡", color: "#D06A1E", match: (n: any) => !n.node.focusable && n.node.kind === "event" },
  { id: "production", label: "Production", icon: "⬢", color: "#C4841D", match: (n: any) => !n.node.focusable && n.node.kind === "production" },
  { id: "timeseries", label: "Time series", icon: "∿", color: "#1F9D5C", match: (n: any) => !n.node.focusable && n.node.kind === "timeseries" },
  { id: "support", label: "Docs & systems", icon: "🗎", color: "#7B5BB0", match: (n: any) => !n.node.focusable && ["doc", "model", "map", "source", "maintenance"].includes(n.node.kind) },
] as const;

type ExploreLayout = "overview" | "cinema";

function hashTone(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function leafSignal(nb: any): { gap: number; tone: "ok" | "warn" | "bad"; bars: ("ok" | "warn" | "bad")[] } {
  const h = hashTone(nb.node.id);
  const kind = nb.node.kind;
  let gap = 2 + (h % 14);
  let tone: "ok" | "warn" | "bad" = "ok";
  if (kind === "event" || String(nb.node.label).toLowerCase().includes("defect")) {
    tone = "bad";
    gap = 8 + (h % 10);
  } else if (kind === "image" || kind === "timeseries") {
    tone = h % 3 === 0 ? "warn" : "ok";
  } else if (nb.node.focusable && nb.node.meta?.state && nb.node.meta.state !== "running") {
    tone = "warn";
  } else if (h % 5 === 0) {
    tone = "warn";
  }
  const bars: ("ok" | "warn" | "bad")[] = [
    tone === "bad" ? "bad" : "ok",
    tone === "warn" || tone === "bad" ? "warn" : "ok",
    h % 2 === 0 ? "ok" : tone,
  ];
  return { gap, tone, bars };
}

type EdgeLink = {
  protocol: string;
  method: string;
  transport?: string;
  source?: string;
  endpoint?: string | null;
  status?: string;
  tags?: number;
  rel?: string;
};

function resolveLink(nb: any): EdgeLink {
  if (nb?.link) return nb.link as EdgeLink;
  const kind = nb?.node?.kind ?? "doc";
  const meta = nb?.node?.meta ?? {};
  const fallback: Record<string, [string, string]> = {
    facility: ["MES Context", "expand"],
    area: ["MES Context", "expand"],
    line: ["MES Context", "expand"],
    station: ["MES Context", "expand"],
    device: ["OPC UA", "subscribe"],
    image: ["GigE Vision", "capture"],
    event: ["MQTT Sparkplug B", "pubsub"],
    production: ["REST/ERP", "poll"],
    timeseries: ["OPC UA", "subscribe"],
    doc: ["HTTPS", "fetch"],
    source: ["Connector", "acquire"],
    maintenance: ["REST", "poll"],
    model: ["gRPC", "infer"],
    map: ["File", "import"],
  };
  const [protocol, method] = fallback[kind] ?? ["HTTPS", "fetch"];
  return {
    protocol: meta.protocol || protocol,
    method: method,
    source: meta.source,
    endpoint: meta.endpoint,
    status: "Connected",
    rel: nb?.rel,
  };
}

function shortProto(protocol: string): string {
  if (protocol.length <= 11) return protocol;
  if (protocol.startsWith("MQTT")) return "MQTT";
  if (protocol.startsWith("OPC")) return "OPC UA";
  if (protocol.startsWith("REST")) return "REST";
  if (protocol.startsWith("GigE")) return "GigE";
  if (protocol.startsWith("Open")) return "OpenProt";
  return protocol.slice(0, 10);
}

/** Compact label for minimized link chips at low zoom. */
function miniProto(protocol: string): string {
  if (protocol.startsWith("MQTT")) return "MQTT";
  if (protocol.startsWith("MES")) return "MES";
  if (protocol.startsWith("REST")) return "REST";
  if (protocol.startsWith("HTTPS")) return "HTTPS";
  if (protocol.startsWith("OPC")) return "OPC";
  if (protocol.startsWith("GigE")) return "GigE";
  if (protocol.startsWith("Open")) return "OP";
  const short = shortProto(protocol);
  return short.length <= 5 ? short : short.slice(0, 4);
}

/** Zoom at/below this uses minimized (protocol-only) link chips. */
const LINK_CHIP_MIN_ZOOM = 0.88;

function LinkChip({
  protocol,
  method,
  title,
  className = "",
  style,
  onClick,
  compact,
  asSpan = false,
}: {
  protocol: string;
  method: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  compact: boolean;
  asSpan?: boolean;
}) {
  const tip = title || `${protocol} · method ${method}`;
  const cls = `cg-link-chip ${compact ? "is-min" : "is-expanded"} ${className}`.trim();
  const body = (
    <>
      <strong>
        <span className="cg-chip-tight">{miniProto(protocol)}</span>
        <span className="cg-chip-wide">{shortProto(protocol)}</span>
      </strong>
      <em>{method}</em>
    </>
  );
  if (asSpan) {
    return (
      <span className={cls} style={style} title={tip}>
        {body}
      </span>
    );
  }
  return (
    <button type="button" className={cls} style={style} title={tip} onClick={onClick}>
      {body}
    </button>
  );
}

type NodeRole = "parent" | "child" | "data";

/** Lower rank = higher in the plant hierarchy (ancestor). */
const KIND_RANK: Record<string, number> = {
  facility: 0,
  area: 1,
  line: 2,
  station: 3,
  device: 4,
  model: 4,
  doc: 5,
  map: 5,
  source: 5,
};

function nodeRole(nb: any, pathIds?: Set<string>, focusKind?: string): NodeRole {
  if (!nb?.node?.focusable) return "data";
  // Already on the cinema path → always a back-link (prevents recursive re-expand).
  if (pathIds?.has(nb.node.id)) return "parent";
  const nk = String(nb.node.kind || "");
  const fk = String(focusKind || "");
  // Hierarchy ancestor (e.g. station when focused on a device) → back, never re-expand.
  if (
    fk && nk &&
    KIND_RANK[nk] !== undefined &&
    KIND_RANK[fk] !== undefined &&
    KIND_RANK[nk] < KIND_RANK[fk]
  ) {
    return "parent";
  }
  const rel = String(nb.rel || "").toLowerCase();
  if (
    rel === "part of" ||
    rel.includes("governed") ||
    rel.includes("inspected by") ||
    rel === "inspects" ||
    rel === "governs"
  ) return "parent";
  return "child";
}

/** Cinema fan order: children first (drill forward), then data, parents last (go back). */
function sortFanLeaves(items: any[], pathIds?: Set<string>, focusKind?: string): any[] {
  const rank = (nb: any) => {
    const r = nodeRole(nb, pathIds, focusKind);
    if (r === "child") return 0;
    if (r === "data") return 1;
    return 2;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

const CATEGORY_LINKS: Record<string, EdgeLink> = {
  entities: { protocol: "MES Context", method: "expand", source: "Hierarchy model", status: "Connected", rel: "contains" },
  inspections: { protocol: "GigE Vision", method: "capture", source: "Vision runtime", status: "Connected", rel: "evidence" },
  quality: { protocol: "MQTT Sparkplug B", method: "pubsub", source: "Event bus", status: "Connected", rel: "raised" },
  production: { protocol: "REST/ERP", method: "poll", source: "ERP → MES", status: "Connected", rel: "produces" },
  timeseries: { protocol: "OPC UA", method: "subscribe", source: "Edge historian", status: "Connected", rel: "measures" },
  support: { protocol: "HTTPS", method: "fetch", source: "Document store", status: "Connected", rel: "documents" },
};

function categoryLink(cat: { id: string; label: string; count?: number }): EdgeLink {
  const base = CATEGORY_LINKS[cat.id] ?? {
    protocol: "MES Context", method: "route", source: "Context graph", status: "Connected",
  };
  return { ...base, tags: cat.count ?? 0, rel: base.rel || cat.label };
}

type ExpandFrame = {
  id: string;
  label: string;
  kind: string;
  node: any;
  neighbors: any[];
  categoryId: string;
  selectedLeafId?: string | null;
  /** Present when this frame continues from a leaf on the previous segment (no new root). */
  via?: { fromId: string; fromLabel: string; rel: string; link: EdgeLink };
};

function buildCategories(neighbors: any[], lens: string | null) {
  const filtered = neighbors.filter((nb: any) => !lens || nb.node.lenses.includes(lens));
  return GRAPH_CATEGORIES.map((c) => {
    const items = filtered.filter(c.match);
    return { ...c, items, count: items.length };
  }).filter((c) => c.count > 0);
}

/** Convert a point from viewport space into an element's unscaled local Y (ignores CSS zoom/scale). */
function localMidY(el: HTMLElement, container: HTMLElement): number {
  const er = el.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  const scale = cr.height / Math.max(container.offsetHeight, 1) || 1;
  return (er.top + er.height / 2 - cr.top) / scale;
}

function localBox(container: HTMLElement): { w: number; h: number; scale: number } {
  const r = container.getBoundingClientRect();
  const scale = r.width / Math.max(container.offsetWidth, 1) || 1;
  return {
    w: Math.max(container.offsetWidth, 1),
    h: Math.max(container.offsetHeight, 1),
    scale,
  };
}

function frameFromGraph(
  graph: any,
  lens: string | null,
  categoryId?: string,
  via?: ExpandFrame["via"],
): ExpandFrame {
  const cats = buildCategories(graph.neighbors || [], lens);
  const catId = categoryId && cats.some((c) => c.id === categoryId)
    ? categoryId
    : (cats[0]?.id ?? "entities");
  return {
    id: graph.focus.id,
    label: graph.focus.label,
    kind: graph.focus.kind,
    node: graph.focus,
    neighbors: graph.neighbors || [],
    categoryId: catId,
    selectedLeafId: null,
    via,
  };
}

function MiniSpark({ values }: { values: number[] }) {
  if (!values?.length) return null;
  const max = Math.max(...values, 0.001);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * 64;
    const y = 22 - ((v - min) / range) * 18;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className="cg-mini-spark" viewBox="0 0 64 24" width="64" height="24" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function ExploreView({
  g, sources, reporting, lens, setLens, selected, setSelected, setFocus,
}: {
  g: any; sources: any[] | null; reporting: any;
  lens: string | null;
  setLens: (l: string | null) => void;
  selected: any; setSelected: (n: any) => void;
  setFocus: (id: string | null) => void;
}) {
  const nav = useNavigate();
  const [layout, setLayout] = useState<ExploreLayout>("overview");
  const [categoryId, setCategoryId] = useState<string>("entities");
  const [panelOpen, setPanelOpen] = useState(true);
  const [live, setLive] = useState<any>(null);
  const [liveTick, setLiveTick] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fanKey, setFanKey] = useState(0);
  const [toastBadge, setToastBadge] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [edgeFocus, setEdgeFocus] = useState(false);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [frames, setFrames] = useState<ExpandFrame[]>([]);
  const [expanding, setExpanding] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const inspectId = selected?.id ?? g.focus.id;
  // Cinema drill keeps plant `g.focus` fixed; live values need the frame that owns the leaf.
  const cinemaFocusId = frames.length
    ? (frames[frames.length - 1].id || g.focus.id)
    : g.focus.id;
  const focusKs = KIND_STYLE[g.focus.kind] ?? KIND_STYLE.facility;
  const parentCrumb = g.path.length > 1 ? g.path[g.path.length - 2] : null;

  const filteredNeighbors = useMemo(
    () => g.neighbors.filter((nb: any) => !lens || nb.node.lenses.includes(lens)),
    [g.neighbors, lens]
  );

  const categories = useMemo(() => buildCategories(g.neighbors || [], lens), [g.neighbors, lens]);

  // Keep root frame in sync; reset expansion when plant focus changes
  useEffect(() => {
    const root = frameFromGraph(g, lens, categoryId);
    setFrames((prev) => {
      if (!prev.length || prev[0].id !== g.focus.id) return [root];
      return [{ ...root, selectedLeafId: prev[0].selectedLeafId }, ...prev.slice(1)];
    });
  }, [g.focus.id, g.neighbors, lens]);

  useEffect(() => {
    if (!categories.length) return;
    if (!categories.some((c) => c.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    setFrames((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      next[0] = { ...next[0], categoryId };
      return next;
    });
  }, [categoryId]);

  const activeCategory = categories.find((c) => c.id === categoryId) ?? categories[0];
  const leaves = activeCategory?.items ?? [];

  // Drop accidental recursive segments (same entity appearing twice on the path).
  useEffect(() => {
    setFrames((prev) => {
      const seen = new Set<string>();
      let changed = false;
      const next: typeof prev = [];
      for (const f of prev) {
        if (seen.has(f.id)) { changed = true; break; }
        seen.add(f.id);
        next.push(f);
      }
      return changed ? next : prev;
    });
  }, [frames]);

  const workflowPath = useMemo(() => {
    const steps: { id: string; label: string; kind: string }[] = [];
    const seenIds = new Set<string>();
    const frameIds = new Set(frames.map((f) => f.id));
    frames.forEach((f, i) => {
      if (seenIds.has(f.id)) return;
      seenIds.add(f.id);
      steps.push({ id: f.id, label: f.label, kind: f.kind });
      const cats = buildCategories(f.neighbors, lens);
      const cat = cats.find((c) => c.id === f.categoryId);
      if (cat) steps.push({ id: `${f.id}:${cat.id}`, label: cat.label, kind: "category" });
      // Don't trail a selected leaf that is already a frame (stops recursive station loops in the bar).
      if (f.selectedLeafId && !frameIds.has(f.selectedLeafId) && !seenIds.has(f.selectedLeafId)) {
        const nb = f.neighbors.find((n: any) => n.node.id === f.selectedLeafId);
        if (nb && (!frames[i + 1] || frames[i + 1].id !== nb.node.id)) {
          seenIds.add(nb.node.id);
          steps.push({ id: nb.node.id, label: nb.node.label, kind: nb.node.kind });
        }
      }
    });
    return steps;
  }, [frames, lens]);

  const alertCount = useMemo(
    () => filteredNeighbors.filter((n: any) => n.node.kind === "event" || String(n.node.label).toLowerCase().includes("defect")).length,
    [filteredNeighbors]
  );

  const entityCount = filteredNeighbors.filter((n: any) => n.node.focusable).length;
  const dataCount = filteredNeighbors.length - entityCount;
  const totalLinked = Math.max(filteredNeighbors.length, 1);
  const coveragePct = Math.min(98, Math.round(55 + (entityCount / totalLinked) * 40));
  const implementPct = Math.min(92, Math.round(35 + (dataCount / totalLinked) * 50));
  const engagement = reporting?.totals?.inspections ?? reporting?.kpis?.inspections
    ?? filteredNeighbors.filter((n: any) => n.node.kind === "image").length * 12 + 48;

  const insights = useMemo(() => {
    const focusLabel = g.focus.label;
    const qualityCat = categories.find((c) => c.id === "quality");
    const inspCat = categories.find((c) => c.id === "inspections");
    const items: { tone: "critical" | "action"; title: string; body: string; link?: string }[] = [];
    if (alertCount > 0 || qualityCat) {
      items.push({
        tone: "critical",
        title: qualityCat?.items?.[0]?.node?.label || `Quality signals at ${focusLabel}`,
        body: `${alertCount || qualityCat?.count || 1} event path(s) need attention in the current context. Drill into Quality events to inspect live samples.`,
      });
    }
    if (inspCat && inspCat.count > 0) {
      items.push({
        tone: "action",
        title: "Tighten inspection coverage",
        body: `${inspCat.count} inspection object(s) linked here. Propose re-balancing sampling on high-variance stations before the next shift.`,
      });
    } else {
      items.push({
        tone: "action",
        title: "Expand context bindings",
        body: `Compose object bindings so inspections and genealogy roll up cleanly under ${focusLabel}.`,
      });
    }
    return items;
  }, [alertCount, categories, g.focus.label]);

  useEffect(() => {
    setFanKey((k) => k + 1);
  }, [categoryId, g.focus.id, layout]);

  useEffect(() => {
    if (alertCount > 0) {
      setToastBadge(`${alertCount} quality signals in view`);
      const t = setTimeout(() => setToastBadge(null), 4200);
      return () => clearTimeout(t);
    }
  }, [g.focus.id, alertCount]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      get(`/api/graph/object/${encodeURIComponent(inspectId)}?focus=${encodeURIComponent(cinemaFocusId)}`)
        .then((d) => {
          if (!alive) return;
          setLive(d);
          setLiveTick(true);
          setTimeout(() => alive && setLiveTick(false), 500);
        })
        .catch(() => { if (alive) setLive(null); });
    };
    load();
    const id = setInterval(load, 2800);
    return () => { alive = false; clearInterval(id); };
  }, [inspectId, cinemaFocusId]);

  const scrollStageRight = () => {
    requestAnimationFrame(() => {
      const vp = viewportRef.current;
      if (!vp) return;
      vp.scrollTo({ left: vp.scrollWidth, behavior: "smooth" });
    });
  };

  const zoomToWorkflow = () => {
    const vp = viewportRef.current;
    const stage = stageRef.current;
    if (!vp || !stage) return;
    const target = Math.min(1.15, Math.max(0.55, (vp.clientWidth - 48) / Math.max(stage.scrollWidth, 1)));
    setZoom(Number(target.toFixed(2)));
    setWorkflowId(workflowPath.map((s) => s.id).join(">"));
    requestAnimationFrame(() => {
      vp.scrollTo({ left: Math.max(0, stage.scrollWidth * target - vp.clientWidth), behavior: "smooth" });
    });
  };

  const collapseTo = (frameIndex: number) => {
    setFrames((prev) => prev.slice(0, frameIndex + 1));
    setWorkflowId(null);
  };

  const openCinema = (catId?: string) => {
    if (catId) setCategoryId(catId);
    setLayout("cinema");
    setPanelOpen(true);
  };

  const pickLeaf = (nb: any, frameIndex = 0) => {
    setSelected(nb.node);
    setEdgeFocus(false);
    setActiveEdgeId(null);
    setPanelOpen(true);
    setLayout("cinema");
    setFrames((prev) => {
      const next = prev.slice(0, frameIndex + 1).map((f, i) =>
        i === frameIndex ? { ...f, selectedLeafId: nb.node.id } : f
      );
      return next;
    });
  };

  const pickEdge = (nb: any, frameIndex = 0) => {
    setSelected(nb.node);
    setEdgeFocus(true);
    setActiveEdgeId(nb.node.id);
    setPanelOpen(true);
    setLayout("cinema");
    setFrames((prev) => {
      const next = prev.slice(0, Math.max(frameIndex + 1, 1)).map((f, i) =>
        i === frameIndex ? { ...f, selectedLeafId: nb.node.id } : f
      );
      return next;
    });
  };

  const scrollToSegment = (index: number) => {
    requestAnimationFrame(() => {
      const vp = viewportRef.current;
      if (!vp) return;
      if (index <= 0) {
        vp.scrollTo({ left: 0, behavior: "smooth" });
        return;
      }
      const seg = stageRef.current?.querySelectorAll(".cg-expand-segment")[index] as HTMLElement | undefined;
      if (seg) vp.scrollTo({ left: Math.max(0, seg.offsetLeft - 24), behavior: "smooth" });
    });
  };

  const expandEntity = async (nb: any, frameIndex: number) => {
    if (!nb.node.focusable) {
      pickLeaf(nb, frameIndex);
      return;
    }

    const nodeId = nb.node.id as string;
    const focusKind = frames[frameIndex]?.kind;
    const pathIds = new Set(frames.map((f) => f.id));
    const role = nodeRole(nb, pathIds, focusKind);

    setSelected(nb.node);
    setEdgeFocus(false);
    setActiveEdgeId(null);
    setPanelOpen(true);
    setLayout("cinema");
    setWorkflowId(null);

    // Already on the path → collapse / reuse. Never append a recursive duplicate (station↔device loops).
    const existingIdx = frames.findIndex((f) => f.id === nodeId);
    if (existingIdx >= 0) {
      setFrames((prev) =>
        prev.slice(0, existingIdx + 1).map((f, i) =>
          i === existingIdx ? { ...f, selectedLeafId: null } : f
        )
      );
      scrollToSegment(existingIdx);
      return;
    }

    // Parent / hierarchy ancestor with no matching frame: step back one segment.
    if (role === "parent") {
      const target = Math.max(0, frameIndex - 1);
      setFrames((prev) => prev.slice(0, target + 1));
      scrollToSegment(target);
      return;
    }

    // Re-clicking the leaf that already opened the next segment: keep that path.
    const nextAlreadyOpen = frames[frameIndex + 1]?.via?.fromId === nodeId
      || frames[frameIndex + 1]?.id === nodeId;
    if (nextAlreadyOpen) {
      setFrames((prev) =>
        prev.map((f, i) => (i === frameIndex ? { ...f, selectedLeafId: nodeId } : f))
      );
      scrollToSegment(frameIndex + 1);
      return;
    }

    setExpanding(true);
    try {
      const data = await get(`/api/graph?focus=${encodeURIComponent(nodeId)}`);
      if (!data?.focus?.id || data.focus.id !== nodeId) {
        toast("Could not expand that node");
        return;
      }
      const via = {
        fromId: nodeId,
        fromLabel: nb.node.label,
        rel: nb.rel || "contains",
        link: resolveLink(nb),
      };
      const nextFrame = frameFromGraph(data, lens, "entities", via);
      setFrames((prev) => {
        // Absolute guard: never put the same entity twice on the cinema path.
        const dupIdx = prev.findIndex((f) => f.id === nextFrame.id || f.id === nodeId);
        if (dupIdx >= 0) {
          return prev.slice(0, dupIdx + 1).map((f, i) =>
            i === dupIdx ? { ...f, selectedLeafId: null } : f
          );
        }
        const head = prev.slice(0, frameIndex + 1).map((f, i) =>
          i === frameIndex ? { ...f, selectedLeafId: nodeId } : f
        );
        if (head.some((f) => f.id === nextFrame.id)) return head;
        return [...head, nextFrame];
      });
      scrollStageRight();
    } catch {
      toast("Could not expand that node");
    } finally {
      setExpanding(false);
    }
  };

  /** Breadcrumb / Up still re-centers the plant focus (resets canvas). */
  const drillEntity = (nb: any) => {
    if (!nb.node.focusable) return;
    expandEntity(nb, Math.max(frames.length - 1, 0));
  };

  const onOverview = useCallback(() => setLayout("overview"), []);
  const onCinema = useCallback(() => setLayout("cinema"), []);
  const onRiAnalysis = useCallback(() => setAnalysisOpen(true), []);

  const copilotBindings = useMemo(
    () =>
      filteredNeighbors.slice(0, 24).map((nb: any) => ({
        id: String(nb.node.id),
        label: String(nb.node.label),
        kind: String(nb.node.kind),
        lens: Array.isArray(nb.node.lenses) ? String(nb.node.lenses[0] || "") : "",
      })),
    [filteredNeighbors],
  );

  useCopilotPageBridge({
    focusLabel: g.focus.label,
    layout,
    metrics: {
      coveragePct,
      linkedObjects: filteredNeighbors.length,
      engagement,
      implementPct,
      alertCount,
    },
    bindings: copilotBindings,
    onOverview,
    onCinema,
    onRiAnalysis,
  });

  const hudNode = selected ?? g.focus;
  const hudKs = KIND_STYLE[hudNode.kind] ?? KIND_STYLE.doc;
  const gaps = live?.values?.find((v: any) => ["open", "critical", "abnormal"].includes(v.key));
  const activeNeighbor = useMemo(
    () => filteredNeighbors.find((n: any) => n.node.id === (selected?.id ?? null)),
    [filteredNeighbors, selected?.id]
  );
  const trunkCategory = useMemo(() => {
    if (!activeEdgeId?.startsWith("trunk:")) return null;
    const parts = activeEdgeId.split(":");
    const id = parts[parts.length - 1];
    const frame = frames[frames.length - 1] ?? frameFromGraph(g, lens, categoryId);
    return buildCategories(frame.neighbors, lens).find((c) => c.id === id) ?? categories.find((c) => c.id === id) ?? null;
  }, [activeEdgeId, categories, frames, g, lens, categoryId]);
  const viaFrame = useMemo(() => {
    if (!activeEdgeId?.startsWith("via:")) return null;
    const id = activeEdgeId.slice(4);
    return frames.find((f) => f.id === id && f.via) ?? null;
  }, [activeEdgeId, frames]);
  const activeLink: EdgeLink | null = viaFrame?.via?.link
    ? viaFrame.via.link
    : trunkCategory
      ? categoryLink(trunkCategory)
      : activeNeighbor
        ? resolveLink(activeNeighbor)
        : (live?.link as EdgeLink | undefined) ?? null;

  return (
    <div className="cg-cinema">
      <div className={`cg-cinema-toast ${toastBadge ? "show" : ""}`} role="status">
        <span className="cg-cinema-toast-dot" />
        {toastBadge || "Synced"}
      </div>

      <div className="cg-cinema-bar">
        <div className="cg-cinema-crumbs">
          {g.path.map((p: any, i: number) => (
            <React.Fragment key={p.id}>
              {i > 0 && <span className="sep">›</span>}
              <button
                type="button"
                className={i === g.path.length - 1 ? "here" : ""}
                onClick={() => { setFocus(p.id); setSelected(null); }}
              >
                {p.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="cg-cinema-tools">
          <button
            type="button"
            className={`cg-tool ${layout === "overview" ? "is-on" : ""}`}
            title="Radial overview"
            onClick={() => setLayout("overview")}
          >
            ◉
          </button>
          <button
            type="button"
            className={`cg-tool ${layout === "cinema" ? "is-on" : ""}`}
            title="Cinema drill"
            onClick={() => setLayout("cinema")}
          >
            ▤
          </button>
          <button type="button" className="cg-tool" title="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>−</button>
          <button type="button" className="cg-tool" title="Zoom in" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}>+</button>
          <button type="button" className="cg-tool-text" title="Fit workflow path" onClick={zoomToWorkflow}>Fit path</button>
          {frames.length > 1 && (
            <button type="button" className="cg-tool-text" title="Collapse expansions" onClick={() => collapseTo(0)}>Collapse</button>
          )}
          <button type="button" className="cg-tool" title="Filters" onClick={() => setLens(lens ? null : "quality")}>
            ▽
            {lens && <span className="cg-tool-badge fade-pop">1</span>}
          </button>
          <button type="button" className="cg-tool" title="Alerts" onClick={() => setAnalysisOpen(true)}>
            ◎
            {alertCount > 0 && <span className="cg-tool-badge fade-pop">{alertCount}</span>}
          </button>
          {parentCrumb && (
            <button type="button" className="cg-tool-text" onClick={() => { setFocus(parentCrumb.id); setSelected(null); }}>
              ↑ Up
            </button>
          )}
        </div>

        <div className="cg-cinema-lenses">
          <button type="button" className={!lens ? "on" : ""} onClick={() => setLens(null)}>All</button>
          {LENSES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={lens === l.id ? "on" : ""}
              style={{ ["--lens" as any]: l.color }}
              onClick={() => setLens(lens === l.id ? null : l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`cg-cinema-body ${panelOpen && layout === "cinema" ? "with-panel" : "solo"}`}>
        {layout === "overview" ? (
          <RadialOverview
            g={g}
            categories={categories}
            zoom={zoom}
            selectedId={selected?.id}
            coveragePct={coveragePct}
            onSelectFocus={() => { setSelected(g.focus); setPanelOpen(true); }}
            onOpenCategory={(id) => openCinema(id)}
            onDrillEntity={drillEntity}
          />
        ) : (
          <div className="cg-expand-shell">
            <div className="cg-workflow-bar fade-in">
              <div className="cg-workflow-steps">
                <span className="cg-workflow-label">Workflow</span>
                {workflowPath.map((step, i) => (
                  <React.Fragment key={`${step.id}-${i}`}>
                    {i > 0 && <span className="sep">→</span>}
                    <button
                      type="button"
                      className={`cg-workflow-step ${workflowId?.includes(step.id) ? "on" : ""} ${step.kind === "category" ? "cat" : ""}`}
                      onClick={() => {
                        const frameIdx = frames.findIndex((f) => f.id === step.id);
                        if (frameIdx >= 0) {
                          collapseTo(frameIdx);
                          const vp = viewportRef.current;
                          const seg = stageRef.current?.querySelectorAll(".cg-expand-segment")[frameIdx] as HTMLElement | undefined;
                          if (vp && seg) vp.scrollTo({ left: seg.offsetLeft - 24, behavior: "smooth" });
                        }
                        setWorkflowId(step.id);
                      }}
                    >
                      {step.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              {expanding && <span className="cg-expanding">Expanding…</span>}
            </div>

            <div className="cg-cinema-viewport-wrap">
              <div className="cg-canvas-tools" role="toolbar" aria-label="Canvas controls">
                <button
                  type="button"
                  className="cg-tool"
                  title="Zoom to path"
                  aria-label="Zoom to path"
                  onClick={zoomToWorkflow}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M2 5.5V2h3.5M11.5 2H15v3.5M15 10.5V14h-3.5M5.5 14H2v-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4.5 8h2.2l1.3-2.2L10 10.2 11.5 8H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="cg-tool"
                  title="Reset canvas"
                  aria-label="Reset canvas"
                  disabled={frames.length <= 1}
                  onClick={() => { collapseTo(0); setZoom(1); setWorkflowId(null); }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M3.2 7.2A5 5 0 1 1 4 11.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M3.2 3.5v3.7h3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

            <div className="cg-cinema-viewport" ref={viewportRef}>
              <div
                className={`cg-cinema-stage is-expanding is-continuous ${workflowId ? "path-focus" : ""}`}
                ref={stageRef}
                style={{ ["--cg-zoom" as any]: zoom }}
              >
                <div className="cg-cinema-glow" aria-hidden />
                <div className="cg-cinema-arc" aria-hidden />

                {(() => {
                  const list = frames.length ? frames : [frameFromGraph(g, lens, categoryId)];
                  const root = list[0];
                  const rootKs = KIND_STYLE[root.kind] ?? KIND_STYLE.facility;
                  return (
                    <>
                      <div className="cg-cinema-col root">
                        <button
                          type="button"
                          className={`cg-root-orb ${!selected || selected.id === root.id ? "active" : ""}`}
                          onClick={() => { setSelected(root.node); setPanelOpen(true); collapseTo(0); }}
                        >
                          <span className="cg-root-rings" aria-hidden />
                          <span className="cg-root-core">
                            <span className="cg-root-glyph">
                              <GraphNodeIcon kind={root.kind} label={root.label} color="#F4F7F8" size={28} />
                            </span>
                          </span>
                        </button>
                        <div className="cg-root-meta">
                          <div className="cg-root-title">{root.label}</div>
                          <div className="cg-root-sub">{rootKs.label}</div>
                          {gaps && (
                            <span className="cg-root-gaps">
                              <i /> {gaps.label} {gaps.value}{gaps.unit || ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {list.map((frame, fi) => {
                        const frameCats = buildCategories(frame.neighbors, lens);
                        const frameCat = frameCats.find((c) => c.id === frame.categoryId) ?? frameCats[0];
                        // Ids already on the path (including this frame) are back-links, never forward expands.
                        const pathIds = new Set(list.slice(0, fi + 1).map((f) => f.id));
                        const frameLeaves = sortFanLeaves(frameCat?.items ?? [], pathIds, frame.kind);
                        const isTail = fi === list.length - 1;
                        const prev = fi > 0 ? list[fi - 1] : null;
                        const anchorLeafId = prev?.selectedLeafId || frame.via?.fromId || null;
                        return (
                          <div key={`${frame.id}-${fi}`} className="cg-expand-segment" data-frame-id={frame.id}>
                            <CinemaTrunk
                              categories={frameCats}
                              categoryId={frame.categoryId}
                              anchorLeafId={anchorLeafId}
                              bridgeLabel={frame.via ? `${shortProto(frame.via.link.protocol)} · ${frame.via.link.method}` : null}
                              zoom={zoom}
                              onSelectCategory={(id) => {
                                if (fi === 0) setCategoryId(id);
                                setFrames((prevF) => {
                                  const next = prevF.slice(0, fi + 1);
                                  next[fi] = { ...next[fi], categoryId: id, selectedLeafId: null };
                                  return next;
                                });
                                setEdgeFocus(false);
                                setActiveEdgeId(null);
                                setWorkflowId(null);
                              }}
                              onPickTrunk={(cat) => {
                                if (fi === 0) setCategoryId(cat.id);
                                setFrames((prevF) => {
                                  const next = prevF.slice(0, fi + 1);
                                  next[fi] = { ...next[fi], categoryId: cat.id };
                                  return next;
                                });
                                setSelected(frame.node);
                                setEdgeFocus(true);
                                setActiveEdgeId(`trunk:${fi}:${cat.id}`);
                                setPanelOpen(true);
                              }}
                              activeEdgeId={activeEdgeId}
                            />
                            <CinemaFan
                              key={`${fanKey}-${frame.id}-${frame.categoryId}`}
                              leaves={frameLeaves.slice(0, 12)}
                              pathIds={pathIds}
                              focusKind={frame.kind}
                              selectedId={frame.selectedLeafId ?? (isTail ? selected?.id : undefined)}
                              expandedId={list[fi + 1]?.via?.fromId ?? list[fi + 1]?.id}
                              activeEdgeId={activeEdgeId}
                              edgeFocus={edgeFocus}
                              zoom={zoom}
                              onPickLeaf={(nb) => pickLeaf(nb, fi)}
                              onPickEdge={(nb) => pickEdge(nb, fi)}
                              onDrillEntity={(nb) => expandEntity(nb, fi)}
                            />
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>
            </div>
          </div>
        )}

        {layout === "cinema" && (
          <aside className={`cg-cinema-panel ${panelOpen ? "open" : "closed"} ${liveTick ? "tick" : ""}`}>
            <div className="cg-cinema-panel-inner fade-in">
              <div className="cg-cinema-panel-top">
                <span className="cg-cinema-panel-kicker">
                  {(hudNode.lenses?.[0] && LENSES.find((l) => l.id === hudNode.lenses[0])?.label) || hudKs.label}
                </span>
                <button type="button" className="cg-panel-close" onClick={() => setPanelOpen(false)} aria-label="Close">✕</button>
              </div>
              <h2 className="cg-cinema-panel-title">{hudNode.label}</h2>
              <div className="cg-cinema-panel-status">
                <span className="cg-status-pill">{edgeFocus ? "Edge" : "Live"}</span>
                {live?.rel && <span className="cg-status-rel">{live.rel}</span>}
              </div>

              {activeLink && (
                <div className={`cg-edge-card fade-in ${edgeFocus ? "focus" : ""}`}>
                  <div className="cg-cinema-section">
                    {viaFrame?.via
                      ? `Continue · ${viaFrame.via.fromLabel}`
                      : trunkCategory
                        ? `Branch · ${trunkCategory.label}`
                        : "Data connectivity"}
                  </div>
                  <div className="cg-edge-grid">
                    <div>
                      <span>Protocol</span>
                      <strong>{activeLink.protocol}</strong>
                    </div>
                    <div>
                      <span>Method</span>
                      <strong>{activeLink.method}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong className={activeLink.status === "Degraded" ? "warn" : "ok"}>
                        {activeLink.status || "Connected"}
                      </strong>
                    </div>
                    <div>
                      <span>Mapped tags</span>
                      <strong>{activeLink.tags ?? "—"}</strong>
                    </div>
                  </div>
                  {(activeLink.endpoint || activeLink.source) && (
                    <div className="cg-edge-foot">
                      {activeLink.endpoint && <code>{activeLink.endpoint}</code>}
                      {activeLink.source && <em>{activeLink.source}</em>}
                    </div>
                  )}
                  {!edgeFocus && activeNeighbor && (
                    <button type="button" className="cg-edge-open" onClick={() => pickEdge(activeNeighbor)}>
                      Inspect edge →
                    </button>
                  )}
                </div>
              )}

              <div className="cg-cinema-metrics">
                {(live?.values || []).slice(0, 4).map((v: any) => (
                  <div key={v.key} className="cg-cinema-metric fade-in">
                    <div className="cg-cinema-metric-top">
                      <span>{v.label}</span>
                      {v.spark?.length > 1 && <MiniSpark values={v.spark} />}
                    </div>
                    <div className="cg-cinema-metric-val">
                      {String(v.value)}{v.unit ? <small>{v.unit}</small> : null}
                    </div>
                  </div>
                ))}
              </div>

              {live?.samples?.length > 0 && (
                <div className="cg-cinema-samples">
                  <div className="cg-cinema-section">Recent records</div>
                  {live.samples.slice(0, 4).map((s: any) => (
                    <div key={s.id} className="cg-cinema-sample fade-in">
                      <span className="mono">{s.id}</span>
                      <strong>{s.label}</strong>
                      <em>{s.detail}</em>
                    </div>
                  ))}
                </div>
              )}

              <div className="cg-cinema-actions">
                {(selected?.workspace || g.focus.workspace || live?.workspace) && (
                  <button type="button" className="cg-btn-primary" onClick={() => nav(selected?.workspace || live?.workspace || g.focus.workspace)}>
                    Explore details →
                  </button>
                )}
                {selected?.focusable && selected.id !== g.focus.id && (
                  <button type="button" className="cg-btn-ghost" onClick={() => setFocus(selected.id)}>
                    Re-center graph
                  </button>
                )}
                <button type="button" className="cg-btn-ghost" onClick={() => setLayout("overview")}>
                  ← Radial overview
                </button>
              </div>

              {sources && (
                <div className="cg-cinema-sources">
                  <div className="cg-cinema-section">Sources</div>
                  <div className="cg-cinema-source-row">
                    {sources.flatMap((c: any) => c.systems).slice(0, 6).map((s: any) => (
                      <span key={s.name}>{s.icon} {s.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {layout === "cinema" && !panelOpen && (
          <button type="button" className="cg-panel-reopen fade-in" onClick={() => setPanelOpen(true)}>
            Show details
          </button>
        )}

        {/* RI Analysis modal */}
        <div className={`cg-ri-modal ${analysisOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="RI Analysis">
          <div className="cg-ri-card fade-in">
            <div className="cg-ri-head">
              <span>RI Analysis</span>
              {alertCount > 0 && <em className="fade-pop">+{alertCount}</em>}
              <button type="button" onClick={() => setAnalysisOpen(false)} aria-label="Close">✕</button>
            </div>
            {insights.map((ins) => (
              <div key={ins.title} className={`cg-ri-block ${ins.tone}`}>
                <strong>{ins.tone === "critical" ? "Critical concerns" : "Propose action"}</strong>
                <h4>{ins.title}</h4>
                <p>{ins.body}</p>
              </div>
            ))}
            <button
              type="button"
              className="cg-btn-primary"
              onClick={() => { setAnalysisOpen(false); openCinema(alertCount ? "quality" : categoryId); }}
            >
              Open cinema path →
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

function CinemaTrunk({
  categories, categoryId, activeEdgeId, onSelectCategory, onPickTrunk, anchorLeafId, bridgeLabel, zoom = 1,
}: {
  categories: any[];
  categoryId: string;
  activeEdgeId: string | null;
  rootRefLabel?: string;
  anchorLeafId?: string | null;
  bridgeLabel?: string | null;
  zoom?: number;
  onSelectCategory: (id: string) => void;
  onPickTrunk: (cat: any) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const catsRef = useRef<HTMLDivElement>(null);
  const catRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [geom, setGeom] = useState<{ h: number; w: number; originY: number; anchors: { id: string; y: number }[] }>({
    h: 320, w: 70, originY: 160, anchors: [],
  });

  const measure = () => {
    const wrap = wrapRef.current;
    const cats = catsRef.current;
    if (!wrap || !cats) return;
    const box = localBox(wrap);
    const h = Math.max(box.h, cats.offsetHeight, 1);
    const rail = wrap.querySelector(".cg-trunk-rail") as HTMLElement | null;
    const w = Math.max(rail?.offsetWidth ?? 70, 1);
    let originY = h / 2;
    if (anchorLeafId) {
      const leaf = document.querySelector(`[data-leaf-id="${CSS.escape(anchorLeafId)}"]`) as HTMLElement | null;
      if (leaf) originY = Math.min(h - 8, Math.max(8, localMidY(leaf, wrap)));
    }
    const anchors = categories.map((c) => {
      const el = catRefs.current.get(c.id);
      if (!el) return { id: c.id, y: originY };
      return { id: c.id, y: Math.min(h - 8, Math.max(8, localMidY(el, wrap))) };
    });
    setGeom((prev) => {
      const same =
        prev.h === h &&
        prev.w === w &&
        Math.abs(prev.originY - originY) < 0.5 &&
        prev.anchors.length === anchors.length &&
        prev.anchors.every((a, i) => a.id === anchors[i].id && Math.abs(a.y - anchors[i].y) < 0.5);
      return same ? prev : { h, w, originY, anchors };
    });
  };

  useLayoutEffect(() => {
    measure();
    const wrap = wrapRef.current;
    const cats = catsRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    if (cats) ro.observe(cats);
    window.addEventListener("resize", measure);
    const t1 = window.setTimeout(measure, 60);
    const t2 = window.setTimeout(measure, 320);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [categories, categoryId, anchorLeafId, zoom]);

  const yFor = (id: string, i: number) => {
    const found = geom.anchors.find((a) => a.id === id);
    if (found) return found.y;
    const n = Math.max(categories.length, 1);
    return 24 + (i / Math.max(1, n - 1)) * (geom.h - 48);
  };

  return (
    <div className="cg-trunk-wrap" ref={wrapRef}>
      <div className="cg-trunk-rail" style={{ height: geom.h }}>
        <svg
          className="cg-cinema-trunk"
          viewBox={`0 0 ${geom.w} ${geom.h}`}
          width={geom.w}
          height={geom.h}
          preserveAspectRatio="none"
          role="img"
          aria-label="Category branch connectors"
        >
          <defs>
            <linearGradient id="cgTrunkHot" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#C4841D" stopOpacity="0.3" />
              <stop offset="55%" stopColor="#C4841D" />
              <stop offset="100%" stopColor="#1F9D5C" />
            </linearGradient>
          </defs>
          {categories.map((c: any, i: number) => {
            const y = yFor(c.id, i);
            const d = `M 2 ${geom.originY} C ${geom.w * 0.4} ${geom.originY}, ${geom.w * 0.55} ${y}, ${geom.w - 2} ${y}`;
            const hot = categoryId === c.id || !!activeEdgeId?.endsWith(`:${c.id}`) || activeEdgeId === `trunk:${c.id}`;
            const link = categoryLink(c);
            return (
              <g
                key={c.id}
                className={`cg-fan-beam cg-trunk-beam ${hot ? "is-hot" : ""}`}
                style={{ animationDelay: `${60 + i * 40}ms` }}
                onClick={() => onPickTrunk(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPickTrunk(c); } }}
              >
                <title>{`${link.protocol} · ${link.method} → ${c.label}`}</title>
                <path className="cg-fan-hit" d={d} />
                <path className={`cg-fan-path cg-trunk-path ${hot ? "hot" : ""}`} d={d} />
                <circle cx={geom.w - 3} cy={y} r="3.2" className={`cg-fan-anchor ${hot ? "hot" : ""}`} />
                <circle className={`cg-fan-pulse ${hot ? "hot" : ""}`} r="2.4">
                  <animateMotion dur={`${2.4 + (i % 3) * 0.35}s`} repeatCount="indefinite" path={d} />
                </circle>
              </g>
            );
          })}
        </svg>
        <div className={`cg-fan-chips cg-trunk-chips ${zoom < LINK_CHIP_MIN_ZOOM ? "chips-min" : "chips-expanded"}`}>
          {bridgeLabel && anchorLeafId && (
            <LinkChip
              asSpan
              compact={zoom < LINK_CHIP_MIN_ZOOM}
              protocol={bridgeLabel.split("·")[0]?.trim() || "MES Context"}
              method={bridgeLabel.split("·")[1]?.trim() || "link"}
              className="cg-bridge-chip active"
              style={{ top: `${geom.originY}px`, left: "18%" }}
            />
          )}
          {categories.map((c: any, i: number) => {
            const y = yFor(c.id, i);
            const link = categoryLink(c);
            const hot = categoryId === c.id || !!activeEdgeId?.endsWith(`:${c.id}`) || activeEdgeId === `trunk:${c.id}`;
            return (
              <LinkChip
                key={`trunk-chip-${c.id}`}
                compact={zoom < LINK_CHIP_MIN_ZOOM}
                protocol={link.protocol}
                method={link.method}
                className={hot ? "active" : ""}
                style={{ top: `${y}px` }}
                title={`${link.protocol} · ${link.method}\n${c.count} ${c.label}`}
                onClick={() => onPickTrunk(c)}
              />
            );
          })}
        </div>
      </div>

      <div className="cg-cinema-col cats" ref={catsRef}>
        {categories.map((c, i) => (
          <button
            key={c.id}
            type="button"
            ref={(el) => {
              if (el) catRefs.current.set(c.id, el);
              else catRefs.current.delete(c.id);
            }}
            className={`cg-cat-card fade-in ${categoryId === c.id ? "active" : ""} ${activeEdgeId?.endsWith(`:${c.id}`) ? "edge-on" : ""}`}
            style={{ animationDelay: `${i * 50}ms` }}
            onClick={() => onSelectCategory(c.id)}
          >
            <span className="cg-cat-ico" style={{ color: c.color, borderColor: `${c.color}55`, background: `${c.color}14` }}>
              <GraphCategoryIcon categoryId={c.id} color={c.color} size={16} />
            </span>
            <span className="cg-cat-copy">
              <strong>{c.count} {c.label}</strong>
              <em>{categoryLink(c).protocol} · {categoryLink(c).method}</em>
            </span>
          </button>
        ))}
        {!categories.length && (
          <div className="cg-cat-card muted">No objects in this lens</div>
        )}
      </div>
    </div>
  );
}

function CinemaFan({
  leaves, pathIds, focusKind, selectedId, expandedId, activeEdgeId, edgeFocus, zoom = 1, onPickLeaf, onPickEdge, onDrillEntity,
}: {
  leaves: any[];
  pathIds?: Set<string>;
  focusKind?: string;
  selectedId?: string;
  expandedId?: string;
  activeEdgeId: string | null;
  edgeFocus: boolean;
  zoom?: number;
  onPickLeaf: (nb: any) => void;
  onPickEdge: (nb: any) => void;
  onDrillEntity: (nb: any) => void;
}) {
  const fanRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const leafRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [layout, setLayout] = useState<{ h: number; w: number; originY: number; anchors: { id: string; y: number }[] }>({
    h: 520, w: 148, originY: 260, anchors: [],
  });
  const [leafFlyout, setLeafFlyout] = useState<LeafFlyout | null>(null);

  const hideLeafFlyout = () => setLeafFlyout(null);

  const showLeafFlyout = (btn: HTMLButtonElement, label: string, sub: string, proto: string) => {
    const titleEl = btn.querySelector(".cg-leaf-title") as HTMLElement | null;
    const subEl = btn.querySelector(".cg-leaf-sub") as HTMLElement | null;
    const protoEl = btn.querySelector(".cg-proto-pill") as HTMLElement | null;
    const clipped = [titleEl, subEl, protoEl].some(
      (el) => !!el && el.scrollWidth > el.clientWidth + 1
    );
    if (!clipped) {
      setLeafFlyout(null);
      return;
    }
    const r = btn.getBoundingClientRect();
    const width = Math.min(340, Math.max(r.width + 48, 240));
    const pad = 10;
    let left = r.left;
    let top = r.top - 4;
    if (left + width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - width - pad);
    if (left < pad) left = pad;
    if (top < pad) top = r.bottom + 4;
    if (top + 72 > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - 80);
    setLeafFlyout({ label, sub, proto, top, left, width });
  };

  const measure = () => {
    const fan = fanRef.current;
    const list = listRef.current;
    if (!fan || !list) return;
    const box = localBox(fan);
    const h = Math.max(box.h, list.offsetHeight, 1);
    const rail = fan.querySelector(".cg-fan-rail") as HTMLElement | null;
    const w = Math.max(rail?.offsetWidth ?? 132, 1);
    const originY = h / 2;
    const anchors = leaves.map((nb) => {
      const el = leafRefs.current.get(nb.node.id);
      if (!el) return { id: nb.node.id, y: originY };
      return { id: nb.node.id, y: Math.min(h - 8, Math.max(8, localMidY(el, fan))) };
    });
    setLayout((prev) => {
      const same =
        prev.h === h &&
        prev.w === w &&
        Math.abs(prev.originY - originY) < 0.5 &&
        prev.anchors.length === anchors.length &&
        prev.anchors.every((a, i) => a.id === anchors[i].id && Math.abs(a.y - anchors[i].y) < 0.5);
      return same ? prev : { h, w, originY, anchors };
    });
  };

  useLayoutEffect(() => {
    measure();
    const fan = fanRef.current;
    const list = listRef.current;
    if (!fan) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(fan);
    if (list) {
      ro.observe(list);
      list.addEventListener("scroll", measure, { passive: true });
    }
    window.addEventListener("resize", measure);
    const t1 = window.setTimeout(measure, 60);
    const t2 = window.setTimeout(measure, 320);
    return () => {
      ro.disconnect();
      list?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [leaves, zoom, selectedId, expandedId]);

  const yFor = (id: string, i: number) => {
    const found = layout.anchors.find((a) => a.id === id);
    if (found) return found.y;
    const n = Math.max(leaves.length, 1);
    return 40 + (i / Math.max(1, n - 1)) * (layout.h - 80);
  };

  return (
    <div className="cg-cinema-col fan" ref={fanRef}>
      <div className="cg-fan-rail" style={{ height: layout.h }}>
        <svg
          className="cg-fan-svg"
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          width={layout.w}
          height={layout.h}
          preserveAspectRatio="none"
          role="img"
          aria-label="Data connectivity edges"
        >
          <defs>
            <linearGradient id="cgFanHot" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#C4841D" stopOpacity="0.25" />
              <stop offset="50%" stopColor="#C4841D" />
              <stop offset="100%" stopColor="#1F9D5C" />
            </linearGradient>
          </defs>
          {leaves.map((nb: any, i: number) => {
            const y = yFor(nb.node.id, i);
            const d = `M 2 ${layout.originY} C ${layout.w * 0.38} ${layout.originY}, ${layout.w * 0.55} ${y}, ${layout.w - 2} ${y}`;
            const hot = activeEdgeId === nb.node.id || (!edgeFocus && selectedId === nb.node.id) || expandedId === nb.node.id;
            const link = resolveLink(nb);
            const role = nodeRole(nb, pathIds, focusKind);
            const degraded = link.status === "Degraded";
            return (
              <g
                key={nb.node.id}
                className={`cg-fan-beam role-${role} ${hot ? "is-hot" : ""} ${degraded ? "is-degraded" : ""}`}
                style={{ animationDelay: `${80 + i * 40}ms` }}
                onClick={() => onPickEdge(nb)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPickEdge(nb); } }}
              >
                <title>{`${link.protocol} · ${link.method}${link.endpoint ? ` · ${link.endpoint}` : ""}`}</title>
                <path className="cg-fan-hit" d={d} />
                <path className={`cg-fan-path ${hot ? "hot" : ""}`} d={d} />
                <circle cx={layout.w - 3} cy={y} r="3.2" className={`cg-fan-anchor ${hot ? "hot" : ""}`} />
                <circle className={`cg-fan-pulse ${hot ? "hot" : ""}`} r="2.4">
                  <animateMotion dur={`${2.2 + (i % 4) * 0.3}s`} repeatCount="indefinite" path={d} />
                </circle>
              </g>
            );
          })}
        </svg>
        <div className={`cg-fan-chips ${zoom < LINK_CHIP_MIN_ZOOM ? "chips-min" : "chips-expanded"}`}>
          {leaves.map((nb: any, i: number) => {
            const y = yFor(nb.node.id, i);
            const link = resolveLink(nb);
            const hot = activeEdgeId === nb.node.id;
            const role = nodeRole(nb, pathIds, focusKind);
            return (
              <LinkChip
                key={`chip-${nb.node.id}`}
                compact={zoom < LINK_CHIP_MIN_ZOOM}
                protocol={link.protocol}
                method={link.method}
                className={`role-${role} ${hot ? "active" : ""} ${link.status === "Degraded" ? "degraded" : ""}`}
                style={{ top: `${y}px` }}
                title={`${link.protocol} · method ${link.method}${link.endpoint ? `\n${link.endpoint}` : ""}`}
                onClick={() => onPickEdge(nb)}
              />
            );
          })}
        </div>
      </div>

      <div className="cg-fan-list" ref={listRef}>
        {leaves.map((nb: any, i: number) => {
          const ks = KIND_STYLE[nb.node.kind] ?? KIND_STYLE.doc;
          const role = nodeRole(nb, pathIds, focusKind);
          const sel = selectedId === nb.node.id && !edgeFocus;
          const sig = leafSignal(nb);
          const link = resolveLink(nb);
          const sub = `${nb.rel} · ${ks.label}`;
          const proto = shortProto(link.protocol);

          if (role === "parent") {
            return (
              <button
                key={nb.node.id}
                type="button"
                data-leaf-id={nb.node.id}
                ref={(el) => {
                  if (el) leafRefs.current.set(nb.node.id, el);
                  else leafRefs.current.delete(nb.node.id);
                }}
                className={`cg-leaf role-parent is-back fade-in ${sel ? "active" : ""}`}
                style={{ animationDelay: `${100 + i * 45}ms`, ["--leaf" as any]: "#7B5BB0" }}
                title={`Go back to ${nb.node.label}`}
                onClick={() => onDrillEntity(nb)}
              >
                <span className="cg-leaf-back-ico" aria-hidden>←</span>
                <span className="cg-leaf-body">
                  <span className="cg-leaf-role">Parent</span>
                  <strong className="cg-leaf-title">
                    Go back to <em className="cg-leaf-back-name">{nb.node.label}</em>
                  </strong>
                </span>
              </button>
            );
          }

          return (
            <button
              key={nb.node.id}
              type="button"
              data-leaf-id={nb.node.id}
              ref={(el) => {
                if (el) leafRefs.current.set(nb.node.id, el);
                else leafRefs.current.delete(nb.node.id);
              }}
              className={`cg-leaf role-${role} fade-in ${sel ? "active" : ""} ${expandedId === nb.node.id ? "is-expanded" : ""} ${activeEdgeId === nb.node.id ? "edge-on" : ""}`}
              style={{ animationDelay: `${100 + i * 45}ms`, ["--leaf" as any]: ks.color }}
              title={nb.node.label}
              onMouseEnter={(e) => showLeafFlyout(e.currentTarget, nb.node.label, sub, link.protocol)}
              onMouseLeave={hideLeafFlyout}
              onFocus={(e) => showLeafFlyout(e.currentTarget, nb.node.label, sub, link.protocol)}
              onBlur={hideLeafFlyout}
              onClick={() => (nb.node.focusable ? onDrillEntity(nb) : onPickLeaf(nb))}
            >
              <span className="cg-leaf-ico" style={{ color: ks.color }}>
                <GraphNodeIcon
                  kind={nb.node.kind}
                  label={nb.node.label}
                  color={ks.color}
                  size={15}
                />
              </span>
              <span className="cg-leaf-body">
                <span className="cg-leaf-role">{role === "child" ? "Child" : "Data"}</span>
                <strong className="cg-leaf-title">{nb.node.label}</strong>
                <em className="cg-leaf-sub">{sub}</em>
                <span className="cg-leaf-meta">
                  <span className={`cg-gap-chip ${sig.tone}`}>GAPS {sig.gap}</span>
                  <span className="cg-proto-pill">{proto}</span>
                  <span className="cg-gap-bars" aria-hidden>
                    {sig.bars.map((b, bi) => <i key={bi} className={b} />)}
                  </span>
                </span>
              </span>
              <span className="cg-leaf-tag">{nb.node.focusable ? "Expand" : "Values"}</span>
            </button>
          );
        })}
        {!leaves.length && (
          <div className="cg-leaf more">Select a category with linked objects</div>
        )}
      </div>

      {leafFlyout && createPortal(
        <div
          className="cg-leaf-flyout"
          style={{ top: leafFlyout.top, left: leafFlyout.left, width: leafFlyout.width }}
          role="tooltip"
        >
          <strong>{leafFlyout.label}</strong>
          <em>{leafFlyout.sub}</em>
          <span>{leafFlyout.proto}</span>
        </div>,
        document.body
      )}
    </div>
  );
}

function RadialOverview({
  g, categories, zoom, selectedId, coveragePct, onSelectFocus, onOpenCategory, onDrillEntity,
}: {
  g: any;
  categories: any[];
  zoom: number;
  selectedId?: string;
  coveragePct: number;
  onSelectFocus: () => void;
  onOpenCategory: (id: string) => void;
  onDrillEntity: (nb: any) => void;
}) {
  const cx = 400;
  const cy = 270;
  const R = 168;
  const total = Math.max(categories.reduce((s, c) => s + c.count, 0), 1);

  const nodes = categories.map((c, i) => {
    const n = categories.length;
    const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    const pct = Math.round((c.count / total) * 100);
    const sats = c.items.slice(0, 4).map((nb: any, si: number) => {
      const sa = a + ((si - 1.5) * 0.22);
      const sr = R + 52 + (si % 2) * 10;
      return {
        nb,
        x: cx + Math.cos(sa) * sr,
        y: cy + Math.sin(sa) * sr,
        n: 1 + (hashTone(nb.node.id) % 28),
      };
    });
    return { c, x, y, pct, a, sats };
  });

  return (
    <div className="cg-overview" style={{ ["--cg-zoom" as any]: zoom }}>
      <div className="cg-overview-glow" aria-hidden />
      <svg className="cg-overview-svg" viewBox="0 0 800 540" role="img" aria-label="Radial context overview">
        <defs>
          <radialGradient id="cgCoreGrad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#F0D78A" />
            <stop offset="45%" stopColor="#D4A84B" />
            <stop offset="100%" stopColor="#6B4A12" />
          </radialGradient>
          <filter id="cgBloom" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r="210" className="cg-overview-ring" />
        <circle cx={cx} cy={cy} r="250" className="cg-overview-ring soft" />

        {nodes.map(({ c, x, y, sats }) => (
          <g key={c.id}>
            <path
              className="cg-overview-beam"
              d={`M ${cx} ${cy} Q ${(cx + x) / 2} ${(cy + y) / 2 - 20}, ${x} ${y}`}
              style={{ ["--beam" as any]: c.color }}
            />
            {sats.map((s: any) => (
              <g key={s.nb.node.id}>
                <line
                  className="cg-overview-sat-line"
                  x1={x} y1={y} x2={s.x} y2={s.y}
                />
                <circle
                  className={`cg-overview-sat ${selectedId === s.nb.node.id ? "sel" : ""}`}
                  cx={s.x} cy={s.y} r="6"
                  style={{ fill: KIND_STYLE[s.nb.node.kind]?.color || c.color }}
                  onClick={() => (s.nb.node.focusable ? onDrillEntity(s.nb) : onOpenCategory(c.id))}
                />
                <text className="cg-overview-sat-n" x={s.x + 9} y={s.y - 7}>{s.n}</text>
              </g>
            ))}
          </g>
        ))}

        <g className="cg-overview-core" onClick={onSelectFocus} style={{ cursor: "pointer" }}>
          <circle cx={cx} cy={cy} r="54" fill="url(#cgCoreGrad)" filter="url(#cgBloom)" />
          <circle cx={cx} cy={cy} r="62" className="cg-overview-core-ring" />
          <circle cx={cx} cy={cy} r="72" className="cg-overview-core-ring outer" />
          <foreignObject x={cx - 14} y={cy - 14} width={28} height={28}>
            <div className="cg-overview-fo">
              <GraphNodeIcon kind={g.focus.kind} label={g.focus.label} color="#2A2110" size={24} />
            </div>
          </foreignObject>
        </g>

        {nodes.map(({ c, x, y, pct }, i) => (
          <g
            key={`n-${c.id}`}
            className="cg-overview-node fade-in"
            style={{ animationDelay: `${i * 60}ms`, cursor: "pointer" }}
            onClick={() => onOpenCategory(c.id)}
          >
            <circle cx={x} cy={y} r="28" className="cg-overview-orb" style={{ fill: c.color }} filter="url(#cgBloom)" />
            <circle cx={x} cy={y} r="34" className="cg-overview-orb-ring" style={{ stroke: c.color }} />
            <foreignObject x={x - 11} y={y - 11} width={22} height={22}>
              <div className="cg-overview-fo">
                <GraphCategoryIcon categoryId={c.id} color="#fff" size={18} />
              </div>
            </foreignObject>
            <text className="cg-overview-label" x={x} y={y + 48} textAnchor="middle">{c.label}</text>
            <text className="cg-overview-pct" x={x} y={y + 64} textAnchor="middle">{pct}%</text>
          </g>
        ))}
      </svg>

      <div className="cg-overview-caption fade-in">
        <strong>{g.focus.label}</strong>
        <span>{coveragePct}% context coverage · click a sector to open cinema drill</span>
      </div>

      <div className="cg-overview-legend fade-in">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => onOpenCategory(c.id)}>
            <i style={{ background: c.color }} /> {c.label} <em>{c.count}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Compose workflow ────────────────────────────────────────────── */

const COMPOSE_STEPS = [
  { key: "hierarchy", label: "Hierarchy", blurb: "Facility → device levels" },
  { key: "bindings", label: "Object bindings", blurb: "Select & bind data objects" },
  { key: "publish", label: "Review & publish", blurb: "Activate the model" },
] as const;

type BindPhase = "select" | "configure" | "properties";

function ComposeView({
  schema, onSaved, readOnly = false, onRequestEdit,
}: {
  schema: any;
  onSaved: () => void;
  readOnly?: boolean;
  onRequestEdit?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [bindPhase, setBindPhase] = useState<BindPhase>("select");
  const [propFocusId, setPropFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState({
    label: "",
    object_type: "",
    description: "",
    report_at: "station",
    protocol: "MES Context",
  });

  // Sync draft when schema loads / changes externally
  const active = draft ?? schema;

  useEffect(() => {
    if (readOnly) setDraft(null);
  }, [readOnly]);

  useEffect(() => {
    if (step !== 1) {
      setBindPhase("select");
      setCustomOpen(false);
    }
  }, [step]);

  const bindings = (active?.object_bindings || []) as any[];
  const levels = (active?.levels || []) as any[];
  const levelKeys = (() => {
    const keys: string[] = [];
    for (const lv of levels) {
      if (lv.id === "facility" || lv.entity === "site") keys.push("facility");
      else if ((LEVELS as readonly string[]).includes(lv.entity)) keys.push(lv.entity);
      else if ((LEVELS as readonly string[]).includes(lv.id)) keys.push(lv.id);
      else keys.push(lv.id || lv.entity);
    }
    return keys.length ? [...new Set(keys)] : [...LEVELS];
  })();
  const selectedTypes = new Set(bindings.map((b) => b.object_type));
  const propFocus = bindings.find((b) => b.id === (propFocusId || bindings[0]?.id)) || null;

  useEffect(() => {
    if (bindPhase === "properties" && bindings.length && !bindings.some((b) => b.id === propFocusId)) {
      setPropFocusId(bindings[0].id);
    }
  }, [bindPhase, bindings, propFocusId]);

  if (!schema) {
    return (
      <Panel>
        <p className="dim">
          Graph schema not available yet — restart the API to load the composition model, then refresh.
        </p>
      </Panel>
    );
  }

  const setBindings = (next: any[]) => {
    if (readOnly) return;
    setDraft({ ...active, object_bindings: next });
  };

  const patchBinding = (id: string, patch: Record<string, any>) => {
    if (readOnly) return;
    setBindings(bindings.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const setLevels = (next: any[]) => {
    if (readOnly) return;
    setDraft({ ...active, levels: next });
  };

  const patchLevel = (id: string, patch: Record<string, any>) => {
    setLevels(levels.map((lv) => (lv.id === id ? { ...lv, ...patch } : lv)));
  };

  const moveLevel = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= levels.length) return;
    const next = [...levels];
    [next[index], next[j]] = [next[j], next[index]];
    setLevels(next);
  };

  const addLevel = () => {
    const n = levels.length + 1;
    setLevels([
      ...levels,
      {
        id: `level-${Date.now().toString(36)}`,
        label: `Custom level ${n}`,
        entity: "custom",
        required: false,
      },
    ]);
  };

  const removeLevel = (id: string) => {
    if (levels.length <= 1) {
      toast("Keep at least one hierarchy level");
      return;
    }
    setLevels(levels.filter((lv) => lv.id !== id));
  };

  const toggleCatalogObject = (item: (typeof OBJECT_CATALOG)[number]) => {
    if (readOnly) return;
    const existing = bindings.find((b) => b.object_type === item.object_type);
    if (existing) {
      setBindings(bindings.filter((b) => b.id !== existing.id));
      return;
    }
    const protocol = item.protocol || DEFAULT_PROTOCOL_BY_TYPE[item.object_type] || "MES Context";
    setBindings([
      ...bindings,
      {
        id: `bind-${item.object_type}-${Date.now().toString(36).slice(-4)}`,
        object_type: item.object_type,
        label: item.label,
        description: item.description,
        report_at: item.report_at,
        rollup_to: item.rollup_to.filter((l) => l !== item.report_at),
        lenses: item.lenses,
        enabled: true,
        protocol,
        properties: defaultPropsFor(item.object_type, protocol),
      },
    ]);
  };

  const removeBinding = (id: string) => {
    if (readOnly) return;
    if (bindings.length <= 1) {
      toast("Keep at least one data object in the model");
      return;
    }
    setBindings(bindings.filter((b) => b.id !== id));
  };

  const defineCustomObject = () => {
    if (readOnly) return;
    const label = customDraft.label.trim();
    let objectType = customDraft.object_type.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (!label) {
      toast("Name the data object");
      return;
    }
    if (!objectType) objectType = label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "custom";
    if (bindings.some((b) => b.object_type === objectType)) {
      toast(`“${objectType}” is already in this model`);
      return;
    }
    const home = customDraft.report_at || levelKeys[Math.min(3, levelKeys.length - 1)] || "station";
    const protocol = customDraft.protocol || "MES Context";
    setBindings([
      ...bindings,
      {
        id: `bind-${objectType}-${Date.now().toString(36).slice(-4)}`,
        object_type: objectType,
        label,
        description: customDraft.description.trim() || "Custom data object in this context model.",
        report_at: home,
        rollup_to: levelKeys.filter((l) => l !== home).slice(0, 2),
        lenses: ["production"],
        enabled: true,
        protocol,
        properties: defaultPropsFor(objectType, protocol),
      },
    ]);
    setCustomDraft({ label: "", object_type: "", description: "", report_at: "station", protocol: "MES Context" });
    setCustomOpen(false);
    toast(`Added “${label}”`);
  };

  const ensureBindingProps = (b: any) => {
    const protocol = b.protocol || DEFAULT_PROTOCOL_BY_TYPE[b.object_type] || "MES Context";
    if (Array.isArray(b.properties) && b.properties.length) {
      return { ...b, protocol };
    }
    return {
      ...b,
      protocol,
      properties: defaultPropsFor(b.object_type, protocol),
    };
  };

  const setBindingProtocol = (id: string, protocol: string) => {
    const b = bindings.find((x) => x.id === id);
    if (!b) return;
    const nextProps = defaultPropsFor(b.object_type, protocol).map((p, i) => {
      const prev = (b.properties || [])[i];
      if (!prev) return p;
      const std = PROTOCOL_STANDARDS[protocol];
      return {
        ...p,
        key: prev.key || p.key,
        label: prev.label || p.label,
        required: prev.required ?? p.required,
        unit: prev.unit || p.unit,
        data_type: std?.types.includes(prev.data_type) ? prev.data_type : p.data_type,
        format: std?.formats.includes(prev.format || "") ? (prev.format || "") : (p.format || ""),
      };
    });
    // Keep any extra custom properties, remapping invalid types to first legal type
    const seededKeys = new Set(nextProps.map((p) => p.key));
    const extras = (b.properties || [])
      .filter((p: any) => p.key && !seededKeys.has(p.key))
      .map((p: any) => ({
        ...p,
        data_type: PROTOCOL_STANDARDS[protocol]?.types.includes(p.data_type)
          ? p.data_type
          : (PROTOCOL_STANDARDS[protocol]?.types[0] || p.data_type),
        format: PROTOCOL_STANDARDS[protocol]?.formats.includes(p.format || "")
          ? (p.format || "")
          : "",
      }));
    patchBinding(id, { protocol, properties: [...nextProps, ...extras] });
  };

  const patchProperty = (bindId: string, propId: string, patch: Partial<PropDef>) => {
    const b = bindings.find((x) => x.id === bindId);
    if (!b) return;
    const props = (ensureBindingProps(b).properties || []).map((p: PropDef) =>
      p.id === propId ? { ...p, ...patch } : p
    );
    patchBinding(bindId, { properties: props, protocol: b.protocol || DEFAULT_PROTOCOL_BY_TYPE[b.object_type] });
  };

  const addProperty = (bindId: string) => {
    const b = bindings.find((x) => x.id === bindId);
    if (!b) return;
    const protocol = b.protocol || DEFAULT_PROTOCOL_BY_TYPE[b.object_type] || "MES Context";
    const std = PROTOCOL_STANDARDS[protocol];
    const props = [...(ensureBindingProps(b).properties || [])];
    const n = props.length + 1;
    props.push({
      id: `prop-custom-${Date.now().toString(36).slice(-5)}`,
      key: `field_${n}`,
      label: `Field ${n}`,
      data_type: std?.types[0] || "String",
      format: "",
      unit: "",
      required: false,
    });
    patchBinding(bindId, { protocol, properties: props });
  };

  const removeProperty = (bindId: string, propId: string) => {
    const b = bindings.find((x) => x.id === bindId);
    if (!b) return;
    const props = (b.properties || []).filter((p: PropDef) => p.id !== propId);
    if (!props.length) {
      toast("Keep at least one property");
      return;
    }
    patchBinding(bindId, { properties: props });
  };

  const toggleRollup = (id: string, level: string) => {
    const b = bindings.find((x) => x.id === id);
    if (!b) return;
    const roll = new Set(b.rollup_to || []);
    if (roll.has(level)) roll.delete(level);
    else roll.add(level);
    patchBinding(id, { rollup_to: levelKeys.filter((l) => roll.has(l)) });
  };

  const save = async (status?: string) => {
    if (readOnly) return;
    setSaving(true);
    try {
      await put("/api/graph/schema", {
        name: active.name,
        status: status ?? active.status,
        object_bindings: bindings.map((b) => ensureBindingProps(b)),
        levels,
        actor: "Jordan Hale",
      });
      toast(status === "Published" ? "Context graph published" : "Schema saved");
      setDraft(null);
      onSaved();
      if (status === "Published") setStep(2);
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Tip>
        Compose defines <b>which data objects</b> belong in the plant model and <b>where they live</b> —
        select from the catalog or define custom types, then set home and roll-up levels for reporting.
        {readOnly && (
          <>
            {" "}
            <button type="button" className="linkish" onClick={onRequestEdit}>Switch to Edit</button>
            {" "}to change bindings.
          </>
        )}
      </Tip>

      <div className="wizard-stepper cg-compose-stepper" role="list">
        {COMPOSE_STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={`wizard-step ${i < step ? "done" : i === step ? "active" : "todo"}`}
            onClick={() => setStep(i)}
          >
            <span className="wizard-num">{i < step ? "✓" : i + 1}</span>
            <span className="wizard-meta">
              <span className="wizard-label">{s.label}</span>
              <span className="wizard-blurb">{s.blurb}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="wizard-panel">
        {step === 0 && (
          <div className="wizard-body">
            <h2 className="wizard-heading">1 · Hierarchy</h2>
            <p className="wizard-lead">
              The context graph spine for {active.name}. Required levels must exist for every
              reporting path; optional levels attach when those entities are present.
              {!readOnly && " Edit labels, entity mapping, and required flags below."}
            </p>
            <div className={`cg-levels ${readOnly ? "" : "is-editing"}`}>
              {levels.map((lv: any, i: number) => (
                <div key={lv.id} className={`cg-level ${readOnly ? "" : "editable"}`}>
                  <span className="cg-level-idx">{i + 1}</span>
                  {readOnly ? (
                    <>
                      <div>
                        <strong>{lv.label}</strong>
                        <div className="small faint">
                          entity · {lv.entity}
                          {lv.isa95 || lv.isa95_label
                            ? ` · ISA-95 ${lv.isa95 || ""}${lv.isa95_label ? ` (${lv.isa95_label})` : ""}`
                            : ""}
                        </div>
                      </div>
                      <span className={`tag ${lv.required ? "" : "dim"}`}>
                        {lv.required ? "Required" : "Optional"}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="cg-level-fields">
                        <input
                          className="field"
                          value={lv.label}
                          aria-label="Level label"
                          onChange={(e) => patchLevel(lv.id, { label: e.target.value })}
                        />
                        <label className="cg-level-entity">
                          <span>entity</span>
                          <select
                            className="field"
                            value={lv.entity}
                            onChange={(e) => patchLevel(lv.id, { entity: e.target.value })}
                          >
                            {LEVEL_ENTITY_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                            {!LEVEL_ENTITY_OPTIONS.some((o) => o.id === lv.entity) && (
                              <option value={lv.entity}>{lv.entity}</option>
                            )}
                          </select>
                        </label>
                      </div>
                      <label className="cg-level-req">
                        <input
                          type="checkbox"
                          checked={!!lv.required}
                          onChange={(e) => patchLevel(lv.id, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      <div className="cg-level-ops">
                        <button type="button" className="btn ghost" disabled={i === 0} onClick={() => moveLevel(i, -1)} title="Move up">↑</button>
                        <button type="button" className="btn ghost" disabled={i === levels.length - 1} onClick={() => moveLevel(i, 1)} title="Move down">↓</button>
                        <button type="button" className="btn ghost" disabled={levels.length <= 1} onClick={() => removeLevel(lv.id)} title="Remove level">✕</button>
                      </div>
                    </>
                  )}
                  {i < levels.length - 1 && <span className="cg-level-arrow" aria-hidden>↓</span>}
                </div>
              ))}
            </div>
            {!readOnly && (
              <button type="button" className="btn ghost cg-level-add" onClick={addLevel}>
                + Add level
              </button>
            )}
            <p className="small faint mt">
              Hierarchy is seeded from plant topology (York Vehicle Operations). Bindings in the next
              step decide which data objects attach at each level.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-body">
            <h2 className="wizard-heading">2 · Object bindings</h2>
            <p className="wizard-lead">
              Select or define data objects, configure home / roll-up levels, then define each object’s
              <b> property schema</b> using the datatype and format standard for its protocol.
            </p>

            <div className="cg-bind-phases" role="tablist" aria-label="Object binding phases">
              <button
                type="button"
                role="tab"
                aria-selected={bindPhase === "select"}
                className={bindPhase === "select" ? "on" : ""}
                onClick={() => setBindPhase("select")}
              >
                1 · Select / define
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bindPhase === "configure"}
                className={bindPhase === "configure" ? "on" : ""}
                onClick={() => setBindPhase("configure")}
                disabled={!bindings.length}
              >
                2 · Configure bindings
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bindPhase === "properties"}
                className={bindPhase === "properties" ? "on" : ""}
                onClick={() => {
                  setBindPhase("properties");
                  setPropFocusId(bindings[0]?.id || null);
                }}
                disabled={!bindings.length}
              >
                3 · Property objects
              </button>
            </div>

            {bindPhase === "select" && (
              <>
                <div className="cg-obj-toolbar">
                  <span className="small faint">
                    {bindings.length} object{bindings.length === 1 ? "" : "s"} in model
                    {bindings.length ? ` · ${bindings.filter((b) => b.enabled).length} enabled` : ""}
                  </span>
                  {!readOnly && (
                    <button type="button" className="btn ghost sm" onClick={() => setCustomOpen((v) => !v)}>
                      {customOpen ? "Cancel custom" : "+ Define custom object"}
                    </button>
                  )}
                </div>

                {customOpen && !readOnly && (
                  <div className="cg-custom-object">
                    <strong>Define a data object</strong>
                    <div className="form-grid">
                      <div className="field-wrap span-2">
                        <label className="field-label">Display name</label>
                        <input
                          className="field"
                          value={customDraft.label}
                          placeholder="e.g. Tool torque curves"
                          onChange={(e) => setCustomDraft((d) => ({ ...d, label: e.target.value }))}
                        />
                      </div>
                      <div className="field-wrap">
                        <label className="field-label">Type key</label>
                        <input
                          className="field mono"
                          value={customDraft.object_type}
                          placeholder="torque_curve"
                          onChange={(e) => setCustomDraft((d) => ({ ...d, object_type: e.target.value }))}
                        />
                      </div>
                      <div className="field-wrap">
                        <label className="field-label">Default home</label>
                        <select
                          className="field"
                          value={customDraft.report_at}
                          onChange={(e) => setCustomDraft((d) => ({ ...d, report_at: e.target.value }))}
                        >
                          {levelKeys.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="field-wrap">
                        <label className="field-label">Protocol</label>
                        <select
                          className="field"
                          value={customDraft.protocol}
                          onChange={(e) => setCustomDraft((d) => ({ ...d, protocol: e.target.value }))}
                        >
                          {PROTOCOL_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div className="field-wrap span-2">
                        <label className="field-label">Description</label>
                        <input
                          className="field"
                          value={customDraft.description}
                          placeholder="How this object is used in context"
                          onChange={(e) => setCustomDraft((d) => ({ ...d, description: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="row mt" style={{ justifyContent: "flex-end", gap: 8 }}>
                      <button type="button" className="btn" onClick={defineCustomObject}>
                        Add to model
                      </button>
                    </div>
                  </div>
                )}

                <div className="cg-obj-catalog" role="listbox" aria-label="Data object catalog">
                  {OBJECT_CATALOG.map((item) => {
                    const on = selectedTypes.has(item.object_type);
                    return (
                      <button
                        key={item.object_type}
                        type="button"
                        role="option"
                        aria-selected={on}
                        className={`cg-obj-card ${on ? "on" : ""}`}
                        disabled={readOnly}
                        onClick={() => toggleCatalogObject(item)}
                      >
                        <span className="cg-obj-check" aria-hidden>{on ? "✓" : "+"}</span>
                        <strong>{item.label}</strong>
                        <span className="tag mono">{item.object_type}</span>
                        <em>{item.description}</em>
                      </button>
                    );
                  })}
                </div>

                {bindings.some((b) => !OBJECT_CATALOG.some((c) => c.object_type === b.object_type)) && (
                  <div className="cg-obj-custom-list">
                    <div className="panel-title">Custom objects in this model</div>
                    {bindings
                      .filter((b) => !OBJECT_CATALOG.some((c) => c.object_type === b.object_type))
                      .map((b) => (
                        <div key={b.id} className="cg-obj-custom-row">
                          <strong>{b.label}</strong>
                          <span className="tag mono">{b.object_type}</span>
                          {!readOnly && (
                            <button type="button" className="btn ghost sm" onClick={() => removeBinding(b.id)}>
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                )}

                {!readOnly && (
                  <div className="cg-obj-next">
                    <button
                      type="button"
                      className="btn"
                      disabled={!bindings.length}
                      onClick={() => setBindPhase("configure")}
                    >
                      Configure bindings →
                    </button>
                  </div>
                )}
              </>
            )}

            {bindPhase === "configure" && (
              <>
                <div className="cg-obj-toolbar">
                  <button type="button" className="btn ghost sm" onClick={() => setBindPhase("select")}>
                    ← Back to select
                  </button>
                  <span className="small faint">
                    Set home level and roll-ups for each selected object
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        setBindPhase("properties");
                        setPropFocusId(bindings[0]?.id || null);
                      }}
                    >
                      Property objects →
                    </button>
                  )}
                </div>
                <div className="cg-bindings">
                  {bindings.map((b) => (
                      <div key={b.id} className={`cg-bind ${b.enabled ? "" : "off"}`}>
                        <div className="cg-bind-head">
                          <label className="wizard-check">
                            <input
                              type="checkbox"
                              checked={!!b.enabled}
                              disabled={readOnly}
                              onChange={(e) => patchBinding(b.id, { enabled: e.target.checked })}
                            />
                            <strong>{b.label}</strong>
                          </label>
                          <div className="row" style={{ gap: 6 }}>
                            <span className="tag mono">{b.object_type}</span>
                            {!readOnly && (
                              <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() => removeBinding(b.id)}
                                title="Remove from model"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="small dim" style={{ margin: "6px 0 10px" }}>{b.description}</p>
                        <div className="form-grid">
                          <div className="field-wrap">
                            <label className="field-label">Reports at (home)</label>
                            <select
                              className="field"
                              value={b.report_at}
                              disabled={readOnly || !b.enabled}
                              onChange={(e) => patchBinding(b.id, { report_at: e.target.value })}
                            >
                              {levelKeys.map((l) => <option key={l} value={l}>{l}</option>)}
                              {!levelKeys.includes(b.report_at) && (
                                <option value={b.report_at}>{b.report_at}</option>
                              )}
                            </select>
                          </div>
                          <div className="field-wrap">
                            <label className="field-label">Roll up to</label>
                            <div className="cg-rollup">
                              {levelKeys.filter((l) => l !== b.report_at).map((l) => (
                                <button
                                  key={l}
                                  type="button"
                                  disabled={readOnly || !b.enabled}
                                  className={`cg-rollup-chip ${(b.rollup_to || []).includes(l) ? "on" : ""}`}
                                  onClick={() => toggleRollup(b.id, l)}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                  ))}
                </div>
              </>
            )}

            {bindPhase === "properties" && propFocus && (() => {
              const focused = ensureBindingProps(propFocus);
              const protocol = focused.protocol || "MES Context";
              const std = PROTOCOL_STANDARDS[protocol] || PROTOCOL_STANDARDS["MES Context"];
              const props: PropDef[] = focused.properties || [];
              return (
                <>
                  <div className="cg-obj-toolbar">
                    <button type="button" className="btn ghost sm" onClick={() => setBindPhase("configure")}>
                      ← Back to bindings
                    </button>
                    <span className="small faint">
                      Property keys, datatypes and formats follow the selected protocol standard
                    </span>
                  </div>

                  <div className="cg-prop-layout">
                    <nav className="cg-prop-nav" aria-label="Data objects">
                      {bindings.map((b) => {
                        const count = (ensureBindingProps(b).properties || []).length;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            className={`cg-prop-nav-btn ${b.id === focused.id ? "on" : ""}`}
                            onClick={() => setPropFocusId(b.id)}
                          >
                            <strong>{b.label}</strong>
                            <em>{b.protocol || DEFAULT_PROTOCOL_BY_TYPE[b.object_type] || "MES Context"} · {count} props</em>
                          </button>
                        );
                      })}
                    </nav>

                    <div className="cg-prop-pane">
                      <div className="cg-prop-head">
                        <div>
                          <h3>{focused.label}</h3>
                          <p className="small dim">{std.standard}</p>
                        </div>
                        <label className="cg-prop-protocol">
                          <span className="field-label">Protocol</span>
                          <select
                            className="field"
                            value={protocol}
                            disabled={readOnly}
                            onChange={(e) => setBindingProtocol(focused.id, e.target.value)}
                          >
                            {PROTOCOL_OPTIONS.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <table className="data cg-prop-table">
                        <thead>
                          <tr>
                            <th>Key</th>
                            <th>Label</th>
                            <th>Data type</th>
                            <th>Format</th>
                            <th>Unit</th>
                            <th>Req</th>
                            {!readOnly && <th />}
                          </tr>
                        </thead>
                        <tbody>
                          {props.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <input
                                  className="field mono"
                                  value={p.key}
                                  disabled={readOnly}
                                  onChange={(e) => patchProperty(focused.id, p.id, {
                                    key: e.target.value.replace(/\s+/g, "_"),
                                  })}
                                />
                              </td>
                              <td>
                                <input
                                  className="field"
                                  value={p.label}
                                  disabled={readOnly}
                                  onChange={(e) => patchProperty(focused.id, p.id, { label: e.target.value })}
                                />
                              </td>
                              <td>
                                <select
                                  className="field"
                                  value={p.data_type}
                                  disabled={readOnly}
                                  onChange={(e) => patchProperty(focused.id, p.id, { data_type: e.target.value })}
                                >
                                  {std.types.map((t) => <option key={t} value={t}>{t}</option>)}
                                  {!std.types.includes(p.data_type) && (
                                    <option value={p.data_type}>{p.data_type}</option>
                                  )}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="field"
                                  value={p.format || ""}
                                  disabled={readOnly}
                                  onChange={(e) => patchProperty(focused.id, p.id, { format: e.target.value })}
                                >
                                  {std.formats.map((f) => (
                                    <option key={f || "none"} value={f}>{f || "—"}</option>
                                  ))}
                                  {p.format && !std.formats.includes(p.format) && (
                                    <option value={p.format}>{p.format}</option>
                                  )}
                                </select>
                              </td>
                              <td>
                                <input
                                  className="field"
                                  value={p.unit || ""}
                                  disabled={readOnly}
                                  placeholder="—"
                                  onChange={(e) => patchProperty(focused.id, p.id, { unit: e.target.value })}
                                />
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={!!p.required}
                                  disabled={readOnly}
                                  onChange={(e) => patchProperty(focused.id, p.id, { required: e.target.checked })}
                                />
                              </td>
                              {!readOnly && (
                                <td>
                                  <button
                                    type="button"
                                    className="btn ghost sm"
                                    onClick={() => removeProperty(focused.id, p.id)}
                                    title="Remove property"
                                  >
                                    ✕
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {!readOnly && (
                        <div className="row mt" style={{ gap: 8 }}>
                          <button type="button" className="btn ghost sm" onClick={() => addProperty(focused.id)}>
                            + Add property
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => patchBinding(focused.id, {
                              protocol,
                              properties: defaultPropsFor(focused.object_type, protocol),
                            })}
                            title="Reset properties to protocol defaults for this object type"
                          >
                            Reset to protocol defaults
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-body">
            <h2 className="wizard-heading">3 · Review & publish</h2>
            <p className="wizard-lead">
              Publishing makes these bindings the active reporting structure for Explore and Reporting.
            </p>
            <div className="wizard-summary" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <div><span className="faint">Model</span><strong>{active.name}</strong></div>
              <div><span className="faint">Status</span><strong>{active.status}</strong></div>
              <div>
                <span className="faint">Enabled bindings</span>
                <strong>{bindings.filter((b) => b.enabled).length} / {bindings.length}</strong>
              </div>
            </div>
            <table className="data">
              <thead>
                <tr><th>Object</th><th>Protocol</th><th>Home</th><th>Properties</th><th>Roll-up</th><th>On</th></tr>
              </thead>
              <tbody>
                {bindings.map((b) => {
                  const enriched = ensureBindingProps(b);
                  return (
                    <tr key={b.id} className={b.enabled ? "" : "dim"}>
                      <td>{b.label}</td>
                      <td className="small">{enriched.protocol}</td>
                      <td className="mono">{b.report_at}</td>
                      <td className="mono">{(enriched.properties || []).length}</td>
                      <td className="small">{(b.rollup_to || []).join(" · ") || "—"}</td>
                      <td>{b.enabled ? "✓" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="wizard-nav">
          <button type="button" className="btn ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            ← Back
          </button>
          <div className="wizard-nav-right">
            {readOnly ? (
              <button type="button" className="btn" onClick={onRequestEdit}>Edit model</button>
            ) : (
              <>
                <button type="button" className="btn ghost" disabled={saving || !draft} onClick={() => save()}>
                  Save draft
                </button>
                {step < COMPOSE_STEPS.length - 1 ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={step === 1 && !bindings.length}
                    onClick={() => {
                      if (step === 1 && bindPhase === "select") {
                        setBindPhase("configure");
                        return;
                      }
                      if (step === 1 && bindPhase === "configure") {
                        setBindPhase("properties");
                        setPropFocusId(bindings[0]?.id || null);
                        return;
                      }
                      setStep((s) => s + 1);
                    }}
                  >
                    {step === 1 && bindPhase === "select"
                      ? "Configure bindings →"
                      : step === 1 && bindPhase === "configure"
                        ? "Property objects →"
                        : "Continue →"}
                  </button>
                ) : (
                  <button type="button" className="btn success" disabled={saving} onClick={() => save("Published")}>
                    {saving ? "Publishing…" : "Publish context model"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Reporting structure ─────────────────────────────────────────── */

function ReportingView({
  reporting, onFocusEntity,
}: {
  reporting: any;
  onFocusEntity: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filterType, setFilterType] = useState<string>("All");
  const [selectedNode, setSelectedNode] = useState<any>(null);

  const types = ["All", ...Object.keys(reporting?.stats?.by_type || {})];
  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !(e[id] ?? true) }));

  if (!reporting) return <p className="dim">Loading reporting structure…</p>;

  return (
    <>
      <Tip>
        The reporting tree follows the composed context graph. Expand a line or station to see
        <b> inspection</b>, <b>status</b>, <b>defect</b> and other objects at that level — including rollups.
        Click a node to inspect, or jump to Explore.
      </Tip>

      <div className="cg-report-kpis">
        <div className="kpi">
          <div className="k-label">Nodes</div>
          <div className="k-value">{reporting.stats.nodes}</div>
          <div className="k-sub">in reporting tree</div>
        </div>
        <div className="kpi">
          <div className="k-label">Object slots</div>
          <div className="k-value">{reporting.stats.objects}</div>
          <div className="k-sub">bound to hierarchy</div>
        </div>
        <div className="kpi">
          <div className="k-label">Schema</div>
          <div className="k-value" style={{ fontSize: 18 }}>{reporting.schema_status}</div>
          <div className="k-sub">{reporting.schema_id}</div>
        </div>
        {Object.entries(reporting.stats.by_type || {}).slice(0, 3).map(([t, n]: [string, any]) => (
          <div className="kpi" key={t}>
            <div className="k-label">{t}</div>
            <div className="k-value" style={{ fontSize: 20 }}>{n}</div>
            <div className="k-sub">instances</div>
          </div>
        ))}
      </div>

      <div className="source-filters" style={{ marginBottom: 12 }}>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            className={`source-chip ${filterType === t ? "active" : ""}`}
            onClick={() => setFilterType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="graph-layout">
        <Panel title="Reporting structure · context hierarchy" style={{ flex: 1, minWidth: 0 }}>
          <ReportTree
            node={reporting.tree}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
            filterType={filterType}
            selectedId={selectedNode?.id}
            onSelect={setSelectedNode}
          />
        </Panel>

        <div className="graph-rail">
          <Panel title={selectedNode ? selectedNode.label : "Select a node"}>
            {!selectedNode && (
              <p className="small dim">Click a facility, area, line, station or device to see bound objects.</p>
            )}
            {selectedNode && (
              <>
                <div className="small faint" style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
                  {selectedNode.kind}
                </div>
                <div className="divider" />
                {selectedNode.objects.length === 0 && (
                  <p className="small dim">No objects bound at this level for the current filter / schema.</p>
                )}
                {selectedNode.objects
                  .filter((o: any) => filterType === "All" || o.type === filterType)
                  .map((o: any, i: number) => {
                    const st = OBJECT_STYLE[o.type] ?? { color: "#6B7275", glyph: "◇" };
                    return (
                      <div key={`${o.type}-${i}`} className="cg-obj-row">
                        <span style={{ color: st.color }}>{st.glyph}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5 }}>{o.label}</div>
                          <div className="small faint">{o.detail}{o.rolled_up ? " · rolled up" : ""}</div>
                        </div>
                        <span className="mono" style={{ fontWeight: 800 }}>{o.count}</span>
                      </div>
                    );
                  })}
                {["facility", "area", "line", "station", "device"].includes(selectedNode.kind) && (
                  <button
                    type="button"
                    className="btn mt"
                    style={{ width: "100%" }}
                    onClick={() => onFocusEntity(selectedNode.id)}
                  >
                    Explore in graph →
                  </button>
                )}
              </>
            )}
          </Panel>

          <div className="mt" />
          <Panel title="Active bindings">
            {reporting.bindings.filter((b: any) => b.enabled).map((b: any) => (
              <div key={b.id} className="row between small" style={{ padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{b.label}</span>
                <span className="mono faint">{b.report_at}</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}

function ReportTree({
  node, depth, expanded, onToggle, filterType, selectedId, onSelect,
}: {
  node: any; depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  filterType: string;
  selectedId?: string;
  onSelect: (n: any) => void;
}) {
  const hasKids = node.children?.length > 0;
  const open = expanded[node.id] ?? depth < 2;
  const ks = KIND_STYLE[node.kind] ?? KIND_STYLE.facility;
  const objs = (node.objects || []).filter((o: any) => filterType === "All" || o.type === filterType);
  const objCount = objs.reduce((a: number, o: any) => a + o.count, 0);

  return (
    <div className="cg-tree-node" style={{ marginLeft: depth ? 14 : 0 }}>
      <div
        className={`cg-tree-row ${selectedId === node.id ? "sel" : ""}`}
        onClick={() => onSelect(node)}
      >
        {hasKids ? (
          <button
            type="button"
            className="cg-tree-twist"
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="cg-tree-twist spacer" />
        )}
        <span className="cg-tree-glyph" style={{ color: ks.color }}>{ks.glyph}</span>
        <span className="cg-tree-label">{node.label}</span>
        <span className="cg-tree-kind">{node.kind}</span>
        {objCount > 0 && <span className="cg-tree-count mono">{objCount}</span>}
        <span className="cg-tree-pills">
          {objs.slice(0, 4).map((o: any, i: number) => {
            const st = OBJECT_STYLE[o.type] ?? { color: "#6B7275", glyph: "◇" };
            return (
              <span key={i} className="cg-tree-pill" style={{ borderColor: st.color, color: st.color }} title={o.label}>
                {st.glyph} {o.count}
              </span>
            );
          })}
        </span>
      </div>
      {hasKids && open && node.children.map((ch: any) => (
        <ReportTree
          key={ch.id}
          node={ch}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          filterType={filterType}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
