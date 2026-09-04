"use client";
import { Shell } from "@/components/Shell";
import { Tip } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function TemplatesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [family, setFamily] = useState("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const q = family === "all" ? "" : `?family=${family}`;
    return api(`/compliance/templates${q}`)
      .then((d) => setItems(d.items || []))
      .catch((e) => setErr(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [family]);

  const families = ["all", "qms", "ppap", "manufacturing", "problem_solving", "supplier", "warranty", "us_regulatory", "eu_unece", "material"];

  async function aiDraft(templateId: string) {
    setBusy(templateId);
    try {
      const events = await api("/quality/events");
      const qe = (events.items || []).find((e: any) => e.status !== "CLOSED") || (events.items || [])[0];
      const draft = await api("/compliance/reports/ai-draft", {
        method: "POST",
        body: JSON.stringify({
          template_id: templateId,
          quality_event_id: qe?.id,
          prompt_hint: "Draft only — cite linked quality evidence; do not claim root cause confirmed.",
        }),
      });
      location.href = `/compliance/submissions/${draft.id}`;
    } catch (e: any) {
      setErr(e.message || "AI draft failed");
      setBusy(null);
    }
  }

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Report library</h1>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/compliance/submissions">Submissions →</Link>
        </Button>
      </div>

      <Tip>
        Ford / GM / Stellantis packs differ by CSR. Regulatory templates are local stubs and never claim
        NHTSA or EU authority filing. Use AI draft to create an unapproved draft only.
      </Tip>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        {families.map((f) => (
          <button key={f} type="button" className={`chip-btn ${family === f ? "active" : ""}`} onClick={() => setFamily(f)}>
            {f}
          </button>
        ))}
      </div>

      {err && <p className="text-destructive mb-2 text-sm">{err}</p>}
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : items.length === 0 ? (
        <p className="muted">No templates. Seed the demo plant.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Family</th>
                <th>Audience</th>
                <th>Customer</th>
                <th>Version</th>
                <th>Evidence kinds</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.code}</td>
                  <td>{t.name}</td>
                  <td>{t.family}</td>
                  <td><Badge variant="outline">{t.audience}</Badge></td>
                  <td>{t.customer || "—"}</td>
                  <td className="mono">{t.version}</td>
                  <td className="muted text-xs">{(t.required_evidence_kinds || []).join(", ") || "—"}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="secondary"
                      type="button"
                      disabled={busy === t.id}
                      onClick={() => aiDraft(t.id)}
                    >
                      {busy === t.id ? "Drafting…" : "AI draft"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
