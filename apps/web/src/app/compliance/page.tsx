"use client";
import { Shell } from "@/components/Shell";
import { Tip } from "@/components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

function Kpi({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  href: string;
  tone?: "warn" | "crit" | "ok";
}) {
  const color =
    tone === "crit" ? "text-destructive" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-foreground";
  return (
    <Link href={href} className="block">
      <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardDescription>{label}</CardDescription>
          <CardTitle className={`font-display text-2xl tabular-nums ${color}`}>{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

export default function ComplianceCockpitPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api("/compliance/cockpit")
      .then(setData)
      .catch((e) => setErr(e.message || "Failed to load cockpit"))
      .finally(() => setLoading(false));
  }, []);

  const k = data?.kpis || {};

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Quality & compliance cockpit</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/compliance/submissions?status=DRAFT">Open drafts</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/compliance/submissions">Submission workflow</Link>
          </Button>
        </div>
      </div>

      <Tip>
        Four audiences drive obligations: internal evidence, customer/OEM packs, regulatory stubs (never
        auto-filed), and information that may become public. AI drafts stay unapproved until a human acts.
      </Tip>

      {err && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Cockpit unavailable</AlertTitle>
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <div className="grid gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 md:grid-cols-5">
            <Kpi label="PPM (demo)" value={k.ppm ?? "—"} href="/compliance/submissions?family=manufacturing" />
            <Kpi label="FPY" value={k.fpy != null ? `${(k.fpy * 100).toFixed(1)}%` : "—"} href="/quality" tone="ok" />
            <Kpi
              label="Open critical QE"
              value={k.open_critical_events ?? 0}
              href="/quality?view=critical"
              tone={(k.open_critical_events || 0) > 0 ? "crit" : "ok"}
            />
            <Kpi
              label="Reports overdue"
              value={k.reports_overdue ?? 0}
              href="/compliance/submissions"
              tone={(k.reports_overdue || 0) > 0 ? "warn" : "ok"}
            />
            <Kpi
              label="Compliance risk"
              value={k.compliance_risk ?? 0}
              href="/compliance/calendar"
              tone={(k.compliance_risk || 0) >= 60 ? "crit" : (k.compliance_risk || 0) >= 40 ? "warn" : "ok"}
            />
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Kpi label="CAPA aging" value={k.capa_aging ?? 0} href="/quality?view=capa" />
            <Kpi label="Supplier open" value={k.supplier_open ?? 0} href="/compliance/submissions?family=supplier" />
            <Kpi label="Warranty emerging" value={k.warranty_emerging ?? 0} href="/compliance/submissions?family=warranty" />
            <Kpi
              label="Regulatory stubs"
              value={k.regulatory_stubs_open ?? 0}
              href="/compliance/submissions?audience=regulatory"
              tone="warn"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Attention queue</CardTitle>
                <CardDescription>Overdue reports and AI drafts requiring human approval</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data.attention?.overdue_reports || []).length === 0 &&
                  (data.attention?.ai_drafts || []).length === 0 && (
                    <p className="muted text-sm">No overdue reports or AI drafts.</p>
                  )}
                {(data.attention?.overdue_reports || []).map((r: any) => (
                  <Link key={r.id} href={`/compliance/submissions/${r.id}`} className="flex items-start justify-between gap-2 rounded border p-2 text-sm hover:bg-muted/40">
                    <span>
                      <Badge variant="destructive" className="mr-2">Overdue</Badge>
                      {r.title}
                    </span>
                    <span className="mono muted text-xs">{r.status}</span>
                  </Link>
                ))}
                {(data.attention?.ai_drafts || []).map((r: any) => (
                  <Link key={r.id} href={`/compliance/submissions/${r.id}`} className="flex items-start justify-between gap-2 rounded border p-2 text-sm hover:bg-muted/40">
                    <span>
                      <Badge variant="secondary" className="mr-2">AI draft</Badge>
                      {r.title}
                    </span>
                    <span className="mono muted text-xs">needs approval</span>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upcoming deadlines</CardTitle>
                <CardDescription>EWR · certificates · CQI · PPAP · OEM scorecards</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.upcoming_deadlines || []).length === 0 && (
                  <p className="muted text-sm">No calendar entries seeded.</p>
                )}
                {(data.upcoming_deadlines || []).map((d: any) => (
                  <Link
                    key={d.id}
                    href={d.report_instance_id ? `/compliance/submissions/${d.report_instance_id}` : "/compliance/calendar"}
                    className="flex items-center justify-between gap-2 rounded border p-2 text-sm hover:bg-muted/40"
                  >
                    <span>
                      <Badge
                        variant={d.status === "overdue" ? "destructive" : d.status === "due" ? "secondary" : "outline"}
                        className="mr-2"
                      >
                        {d.status}
                      </Badge>
                      {d.title}
                    </span>
                    <span className="muted text-xs tabular-nums">
                      {d.due_at ? new Date(d.due_at).toLocaleDateString() : "—"}
                    </span>
                  </Link>
                ))}
                <Button asChild variant="ghost" size="sm" className="mt-2">
                  <Link href="/compliance/calendar">Full calendar →</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(data.audience_counts || {}).map(([a, n]) => (
              <Badge key={a} variant="outline">
                {a}: {n as number}
              </Badge>
            ))}
            {Object.entries(data.reports_by_status || {}).map(([s, n]) => (
              <Badge key={s} variant="secondary">
                {s}: {n as number}
              </Badge>
            ))}
          </div>

          {(data.disclaimers || []).map((d: string) => (
            <p key={d} className="muted mt-3 text-xs">
              {d}
            </p>
          ))}
        </>
      ) : null}
    </Shell>
  );
}
