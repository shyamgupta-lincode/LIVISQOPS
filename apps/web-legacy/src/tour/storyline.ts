// First-time user storyline for LIVIS MES / QualityOps.
// Phases: Access → Configure → Run the day → Assure quality → Govern & maintain.

export type TourPhase =
  | "access"
  | "configure"
  | "operate"
  | "quality"
  | "govern";

export type TourStep = {
  id: string;
  phase: TourPhase;
  title: string;
  /** Short label in the progress rail */
  beat: string;
  /** Rich description shown in the coach card */
  body: string;
  /** What the user should do / remember */
  action?: string;
  route?: string;
  /** CSS selector; if missing, card centers without spotlight */
  selector?: string;
  placement?: "auto" | "top" | "bottom" | "left" | "right";
  /** Extra wait after navigation for page paint */
  settleMs?: number;
};

export const PHASES: {
  id: TourPhase;
  label: string;
  blurb: string;
  color: string;
}[] = [
  {
    id: "access",
    label: "01 · Access",
    blurb: "Sign in, pick a role app, learn the shell.",
    color: "#3E96F4",
  },
  {
    id: "configure",
    label: "02 · Configure",
    blurb: "Model the plant, assets, workflows, then edge.",
    color: "#1F9D5C",
  },
  {
    id: "operate",
    label: "03 · Run the day",
    blurb: "Plan, twin, orders, and station execution.",
    color: "#3E96F4",
  },
  {
    id: "quality",
    label: "04 · Assure quality",
    blurb: "Review evidence, models, and bounded agents.",
    color: "#C94A7A",
  },
  {
    id: "govern",
    label: "05 · Govern & maintain",
    blurb: "Prove value, manage entities, keep policy & audit.",
    color: "#C4841D",
  },
];

/**
 * End-to-end guided path for a first-time plant lead / program owner.
 * Order mirrors how LIVIS is meant to be stood up, then lived in.
 */
