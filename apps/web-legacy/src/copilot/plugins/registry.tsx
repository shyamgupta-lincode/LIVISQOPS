import React from "react";

import type { PluginPayload } from "../types";
import { ChartBlock } from "./ChartBlock";
import { PdfBlock } from "./PdfBlock";
import { TableBlock } from "./TableBlock";

export type PluginId = "charts" | "tables" | "documents" | "text";

function TextBlock({ title, body }: { title?: string; body: string }) {
  return (
    <div className="copilot-block copilot-block-text">
      {title && <div className="copilot-block-title">{title}</div>}
      <p>{body}</p>
    </div>
  );
}

/** Simple plugin registry: kind → renderer */
export const PLUGIN_REGISTRY: Record<
  PluginPayload["kind"],
  (payload: PluginPayload) => React.ReactNode
> = {
  chart: (p) => <ChartBlock payload={p as Extract<PluginPayload, { kind: "chart" }>} />,
  table: (p) => <TableBlock payload={p as Extract<PluginPayload, { kind: "table" }>} />,
  pdf: (p) => <PdfBlock payload={p as Extract<PluginPayload, { kind: "pdf" }>} />,
  text: (p) => {
    const t = p as Extract<PluginPayload, { kind: "text" }>;
    return <TextBlock title={t.title} body={t.body} />;
  },
};

export function renderPluginBlock(payload: PluginPayload): React.ReactNode {
  const render = PLUGIN_REGISTRY[payload.kind];
  return render ? render(payload) : null;
}

export const PLUGIN_CAPABILITIES: { id: PluginId; label: string; blurb: string }[] = [
  { id: "charts", label: "Charts", blurb: "Recharts line / bar / area from structured payloads" },
  { id: "tables", label: "Tables", blurb: "HTML data tables for bindings and KPIs" },
  { id: "documents", label: "Docs", blurb: "PDF viewer + markdown manual excerpts" },
];
