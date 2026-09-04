"use client";
import { Shell } from "@/components/Shell";
import { Tip } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const AUDIENCES = ["all", "internal", "customer", "regulatory", "public"];

export default function ObligationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [audience, setAudience] = useState("all");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = audience === "all" ? "" : `?audience=${audience}`;
    api(`/compliance/obligations${q}`)
      .then((d) => setItems(d.items || []))
      .catch((e) => setErr(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [audience]);

  const families = useMemo(() => [...new Set(items.map((i) => i.family))], [items]);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Obligation register</h1>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/compliance/templates">Templates →</Link>
        </Button>
      </div>

      <Tip>
        Obligations depend on OEM vs Tier position, products, customers, and markets. Audience categories:
        internal · customer · regulatory · public.
      </Tip>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        {AUDIENCES.map((a) => (
          <button
            key={a}
            type="button"
            className={`chip-btn ${audience === a ? "active" : ""}`}
            onClick={() => setAudience(a)}
          >
            {a}
          </button>
        ))}
      </div>

      {err && <p className="text-destructive text-sm">{err}</p>}
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : items.length === 0 ? (
        <p className="muted">No obligations for this filter. Re-run seed if the plant is empty.</p>
      ) : (
        <>
          <p className="muted mb-2 text-xs">
            {items.length} obligations · families: {families.join(", ")}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Risk</th>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Audience</th>
                  <th>Family</th>
                  <th>Customer</th>
                  <th>Country</th>
                  <th>Cadence</th>
                  <th>Standards</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className={`badge ${o.risk === "Critical" ? "crit" : o.risk === "High" ? "warn" : ""}`}>
                        {o.risk}
                      </span>
                    </td>
                    <td className="mono">{o.code}</td>
                    <td>{o.title}</td>
                    <td><Badge variant="outline">{o.audience}</Badge></td>
                    <td>{o.family}</td>
                    <td>{o.customer || "—"}</td>
                    <td>{o.country || "—"}</td>
                    <td>{o.cadence}</td>
                    <td className="muted text-xs">{(o.standard_refs || []).join(", ")}</td>
                    <td className="muted">{o.owner_role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
