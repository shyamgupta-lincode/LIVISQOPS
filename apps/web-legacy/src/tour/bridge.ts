// Cross-page bridge for the Interactive Lab tour.
// Pages listen for commands; the tour listens for completions.

export type TourCommand =
  | {
      type: "open-create-order";
      prefill: {
        source?: string;
        erp_ref?: string;
        product?: string;
        variant?: string;
        color?: string;
        qty?: number;
        line_id?: string;
        release?: boolean;
        status?: string;
      };
      lockFields?: string[];
    }
  | { type: "set-order-ref"; erp_ref: string }
  | { type: "production-mode"; mode: "orders" | "genealogy" | "context" }
  | { type: "focus-line"; lineId: string | null }
  | { type: "highlight-order"; orderId: string | null }
  | {
      type: "open-create-agent";
      prefill: {
        name?: string;
        autonomy?: string;
        description?: string;
        version?: string;
        tools?: string;
        prompt?: string;
        data_source_topics?: string[];
      };
    }
  | { type: "set-agent-name"; name: string }
  | { type: "set-agent-description"; description: string };

export type TourNotice =
  | {
      type: "order-created";
      order: { id: string; erp_ref: string; line_id: string; source: string; qty: number };
    }
  | {
      type: "agent-created";
      agent: { id: string; name: string; autonomy: string };
    };

const CMD = "livis-tour-cmd";
const NOTICE = "livis-tour-notice";

export function tourCommand(cmd: TourCommand) {
  window.dispatchEvent(new CustomEvent(CMD, { detail: cmd }));
}

export function onTourCommand(handler: (cmd: TourCommand) => void) {
  const fn = (e: Event) => handler((e as CustomEvent).detail as TourCommand);
  window.addEventListener(CMD, fn);
  return () => window.removeEventListener(CMD, fn);
}

export function tourNotice(notice: TourNotice) {
  window.dispatchEvent(new CustomEvent(NOTICE, { detail: notice }));
}

export function onTourNotice(handler: (notice: TourNotice) => void) {
  const fn = (e: Event) => handler((e as CustomEvent).detail as TourNotice);
  window.addEventListener(NOTICE, fn);
  return () => window.removeEventListener(NOTICE, fn);
}

export type LabArtifacts = {
  batchTag: string;
  orderId: string;
  orderRef: string;
  lineId: string;
  agentId: string;
  agentName: string;
};

export const emptyLabArtifacts = (): LabArtifacts => ({
  batchTag: "",
  orderId: "",
  orderRef: "",
  lineId: "",
  agentId: "",
  agentName: "",
});
