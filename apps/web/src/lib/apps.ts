/** Role-oriented app catalog — enter FactoryOps through workflow icons.
 *
 * Ownership rule: every workspace href (and its subpaths) belongs to exactly one app.
 * If two personas need the same UI, use distinct paths that re-export the same page.
 */

export type Workspace = {
  href: string;
  label: string;
  icon: string;
  desc: string;
  end?: boolean;
};

export type AppDef = {
  id: string;
  name: string;
  icon: string;
  color: string;
  home: string;
  tagline: string;
  personas: string;
  workspaces: Workspace[];
};

export const APPS: AppDef[] = [
  {
    id: "operate",
    name: "Operate",
    icon: "◎",
    color: "#3E96F4",
    home: "/operate",
    tagline: "Run today's plan: find the constraint, own the next action, execute at the station.",
    personas: "Plant & production managers · supervisors · operators",
    workspaces: [
      { href: "/operate", end: true, label: "Command Center", icon: "◎", desc: "Plan, KPIs, actions" },
      { href: "/twin", label: "Factory Twin", icon: "▦", desc: "Spatial plant + overlays" },
      { href: "/live", label: "Live Production", icon: "◉", desc: "Telemetry + anomalies" },
      { href: "/work", label: "Station Workspace", icon: "▣", desc: "Frontline execution" },
    ],
  },
  {
    id: "quality",
    name: "Quality & AI",
    icon: "◉",
    color: "#C94A7A",
    home: "/quality",
    tagline: "Trust every decision: review evidence, contain defects, govern agents and lessons.",
    personas: "Quality engineers · reviewers · knowledge stewards",
    workspaces: [
      { href: "/quality", label: "Quality Events", icon: "◫", desc: "Lifecycle board + thread" },
      { href: "/rca", label: "RCA Workspace", icon: "⬡", desc: "Hypotheses + evidence" },
      { href: "/knowledge", label: "Knowledge", icon: "✦", desc: "Cases + steward queue" },
      { href: "/admin/agents", label: "AI Agents", icon: "⚙", desc: "Bounded action ledger" },
    ],
  },
  {
    id: "engineer",
    name: "Engineer",
    icon: "⧉",
    color: "#1F9D5C",
    home: "/graph",
    tagline: "Model the plant, score assets, wire data planes and the event backbone.",
    personas: "Manufacturing engineers · maintenance · OT / data",
    workspaces: [
      { href: "/graph", label: "Context Graph", icon: "❖", desc: "ISA-95 bindings" },
      { href: "/reliability", label: "Predictive Maintenance", icon: "⏱", desc: "Failure modes + horizon" },
      { href: "/assets", label: "Assets", icon: "⬡", desc: "Health · predictions · work" },
      { href: "/admin/data", label: "Data Planes", icon: "▣", desc: "Specialized stores" },
      { href: "/admin/backbone", label: "Event Backbone", icon: "⇄", desc: "Topics · replay · DLQ" },
      { href: "/admin/integrations", label: "Integrations", icon: "☍", desc: "OPC UA · MES · QMS · CMMS" },
    ],
  },
  {
    id: "govern",
    name: "Govern",
    icon: "⚿",
    color: "#C4841D",
    home: "/admin/learning",
    tagline: "Prove value and control the platform: learning gates, policies, identity, audit.",
    personas: "Executives · IT / security · program leadership",
    workspaces: [
      { href: "/admin/learning", label: "Governed Learning", icon: "◐", desc: "Versions · shadow gates" },
      { href: "/admin/agent-governance", label: "Agent Governance", icon: "✦", desc: "Autonomy + OT deny" },
      { href: "/admin/audit", label: "Audit", icon: "☰", desc: "Append-only ledger" },
    ],
  },
  {
    id: "compliance",
    name: "Compliance",
    icon: "▤",
    color: "#6B5CE7",
    home: "/compliance",
    tagline: "Generate and govern automotive quality reports for audits, OEMs, regulators, and public disclosure.",
    personas: "Quality managers · compliance · customer quality · regulatory",
    workspaces: [
      { href: "/compliance", end: true, label: "Quality Cockpit", icon: "▤", desc: "Risk KPIs + attention" },
      { href: "/compliance/obligations", label: "Obligation Register", icon: "☰", desc: "Country · OEM · product" },
      { href: "/compliance/templates", label: "Report Library", icon: "▦", desc: "OEM-specific templates" },
      { href: "/compliance/submissions", label: "Submissions", icon: "⇄", desc: "Draft → accepted" },
      { href: "/compliance/calendar", label: "Calendar", icon: "◷", desc: "EWR · cert · CQI" },
      { href: "/compliance/regulatory", label: "Regulatory Change", icon: "◈", desc: "ISO · eCoC · passport" },
    ],
  },
];

/** True when pathname matches a workspace href (honoring `end` exact-match). */
export function pathMatchesWorkspace(pathname: string, w: Workspace): boolean {
  if (w.end) return pathname === w.href;
  return pathname === w.href || pathname.startsWith(`${w.href}/`);
}

/**
 * Resolve the single owning app for a pathname.
 * Prefers the longest matching workspace href so nested routes stay unambiguous.
 */
export function appForPath(pathname: string): AppDef | undefined {
  let best: { app: AppDef; len: number } | undefined;
  for (const app of APPS) {
    for (const w of app.workspaces) {
      if (!pathMatchesWorkspace(pathname, w)) continue;
      if (!best || w.href.length > best.len) {
        best = { app, len: w.href.length };
      }
    }
  }
  return best?.app;
}

export function workspaceForPath(app: AppDef, pathname: string): Workspace | undefined {
  return [...app.workspaces]
    .sort((a, b) => b.href.length - a.href.length)
    .find((w) => pathMatchesWorkspace(pathname, w));
}

/** Detect workspace hrefs that match more than one app (empty when ownership is exclusive). */
export function workspaceOwnershipConflicts(): Array<{ href: string; apps: string[] }> {
  const conflicts: Array<{ href: string; apps: string[] }> = [];
  for (const app of APPS) {
    for (const w of app.workspaces) {
      const owners = APPS.filter((a) =>
        a.workspaces.some((ow) => pathMatchesWorkspace(w.href, ow)),
      ).map((a) => a.id);
      if (owners.length > 1 && !conflicts.some((c) => c.href === w.href)) {
        conflicts.push({ href: w.href, apps: owners });
      }
    }
  }
  return conflicts;
}
