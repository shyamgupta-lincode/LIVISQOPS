"use client";
import { Shell } from "@/components/Shell";
import { AdminSubnav, Panel } from "@/components/ui";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export default function AuditPage() {
  const [audit, setAudit] = useState<any[]>([]);
  useEffect(() => {
    api("/admin/audit").then((d) => setAudit(d.items || []));
  }, []);
  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Audit</h1>
        </div>
      </div>
      <AdminSubnav />
      <Panel>
        <table className="table">
          <thead><tr><th>When</th><th>Actor</th><th>Type</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td className="mono">{a.at}</td>
                <td>{a.actor}</td>
                <td>{a.actor_type}</td>
                <td>{a.action}</td>
                <td className="mono">{a.target_type}:{a.target_id?.slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Shell>
  );
}
