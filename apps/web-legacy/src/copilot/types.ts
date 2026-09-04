/** Universal Copilot — shared types & plugin payloads */

export type ChartKind = "line" | "bar" | "area";

export type ChartPayload = {
  kind: "chart";
  title: string;
  chartType: ChartKind;
  xKey: string;
  series: { key: string; label?: string; color?: string }[];
  data: Record<string, string | number>[];
};

export type TablePayload = {
  kind: "table";
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null | undefined>[];
};

export type PdfPayload = {
  kind: "pdf";
  title: string;
  url: string;
  page?: number;
  /** Optional markdown companion (e.g. USER_MANUAL.md excerpt) */
  markdownUrl?: string;
  markdownPreview?: string;
};

export type TextPayload = {
  kind: "text";
  title?: string;
  body: string;
};

export type PluginPayload = ChartPayload | TablePayload | PdfPayload | TextPayload;

export type CopilotRole = "user" | "assistant" | "system";

export type CopilotMessage = {
  id: string;
  role: CopilotRole;
  text: string;
  blocks?: PluginPayload[];
  ts: number;
};

export type CopilotMetrics = {
  coveragePct: number;
  linkedObjects: number;
  engagement: number;
  implementPct: number;
  alertCount?: number;
};

export type CopilotBindingRow = {
  id: string;
  label: string;
  kind: string;
  lens?: string;
};

/** Page-level hooks registered by Context Graph Explore (or future hosts). */
export type CopilotPageContext = {
  focusLabel?: string;
  metrics?: CopilotMetrics;
  bindings?: CopilotBindingRow[];
  layout?: "overview" | "cinema" | string;
  onOverview?: () => void;
  onCinema?: () => void;
  onRiAnalysis?: () => void;
};

export type AssistantReply = {
  text: string;
  blocks?: PluginPayload[];
  /** Side-effect hints handled by the panel */
  actions?: Array<"overview" | "cinema" | "ri-analysis">;
};
