"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export type StatItem = {
  label: string;
  value: ReactNode;
  subtext?: string;
  tone?: "default" | "ok" | "warn" | "crit" | "info";
  icon?: ReactNode;
};

const toneBorder: Record<NonNullable<StatItem["tone"]>, string> = {
  default: "border-border",
  ok: "border-ok/35",
  warn: "border-warn/35",
  crit: "border-crit/35",
  info: "border-info/35",
};

/** FactoryOps KPI strip — Watermelon Card-based stats block */
export function StatsGrid({
  items,
  columns = 3,
  className,
}: {
  items: StatItem[];
  columns?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  const col =
    columns === 2
      ? "md:grid-cols-2"
      : columns === 4
        ? "md:grid-cols-4"
        : columns === 5
          ? "md:grid-cols-5"
          : "md:grid-cols-3";

  return (
    <div className={cn("grid grid-cols-1 gap-3", col, className)}>
      {items.map((item) => (
        <Card
          key={String(item.label)}
          className={cn("gap-2 py-4 shadow-sm", toneBorder[item.tone || "default"])}
        >
          <CardContent className="px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                {item.label}
              </div>
              {item.icon}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{item.value}</div>
            {item.subtext ? (
              <p className="text-muted-foreground mt-1 text-xs">{item.subtext}</p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default StatsGrid;
