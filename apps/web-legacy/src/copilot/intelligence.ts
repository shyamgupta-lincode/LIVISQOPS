/** Keyword / intent demos → structured plugin payloads (no LLM required). */

import { DOC_CATALOG, matchDocs } from "./catalog";
import type {
  AssistantReply,
  ChartPayload,
  CopilotPageContext,
  TablePayload,
} from "./types";

function coverageChart(ctx: CopilotPageContext | null): ChartPayload {
  const coverage = ctx?.metrics?.coveragePct ?? 78;
  const implement = ctx?.metrics?.implementPct ?? 64;
  const linked = ctx?.metrics?.linkedObjects ?? 24;
  return {
    kind: "chart",
    title: `Coverage · ${ctx?.focusLabel || "active context"}`,
    chartType: "area",
    xKey: "shift",
    series: [
      { key: "coverage", label: "Coverage %", color: "var(--app-color, var(--accent))" },
      { key: "implement", label: "Implementation %", color: "#1F9D5C" },
    ],
    data: [
      { shift: "S-2", coverage: Math.max(40, coverage - 18), implement: Math.max(30, implement - 14) },
      { shift: "S-1", coverage: Math.max(45, coverage - 8), implement: Math.max(35, implement - 6) },
      { shift: "Now", coverage, implement },
      { shift: "Proj", coverage: Math.min(99, coverage + 4), implement: Math.min(96, implement + 6) },
      { shift: "Target", coverage: 92, implement: Math.min(98, Math.round(linked * 2.1)) },
    ],
  };
}

function engagementBar(ctx: CopilotPageContext | null): ChartPayload {
  const eng = ctx?.metrics?.engagement ?? 48;
  return {
    kind: "chart",
    title: "Engagement by lens",
    chartType: "bar",
    xKey: "lens",
    series: [{ key: "value", label: "Signals", color: "#C4841D" }],
    data: [
      { lens: "Quality", value: Math.round(eng * 0.42) },
      { lens: "Production", value: Math.round(eng * 0.28) },
      { lens: "Assets", value: Math.round(eng * 0.18) },
      { lens: "Other", value: Math.round(eng * 0.12) },
    ],
  };
}

function bindingsTable(ctx: CopilotPageContext | null): TablePayload {
  const rows = (ctx?.bindings ?? []).slice(0, 12).map((b) => ({
    id: b.id,
    label: b.label,
    kind: b.kind,
    lens: b.lens || "—",
  }));
  if (!rows.length) {
    return {
      kind: "table",
      title: "Linked objects (demo)",
      columns: [
        { key: "id", label: "ID" },
        { key: "label", label: "Label" },
        { key: "kind", label: "Kind" },
        { key: "lens", label: "Lens" },
      ],
      rows: [
        { id: "st-paint-01", label: "Paint Booth 1", kind: "station", lens: "quality" },
        { id: "insp-vin-scan", label: "VIN scan inspection", kind: "inspection", lens: "quality" },
        { id: "evt-scratch", label: "Surface scratch event", kind: "event", lens: "quality" },
        { id: "dev-cam-a", label: "Edge cam A", kind: "device", lens: "assets" },
      ],
    };
  }
  return {
    kind: "table",
    title: `Bindings · ${ctx?.focusLabel || "focus"}`,
    columns: [
      { key: "id", label: "ID" },
      { key: "label", label: "Label" },
      { key: "kind", label: "Kind" },
      { key: "lens", label: "Lens" },
    ],
    rows,
  };
}

