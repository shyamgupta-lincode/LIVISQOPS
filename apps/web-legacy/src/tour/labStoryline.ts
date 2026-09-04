// Interactive Lab — hands-on path: enter a batch tag, create a WO, follow it,
// then register a bounded agent tied to that tag.

import type { TourCommand } from "./bridge";

export type LabPhase = "setup" | "create" | "trace" | "agent" | "wrap";

export type LabStep = {
  id: string;
  phase: LabPhase;
  beat: string;
  title: string;
  body: string;
  action?: string;
  route?: string;
  selector?: string;
  placement?: "auto" | "top" | "bottom" | "left" | "right";
  settleMs?: number;
  /** Coach-card input the user must fill */
  input?: {
    key: "batchTag" | "agentSuffix";
    label: string;
    placeholder: string;
    hint?: string;
  };
  /** Emit after navigation / when entering the step */
  commands?: TourCommand[];
  /** Re-emit when coach input changes (template uses {{batchTag}} etc.) */
  syncCommands?: (artifacts: {
    batchTag: string;
    agentSuffix: string;
    orderId: string;
  }) => TourCommand[];
  /** Block Next until this notice arrives */
  waitFor?: "order-created" | "agent-created";
  /** Dynamic selector using artifacts */
  selectorFrom?: "order" | "agent";
  requireInput?: boolean;
};

export const LAB_PHASES: {
  id: LabPhase;
  label: string;
  blurb: string;
  color: string;
}[] = [
  { id: "setup", label: "01 · Setup", blurb: "Name the change you will track.", color: "#3E96F4" },
  { id: "create", label: "02 · Create", blurb: "Commit a prefilled work order.", color: "#C4841D" },
  { id: "trace", label: "03 · Trace", blurb: "Follow the order across Operate.", color: "#1F9D5C" },
  { id: "agent", label: "04 · Agent", blurb: "Register a watcher for your batch.", color: "#C94A7A" },
  { id: "wrap", label: "05 · Wrap", blurb: "Confirm the loop is closed.", color: "#7B5BB0" },
];

