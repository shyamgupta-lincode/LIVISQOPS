"use client";
import { Shell } from "@/components/Shell";
import { Tip } from "@/components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export default function RegulatoryChangePage() {
  const [items, setItems] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/compliance/regulatory-changes")
      .then((d) => {
        setItems(d.items || []);
        setMeta(d);
      })
      .catch((e) => setErr(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Regulatory change awareness</h1>
        </div>
      </div>

      <Tip>
        ISO 9001:2015+Amd1:2024 remains the baseline until the 2026 edition lands. IATF packs stay
        OEM-CSR versioned. EU eCoC electronic data from Jul 2026; battery passport from Feb 2027.
      </Tip>

      <Alert className="mb-4">
        <AlertTitle>No external filing</AlertTitle>
        <AlertDescription>
          This workspace does not submit to NHTSA, EPA, or EU type-approval authorities. Stubs track
          readiness and evidence only ({meta?.live_feed === false ? "live_feed=false" : "…"}).
        </AlertDescription>
      </Alert>

      {err && <p className="text-destructive text-sm">{err}</p>}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((it) => (
            <Card key={it.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{it.title}</CardTitle>
                  <Badge variant="outline">{it.audience}</Badge>
                </div>
                <CardDescription>Effective: {it.effective}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{it.summary}</p>
                <p className="muted text-xs">Impact: {it.impact}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Shell>
  );
}