async function fetchMarkdownPreview(url: string, maxChars = 900): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const text = await res.text();
    const cleaned = text
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\|/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars)}…` : cleaned;
  } catch {
    return undefined;
  }
}

export async function resolveCopilotIntent(
  raw: string,
  ctx: CopilotPageContext | null,
): Promise<AssistantReply> {
  const q = raw.trim().toLowerCase();
  if (!q) {
    return { text: "Ask about coverage, bindings, or docs — or use Chart / Table / Docs." };
  }

  if (/\b(overview|radial)\b/.test(q)) {
    return {
      text: ctx?.onOverview
        ? `Switching to radial overview for ${ctx.focusLabel || "the graph"}.`
        : "Overview is available on the Context Graph Explore workspace.",
      actions: ctx?.onOverview ? ["overview"] : undefined,
    };
  }

  if (/\b(cinema|drill)\b/.test(q)) {
    return {
      text: ctx?.onCinema
        ? "Opening cinema drill."
        : "Cinema drill lives on Context Graph Explore.",
      actions: ctx?.onCinema ? ["cinema"] : undefined,
    };
  }

  if (/\b(ri analysis|ri\b|analysis|concerns|alerts?)\b/.test(q)) {
    return {
      text: ctx?.onRiAnalysis
        ? `Opening RI Analysis${ctx.metrics?.alertCount ? ` (${ctx.metrics.alertCount} signals)` : ""}.`
        : "RI Analysis is wired when Explore is active on Context Graph.",
      actions: ctx?.onRiAnalysis ? ["ri-analysis"] : undefined,
      blocks: ctx?.metrics
        ? [{
            kind: "text",
            title: "Context KPIs",
            body: `Coverage ${ctx.metrics.coveragePct}% · Linked ${ctx.metrics.linkedObjects} · Engagement ${ctx.metrics.engagement} · Implementation ${ctx.metrics.implementPct}%`,
          }]
        : undefined,
    };
  }

  if (/\b(chart|coverage|trend|graph|plot|bar|area|line)\b/.test(q)) {
    const chart = /\b(bar|engagement|lens)\b/.test(q) ? engagementBar(ctx) : coverageChart(ctx);
    if (/\bline\b/.test(q)) chart.chartType = "line";
    if (/\bbar\b/.test(q)) chart.chartType = "bar";
    if (/\barea\b/.test(q)) chart.chartType = "area";
    return {
      text: `Here’s a ${chart.chartType} chart for ${ctx?.focusLabel || "the active workspace"}.`,
      blocks: [chart],
    };
  }

  if (/\b(table|bindings?|linked|objects?|rows?)\b/.test(q)) {
    return {
      text: "Linked objects as a table (from Explore context when available).",
      blocks: [bindingsTable(ctx)],
    };
  }

  if (/\b(pdf|doc|docs|manual|documentation|help|guide)\b/.test(q)) {
    const docs = matchDocs(q);
    const pick = docs[0] || DOC_CATALOG[0];
    const preview = pick.mdUrl ? await fetchMarkdownPreview(pick.mdUrl) : undefined;
    return {
      text: `Matched “${pick.title}”. ${pick.blurb}`,
      blocks: [
        {
          kind: "pdf",
          title: pick.title,
          url: pick.pdfUrl || "/docs/LIVIS_COPILOT_GUIDE.pdf",
          page: pick.defaultPage ?? 1,
          markdownUrl: pick.mdUrl,
          markdownPreview: preview,
        },
      ],
    };
  }

  // Soft fallback: mention capabilities + optional KPI strip
  const focus = ctx?.focusLabel ? ` around ${ctx.focusLabel}` : "";
  return {
    text:
      `I can chart coverage, list bindings as a table, or open docs${focus}. ` +
      `Try “show coverage chart”, “table of bindings”, or “open user manual”.`,
    blocks: ctx?.metrics
      ? [{
          kind: "text",
          body: `Live KPIs — Coverage ${ctx.metrics.coveragePct}% · Linked ${ctx.metrics.linkedObjects} · Engagement ${ctx.metrics.engagement} · Impl ${ctx.metrics.implementPct}%`,
        }]
      : undefined,
  };
}

/** Quick-action helpers used by chips */
export function quickChart(ctx: CopilotPageContext | null): AssistantReply {
  return {
    text: "Coverage trend (plugin: charts).",
    blocks: [coverageChart(ctx)],
  };
}

export function quickTable(ctx: CopilotPageContext | null): AssistantReply {
  return {
    text: "Bindings table (plugin: tables).",
    blocks: [bindingsTable(ctx)],
  };
}

export async function quickDocs(ctx: CopilotPageContext | null): Promise<AssistantReply> {
  return resolveCopilotIntent("open user manual", ctx);
}