export const LAB_STEPS: LabStep[] = [
  {
    id: "lab-welcome",
    phase: "setup",
    beat: "Interactive lab",
    title: "Track one change across the plant",
    body:
      "This lab is hands-on. You will enter a short batch tag, create a work order from a prefilled form, " +
      "then watch that same tag surface in Production rollups and Factory Twin. " +
      "Finally you will register a bounded AI agent named for your batch.",
    action: "Have a 4–12 character tag ready (letters/numbers). Example: JORDAN07",
    route: "/",
    selector: "[data-tour='launcher-hero']",
    placement: "bottom",
  },
  {
    id: "lab-tag",
    phase: "setup",
    beat: "Your batch tag",
    title: "Name the change you will follow",
    body:
      "Everything in this lab keys off your batch tag — it becomes the work order’s external reference " +
      "and part of the agent name. Pick something unique so you can spot it instantly.",
    action: "Type your tag below, then continue. You can still edit it in the form.",
    route: "/operate/production",
    selector: "[data-tour='page-production']",
    placement: "left",
    settleMs: 450,
    input: {
      key: "batchTag",
      label: "Batch tag / external ref",
      placeholder: "e.g. JORDAN07",
      hint: "Used as Manual WO external reference",
    },
    requireInput: true,
  },
  {
    id: "lab-create-wo",
    phase: "create",
    beat: "Create work order",
    title: "Complete the prefilled work order",
    body:
      "We opened Create work order with product, variant, Touring line, qty 6, and Release checked. " +
      "Your batch tag is already in External reference. Glance the fields, then click Create work order.",
    action: "Click Create work order in the modal to continue — Next unlocks when the order exists.",
    route: "/operate/production",
    selector: ".modal",
    placement: "left",
    settleMs: 500,
    commands: [
      { type: "production-mode", mode: "orders" },
      {
        type: "open-create-order",
        prefill: {
          source: "Manual",
          product: "Harley-Davidson Motorcycle",
          variant: "Street Glide Special",
          color: "Whiskey Fire",
          qty: 6,
          line_id: "line-touring-assembly-line",
          status: "Released",
          release: true,
        },
        lockFields: ["source", "line_id"],
      },
    ],
    syncCommands: ({ batchTag }) => [
      { type: "set-order-ref", erp_ref: batchTag },
    ],
    waitFor: "order-created",
  },
  {
    id: "lab-see-order",
    phase: "create",
    beat: "Your order card",
    title: "Your order is live in Production",
    body:
      "The new production order object homes at the Touring Assembly line (context-graph binding: order @ line). " +
      "Source badge Manual and your external ref make it searchable among SAP/ERP traffic.",
    action: "Note the order id — we will follow this same object next.",
    route: "/operate/production",
    selectorFrom: "order",
    placement: "left",
    settleMs: 450,
    commands: [
      { type: "production-mode", mode: "orders" },
      { type: "focus-line", lineId: "line-touring-assembly-line" },
    ],
  },
  {
    id: "lab-context",
    phase: "trace",
    beat: "By context",
    title: "See the rollup on the spine",
    body:
      "By context rolls orders up facility → area → line using the active Engineer model. " +
      "Touring Assembly’s counts now include the order you just released.",
    action: "Find Touring Assembly — your batch increased the line’s order / released totals.",
    route: "/operate/production",
    selector: "[data-tour='prod-context-touring']",
    placement: "left",
    settleMs: 500,
    commands: [
      { type: "production-mode", mode: "context" },
      { type: "focus-line", lineId: null },
    ],
  },
  {
    id: "lab-twin",
    phase: "trace",
    beat: "Factory Twin",
    title: "Same spine in the spatial twin",
    body:
      "Factory Twin uses the identical context-graph spine and binding pills. " +
      "Your work order does not redraw geometry — it attaches as an order object at line level while stations show live devices.",
    action: "Scan Final Assembly → Touring Assembly. Binding pills should include Production order.",
    route: "/operate/twin",
    selector: "[data-tour='page-twin']",
    placement: "left",
    settleMs: 500,
  },
  {
    id: "lab-agent-form",
    phase: "agent",
    beat: "Add AI agent",
    title: "Register a watcher for your batch",
    body:
      "We opened Add AI agent prefilled at L1 · Recommend with tools for event search and loss ranking. " +
      "Add a short personal suffix so the agent name is uniquely yours, then submit.",
    action: "Enter a short suffix (e.g. watch), then click Add AI agent in the modal.",
    route: "/quality/agents",
    selector: ".modal",
    placement: "left",
    settleMs: 500,
    input: {
      key: "agentSuffix",
      label: "Name suffix",
      placeholder: "e.g. watch",
      hint: "Appended to Batch radar · {your tag}",
    },
    requireInput: true,
    commands: [
      {
        type: "open-create-agent",
        prefill: {
          autonomy: "L1 · Recommend",
          version: "0.1",
          description:
            "Watches constraint and starvation signals for the interactive-lab batch; recommends only — never silently controls production.",
          tools: "search_events, read_genealogy, rank_losses",
          prompt:
            "Watch station status and production orders for the interactive-lab batch. Rank starvation and cycle-time risk; recommend only.",
          data_source_topics: ["bind-status", "bind-order", "bind-defect"],
        },
      },
    ],
    syncCommands: ({ batchTag, agentSuffix }) => {
      const suffix = agentSuffix.trim() || "watch";
      const name = `Batch radar ${batchTag} ${suffix}`.replace(/\s+/g, " ").trim();
      return [
        { type: "set-agent-name", name },
        {
          type: "set-agent-description",
          description:
            `Watches constraint and starvation signals for batch ${batchTag}; recommends only — never silently controls production.`,
        },
      ];
    },
    waitFor: "agent-created",
  },
  {
    id: "lab-agent-card",
    phase: "agent",
    beat: "Catalog entry",
    title: "Your agent is in the catalog",
    body:
      "The agent appears under autonomy L1 · Recommend with eval scores starting at 0 until calibrated. " +
      "View detail shows ledger activity (empty for now) and permitted tools — the same trust model as stock agents.",
    action: "Optional: click View detail on your new agent after the tour.",
    route: "/quality/agents",
    selectorFrom: "agent",
    placement: "left",
    settleMs: 450,
  },
  {
    id: "lab-wrap",
    phase: "wrap",
    beat: "Loop closed",
    title: "You created a traceable change",
    body:
      "You entered a batch tag, released a Manual work order onto Touring Assembly, saw it in Production context and Factory Twin, " +
      "and registered a bounded agent keyed to that batch. That is the configure → operate → quality loop in miniature.",
    action: "Replay the storyline tour for the full platform narrative, or keep operating from Command Center.",
    route: "/operate",
    selector: "[data-tour='page-command']",
    placement: "left",
    settleMs: 400,
  },
];

export function labPhaseMeta(id: LabPhase) {
  return LAB_PHASES.find((p) => p.id === id)!;
}
