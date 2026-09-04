// Administration: identity/RBAC, Plant Policy as Code, immutable audit trail.

import React, { useState } from "react";

import { ago, usePoll } from "../api";
import { PageHeader, Panel } from "../components/ui";

export default function Admin() {
  const { data: users } = usePoll<any[]>("/api/users", 20000);
  const { data: policies } = usePoll<any[]>("/api/policies", 0);
  const [auditFilter, setAuditFilter] = useState("");
  const { data: audit } = usePoll<any[]>(
    auditFilter ? `/api/audit?kind=${auditFilter}` : "/api/audit", 8000
  );

  return (
    <div data-tour="page-admin">
      <PageHeader
        title="Administration"
        sub="Identity, sites, governance, security and audit. Plant Policy as Code — versioned and testable."
        tip={<>For create/edit/delete of users and other records, open <b>Entity Manager</b> in the Govern sidebar.</>}
      />

      <div className="grid cols-2">
        <div>
          <Panel title="Users & roles · skill-aware authorization">
            <table className="data">
              <thead><tr><th>Name</th><th>Role</th><th>Skills</th><th>SSO</th></tr></thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="small dim">{u.role}</td>
                    <td>{u.skills.map((s: string) => <span className="tag" key={s}>{s}</span>)}</td>
                    <td className="small faint">{u.sso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <div className="mt" />
          <Panel title="Plant Policy as Code">
            {(policies ?? []).map((p) => (
              <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="row between">
                  <strong style={{ fontSize: 13 }}>{p.name}</strong>
                  <span className="tag mono">{p.version} · {p.status}</span>
                </div>
                <div className="small dim">{p.rule}</div>
              </div>
            ))}
          </Panel>
        </div>

        <Panel
          title="Audit trail · immutable, source-identified"
          action={
            <select className="field" style={{ width: 170, padding: "4px 8px" }} value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)}>
              <option value="">All kinds</option>
              <option value="model">Model</option>
              <option value="hold">Holds</option>
              <option value="workflow">Workflow</option>
              <option value="agent">Agent</option>
              <option value="edge">Edge</option>
              <option value="operation">Operations</option>
            </select>
          }
        >
          {(audit ?? []).slice(0, 30).map((a) => (
            <div key={a.id} style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
              <div className="row between">
                <span className="tag mono">{a.kind}</span>
                <span className="small faint">{ago(a.at)}</span>
              </div>
              <div className="small" style={{ marginTop: 3 }}>{a.detail}</div>
              <div className="small faint">actor: {a.actor} · source: {a.source}</div>
            </div>
          ))}
          {(audit ?? []).length === 0 && <p className="small dim">No audit records for this filter.</p>}
        </Panel>
      </div>
    </div>
  );
}
