"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tip } from "@/components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STEPS = ["DRAFT", "VALIDATED", "APPROVED", "SUBMITTED", "ACCEPTED"];

const NEXT: Record<string, string | null> = {
  DRAFT: "VALIDATED",
  VALIDATED: "APPROVED",
  APPROVED: "SUBMITTED",
  SUBMITTED: "ACCEPTED",
  ACCEPTED: "AMENDED",
  REJECTED: "AMENDED",
  AMENDED: "VALIDATED",
};

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<any>(null);

  const load = () =>
    api(`/compliance/reports/${id}`)
      .then(setR)
      .catch((e) => setErr(e.message || "Not found"));

  useEffect(() => {
    const raw = localStorage.getItem("fo_user");
    if (raw) setUser(JSON.parse(raw));
    load();
  }, [id]);

  const idx = STEPS.indexOf(r?.status === "AMENDED" || r?.status === "REJECTED" ? "DRAFT" : r?.status);
  const next = r ? NEXT[r.status] : null;
  const canApprove = useMemo(() => {
    const role = (user?.role || "").toLowerCase().replace(/\s+/g, "_");
    return ["quality_manager", "admin", "compliance", "customer_quality", "regulatory", "plant_manager"].includes(role);
  }, [user]);

  async function transition(to: string) {
    setBusy(true);
    setErr("");
    try {
      const updated = await api(`/compliance/reports/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({
          to_status: to,
          expected_version: r.version,
          note: to === "SUBMITTED" && r.filing_channel === "stub"
            ? "Prepared locally — not transmitted to regulator"
            : undefined,
          rejection_reason: to === "REJECTED" ? "Rejected in demo review" : undefined,
        }),
      });
      setR({ ...r, ...updated, template: r.template, obligation: r.obligation });
    } catch (e: any) {
      setErr(e.message || "Transition denied");
    } finally {
      setBusy(false);
    }
  }

  if (!r && !err) {
    return (
      <Shell>
        <p className="muted">Loading report…</p>
      </Shell>
    );
  }

  if (err && !r) {
    return (
      <Shell>
        <Alert variant="destructive">
          <AlertTitle>Report unavailable</AlertTitle>
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      </Shell>
    );
  }

  return (
    <Shell>
      <Tip>
        Evidence graph lite links quality events, inspections, genealogy, anomalies, and RCA. AI drafts
        must be human-approved. Regulatory stubs cannot be marked ACCEPTED.
      </Tip>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="mono muted">{r.id}</div>
            <h1 style={{ margin: "4px 0" }}>{r.title}</h1>
            <Badge variant="outline" className="mr-1">{r.audience}</Badge>
            <Badge variant="secondary" className="mr-1">{r.family}</Badge>
            <span className={`badge ${r.status === "REJECTED" ? "crit" : r.ai_draft ? "warn" : "ok"}`}>{r.status}</span>
            <span className="muted"> · v{r.version}</span>
            {r.ai_draft && <Badge variant="secondary" className="ml-2">AI draft — unapproved</Badge>}
            {r.customer && <span className="muted"> · {r.customer}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button asChild size="sm" variant="outline">
              <Link href="/compliance/submissions">Back</Link>
            </Button>
            {r.status === "SUBMITTED" && canApprove && (
              <Button size="sm" variant="outline" disabled={busy} type="button" onClick={() => transition("REJECTED")}>
                Reject
              </Button>
            )}
            {next && (
              <Button
                size="sm"
                disabled={busy || (next === "APPROVED" && !canApprove) || (next === "SUBMITTED" && !canApprove) || (next === "ACCEPTED" && !canApprove)}
                type="button"
                onClick={() => transition(next)}
              >
                {busy ? "Working…" : `Advance → ${next}`}
              </Button>
            )}
          </div>
        </div>
        <div className="stepper" style={{ marginTop: 12 }}>
          {STEPS.map((s, i) => (
            <span key={s} className={`badge ${i <= idx && r.status !== "REJECTED" ? "ok" : ""}`}>
              {s}
            </span>
          ))}
          {(r.status === "REJECTED" || r.status === "AMENDED") && (
            <span className={`badge ${r.status === "REJECTED" ? "crit" : "warn"}`}>{r.status}</span>
          )}
        </div>
      </div>

      {err && (
        <Alert variant="destructive" className="mb-3">
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription className="font-mono text-xs whitespace-pre-wrap">{err}</AlertDescription>
        </Alert>
      )}

      {r.disclaimer && (
        <Alert className="mb-3">
          <AlertTitle>Regulatory / filing disclaimer</AlertTitle>
          <AlertDescription>{r.disclaimer}</AlertDescription>
        </Alert>
      )}

      <div className="grid" style={{ gridTemplateColumns: "1fr 320px", gap: 12 }}>
        <div className="space-y-3">
          <Panel title="Summary">
            <p>{r.summary || "—"}</p>
            {r.rejection_reason && (
              <p className="text-destructive mt-2 text-sm">Rejection: {r.rejection_reason}</p>
            )}
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 12 }}>
              {JSON.stringify(r.payload || {}, null, 2)}
            </pre>
          </Panel>

          <Panel title="Evidence links">
            {(r.evidence_links || []).length === 0 ? (
              <p className="muted">No evidence linked yet.</p>
            ) : (
              <ul className="space-y-2">
                {(r.evidence_links || []).map((e: any, i: number) => (
                  <li key={`${e.kind}-${e.id}-${i}`} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                    <span>
                      <Badge variant="outline" className="mr-2">{e.kind}</Badge>
                      {e.label || e.id}
                    </span>
                    {e.kind === "quality_event" ? (
                      <Link className="text-xs font-semibold" href={`/quality/${e.id}`}>Open →</Link>
                    ) : e.kind === "anomaly" ? (
                      <Link className="text-xs font-semibold" href="/live">Live →</Link>
                    ) : (
                      <span className="mono muted text-xs">{String(e.id).slice(0, 8)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Audit trail">
            <ol className="space-y-2 text-sm">
              {(r.audit_trail || []).map((a: any, i: number) => (
                <li key={i} className="rounded border p-2">
                  <div className="flex justify-between gap-2">
                    <strong>{a.action}</strong>
                    <span className="muted text-xs">{a.at ? new Date(a.at).toLocaleString() : ""}</span>
                  </div>
                  <div className="muted text-xs">
                    {a.actor} · {a.actor_type} · {a.status}
                    {a.note ? ` — ${a.note}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel title="Context">
            <p className="text-sm"><span className="muted">Period:</span> {r.period_label || "—"}</p>
            <p className="text-sm"><span className="muted">Due:</span> {r.due_at ? new Date(r.due_at).toLocaleString() : "—"}</p>
            <p className="text-sm"><span className="muted">Submitted:</span> {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}</p>
            <p className="text-sm"><span className="muted">Owner role:</span> {r.owner_role || "—"}</p>
            <p className="text-sm"><span className="muted">Channel:</span> {r.filing_channel || "none"}</p>
            <p className="text-sm"><span className="muted">External filing claimed:</span> {r.external_filing_claimed ? "yes" : "no"}</p>
          </Panel>
          {r.template && (
            <Panel title="Template">
              <p className="text-sm font-semibold">{r.template.name}</p>
              <p className="mono muted text-xs">{r.template.code} · v{r.template.version}</p>
              <ul className="mt-2 list-disc pl-4 text-xs">
                {(r.template.sections || []).map((s: any) => (
                  <li key={s.id || s.title}>{s.title || s.id}</li>
                ))}
              </ul>
            </Panel>
          )}
          {r.obligation && (
            <Panel title="Obligation">
              <p className="text-sm font-semibold">{r.obligation.title}</p>
              <p className="muted text-xs">{r.obligation.code} · {(r.obligation.standard_refs || []).join(", ")}</p>
            </Panel>
          )}
          {!canApprove && (
            <Alert>
              <AlertTitle>Role limit</AlertTitle>
              <AlertDescription className="text-xs">
                Signed in as {user?.role || "unknown"}. Approve/submit requires quality_manager, compliance,
                customer_quality, regulatory, or admin.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </Shell>
  );
}