export const TOUR_STEPS: TourStep[] = [
  // ── ACCESS ──────────────────────────────────────────────────────────
  {
    id: "welcome",
    phase: "access",
    beat: "Welcome",
    title: "Welcome to LIVIS · QualityOps",
    body:
      "This platform connects engineering models, live plant operations, quality & AI, and governance in one place. " +
      "You never jump straight into a flat menu — you enter through a role-oriented app that matches how you work today.",
    action: "Follow this tour once. You can replay it anytime from the ✦ Tour button.",
    route: "/",
    selector: "[data-tour='launcher-hero']",
    placement: "bottom",
  },
  {
    id: "launcher-apps",
    phase: "access",
    beat: "Choose an app",
    title: "Four apps · four jobs",
    body:
      "Operate runs the shift. Quality & AI protects trust in defects and models. " +
      "Engineer models the plant and deploys change. Govern proves value and controls the platform. " +
      "Live badges on each card show where attention is needed before you enter.",
    action: "Tip: press 1–4 on the keyboard to enter an app instantly.",
    route: "/",
    selector: "[data-tour='launcher-grid']",
    placement: "top",
  },
  {
    id: "enter-engineer",
    phase: "access",
    beat: "Start in Engineer",
    title: "First-time path starts in Engineer",
    body:
      "For a new site, configure before you chase alarms. Engineer is where you compose the context graph, " +
      "score assets, author work instructions, and connect edge nodes. Operate and Quality will then speak the same plant language.",
    action: "We will open Engineer next and walk the configure spine.",
    route: "/",
    selector: "[data-tour='app-card-engineer']",
    placement: "left",
  },
  {
    id: "shell-nav",
    phase: "access",
    beat: "Shell · workspaces",
    title: "App shell · workspaces stay scoped",
    body:
      "Inside an app, the left rail lists only that app’s workspaces. " +
      "The brand mark returns you to the launcher; Switch app jumps between role worlds without losing site context.",
    action: "Notice the green Engineer badge — accent color follows the active app.",
    route: "/engineer/graph",
    selector: "[data-tour='sidenav']",
    placement: "right",
    settleMs: 400,
  },
  {
    id: "shell-ribbon",
    phase: "access",
    beat: "Context ribbon",
    title: "Always-on plant context",
    body:
      "The top ribbon shows site & shift, plan vs actual, and whether Central is live. " +
      "Every workspace shares this truth so you never wonder which plant or shift you are deciding for.",
    route: "/engineer/graph",
    selector: "[data-tour='context-ribbon']",
    placement: "bottom",
  },

  // ── CONFIGURE ───────────────────────────────────────────────────────
  {
    id: "cg-library",
    phase: "configure",
    beat: "Context Graph",
    title: "Compose the operational knowledge model",
    body:
      "Context Graph is the spine of the platform. You define hierarchy levels (facility → area → line → station → device) " +
      "and bind objects — orders, genealogy, inspections, timeseries — so Operate Twin and Production roll up the same way Engineer intended.",
    action: "Open a graph card to enter Compose → Explore → Reporting.",
    route: "/engineer/graph",
    selector: "[data-tour='page-context-graph']",
    placement: "left",
    settleMs: 450,
  },
  {
    id: "cg-modes",
    phase: "configure",
    beat: "Compose · Explore · Report",
    title: "Three modes on one model",
    body:
      "Compose edits levels and object bindings. Explore is the live cinema of the graph. " +
      "Reporting shows rollups by context path. Publish when the model is ready — Factory Twin and Production read the active published spine.",
    action: "If no graph is open yet, pick one from the library first — the modes appear in the workflow.",
    route: "/engineer/graph",
    selector: "[data-tour='page-context-graph']",
    placement: "bottom",
  },
  {
    id: "assets",
    phase: "configure",
    beat: "Assets",
    title: "Score the physical hierarchy",
    body:
      "Assets overlays health and AI confidence on the plant hierarchy. " +
      "Use it after the context graph exists so stations and devices inherit the right labels and parents.",
    action: "Drill into a weak asset when OEE or quality drifts — this is where maintenance and OT meet.",
    route: "/engineer/assets",
    selector: "[data-tour='page-assets']",
    placement: "left",
    settleMs: 400,
  },
  {
    id: "workflows",
    phase: "configure",
    beat: "Workflows",
    title: "Author work instructions & compile the twin",
    body:
      "Workflows is the Work Instruction & Interlock Builder. Capture steps, evidence, and change control, " +
      "then run Twin Compiler so the executable twin gets guidance, state machines, evidence contracts, and handshake tests.",
    action: "Never silently push to the line — compile, review artifacts, then deploy through change pipeline.",
    route: "/engineer/workflows",
    selector: "[data-tour='page-workflows']",
    placement: "left",
    settleMs: 400,
  },
  {
    id: "edge",
    phase: "configure",
    beat: "Edge",
    title: "Connect the edge fleet",
    body:
      "Edge & Integrations manages nodes (k3s, GPU, PTP/NTP trust), connectors (OPC UA, MQTT Sparkplug, GigE Vision, Open Protocol), " +
      "and mission readiness. Degraded or offline nodes surface store-and-forward queues so Central stays honest.",
    action: "Healthy edge + published context graph = Operate and Quality can trust live signals.",
    route: "/engineer/edge",
    selector: "[data-tour='page-edge']",
    placement: "left",
    settleMs: 400,
  },

  // ── OPERATE ─────────────────────────────────────────────────────────
  {
    id: "command-center",
    phase: "operate",
    beat: "Command Center",
    title: "Run the shift from the radar",
    body:
      "Command Center is the daily cockpit: plan vs actual, OEE/FPY, constraint radar, open events, and owned actions. " +
      "Acknowledge P1s, complete actions with evidence, and read the grounded shift brief from agents.",
    action: "Start every shift here — then deep-dive Twin or Station only when the radar points you.",
    route: "/operate",
    selector: "[data-tour='page-command']",
    placement: "left",
    settleMs: 450,
  },
  {
    id: "factory-twin",
    phase: "operate",
    beat: "Factory Twin",
    title: "See the plant as the context graph intended",
    body:
      "Factory Twin renders facility → area → line → station → device using the active Engineer spine. " +
      "Binding pills show order, genealogy, inspection and other objects. Scrub causal time-travel to compare before/after a disruption.",
    action: "Click a device icon on a station card for live PLC tags or camera inspection frames.",
    route: "/operate/twin",
    selector: "[data-tour='page-twin']",
    placement: "left",
    settleMs: 450,
  },
  {
    id: "production",
    phase: "operate",
    beat: "Production",
    title: "Orders home at the line",
    body:
      "Production follows context-graph bindings: production orders report at line; VIN genealogy at station. " +
      "Modes — Orders, WIP · Genealogy, By context — mirror Compose / Explore / Reporting so dispatch and rollups stay aligned.",
    action: "Create a manual WO or ingest from SAP/ERP/APS/WMS, then open a VIN for the full storyline.",
    route: "/operate/production",
    selector: "[data-tour='page-production']",
    placement: "left",
    settleMs: 400,
  },
  {
    id: "station",
    phase: "operate",
    beat: "Station",
    title: "Execute with proof at the station",
    body:
      "Station Workspace is the operator surface: current VIN, work instruction steps, evidence capture, and interlocks. " +
      "Every completed step carries instruction version, model version, and multimodal proof for genealogy and audit.",
    action: "Supervisors coach from Twin; operators finish the minute-by-minute work here.",
    route: "/operate/station",
    selector: "[data-tour='page-station']",
    placement: "left",
    settleMs: 400,
  },

  // ── QUALITY ─────────────────────────────────────────────────────────
  {
    id: "quality-review",
    phase: "quality",
    beat: "Quality Review",
    title: "Trust the defect decision",
    body:
      "Quality Review is where vision findings become dispositions. Inspect evidence frames, use Defect DNA to find similar history, " +
      "and apply containment holds with named authority — never anonymous.",
    action: "Open a critical defect and walk the evidence before you hold carriers or release units.",
    route: "/quality",
    selector: "[data-tour='page-quality']",
    placement: "left",
    settleMs: 400,
  },
  {
    id: "vision-ai",
    phase: "quality",
    beat: "Vision AI",
    title: "Govern model fitness before deploy",
    body:
      "Vision AI tracks model versions, production fitness, and deployment gates. " +
      "A model that looks good offline still needs edge health, data lag, and confidence calibration before it assists the line.",
    action: "Treat deploy as a controlled change — same discipline as work-instruction release.",
    route: "/quality/vision",
    selector: "[data-tour='page-vision']",
    placement: "left",
    settleMs: 400,
  },
  {
    id: "agents",
    phase: "quality",
    beat: "AI Agents",
    title: "Agents recommend · humans authorize",
    body:
      "AI Agent Workspace is the Bounded Action Ledger plus autonomy catalog (L0–L4). " +
      "Pending approvals show blast radius, evidence links, and reversibility. Approve with named authority or reject with a reason. " +
      "Add agents only with permitted tools — unbounded control is excluded by policy.",
    action: "Open View detail on Constraint Radar, then Approve or Reject a pending ledger item.",
    route: "/quality/agents",
    selector: "[data-tour='page-agents']",
    placement: "left",
    settleMs: 400,
  },

  // ── GOVERN & MAINTAIN ───────────────────────────────────────────────
  {
    id: "proof",
    phase: "govern",
    beat: "Proof Engine",
    title: "Prove the platform is paying back",
    body:
      "Proof Engine is the value ledger and CVV story: money saved, escapes prevented, payback months. " +
      "Executives and program leads use this to keep the deployment honest — benefits tied to evidence, not slides.",
    action: "Check today’s savings after a containment or rebalance that agents and quality executed.",
    route: "/govern",
    selector: "[data-tour='page-proof']",
    placement: "left",
    settleMs: 400,
  },
  {
    id: "entities",
    phase: "govern",
    beat: "Entities",
    title: "Maintain the system of record",
    body:
      "Entity Manager is governed CRUD for core records (sites, lines, products, and more). " +
      "When master data drifts, fix it here so Engineer graphs and Operate topology stay consistent.",
    action: "Prefer Entity Manager over ad-hoc edits in spreadsheets — every change is actor-stamped.",
    route: "/govern/entities",
    selector: "[data-tour='page-entities']",
    placement: "left",
    settleMs: 400,
  },
  {
    id: "admin",
    phase: "govern",
    beat: "Administration",
    title: "Policy, identity, and audit forever",
    body:
      "Administration covers RBAC, policy-as-code, and the immutable audit trail — including agent approvals and entity changes. " +
      "This is how you maintain the platform after go-live: who may approve holds, who may publish graphs, what is excluded from automation.",
    action: "Review recent audit kinds like agent.action.approve and agent.create after the tour.",
    route: "/govern/admin",
    selector: "[data-tour='page-admin']",
    placement: "left",
    settleMs: 400,
  },
  {
    id: "close",
    phase: "govern",
    beat: "Keep the loop",
    title: "You are ready to run the loop",
    body:
      "Daily rhythm: Operate Command Center → Twin/Station as needed → Quality for trust decisions → Govern for proof. " +
      "Change rhythm: Engineer Context Graph → Assets → Workflows (compile) → Edge → publish → verify in Operate. " +
      "Replay this tour anytime from the floating ✦ Tour control.",
    action: "Switch app from the sidebar whenever your role for the next hour changes.",
    route: "/",
    selector: "[data-tour='launcher-hero']",
    placement: "bottom",
    settleMs: 350,
  },
];

export function phaseMeta(id: TourPhase) {
  return PHASES.find((p) => p.id === id)!;
}
