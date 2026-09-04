"use client";

import {
  FlowNode,
  dataplaneStyle,
  formatLinkLabel,
  formatLinkTooltip,
} from "@/lib/graphBackplane";
import { Badge } from "@/components/ui/badge";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

type Props = {
  roots: FlowNode[];
  levels: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (node: FlowNode) => void;
  direction?: "ltr" | "ttb";
  collapsed: Record<string, boolean>;
  onToggle: (id: string) => void;
};

type LaidOut = {
  node: FlowNode;
  depth: number;
  x: number;
  y: number;
  h: number;
  parentId?: string;
};

const NODE_W = 188;
const COL_W = 220;
/**
 * Typical full device card (badge, title, HI/state, OPC UA ingress, dataplane pills)
 * measures ~141px; reserve a little more so packing never clips.
 */
const NODE_H_MIN = 128;
/** Vertical gap between packed sibling extents. */
const ROW_GAP = 16;
/** Depth pitch for ttb layout / headers — must clear max estimated card height. */
const ROW_PITCH = 152 + ROW_GAP;
const PAD_X = 40;
const PAD_Y = 56;
const MIN_ZOOM = 0.65;
const MAX_ZOOM = 1.4;

function visibleChildren(node: FlowNode, collapsed: Record<string, boolean>): FlowNode[] {
  if (collapsed[node.id]) return [];
  return node.children || [];
}

function attachmentIndicators(node: FlowNode) {
  const atts = node.attachments || [];
  const byType = Object.fromEntries(atts.map((a) => [a.object_type, a.count]));
  const homeSlots = (node.binding_slots || []).filter((s) => s.mode === "home");
  // Prefer home binding slots; fall back to attachment types that exist.
  const keys = homeSlots.length
    ? homeSlots.slice(0, 4).map((s) => ({
        object_type: s.object_type,
        label: s.label,
        protocol: s.protocol,
      }))
    : atts.slice(0, 4).map((a) => ({
        object_type: a.object_type,
        label: a.object_type,
        protocol: undefined as string | undefined,
      }));

  // When no home slots, still show attachment counts only (no fake empties).
  if (!homeSlots.length && !atts.length) {
    return [] as {
      object_type: string;
      label: string;
      count: number | null;
      empty: boolean;
      protocol?: string;
    }[];
  }

  return keys.map((k) => {
    const count = byType[k.object_type];
    const has = typeof count === "number" && count > 0;
    return {
      object_type: k.object_type,
      label: k.label,
      count: has ? count : 0,
      empty: !has,
      protocol: k.protocol,
    };
  });
}

/**
 * Estimate rendered card height from content (badge, title, meta, ingress, pills).
 * Calibrated against measured device cards (~141px) with HI + ingress + pill row.
 */
export function estimateNodeHeight(node: FlowNode, hasParent: boolean): number {
  // Core stack: padding/border + badge row + title + meta + one pill row.
  let h = 128;
  const metaBits =
    (node.props?.health_index != null ? 1 : 0) +
    (node.props?.state ? 1 : 0) +
    (node.props?.demo_scenario ? 1 : 0) +
    (node.live?.open_anomalies ? 1 : 0) +
    (node.live?.open_quality_events ? 1 : 0);
  if (metaBits > 2) h += 16;
  if (hasParent && node.link) h += 20; // ingress line (~141–148px typical)
  const pillCount = Math.max(1, attachmentIndicators(node).length);
  if (pillCount > 3) h += 18; // wrapped pill row
  return Math.max(NODE_H_MIN, h);
}

function nodeHeight(
  node: FlowNode,
  hasParent: boolean,
  heightOverrides?: Record<string, number>,
): number {
  const estimated = estimateNodeHeight(node, hasParent);
  const measured = heightOverrides?.[node.id];
  return measured != null ? Math.max(estimated, measured) : estimated;
}

