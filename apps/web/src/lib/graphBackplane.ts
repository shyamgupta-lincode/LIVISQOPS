/** Backplane + flow-tree helpers for /graph */

export type BackplaneLevel = {
  id: string;
  label: string;
  kinds: string[];
  isa95?: string;
  required?: boolean;
  enabled?: boolean;
  order?: number;
};

export type BackplaneDataplane = {
  id: string;
  object_type: string;
  label: string;
  attach_at: string;
  rollup_to?: string[];
  enabled?: boolean;
  description?: string;
  protocol?: string;
  transport?: string;
  direction?: string;
  topic?: string | null;
  endpoint?: string | null;
  source_binding?: string | null;
  lenses?: string[];
};

export type BackplaneConfig = {
  id: string;
  name: string;
  version?: string;
  direction: "ltr" | "ttb";
  default_site?: string;
  levels: BackplaneLevel[];
  dataplanes: BackplaneDataplane[];
};

export type FlowLink = {
  protocol: string;
  transport?: string | null;
  direction?: string | null;
  topic?: string | null;
  endpoint?: string | null;
  connector_kind?: string | null;
  provenance_source?: string | null;
};

export type FlowAttachment = {
  object_type: string;
  items: {
    id: string;
    kind: string;
    label: string;
    rel_type?: string;
    props?: Record<string, unknown>;
    link?: FlowLink | null;
  }[];
  count: number;
  source?: string;
};

export type FlowNode = {
  id: string;
  kind: string;
  level: string;
  label: string;
  props?: Record<string, unknown>;
  site_id?: string | null;
  binding_slots?: {
    id: string;
    object_type: string;
    label: string;
    mode: string;
    protocol?: string;
    transport?: string;
    direction?: string;
    topic?: string | null;
    endpoint?: string | null;
  }[];
  attachments?: FlowAttachment[];
  attachment_count?: number;
  /** Parent→child connectivity (protocol / transport / topic). */
  link?: FlowLink | null;
  live?: {
    open_anomalies?: number;
    open_quality_events?: number;
    distinct_signals?: number;
  };
  children?: FlowNode[];
};

export type FlowForest = {
  backplane_id?: string;
  levels: string[];
  roots: FlowNode[];
  stats: { nodes: number; by_level: Record<string, number>; attachments: number; roots: number };
  sites?: { id: string; label: string; code?: string; legacy?: boolean }[];
};

const STORAGE_KEY = "fo_graph_backplane_v1";

export const DATAPLANE_STYLE: Record<string, { glyph: string; color: string }> = {
  entities: { glyph: "▣", color: "#0B6E4F" },
  status: { glyph: "●", color: "#2563eb" },
  inspection: { glyph: "◎", color: "#7c3aed" },
  defect: { glyph: "▲", color: "#dc2626" },
  quality_event: { glyph: "◆", color: "#b91c1c" },
  order: { glyph: "☰", color: "#0891b2" },
  genealogy: { glyph: "⧉", color: "#0f766e" },
  timeseries: { glyph: "∿", color: "#ca8a04" },
  failure_mode: { glyph: "⚙", color: "#ea580c" },
  lesson: { glyph: "★", color: "#4f46e5" },
};

/** Default hierarchy link profiles when edge provenance is missing (client rebuild). */
const FLOW_LINK_BY_KIND: Record<string, FlowLink> = {
  site: {
    protocol: "simulated",
    transport: "seed",
    direction: "publish",
    topic: "context.sites",
    endpoint: "context://enterprise/sites",
  },
  area: {
    protocol: "MES REST",
    transport: "https",
    direction: "subscribe",
    topic: "mes.areas",
    endpoint: "/api/v1/connector-sim/mes/areas",
  },
  line: {
    protocol: "MES REST",
    transport: "https",
    direction: "subscribe",
    topic: "mes.production.context",
    endpoint: "/api/v1/connector-sim/mes/lines",
  },
  cell: {
    protocol: "MQTT Sparkplug B",
    transport: "mqtt",
    direction: "publish",
    topic: "spBv1.0/FactoryOps/DBIRTH",
    endpoint: "mqtt://mosquitto:1883",
  },
  station: {
    protocol: "MQTT Sparkplug B",
    transport: "mqtt",
    direction: "publish",
    topic: "spBv1.0/FactoryOps/DDATA",
    endpoint: "mqtt://mosquitto:1883",
  },
  asset: {
    protocol: "OPC UA",
    transport: "opc.tcp",
    direction: "subscribe",
    topic: "ns=2;s=Asset",
    endpoint: "opc.tcp://line-opcua/UA/FactoryOps",
  },
};

export function dataplaneStyle(objectType: string) {
  return DATAPLANE_STYLE[objectType] || { glyph: "◇", color: "#6B7275" };
}

export function formatLinkLabel(link?: FlowLink | null): string {
  if (!link?.protocol) return "";
  const dir =
    link.direction === "subscribe" ? "sub" : link.direction === "publish" ? "pub" : link.direction || "";
  const hint = link.topic || link.endpoint || "";
  const shortHint = hint.length > 28 ? `${hint.slice(0, 26)}…` : hint;
  return [link.protocol, dir, shortHint].filter(Boolean).join(" · ");
}

