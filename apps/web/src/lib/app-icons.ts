import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlignLeft,
  ArrowLeftRight,
  BookOpen,
  Bot,
  Boxes,
  CalendarDays,
  ClipboardList,
  Crosshair,
  Database,
  FileStack,
  Gauge,
  GitBranch,
  GraduationCap,
  Hexagon,
  KeyRound,
  Layers,
  LayoutDashboard,
  Library,
  ListChecks,
  MonitorSmartphone,
  Plug,
  Scale,
  Send,
  Share2,
  Shield,
  Sparkles,
  SquareStack,
} from "lucide-react";

/** Top-level app icons for the bottom Shell dock / launcher brand mark. */
export const APP_ICONS: Record<string, LucideIcon> = {
  operate: Crosshair,
  quality: Sparkles,
  engineer: Layers,
  govern: KeyRound,
  compliance: AlignLeft,
};

/** Workspace icons keyed by exclusive workspace href from `apps.ts`. */
const WORKSPACE_ICONS: Record<string, LucideIcon> = {
  "/operate": LayoutDashboard,
  "/twin": Boxes,
  "/live": Activity,
  "/work": MonitorSmartphone,
  "/quality": ClipboardList,
  "/rca": GitBranch,
  "/knowledge": BookOpen,
  "/admin/agents": Bot,
  "/graph": Share2,
  "/reliability": Gauge,
  "/assets": Hexagon,
  "/admin/data": Database,
  "/admin/backbone": ArrowLeftRight,
  "/admin/integrations": Plug,
  "/admin/learning": GraduationCap,
  "/admin/agent-governance": Shield,
  "/admin/audit": ListChecks,
  "/compliance": FileStack,
  "/compliance/obligations": ListChecks,
  "/compliance/templates": Library,
  "/compliance/submissions": Send,
  "/compliance/calendar": CalendarDays,
  "/compliance/regulatory": Scale,
};

export function workspaceIconFor(href: string): LucideIcon {
  return WORKSPACE_ICONS[href] || SquareStack;
}

export function appIconFor(appId: string): LucideIcon {
  return APP_ICONS[appId] || Crosshair;
}