export function layoutForest(
  roots: FlowNode[],
  collapsed: Record<string, boolean>,
  direction: "ltr" | "ttb",
  heightOverrides: Record<string, number> = {},
): LaidOut[] {
  const out: LaidOut[] = [];

  if (direction === "ttb") {
    // Depth = rows; pack siblings left-to-right by estimated width (fixed NODE_W).
    let colCursor = 0;
    const placeTtb = (node: FlowNode, depth: number, parentId?: string): number => {
      const kids = visibleChildren(node, collapsed);
      const h = nodeHeight(node, !!parentId, heightOverrides);
      let center: number;
      if (!kids.length) {
        center = colCursor;
        colCursor += 1;
      } else {
        const childCenters = kids.map((ch) => placeTtb(ch, depth + 1, node.id));
        center = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;
      }
      const x = PAD_X + center * COL_W;
      const y = PAD_Y + depth * ROW_PITCH;
      out.push({ node, depth, x, y, h, parentId });
      return center;
    };
    roots.forEach((r) => placeTtb(r, 0));
  } else {
    // LTR: pack along Y using each node's estimated/measured height + ROW_GAP so siblings never overlap.
    let leafCursor = 0;
    const placeLtr = (
      node: FlowNode,
      depth: number,
      parentId?: string,
    ): { top: number; bottom: number; mid: number } => {
      const kids = visibleChildren(node, collapsed);
      const h = nodeHeight(node, !!parentId, heightOverrides);
      const x = PAD_X + depth * COL_W;
      let top: number;
      let bottom: number;
      let mid: number;
      if (!kids.length) {
        top = leafCursor;
        bottom = top + h;
        mid = top + h / 2;
        leafCursor = bottom + ROW_GAP;
      } else {
        const spans = kids.map((ch) => placeLtr(ch, depth + 1, node.id));
        const spanTop = spans[0].top;
        const spanBottom = spans[spans.length - 1].bottom;
        mid = (spanTop + spanBottom) / 2;
        top = mid - h / 2;
        bottom = top + h;
      }
      out.push({ node, depth, x, y: top, h, parentId });
      return { top, bottom, mid };
    };
    roots.forEach((r) => placeLtr(r, 0));
  }

  // Normalize so no node sits at negative coords (fixes overflow / left=-N bounds).
  if (!out.length) return out;
  const minX = Math.min(...out.map((n) => n.x));
  const minY = Math.min(...out.map((n) => n.y));
  const dx = minX < PAD_X ? PAD_X - minX : 0;
  const dy = minY < PAD_Y ? PAD_Y - minY : 0;
  if (dx || dy) {
    for (const n of out) {
      n.x += dx;
      n.y += dy;
    }
  }
  return out;
}

function shortProtocol(protocol: string): string {
  if (protocol.startsWith("MQTT")) return "MQTT";
  if (protocol.startsWith("Kafka")) return "Kafka";
  if (protocol === "OPC UA") return "OPC UA";
  if (protocol === "MES REST") return "MES";
  if (protocol === "GigE Vision") return "GigE";
  if (protocol === "HTTP ingest") return "HTTP";
  if (protocol === "CMMS REST") return "CMMS";
  return protocol.length > 10 ? `${protocol.slice(0, 9)}…` : protocol;
}

