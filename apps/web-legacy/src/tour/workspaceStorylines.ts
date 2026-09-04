// Per-workspace guided storylines — one focused tour per app surface.

export type WsPhase = {
  id: string;
  label: string;
  blurb: string;
  color: string;
};

export type WsStep = {
  id: string;
  phase: string;
  beat: string;
  title: string;
  body: string;
  action?: string;
  route?: string;
  selector?: string;
  placement?: "auto" | "top" | "bottom" | "left" | "right";
  settleMs?: number;
};

export type WorkspaceTour = {
  id: string;
  appId: "engineer" | "operate" | "quality" | "govern";
  label: string;
  short: string;
  entryRoute: string;
  /** Longest-prefix match against location.pathname */
  matchPrefix: string | string[];
  color: string;
  phases: WsPhase[];
  steps: WsStep[];
};

const P = {
  engineer: "#1F9D5C",
  operate: "#3E96F4",
  quality: "#C94A7A",
  govern: "#C4841D",
};

function phases(
  color: string,
  items: [string, string, string][],
): WsPhase[] {
  return items.map(([id, label, blurb], i) => ({
    id,
    label: `0${i + 1} · ${label}`,
    blurb,
    color,
  }));
}

export const WORKSPACE_TOURS: WorkspaceTour[] = [
  // ── Engineer ────────────────────────────────────────────────────
  {
    id: "context-graph",
    appId: "engineer",
    label: "Context Graph",
    short: "Compose hierarchy, bind objects, explore & report",
    entryRoute: "/engineer/graph",
    matchPrefix: "/engineer/graph",
    color: P.engineer,
    phases: phases(P.engineer, [
      ["library", "Library", "Pick or open a plant knowledge model."],
      ["compose", "Compose", "Levels and object bindings."],
      ["live", "Live use", "How Operate consumes the model."],
    ]),
    steps: [
      {
        id: "cg-1",
        phase: "library",
        beat: "Library",
        title: "Context Graph is the plant knowledge model",
        body:
          "Every Operate twin, Production rollup, and station path ultimately reads the active context graph. " +
          "Start in the library: cards show draft vs published models so you know what the plant is running on.",
        action: "Open a graph card when you are ready to edit — Compose → Explore → Reporting.",
        route: "/engineer/graph",
        selector: "[data-tour='page-context-graph']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "cg-2",
        phase: "library",
        beat: "Models",
        title: "Published vs draft",
        body:
          "Published models drive Factory Twin and Production. Drafts are safe sandboxes. " +
          "Hero stats summarize how many models exist and which are live.",
        action: "Prefer one active published model per site to avoid conflicting spines.",
        route: "/engineer/graph",
        selector: "[data-tour='cg-library']",
        placement: "top",
        settleMs: 350,
      },
      {
        id: "cg-3",
        phase: "compose",
        beat: "Hierarchy",
        title: "Compose the spine first",
        body:
          "Inside a graph, Compose defines levels — facility, area, line, station, device — and which are required. " +
          "Omitting a level flattens Twin and Production the same way.",
        action: "Keep required levels stable; rename labels to match shop-floor language.",
        route: "/engineer/graph",
        selector: "[data-tour='page-context-graph']",
        placement: "left",
      },
      {
        id: "cg-4",
        phase: "compose",
        beat: "Bindings",
        title: "Bind objects where they home",
        body:
          "Object bindings attach orders, genealogy, inspections, timeseries, and work instructions to a home level " +
          "(report_at) with optional rollups. Example: order @ line, genealogy @ station.",
        action: "Enable only what the site will actually produce evidence for.",
        route: "/engineer/graph",
        selector: "[data-tour='page-context-graph']",
        placement: "bottom",
      },
      {
        id: "cg-5",
        phase: "live",
        beat: "Downstream",
        title: "Publish so Operate can speak the same language",
        body:
          "After Compose, Explore validates live neighbors; Reporting previews path rollups. " +
          "Publishing updates topology.context_graph — Factory Twin spine chips and Production modes refresh automatically.",
        action: "Next tour Assets to score stations on this same hierarchy.",
        route: "/engineer/graph",
        selector: "[data-tour='sidenav']",
        placement: "right",
      },
    ],
  },
  {
    id: "assets",
    appId: "engineer",
    label: "Assets",
    short: "Hierarchy health, leak cards, jump to station",
    entryRoute: "/engineer/assets",
    matchPrefix: "/engineer/assets",
    color: P.engineer,
    phases: phases(P.engineer, [
      ["scan", "Scan", "Find where money is leaking."],
      ["registry", "Registry", "Full station inventory."],
      ["act", "Act", "Jump into Operate to fix."],
    ]),
    steps: [
      {
        id: "as-1",
        phase: "scan",
        beat: "Purpose",
        title: "Assets scores the physical hierarchy",
        body:
          "After the context graph exists, Assets shows composite health (availability × quality × performance) " +
          "so manufacturing and maintenance share one truth about weak stations.",
        route: "/engineer/assets",
        selector: "[data-tour='page-assets']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "as-2",
        phase: "scan",
        beat: "Leak cards",
        title: "Where money is leaking",
        body:
          "The top strip ranks the worst composite scores. Red borders call out stations below threshold — " +
          "these are your first constraint candidates for Command Center.",
        action: "Filter by area when you own a single value stream.",
        route: "/engineer/assets",
        selector: "[data-tour='assets-leaks']",
        placement: "bottom",
        settleMs: 350,
      },
      {
        id: "as-3",
        phase: "registry",
        beat: "Registry",
        title: "Station registry is the drill list",
        body:
          "The table lists every station with area/line, live state, and health. " +
          "It is the engineer’s inventory view — Twin is the spatial twin of the same records.",
        route: "/engineer/assets",
        selector: "[data-tour='assets-registry']",
        placement: "top",
      },
      {
        id: "as-4",
        phase: "act",
        beat: "Deep link",
        title: "Click through to Station Workspace",
        body:
          "Any card or row opens Operate → Station Workspace for that asset. " +
          "That is how Engineer diagnosis becomes operator execution without re-finding the station.",
        action: "Click a leaking card after this tour to practice the handoff.",
        route: "/engineer/assets",
        selector: "[data-tour='assets-leaks']",
        placement: "left",
      },
    ],
  },
  {
    id: "workflows",
    appId: "engineer",
    label: "Workflows",
    short: "Instructions, change pipeline, Twin Compiler",
    entryRoute: "/engineer/workflows",
    matchPrefix: "/engineer/workflows",
    color: P.engineer,
    phases: phases(P.engineer, [
      ["design", "Design", "Author standard work."],
      ["change", "Change", "Approve controlled updates."],
      ["compile", "Compile", "Generate the executable twin."],
    ]),
    steps: [
      {
        id: "wf-1",
        phase: "design",
        beat: "Builder",
        title: "Work Instruction & Interlock Builder",
        body:
          "Workflows is where standard work is defined: steps, evidence expectations, and interlocks. " +
          "Safety logic stays allowlisted — you author process, not unbounded PLC writes.",
        route: "/engineer/workflows",
        selector: "[data-tour='page-workflows']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "wf-2",
        phase: "design",
        beat: "Instructions",
        title: "Deployed instructions",
        body:
          "The left panel lists live work instructions by station and version. " +
          "Open a row to inspect steps; Edit in wizard starts a controlled change.",
        action: "Use + Open builder for a net-new instruction.",
        route: "/engineer/workflows",
        selector: "[data-tour='wf-instructions']",
        placement: "right",
        settleMs: 350,
      },
      {
        id: "wf-3",
        phase: "change",
        beat: "Pipeline",
        title: "Change pipeline is mandatory",
        body:
          "Draft → In Review → Approved → Compiled → Deployed. " +
          "Approve with named authority, then compile — never push straight to the line from a draft.",
        route: "/engineer/workflows",
        selector: "[data-tour='wf-pipeline']",
        placement: "left",
      },
      {
        id: "wf-4",
        phase: "compile",
        beat: "Twin Compiler",
        title: "Compile produces executable artifacts",
        body:
          "Twin Compiler emits operator guidance, edge state machine, evidence schema, handshake tests, and simulation hooks. " +
          "Review artifacts before deploy so Station Workspace and edge stay aligned.",
        action: "On an Approved change, click Compile with Twin Compiler.",
        route: "/engineer/workflows",
        selector: "[data-tour='wf-pipeline']",
        placement: "bottom",
      },
    ],
  },
  {
    id: "edge",
    appId: "engineer",
    label: "Edge & Integrations",
    short: "Fleet health, connectors, mission readiness",
    entryRoute: "/engineer/edge",
    matchPrefix: "/engineer/edge",
    color: P.engineer,
    phases: phases(P.engineer, [
      ["fleet", "Fleet", "Node health and readiness."],
      ["connect", "Connect", "Protocols into the plant."],
      ["trust", "Trust", "Time, certs, offline queues."],
    ]),
    steps: [
      {
        id: "ed-1",
        phase: "fleet",
        beat: "Fleet",
        title: "Edge is where Central meets the line",
        body:
          "Each edge node carries k3s, optional GPU, storage, and mission-readiness scores. " +
          "Degraded or offline nodes explain data lag before you blame the model.",
        route: "/engineer/edge",
        selector: "[data-tour='page-edge']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "ed-2",
        phase: "fleet",
        beat: "KPIs",
        title: "Readiness at a glance",
        body:
          "KPI chips summarize healthy vs degraded nodes, queue depth, and clock trust. " +
          "Store-and-forward keeps events when WAN drops — Central reconnects without inventing gaps.",
        route: "/engineer/edge",
        selector: "[data-tour='edge-kpis']",
        placement: "bottom",
      },
      {
        id: "ed-3",
        phase: "connect",
        beat: "Connectors",
        title: "Integrations are protocol-aware",
        body:
          "OPC UA, MQTT Sparkplug B, GigE Vision, Open Protocol, REST/HTTPS — connectors declare what the graph can bind. " +
          "Context Graph property schemas should match these protocols.",
        route: "/engineer/edge",
        selector: "[data-tour='page-edge']",
        placement: "left",
      },
      {
        id: "ed-4",
        phase: "trust",
        beat: "Trust",
        title: "Time and identity before AI",
        body:
          "PTP/NTP trust, TPM/secure boot, and cert expiry are first-class. " +
          "A confident vision model on an untrusted clock is still an untrusted decision.",
        action: "Fix Offline / Degraded nodes before chasing false defects.",
        route: "/engineer/edge",
        selector: "[data-tour='page-edge']",
        placement: "bottom",
      },
    ],
  },

  // ── Operate ─────────────────────────────────────────────────────
  {
    id: "command-center",
    appId: "operate",
    label: "Command Center",
    short: "Plan, constraints, events, shift brief",
    entryRoute: "/operate",
    matchPrefix: ["/operate"],
    color: P.operate,
    phases: phases(P.operate, [
      ["pulse", "Pulse", "Are we on plan?"],
      ["radar", "Radar", "Where is the constraint?"],
      ["own", "Own", "Who closes the next action?"],
    ]),
    steps: [
      {
        id: "cc-1",
        phase: "pulse",
        beat: "Cockpit",
        title: "Start every shift in Command Center",
        body:
          "Plan vs actual, OEE, FPY, and money-at-risk sit in one strip. " +
          "KPI cards with hover arrows deep-link into Production, Twin, or Quality.",
        route: "/operate",
        selector: "[data-tour='page-command']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "cc-2",
        phase: "pulse",
        beat: "KPIs",
        title: "Read the strip before the inbox",
        body:
          "If actual trails plan, open Production. If FPY dips, open Quality. " +
          "The strip is the triage order — not every P1 is the true constraint.",
        route: "/operate",
        selector: "[data-tour='cc-kpis']",
        placement: "bottom",
      },
      {
        id: "cc-3",
        phase: "radar",
        beat: "Constraints",
        title: "Constraint Radar ranks delivery risk",
        body:
          "Emerging starvation, cycle creep, and defect clusters are ranked by predicted impact. " +
          "Click a row to jump to the station that owns the bottleneck.",
        route: "/operate",
        selector: "[data-tour='cc-radar']",
        placement: "left",
        settleMs: 350,
      },
      {
        id: "cc-4",
        phase: "own",
        beat: "Actions",
        title: "Acknowledge events · complete actions with evidence",
        body:
          "Priority queue and action list require named actors. " +
          "The AI shift brief is grounded in citations — use it as a starting narrative, not an autopilot.",
        action: "Ack a P1, then complete an action with evidence to feel the audit trail.",
        route: "/operate",
        selector: "[data-tour='page-command']",
        placement: "bottom",
      },
    ],
  },
  {
    id: "factory-twin",
    appId: "operate",
    label: "Factory Twin",
    short: "Spatial spine, bindings, live devices, time travel",
    entryRoute: "/operate/twin",
    matchPrefix: "/operate/twin",
    color: P.operate,
    phases: phases(P.operate, [
      ["spine", "Spine", "Context graph as space."],
      ["live", "Live", "Stations and devices."],
      ["time", "Time", "Causal scrubbing."],
    ]),
    steps: [
      {
        id: "ft-1",
        phase: "spine",
        beat: "Twin",
        title: "The twin is the context graph made spatial",
        body:
          "Factory Twin does not invent hierarchy — it renders the active Engineer spine with binding pills " +
          "for orders, genealogy, inspections, and more at each level.",
        route: "/operate/twin",
        selector: "[data-tour='page-twin']",
        placement: "left",
        settleMs: 450,
      },
      {
        id: "ft-2",
        phase: "spine",
        beat: "Spine bar",
        title: "CONTEXT SPINE shows what is modeled",
        body:
          "Chips mirror Compose levels. If Device is optional and omitted, stations stop at the last enabled level. " +
          "Schema status tells you if you are on Published or Draft.",
        route: "/operate/twin",
        selector: "[data-tour='twin-spine']",
        placement: "bottom",
        settleMs: 350,
      },
      {
        id: "ft-3",
        phase: "live",
        beat: "Stations",
        title: "Station cards carry live state and device icons",
        body:
          "Click a station to inspect metrics. Device icons (PLC, camera, torque) open live modals — " +
          "tag trends for PLC, recent inspection frames for cameras.",
        action: "Open a camera or PLC icon after the tour.",
        route: "/operate/twin",
        selector: "[data-tour='page-twin']",
        placement: "left",
      },
      {
        id: "ft-4",
        phase: "time",
        beat: "Time travel",
        title: "Scrub history to compare before/after",
        body:
          "Causal time-travel loads topology snapshots so you can explain a disruption with evidence, " +
          "not memory. Pair with VIN storyline in Production for unit-level proof.",
        route: "/operate/twin",
        selector: "[data-tour='page-twin']",
        placement: "bottom",
      },
    ],
  },
  {
    id: "production",
    appId: "operate",
    label: "Production",
    short: "Orders @ line, genealogy @ station, rollups",
    entryRoute: "/operate/production",
    matchPrefix: "/operate/production",
    color: P.operate,
    phases: phases(P.operate, [
      ["orders", "Orders", "Dispatch at the home line."],
      ["wip", "WIP", "VIN genealogy paths."],
      ["rollup", "Rollup", "By context spine."],
    ]),
    steps: [
      {
        id: "pr-1",
        phase: "orders",
        beat: "Modes",
        title: "Production follows context-graph bindings",
        body:
          "Orders mode groups work orders by home line. Source chips filter SAP/ERP/APS/WMS/Manual. " +
          "Create work order simulates ingest or manual entry — release puts units onto the line.",
        route: "/operate/production",
        selector: "[data-tour='page-production']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "pr-2",
        phase: "orders",
        beat: "Mode tabs",
        title: "Orders · WIP · By context",
        body:
          "These modes mirror Context Graph’s Compose / Explore / Reporting idea: dispatch, live units, path rollups. " +
          "Spine chips above remind you which model is active.",
        route: "/operate/production",
        selector: "[data-tour='prod-modes']",
        placement: "bottom",
      },
      {
        id: "pr-3",
        phase: "wip",
        beat: "Genealogy",
        title: "WIP shows VIN paths through the plant",
        body:
          "Each unit card shows facility → area → line → station from current_station. " +
          "Open a VIN for storyline, component genealogy, and quality history.",
        action: "Switch to WIP · Genealogy after this step.",
        route: "/operate/production",
        selector: "[data-tour='page-production']",
        placement: "left",
      },
      {
        id: "pr-4",
        phase: "rollup",
        beat: "Context",
        title: "By context is the reporting surface",
        body:
          "Area and line cards roll order counts and WIP. Click a line to focus Orders — " +
          "the same navigation pattern as Twin drill-down.",
        route: "/operate/production",
        selector: "[data-tour='prod-spine']",
        placement: "bottom",
      },
    ],
  },
  {
    id: "station",
    appId: "operate",
    label: "Station Workspace",
    short: "Operator execution with proof",
    entryRoute: "/operate/station",
    matchPrefix: "/operate/station",
    color: P.operate,
    phases: phases(P.operate, [
      ["job", "Job", "Current VIN and instruction."],
      ["steps", "Steps", "Execute with evidence."],
      ["prove", "Prove", "Versions and audit."],
    ]),
    steps: [
      {
        id: "st-1",
        phase: "job",
        beat: "Workspace",
        title: "Station Workspace is the operator surface",
        body:
          "Supervisors coach from Twin; operators finish the minute in Station Workspace — " +
          "current VIN, work instruction, interlocks, and evidence capture.",
        route: "/operate/station",
        selector: "[data-tour='page-station']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "st-2",
        phase: "steps",
        beat: "Execution",
        title: "Complete steps in sequence",
        body:
          "Each step can require scan, torque, vision, or acknowledgment. " +
          "Interlocks block advance until evidence contracts pass — compiled from Workflows.",
        route: "/operate/station",
        selector: "[data-tour='page-station']",
        placement: "bottom",
      },
      {
        id: "st-3",
        phase: "prove",
        beat: "Proof",
        title: "Every step is versioned proof",
        body:
          "Instruction version, model version, operator, and multimodal evidence travel with the VIN storyline. " +
          "That is what Quality and Govern audit later.",
        action: "Open a VIN in Production after running a station to see the trail.",
        route: "/operate/station",
        selector: "[data-tour='page-station']",
        placement: "left",
      },
    ],
  },

  // ── Quality ─────────────────────────────────────────────────────
  {
    id: "quality-review",
    appId: "quality",
    label: "Quality Review",
    short: "Defects, DNA, containment holds",
    entryRoute: "/quality",
    matchPrefix: ["/quality"],
    color: P.quality,
    phases: phases(P.quality, [
      ["triage", "Triage", "Open defects by severity."],
      ["evidence", "Evidence", "Trust the frame."],
      ["contain", "Contain", "Holds with authority."],
    ]),
    steps: [
      {
        id: "qr-1",
        phase: "triage",
        beat: "Review",
        title: "Quality Review turns findings into dispositions",
        body:
          "Open defects, severity, and FPY context land here. " +
          "Critical items demand evidence review before any release decision.",
        route: "/quality",
        selector: "[data-tour='page-quality']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "qr-2",
        phase: "triage",
        beat: "KPIs",
        title: "Know the quality pulse",
        body:
          "KPI strip tracks open defects, criticals, holds, and escape risk. " +
          "Use it to choose Defect DNA investigation vs immediate containment.",
        route: "/quality",
        selector: "[data-tour='quality-kpis']",
        placement: "bottom",
      },
      {
        id: "qr-3",
        phase: "evidence",
        beat: "DNA",
        title: "Defect DNA finds similar history",
        body:
          "Similar defects across VIN, station, and model version prevent one-off guessing. " +
          "Always open the evidence frame before you trust a class label.",
        route: "/quality",
        selector: "[data-tour='page-quality']",
        placement: "left",
      },
      {
        id: "qr-4",
        phase: "contain",
        beat: "Holds",
        title: "Containment needs named authority",
        body:
          "Quality holds and dispositions are actor-stamped. " +
          "Agents may draft holds — humans approve. Releasing a hold is a Governed privilege.",
        action: "Pair with AI Agents tour for the approval ledger.",
        route: "/quality",
        selector: "[data-tour='page-quality']",
        placement: "bottom",
      },
    ],
  },
  {
    id: "vision-ai",
    appId: "quality",
    label: "Vision AI",
    short: "Model fitness and governed deploy",
    entryRoute: "/quality/vision",
    matchPrefix: "/quality/vision",
    color: P.quality,
    phases: phases(P.quality, [
      ["fitness", "Fitness", "Performance by slice."],
      ["gate", "Gate", "Deploy is a change."],
      ["edge", "Edge", "Runtime reality."],
    ]),
    steps: [
      {
        id: "vi-1",
        phase: "fitness",
        beat: "Models",
        title: "Vision AI governs production fitness",
        body:
          "Accuracy alone is not enough — fitness by line, variant, shift, and environment decides assist vs escalate.",
        route: "/quality/vision",
        selector: "[data-tour='page-vision']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "vi-2",
        phase: "gate",
        beat: "Release",
        title: "Treat deploy like a work-instruction change",
        body:
          "Model promotion should pass gates tied to edge health and calibrated confidence. " +
          "Borderline confidence feeds Reinspection Trigger agents — not silent auto-scrap.",
        route: "/quality/vision",
        selector: "[data-tour='page-vision']",
        placement: "bottom",
      },
      {
        id: "vi-3",
        phase: "edge",
        beat: "Runtime",
        title: "Fitness without healthy edge is fiction",
        body:
          "Check Engineer → Edge for camera nodes and data lag before blaming the network of weights. " +
          "Twin device modals show recent inspection frames from the same pipeline.",
        action: "After deploy, watch Station and Quality Review for disposition mix shifts.",
        route: "/quality/vision",
        selector: "[data-tour='page-vision']",
        placement: "left",
      },
    ],
  },
  {
    id: "agents",
    appId: "quality",
    label: "AI Agents",
    short: "Bounded ledger, autonomy L0–L4, catalog",
    entryRoute: "/quality/agents",
    matchPrefix: "/quality/agents",
    color: P.quality,
    phases: phases(P.quality, [
      ["ledger", "Ledger", "Approve with authority."],
      ["catalog", "Catalog", "Autonomy and tools."],
      ["trust", "Trust", "What policy excludes."],
    ]),
    steps: [
      {
        id: "ag-1",
        phase: "ledger",
        beat: "Workspace",
        title: "Agents recommend — they never silently control",
        body:
          "The Bounded Action Ledger lists proposals with confidence, blast radius, reversibility, and evidence links. " +
          "Pending items wait on named authority.",
        route: "/quality/agents",
        selector: "[data-tour='page-agents']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "ag-2",
        phase: "ledger",
        beat: "Approvals",
        title: "Approve or reject with a name",
        body:
          "Set Named authority, review blast radius, then Approve or Reject (optional reason). " +
          "Outcomes are measured after execution — audit records agent.action.* events.",
        action: "Filter Pending, then decide one item.",
        route: "/quality/agents",
        selector: "[data-tour='agents-ledger']",
        placement: "right",
      },
      {
        id: "ag-3",
        phase: "catalog",
        beat: "Catalog",
        title: "Autonomy levels L0–L4",
        body:
          "L0 retrieve → L4 bounded automation. View detail shows tools and ledger history; " +
          "Add AI agent registers a new bounded agent with permitted tools only.",
        route: "/quality/agents",
        selector: "[data-tour='agents-catalog']",
        placement: "left",
      },
      {
        id: "ag-4",
        phase: "trust",
        beat: "Policy",
        title: "Trust controls are non-negotiable",
        body:
          "Grounding, evidence, confidence, permission, audit. " +
          "Excluded by policy: unbounded autonomous control, safety decisions, releasing holds without authority.",
        route: "/quality/agents",
        selector: "[data-tour='agents-trust']",
        placement: "top",
      },
    ],
  },

  // ── Govern ──────────────────────────────────────────────────────
  {
    id: "proof-engine",
    appId: "govern",
    label: "Proof Engine",
    short: "Value ledger and payback",
    entryRoute: "/govern",
    matchPrefix: ["/govern"],
    color: P.govern,
    phases: phases(P.govern, [
      ["value", "Value", "Money and escapes."],
      ["proof", "Proof", "Evidence-backed CVV."],
      ["steer", "Steer", "Fund what works."],
    ]),
    steps: [
      {
        id: "pe-1",
        phase: "value",
        beat: "Ledger",
        title: "Proof Engine makes benefits auditable",
        body:
          "Value ledger and CVV translate quality escapes prevented, downtime avoided, and agent outcomes into money and payback months.",
        route: "/govern",
        selector: "[data-tour='page-proof']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "pe-2",
        phase: "value",
        beat: "KPIs",
        title: "Read today’s savings in context",
        body:
          "KPI strip shows saved today, cumulative value, and payback. " +
          "These numbers should move when containment, rebalance, or reinspection actually executes.",
        route: "/govern",
        selector: "[data-tour='proof-kpis']",
        placement: "bottom",
      },
      {
        id: "pe-3",
        phase: "proof",
        beat: "CVV",
        title: "Every dollar needs a trail",
        body:
          "Ledger lines cite events, holds, and agent actions. " +
          "If Finance cannot re-find the evidence, it does not count.",
        route: "/govern",
        selector: "[data-tour='page-proof']",
        placement: "left",
      },
      {
        id: "pe-4",
        phase: "steer",
        beat: "Steer",
        title: "Use proof to steer the program",
        body:
          "Double down on lines and agents that move CVV; fix edge and model fitness where value stalls. " +
          "Govern closes the loop with Engineer and Quality.",
        route: "/govern",
        selector: "[data-tour='page-proof']",
        placement: "bottom",
      },
    ],
  },
  {
    id: "entities",
    appId: "govern",
    label: "Entity Manager",
    short: "Governed CRUD for master data",
    entryRoute: "/govern/entities",
    matchPrefix: "/govern/entities",
    color: P.govern,
    phases: phases(P.govern, [
      ["choose", "Choose", "Pick an entity type."],
      ["edit", "Edit", "Actor-stamped changes."],
      ["sync", "Sync", "Keep graph & twin honest."],
    ]),
    steps: [
      {
        id: "en-1",
        phase: "choose",
        beat: "Manager",
        title: "Entity Manager is the system of record UI",
        body:
          "Sites, lines, products, and other core records are edited here — not in shadow spreadsheets — " +
          "so Context Graph and topology stay consistent.",
        route: "/govern/entities",
        selector: "[data-tour='page-entities']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "en-2",
        phase: "edit",
        beat: "CRUD",
        title: "Create and update with an actor",
        body:
          "Every create/update/delete carries Jordan Hale (or your actor) into audit. " +
          "Use this when master data drift breaks bindings or VIN genealogy.",
        route: "/govern/entities",
        selector: "[data-tour='page-entities']",
        placement: "bottom",
      },
      {
        id: "en-3",
        phase: "sync",
        beat: "Impact",
        title: "Changes ripple to Engineer and Operate",
        body:
          "Renaming a line or retiring a station should be reflected before you publish a new context graph. " +
          "Twin and Production read the same entities underneath the spine.",
        action: "After edits, smoke-check Assets and Twin.",
        route: "/govern/entities",
        selector: "[data-tour='page-entities']",
        placement: "left",
      },
    ],
  },
  {
    id: "admin",
    appId: "govern",
    label: "Administration",
    short: "RBAC, policy as code, audit",
    entryRoute: "/govern/admin",
    matchPrefix: "/govern/admin",
    color: P.govern,
    phases: phases(P.govern, [
      ["access", "Access", "Who may do what."],
      ["policy", "Policy", "Automation bounds."],
      ["audit", "Audit", "Immutable history."],
    ]),
    steps: [
      {
        id: "ad-1",
        phase: "access",
        beat: "Admin",
        title: "Administration keeps the platform governable",
        body:
          "RBAC decides who publishes graphs, approves holds, deploys models, or compiles twins. " +
          "Without this, every other workspace is a demo.",
        route: "/govern/admin",
        selector: "[data-tour='page-admin']",
        placement: "left",
        settleMs: 400,
      },
      {
        id: "ad-2",
        phase: "policy",
        beat: "Policy",
        title: "Policy as code bounds automation",
        body:
          "Encode exclusions: no unbounded control, no safety authorship in Workflows, no hold release without authority. " +
          "Agent autonomy ceilings belong here.",
        route: "/govern/admin",
        selector: "[data-tour='page-admin']",
        placement: "bottom",
      },
      {
        id: "ad-3",
        phase: "audit",
        beat: "Audit",
        title: "Audit is the memory of the plant",
        body:
          "Filter agent.action.approve, agent.create, entity changes, and workflow deploys. " +
          "When something goes wrong, start here — then jump to the workspace that produced the event.",
        action: "Search for agent.action after using the Interactive Lab.",
        route: "/govern/admin",
        selector: "[data-tour='page-admin']",
        placement: "left",
      },
    ],
  },
  {
    id: "data-planes",
    appId: "engineer",
    label: "Data Planes",
    short: "Specialized stores + semantic contract",
    entryRoute: "/engineer/data-planes",
    matchPrefix: "/engineer/data-planes",
    color: P.engineer,
    phases: phases(P.engineer, [
      ["contract", "Contract", "One context schema."],
      ["planes", "Planes", "Six specialized stores."],
    ]),
    steps: [
      {
        id: "dp-1",
        phase: "contract",
        beat: "Contract",
        title: "Not one database with AI on top",
        body:
          "Every observation carries ISA-95 aligned identifiers. Specialized stores share that contract; lakehouse and ledger are append-only.",
        route: "/engineer/data-planes",
        selector: "[data-tour='page-data-planes']",
        placement: "left",
        settleMs: 400,
      },
    ],
  },
  {
    id: "backbone",
    appId: "engineer",
    label: "Event Backbone",
    short: "Topics, stream, replay",
    entryRoute: "/engineer/backbone",
    matchPrefix: "/engineer/backbone",
    color: P.engineer,
    phases: phases(P.engineer, [
      ["bus", "Bus", "OT + IT publish here."],
    ]),
    steps: [
      {
        id: "bb-1",
        phase: "bus",
        beat: "Bus",
        title: "Detection emits candidates on the backbone",
        body:
          "Inspect envelopes with full context. Replay from a sequence for consumers. Agents never read raw HF feeds continuously.",
        route: "/engineer/backbone",
        selector: "[data-tour='page-backbone']",
        placement: "left",
        settleMs: 400,
      },
    ],
  },
  {
    id: "quality-events",
    appId: "quality",
    label: "Quality Events",
    short: "Lifecycle board + digital thread",
    entryRoute: "/quality/events",
    matchPrefix: "/quality/events",
    color: P.quality,
    phases: phases(P.quality, [
      ["lifecycle", "Lifecycle", "Detected to Closed."],
    ]),
    steps: [
      {
        id: "qe-1",
        phase: "lifecycle",
        beat: "Lifecycle",
        title: "Quality events are first-class business objects",
        body:
          "Move events through containment, investigation, disposition and effectiveness. Closing feeds knowledge curation.",
        route: "/quality/events",
        selector: "[data-tour='page-quality-events']",
        placement: "left",
        settleMs: 400,
      },
    ],
  },
  {
    id: "pdm",
    appId: "engineer",
    label: "Predictive Maintenance",
    short: "Failure modes + lead time",
    entryRoute: "/engineer/pdm",
    matchPrefix: "/engineer/pdm",
    color: P.engineer,
    phases: phases(P.engineer, [
      ["fm", "Failure modes", "Actionable lead time."],
    ]),
    steps: [
      {
        id: "pdm-1",
        phase: "fm",
        beat: "PdM",
        title: "Predict by failure mode, not generic health",
        body:
          "Link telemetry to work orders and capture technician findings as ground truth. RUL only with run-to-failure history.",
        route: "/engineer/pdm",
        selector: "[data-tour='page-pdm']",
        placement: "left",
        settleMs: 400,
      },
    ],
  },
  {
    id: "learning",
    appId: "govern",
    label: "Governed Learning",
    short: "Metrics, versions, shadow gates",
    entryRoute: "/govern/learning",
    matchPrefix: "/govern/learning",
    color: P.govern,
    phases: phases(P.govern, [
      ["truth", "Truth", "Confirmed outcomes only."],
    ]),
    steps: [
      {
        id: "gl-1",
        phase: "truth",
        beat: "Truth",
        title: "Learning is controlled and measurable",
        body:
          "Track precision, RCA accuracy, context coverage and PdM lead time. Shadow and approve before ops impact.",
        route: "/govern/learning",
        selector: "[data-tour='page-learning']",
        placement: "left",
        settleMs: 400,
      },
    ],
  },
];