export function formatLinkTooltip(link?: FlowLink | null): string {
  if (!link?.protocol) return "No protocol metadata";
  const parts = [
    `Protocol: ${link.protocol}`,
    link.transport ? `Transport: ${link.transport}` : "",
    link.direction ? `Direction: ${link.direction}` : "",
    link.topic ? `Topic: ${link.topic}` : "",
    link.endpoint ? `Endpoint: ${link.endpoint}` : "",
    link.connector_kind ? `Connector: ${link.connector_kind}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

function linkFromProvenance(provenance?: Record<string, unknown> | null): FlowLink | null {
  if (!provenance) return null;
  const nested = provenance.link;
  const src =
    nested && typeof nested === "object" ? (nested as Record<string, unknown>) : provenance;
  const protocol = src.protocol;
  if (typeof protocol !== "string" || !protocol) return null;
  return {
    protocol,
    transport: (src.transport as string) || null,
    direction: (src.direction as string) || "publish",
    topic: (src.topic as string) || null,
    endpoint: (src.endpoint as string) || null,
    connector_kind: (src.connector_kind as string) || null,
    provenance_source: (provenance.source as string) || "seed",
  };
}

function defaultLinkForKind(kind: string, props?: Record<string, unknown>): FlowLink {
  const base = { ...(FLOW_LINK_BY_KIND[kind] || { protocol: "MES Context", direction: "publish" }) };
  if (props?.legacy || props?.legacy_site) {
    base.protocol = "simulated";
    base.transport = "seed";
    base.endpoint = "context://harley-york";
  }
  return base;
}

export function loadBackplaneOverride(): BackplaneConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BackplaneConfig;
  } catch {
    return null;
  }
}

export function saveBackplaneOverride(cfg: BackplaneConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearBackplaneOverride() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Merge user form edits onto seeded backplane (levels/dataplanes enablement + order). */
export function mergeBackplane(seed: BackplaneConfig, override: BackplaneConfig | null): BackplaneConfig {
  if (!override) return seed;
  const levelMap = new Map(override.levels.map((l) => [l.id, l]));
  const dpMap = new Map(override.dataplanes.map((d) => [d.id, d]));
  return {
    ...seed,
    name: override.name || seed.name,
    direction: override.direction || seed.direction,
    levels: seed.levels
      .map((l) => {
        const o = levelMap.get(l.id);
        return o ? { ...l, enabled: o.enabled !== false, label: o.label || l.label, order: o.order ?? l.order } : l;
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    dataplanes: seed.dataplanes.map((d) => {
      const o = dpMap.get(d.id);
      return o
        ? {
            ...d,
            enabled: o.enabled !== false,
            attach_at: o.attach_at || d.attach_at,
            rollup_to: o.rollup_to ?? d.rollup_to,
            label: o.label || d.label,
          }
        : d;
    }),
  };
}

/** Client-side rebuild when backplane form changes (uses full node/edge payload). */
export function rebuildForestClient(
  nodes: { id: string; kind: string; label: string; props?: Record<string, unknown> }[],
  edges: {
    id?: string;
    src_id: string;
    dst_id: string;
    rel_type: string;
    confidence?: number;
    provenance?: Record<string, unknown>;
  }[],
  backplane: BackplaneConfig,
  siteId: string | null,
): FlowForest {
  const enabledLevels = [...backplane.levels]
    .filter((l) => l.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const levelIds = enabledLevels.map((l) => l.id);
  const kindToLevel: Record<string, string> = {};
  for (const lvl of enabledLevels) {
    for (const k of lvl.kinds || []) kindToLevel[k] = lvl.id;
  }

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const children: Record<string, string[]> = {};
  const parent: Record<string, string> = {};
  const containsEdge: Record<string, (typeof edges)[number]> = {};
  const related: Record<
    string,
    {
      direction: string;
      node_id: string;
      kind: string;
      label: string;
      rel_type: string;
      props?: Record<string, unknown>;
      link?: FlowLink | null;
    }[]
  > = {};

  for (const e of edges) {
    if (!byId[e.src_id] || !byId[e.dst_id]) continue;
    if (e.rel_type === "contains") {
      (children[e.src_id] ||= []).push(e.dst_id);
      parent[e.dst_id] = e.src_id;
      containsEdge[e.dst_id] = e;
    } else {
      (related[e.src_id] ||= []).push({
        direction: "out",
        node_id: e.dst_id,
        kind: byId[e.dst_id].kind,
        label: byId[e.dst_id].label,
        rel_type: e.rel_type,
        props: byId[e.dst_id].props,
        link: linkFromProvenance(e.provenance),
      });
    }
  }

  const siteOf: Record<string, string | null> = {};
  const resolveSite = (nid: string, seen = new Set<string>()): string | null => {
    if (nid in siteOf) return siteOf[nid];
    if (seen.has(nid)) return null;
    seen.add(nid);
    const node = byId[nid];
    if (!node) {
      siteOf[nid] = null;
      return null;
    }
    if (node.kind === "site") {
      siteOf[nid] = nid;
      return nid;
    }
    const sid = (node.props?.site_id as string) || null;
    if (sid) {
      siteOf[nid] = sid;
      return sid;
    }
    const p = parent[nid];
    const resolved = p ? resolveSite(p, seen) : null;
    siteOf[nid] = resolved;
    return resolved;
  };
  for (const n of nodes) resolveSite(n.id);

  const dataplanes = backplane.dataplanes.filter((d) => d.enabled !== false);
  const slotsFor = (levelId: string) =>
    dataplanes
      .filter((d) => d.attach_at === levelId || (d.rollup_to || []).includes(levelId))
      .map((d) => ({
        id: d.id,
        object_type: d.object_type,
        label: d.label,
        mode: d.attach_at === levelId ? "home" : "rollup",
        protocol: d.protocol,
        transport: d.transport,
        direction: d.direction,
        topic: d.topic,
        endpoint: d.endpoint,
      }));

  const attachKindMap: Record<string, string> = {
    signal: "timeseries",
    failure_mode: "failure_mode",
    unit: "genealogy",
    lot: "genealogy",
    order: "order",
    product: "entities",
  };

  const makeNode = (nid: string, stack: Set<string> = new Set()): FlowNode | null => {
    const raw = byId[nid];
    if (!raw) return null;
    if (stack.has(nid)) return null;
    const nextStack = new Set(stack);
    nextStack.add(nid);
    const level = kindToLevel[raw.kind];
    if (!level || !levelIds.includes(level)) return null;
    if (siteId && siteOf[nid] && siteOf[nid] !== siteId && raw.kind !== "site") return null;
    if (siteId && raw.kind === "site" && nid !== siteId) return null;

    const kids: FlowNode[] = [];
    for (const cid of children[nid] || []) {
      const child = byId[cid];
      if (!child) continue;
      const cl = kindToLevel[child.kind];
      if (cl && levelIds.includes(cl)) {
        const built = makeNode(cid, nextStack);
        if (built) kids.push(built);
      } else {
        for (const gc of children[cid] || []) {
          const built = makeNode(gc, nextStack);
          if (built) kids.push(built);
        }
      }
    }
    kids.sort((a, b) => a.label.localeCompare(b.label));

    const groups: Record<string, FlowAttachment["items"]> = {};
    for (const r of related[nid] || []) {
      if (kindToLevel[r.kind]) continue;
      const key = attachKindMap[r.kind] || r.kind;
      (groups[key] ||= []).push({
        id: r.node_id,
        kind: r.kind,
        label: r.label,
        rel_type: r.rel_type,
        props: r.props,
        link: r.link,
      });
    }
    const attachments: FlowAttachment[] = Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([object_type, items]) => ({ object_type, items, count: items.length }));

    const edgeMeta = containsEdge[nid];
    const link =
      linkFromProvenance(edgeMeta?.provenance) ||
      (parent[nid] ? defaultLinkForKind(raw.kind, raw.props) : null);

    return {
      id: nid,
      kind: raw.kind,
      level,
      label: raw.label,
      props: raw.props,
      site_id: siteOf[nid],
      binding_slots: slotsFor(level),
      attachments,
      attachment_count: attachments.reduce((s, a) => s + a.count, 0),
      link,
      children: kids,
    };
  };

  let plantIds = nodes.filter((n) => n.kind === "site").map((n) => n.id);
  if (siteId) plantIds = plantIds.includes(siteId) ? [siteId] : [];
  const roots = plantIds.map((id) => makeNode(id)).filter(Boolean) as FlowNode[];
  roots.sort((a, b) => a.label.localeCompare(b.label));

  const stats = { nodes: 0, by_level: {} as Record<string, number>, attachments: 0, roots: roots.length };
  const walk = (n: FlowNode) => {
    stats.nodes += 1;
    stats.by_level[n.level] = (stats.by_level[n.level] || 0) + 1;
    stats.attachments += n.attachment_count || 0;
    (n.children || []).forEach(walk);
  };
  roots.forEach(walk);

  return {
    backplane_id: backplane.id,
    levels: levelIds,
    roots,
    stats,
    sites: nodes
      .filter((n) => n.kind === "site")
      .map((n) => ({
        id: n.id,
        label: n.label,
        code: n.props?.code as string | undefined,
        legacy: Boolean(n.props?.legacy_site || n.props?.tier),
      })),
  };
}

export function flattenForest(roots: FlowNode[]): FlowNode[] {
  const out: FlowNode[] = [];
  const walk = (n: FlowNode) => {
    out.push(n);
    (n.children || []).forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

export function findPath(roots: FlowNode[], id: string): FlowNode[] | null {
  const path: FlowNode[] = [];
  const walk = (n: FlowNode): boolean => {
    path.push(n);
    if (n.id === id) return true;
    for (const ch of n.children || []) {
      if (walk(ch)) return true;
    }
    path.pop();
    return false;
  };
  for (const r of roots) {
    if (walk(r)) return [...path];
  }
  return null;
}
