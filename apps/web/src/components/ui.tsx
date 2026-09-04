"use client";

import { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { Tabs as WmTabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appForPath } from "@/lib/apps";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

export function Tip({ children }: { children: ReactNode }) {
  return (
    <Alert className="mb-3 border-dashed border-primary/30 bg-primary/5">
      <Info className="text-primary" />
      <AlertDescription className="text-muted-foreground">{children}</AlertDescription>
    </Alert>
  );
}

export function StateChip({ state }: { state: string }) {
  const key = (state || "").toLowerCase().replace(/\s+/g, "-");
  const tone =
    key.includes("run") || key.includes("ok") || key.includes("closed")
      ? "border-ok/40 bg-ok/10 text-ok"
      : key.includes("fault") || key.includes("crit") || key.includes("down")
        ? "border-crit/40 bg-crit/10 text-crit"
        : key.includes("block") || key.includes("warn") || key.includes("hold")
          ? "border-warn/40 bg-warn/10 text-warn"
          : key.includes("starv") || key.includes("info")
            ? "border-info/40 bg-info/10 text-info"
            : "bg-secondary text-secondary-foreground";
  return (
    <Badge variant="outline" className={cn("rounded-full font-bold uppercase tracking-wide", tone)}>
      {state}
    </Badge>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
  style,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Card className={cn("gap-3 py-4 shadow-sm", className)} style={style}>
      {(title !== undefined || action) && (
        <CardHeader className="px-4 pb-0 [.border-b]:pb-0">
          <CardTitle className="text-sm font-bold">{title}</CardTitle>
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      )}
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

export function Spark({ values, height = 36 }: { values: number[]; height?: number }) {
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values);
  const range = max - min || 1;
  return (
    <div className="spark" style={{ height }} aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className={`spark-bar ${i === values.length - 1 ? "hot" : ""}`}
          style={{ height: `${14 + ((v - min) / range) * 86}%` }}
        />
      ))}
    </div>
  );
}

export function Drawer({
  onClose,
  title,
  children,
  width = 420,
}: {
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="p-0" style={{ maxWidth: width, width: "100%" }}>
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="overflow-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <WmTabs value={active} onValueChange={onChange}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </WmTabs>
  );
}

export function ContextRibbon({
  plant,
  shift,
  timeRange,
  live = true,
  onTimeRange,
}: {
  plant?: string;
  shift?: string;
  timeRange: string;
  live?: boolean;
  onTimeRange?: (v: string) => void;
}) {
  return (
    <div className="context-ribbon mb-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-lg border bg-card px-3 py-2">
      <span className="ribbon-item inline-flex items-center gap-1.5 text-sm">
        <span className="ribbon-k text-muted-foreground text-[11px] font-bold uppercase tracking-wide">Plant</span>
        {plant || "—"}
      </span>
      <span className="ribbon-item inline-flex items-center gap-1.5 text-sm">
        <span className="ribbon-k text-muted-foreground text-[11px] font-bold uppercase tracking-wide">Shift</span>
        {shift || "—"}
      </span>
      <label className="ribbon-item inline-flex items-center gap-1.5 text-sm">
        <span className="ribbon-k text-muted-foreground text-[11px] font-bold uppercase tracking-wide">Window</span>
        <Select value={timeRange} onValueChange={(v) => onTimeRange?.(v)}>
          <SelectTrigger size="sm" className="min-w-[7.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15m">Last 15m</SelectItem>
            <SelectItem value="1h">Last 1h</SelectItem>
            <SelectItem value="8h">Shift (8h)</SelectItem>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7d</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Badge variant={live ? "default" : "secondary"} className="gap-1.5">
        <StatusIndicator state={live ? "active" : "idle"} size="sm" />
        {live ? "LIVE" : "PAUSED"}
      </Badge>
    </div>
  );
}

export function AdminSubnav({ trailing }: { trailing?: ReactNode } = {}) {
  const pathname = usePathname();
  const app = appForPath(pathname);
  // Sibling workspaces from the owning app only — never cross-app admin links.
  const links = (app?.workspaces || []).filter(
    (w) => w.href.startsWith("/admin") || w.href === "/graph" || w.href === "/reliability",
  );
  if (!links.length && !trailing) return null;
  return (
    <div className="subnav mb-3 flex flex-wrap items-center gap-2">
      {links.map((w) => (
        <Button key={w.href} variant="outline" size="sm" asChild>
          <a href={w.href}>{w.label}</a>
        </Button>
      ))}
      {trailing ? <span className="ml-auto flex flex-wrap items-center gap-2">{trailing}</span> : null}
    </div>
  );
}

export function KpiStat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("gap-2 py-4 shadow-sm transition hover:-translate-y-0.5", className)}>
      <CardContent className="px-4">
        <div className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">{label}</div>
        <div className="font-display mt-1 text-2xl font-bold tabular-nums">{value}</div>
        {hint ? <div className="text-muted-foreground mt-1 text-xs">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