export const APP_TOUR_GROUPS: {
  id: WorkspaceTour["appId"];
  label: string;
  color: string;
}[] = [
  { id: "engineer", label: "Engineer", color: P.engineer },
  { id: "operate", label: "Operate", color: P.operate },
  { id: "quality", label: "Quality & AI", color: P.quality },
  { id: "govern", label: "Govern", color: P.govern },
];

export function workspaceTourById(id: string) {
  return WORKSPACE_TOURS.find((t) => t.id === id);
}

export function workspaceTourForPath(pathname: string): WorkspaceTour | undefined {
  // Prefer longest matchPrefix; special-case /operate and /quality /govern ends
  const scored = WORKSPACE_TOURS.map((t) => {
    const prefixes = Array.isArray(t.matchPrefix) ? t.matchPrefix : [t.matchPrefix];
    let best = -1;
    for (const p of prefixes) {
      if (p === "/operate" || p === "/quality" || p === "/govern") {
        if (pathname === p) best = Math.max(best, p.length);
      } else if (pathname === p || pathname.startsWith(p + "/")) {
        best = Math.max(best, p.length);
      }
    }
    return { t, best };
  }).filter((x) => x.best > 0);
  scored.sort((a, b) => b.best - a.best);
  return scored[0]?.t;
}
