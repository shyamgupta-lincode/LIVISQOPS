// App catalog: the product is entered through one of four role-oriented apps.
// Each app owns a set of workspaces (routes) and a signature color.

export interface Workspace {
  to: string;
  end?: boolean;
  label: string;
  icon: string;
  desc: string;
}

export interface AppDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  base: string;
  tagline: string;
  personas: string;
  workspaces: Workspace[];
}

export const APPS: AppDef[] = [
  {
    id: "operate",
    name: "Operate",
    icon: "◎",
    color: "#3E96F4",
    base: "/operate",
    tagline: "Run today's plan: find the constraint, own the next action, execute at the station.",
    personas: "Plant & production managers · supervisors · operators",
    workspaces: [
      { to: "/operate", end: true, label: "Command Center", icon: "◎", desc: "Plan, constraint radar, actions" },
      { to: "/operate/twin", label: "Factory Twin", icon: "▦", desc: "Spatial plant + time travel" },
      { to: "/operate/production", label: "Production", icon: "⚙", desc: "Orders, WIP, VIN storyline" },
      { to: "/operate/warranty", label: "Warranty and Claims", icon: "⛨", desc: "VIN genealogy, reports, claims" },
      { to: "/operate/station", label: "Station Workspace", icon: "▣", desc: "Operator execution UI" },
    ],
  },
  {
    id: "quality",
    name: "Quality & AI",
    icon: "◉",
    color: "#C94A7A",
    base: "/quality",
    tagline: "Trust every decision: review evidence, contain defects, govern models and agents.",
    personas: "Quality engineers · vision/ML engineers · reviewers",
    workspaces: [
      { to: "/quality", end: true, label: "Quality Review", icon: "✓", desc: "Defects, Defect DNA, holds" },
      { to: "/quality/events", label: "Quality Events", icon: "◫", desc: "Lifecycle board + digital thread" },
      { to: "/quality/vision", label: "Vision AI", icon: "◉", desc: "Models, fitness, deployment" },
      { to: "/quality/agents", label: "AI Agents", icon: "✦", desc: "RCA, knowledge, bounded ledger" },
    ],
  },
  {
    id: "engineer",
    name: "Engineer",
    icon: "⧉",
    color: "#1F9D5C",
    base: "/engineer",
    tagline: "Model the plant, score assets, author workflows, then connect the edge.",
    personas: "Manufacturing engineers · maintenance · OT/controls",
    workspaces: [
      { to: "/engineer/graph", label: "Context Graph", icon: "❖", desc: "Operational knowledge graph" },
      { to: "/engineer/data-planes", label: "Data Planes", icon: "▣", desc: "Specialized stores + contract" },
      { to: "/engineer/backbone", label: "Event Backbone", icon: "⇄", desc: "Topics, stream, replay" },
      { to: "/engineer/assets", label: "Assets", icon: "🗜", desc: "Hierarchy and health scores" },
      { to: "/engineer/pdm", label: "Predictive Maintenance", icon: "⏱", desc: "Failure modes + lead time" },
      { to: "/engineer/workflows", label: "Workflows", icon: "⧉", desc: "Instructions + twin compiler" },
      { to: "/engineer/edge", label: "Edge & Integrations", icon: "⬡", desc: "Fleet, connectors, autopilot" },
    ],
  },
  {
    id: "govern",
    name: "Govern",
    icon: "⚿",
    color: "#C4841D",
    base: "/govern",
    tagline: "Prove the value and control the platform: value ledger, policies, identity, audit.",
    personas: "Executives · IT/security admins · program leadership",
    workspaces: [
      { to: "/govern", end: true, label: "Proof Engine", icon: "$", desc: "Value ledger and CVV" },
      { to: "/govern/learning", label: "Governed Learning", icon: "◐", desc: "Metrics, versions, shadow gates" },
      { to: "/govern/entities", label: "Entity Manager", icon: "☰", desc: "CRUD for core records" },
      { to: "/govern/admin", label: "Administration", icon: "⚿", desc: "RBAC, policy as code, audit" },
    ],
  },
];

export function appForPath(pathname: string): AppDef | undefined {
  return APPS.find((a) => pathname === a.base || pathname.startsWith(a.base + "/"));
}

export function workspaceForPath(app: AppDef, pathname: string): Workspace | undefined {
  // Longest-prefix match so /operate/station/:id resolves to Station Workspace.
  return [...app.workspaces]
    .sort((a, b) => b.to.length - a.to.length)
    .find((w) => (w.end ? pathname === w.to : pathname === w.to || pathname.startsWith(w.to + "/")));
}
