export { default as UniversalCopilot } from "./UniversalCopilot";
export { CopilotProvider, useCopilot, useCopilotPageBridge } from "./CopilotContext";
export { PLUGIN_CAPABILITIES, PLUGIN_REGISTRY, renderPluginBlock } from "./plugins/registry";
export type {
  AssistantReply,
  ChartPayload,
  CopilotMessage,
  CopilotMetrics,
  CopilotPageContext,
  PdfPayload,
  PluginPayload,
  TablePayload,
} from "./types";