export function FlowTreeCanvas({
  roots,
  levels,
  selectedId,
  onSelect,
  direction = "ltr",
  collapsed,
  onToggle,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [heightOverrides, setHeightOverrides] = useState<Record<string, number>>({});
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  const laid = useMemo(
    () => layoutForest(roots, collapsed, direction, heightOverrides),
    [roots, collapsed, direction, heightOverrides],
  );

  const byId = useMemo(() => Object.fromEntries(laid.map((l) => [l.node.id, l])), [laid]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const maxX = laid.reduce((m, n) => Math.max(m, n.x), 0);
    const maxBottom = laid.reduce((m, n) => Math.max(m, n.y + n.h), 0);
    const w = Math.max(el.clientWidth, maxX + NODE_W + PAD_X);
    const h = Math.max(480, maxBottom + PAD_Y);
    setSize({ w, h });
  }, [laid]);

  // Measure real card heights and re-pack when content exceeds the estimate.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !laid.length) return;
    const next: Record<string, number> = { ...heightOverrides };
    let changed = false;
    for (const n of laid) {
      const el = wrap.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(n.node.id)}"]`);
      if (!el) continue;
      const measured = Math.ceil(el.offsetHeight);
      if (measured > (next[n.node.id] ?? n.h)) {
        next[n.node.id] = measured;
        changed = true;
      }
    }
    if (changed) setHeightOverrides(next);
  }, [laid, heightOverrides]);

  // Reset pan when forest direction / site tree changes significantly.
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [direction, roots]);

  const levelLabels = useMemo(() => {
    const map = Object.fromEntries(levels.map((l) => [l.id, l.label]));
    return map;
  }, [levels]);

  const onWheel = (e: ReactWheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((z + delta).toFixed(2)))));
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 1 && !(e.button === 0 && e.altKey)) return;
    e.preventDefault();
    const el = wrapRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pan.x, py: pan.y };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.px + (e.clientX - d.ox), y: d.py + (e.clientY - d.oy) });
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    wrapRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="graph-canvas flow-tree-canvas"
      ref={wrapRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="flow-tree-toolbar" aria-label="Canvas controls">
        <button type="button" className="btn ghost sm" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.1))} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.1))} aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset
        </button>
        <span className="muted" style={{ fontSize: 11 }}>
          {Math.round(zoom * 100)}% · Alt-drag pan · ⌘/Ctrl-wheel zoom
        </span>
      </div>

      <div
        className="flow-tree-world"
        style={{
          width: size.w,
          height: size.h,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <div className="flow-tree-grid" aria-hidden />

        <div className="flow-tree-headers" aria-hidden>
          {levels.map((lvl, i) => (
            <div
              key={lvl.id}
              className="flow-tree-header"
              style={
                direction === "ltr"
                  ? { left: PAD_X + i * COL_W, top: 12, width: NODE_W }
                  : { left: 12, top: PAD_Y + i * ROW_PITCH - 32, width: 120 }
              }
            >
              {lvl.label}
            </div>
          ))}
        </div>

        <svg
          className="flow-tree-edges"
          width={size.w}
          height={size.h}
          role="img"
          aria-label="Hierarchy connections with protocols"
        >
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="flow-tree-arrow" />
            </marker>
          </defs>
          {laid
            .filter((n) => n.parentId && byId[n.parentId])
            .map((n) => {
              const p = byId[n.parentId!];
              const x1 = p.x + (direction === "ltr" ? NODE_W : NODE_W / 2);
              const y1 = p.y + (direction === "ltr" ? p.h / 2 : p.h);
              const x2 = n.x + (direction === "ltr" ? 0 : NODE_W / 2);
              const y2 = n.y + (direction === "ltr" ? n.h / 2 : 0);
              const mx = direction === "ltr" ? (x1 + x2) / 2 : x1;
              const my = direction === "ltr" ? y1 : (y1 + y2) / 2;
              const d =
                direction === "ltr"
                  ? `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
                  : `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
              const link = n.node.link;
              const label = link ? shortProtocol(link.protocol) : "";
              const lx = direction === "ltr" ? mx : (x1 + x2) / 2;
              const ly = direction === "ltr" ? (y1 + y2) / 2 : my;
              const tip = formatLinkTooltip(link);
              return (
                <g key={`${n.parentId}-${n.node.id}`} className="flow-tree-edge-group">
                  <path d={d} className="flow-tree-edge" markerEnd="url(#flow-arrow)" />
                  {label ? (
                    <g transform={`translate(${lx}, ${ly})`}>
                      <title>{tip}</title>
                      <rect
                        x={-36}
                        y={-9}
                        width={72}
                        height={18}
                        rx={4}
                        className="flow-tree-edge-label-bg"
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="flow-tree-edge-label"
                      >
                        {label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
        </svg>

        <div className="flow-tree-nodes" style={{ width: size.w, height: size.h }}>
          {laid.map(({ node, x, y, parentId }) => {
            const hasKids = (node.children || []).length > 0;
            const isCollapsed = !!collapsed[node.id];
            const hi = node.props?.health_index as number | undefined;
            const state = node.props?.state as string | undefined;
            const scenario = node.props?.demo_scenario as string | undefined;
            const indicators = attachmentIndicators(node);
            const linkLabel = parentId ? formatLinkLabel(node.link) : "";

            return (
              <button
                key={node.id}
                type="button"
                data-node-id={node.id}
                className={`graph-node flow-tree-node level-${node.level} ${
                  selectedId === node.id ? "selected" : ""
                } ${scenario ? "has-scenario" : ""}`}
                style={{ left: x, top: y, width: NODE_W }}
                onClick={() => onSelect(node)}
                aria-pressed={selectedId === node.id}
              >
                <div className="flow-tree-node-top">
                  {hasKids ? (
                    <span
                      className="flow-tree-twist"
                      role="button"
                      tabIndex={0}
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(node.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggle(node.id);
                        }
                      }}
                    >
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                  ) : (
                    <span className="flow-tree-twist spacer" />
                  )}
                  <Badge
                    variant="outline"
                    className={`flow-kind-badge kind-${node.level}`}
                  >
                    {levelLabels[node.level] || node.kind}
                  </Badge>
                </div>
                <strong title={node.label}>{node.label}</strong>
                <div className="flow-tree-meta">
                  {hi != null && (
                    <span className={`hi ${hi < 0.75 ? "warn" : ""}`}>
                      HI {(hi * 100).toFixed(0)}%
                    </span>
                  )}
                  {state && <span className="state-pill">{state}</span>}
                  {scenario && <span className="scenario">{scenario}</span>}
                  {node.live?.open_anomalies ? (
                    <span className="live-pill crit">{node.live.open_anomalies} anom</span>
                  ) : null}
                  {node.live?.open_quality_events ? (
                    <span className="live-pill warn">{node.live.open_quality_events} QE</span>
                  ) : null}
                </div>
                {linkLabel ? (
                  <div className="flow-tree-ingress" title={formatLinkTooltip(node.link)}>
                    ⇢ {linkLabel}
                  </div>
                ) : null}
                <div className="flow-tree-pills">
                  {indicators.map((a) => {
                    const st = dataplaneStyle(a.object_type);
                    return (
                      <span
                        key={a.object_type}
                        className={`flow-tree-pill ${a.empty ? "empty" : ""}`}
                        style={{ borderColor: st.color, color: st.color }}
                        title={
                          a.empty
                            ? `${a.label}: empty${a.protocol ? ` · ${a.protocol}` : ""}`
                            : `${a.label}: ${a.count}${a.protocol ? ` · ${a.protocol}` : ""}`
                        }
                      >
                        {st.glyph} {a.empty ? "empty" : a.count}
                      </span>
                    );
                  })}
                  {!indicators.length && (
                    <span className="flow-tree-pill empty muted-pill" title="No dataplane attachments">
                      no planes
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {!laid.length && (
            <p className="muted" style={{ padding: 16 }}>
              No hierarchy nodes for this site / backplane.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
