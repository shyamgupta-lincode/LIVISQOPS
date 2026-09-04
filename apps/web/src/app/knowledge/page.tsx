"use client";
import { Shell } from "@/components/Shell";
import { Panel, Tip } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export default function KnowledgePage() {
  const [q, setQ] = useState("bearing");
  const [items, setItems] = useState<any[]>([]);
  const [props, setProps] = useState<any[]>([]);
  const search = () => api(`/knowledge/search?q=${encodeURIComponent(q)}`).then((d) => setItems(d.items || []));
  useEffect(() => {
    search();
    api("/knowledge/proposals").then((d) => setProps(d.items || []));
  }, []);

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>Knowledge</h1>
        </div>
        <div className="flex gap-2">
          <Input className="w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases…" />
          <Button size="sm" type="button" onClick={search}>Search</Button>
        </div>
      </div>
      <Tip>
        Similar-case retrieval feeds RCA and containment. Promotion is steward-gated so contradictory
        or irrelevant lessons (seeded on purpose) do not silently overwrite the index.
      </Tip>
      <div className="grid cols-2">
        <Panel title="Approved cases">
          <table className="table">
            <thead><tr><th>Title</th><th>Cause</th><th>Effectiveness</th><th>Ver</th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td>{c.confirmed_cause}</td>
                  <td>{c.effectiveness}</td>
                  <td>{c.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Pending proposals">
          <table className="table">
            <thead><tr><th>ID</th><th>Status</th><th>Event</th><th></th></tr></thead>
            <tbody>
              {props.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.id.slice(0, 8)}</td>
                  <td>{p.status}</td>
                  <td className="mono">{p.quality_event_id?.slice(0, 8)}</td>
                  <td>
                    {p.status === "Pending Approval" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={async () => {
                          await api(`/knowledge/proposals/${p.id}/approve`, { method: "POST" });
                          setProps((await api("/knowledge/proposals")).items || []);
                          search();
                        }}
                      >
                        Approve
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!props.length && <tr><td colSpan={4} className="muted">No pending proposals</td></tr>}
            </tbody>
          </table>
        </Panel>
      </div>
    </Shell>
  );
}
