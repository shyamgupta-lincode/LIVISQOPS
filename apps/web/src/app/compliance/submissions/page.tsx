"use client";
import { Shell } from "@/components/Shell";
import { Tip } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

const STEPS = ["DRAFT", "VALIDATED", "APPROVED", "SUBMITTED", "ACCEPTED"];

function statusTone(s: string) {
  if (s === "REJECTED" || s === "overdue") return "crit";
  if (s === "DRAFT" || s === "AMENDED") return "warn";
  if (s === "ACCEPTED" || s === "APPROVED") return "ok";
  return "";
}

export default function SubmissionsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filters, setFilters] = useState({ status: "", family: "", audience: "" });

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setFilters({
      status: sp.get("status") || "",
      family: sp.get("family") || "",
      audience: sp.get("audience") || "",
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (filters.status) q.set("status", filters.status);
    if (filters.family) q.set("family", filters.family);
    if (filters.audience) q.set("audience", filters.audience);
    const qs = q.toString();
    api(`/compliance/reports${qs ? `?${qs}` : ""}`)
      .then((d) => setItems(d.items || []))
      .catch((e) => setErr(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Submission workflow</h1>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/compliance/templates">New from template</Link>
        </Button>
      </div>

      <Tip>
        Operators can contribute to drafts. Quality managers, compliance, customer quality, and regulatory
        roles approve and submit. Regulatory stubs never claim external filing success.
      </Tip>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        <button type="button" className={`chip-btn ${!filters.status ? "active" : ""}`} onClick={() => setFilters((f) => ({ ...f, status: "" }))}>
          All statuses
        </button>
        {STEPS.concat(["REJECTED", "AMENDED"]).map((s) => (
          <button
            key={s}
            type="button"
            className={`chip-btn ${filters.status === s ? "active" : ""}`}
            onClick={() => setFilters((f) => ({ ...f, status: s }))}
          >
            {s}
          </button>
        ))}
      </div>

      {err && <p className="text-destructive text-sm">{err}</p>}
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : items.length === 0 ? (
        <p className="muted">No report instances for this filter.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Title</th>
                <th>Family</th>
                <th>Audience</th>
                <th>Customer</th>
                <th>Due</th>
                <th>AI</th>
                <th>Evidence</th>
                <th>Channel</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`badge ${statusTone(r.status)}`}>{r.status}</span>
                  </td>
                  <td>
                    <Link href={`/compliance/submissions/${r.id}`} style={{ fontWeight: 600 }}>
                      {r.title}
                    </Link>
                    {r.ai_draft && (
                      <Badge variant="secondary" className="ml-2">
                        AI draft
                      </Badge>
                    )}
                  </td>
                  <td>{r.family}</td>
                  <td><Badge variant="outline">{r.audience}</Badge></td>
                  <td>{r.customer || "—"}</td>
                  <td className="tabular-nums text-xs">
                    {r.due_at ? new Date(r.due_at).toLocaleDateString() : "—"}
                  </td>
                  <td>{r.ai_draft ? "yes" : "—"}</td>
                  <td className="mono muted">{(r.evidence_links || []).length}</td>
                  <td className="muted text-xs">{r.filing_channel || "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
