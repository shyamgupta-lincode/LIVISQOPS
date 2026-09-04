"use client";
import { Shell } from "@/components/Shell";
import { Tip } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function ComplianceCalendarPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/compliance/calendar")
      .then((d) => setItems(d.items || []))
      .catch((e) => setErr(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Compliance calendar</h1>
        </div>
      </div>

      <Tip>
        Deadlines are plant-local demo schedule entries. Overdue and due-soon items link to the related
        report instance when seeded.
      </Tip>

      {err && <p className="text-destructive text-sm">{err}</p>}
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <p className="muted">No deadlines. Seed compliance data.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Due</th>
                <th>Title</th>
                <th>Kind</th>
                <th>Audience</th>
                <th>Owner</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Badge
                      variant={d.status === "overdue" ? "destructive" : d.status === "due" ? "secondary" : "outline"}
                    >
                      {d.status}
                    </Badge>
                  </td>
                  <td className="tabular-nums text-sm">
                    {d.due_at ? new Date(d.due_at).toLocaleDateString() : "—"}
                  </td>
                  <td>{d.title}</td>
                  <td>{d.kind}</td>
                  <td><Badge variant="outline">{d.audience}</Badge></td>
                  <td className="muted text-xs">{d.owner_role}</td>
                  <td>
                    {d.report_instance_id ? (
                      <Link href={`/compliance/submissions/${d.report_instance_id}`} className="text-sm font-semibold">
                        Open →
                      </Link>
                    ) : (
                      "—"
                    )}
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
