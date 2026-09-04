"use client";
import { Shell } from "@/components/Shell";
import { Panel, StateChip, Tip } from "@/components/ui";
import { api } from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function AssetPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const [a, setA] = useState<any>(null);
  useEffect(() => {
    api("/reliability/assets").then((d) => setA((d.items || []).find((x: any) => x.id === assetId)));
  }, [assetId]);
  if (!a) return <Shell><p>Loading asset context…</p></Shell>;
  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1>{a.name}</h1>
          <p className="mono muted">{a.id}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn ghost sm" href="/twin">Twin</Link>
          <Link className="btn ghost sm" href="/live">Live</Link>
          <Link className="btn sm" href="/work">Station work</Link>
        </div>
      </div>
      <Tip>Asset 360°: health, failure-mode prediction, and links into twin / live / work.</Tip>
      <div className="grid cols-2">
        <Panel title="Health">
          <div className="value" style={{ fontSize: 42, fontFamily: "var(--font-display)", fontWeight: 700 }}>
            {(a.health_index * 100).toFixed(0)}%
          </div>
          <p><StateChip state={a.operating_state} /> · {a.criticality}</p>
        </Panel>
        <Panel title="Active prediction">
          {a.prediction ? (
            <>
              <p>Failure mode: <strong>{a.failure_mode?.name}</strong></p>
              <p>P(horizon): {(a.prediction.probability_in_horizon * 100).toFixed(0)}% over {a.prediction.horizon_hours}h</p>
              <p className="muted">Model {a.prediction.model_version} · RUL not claimed</p>
            </>
          ) : <p className="muted">No open prediction</p>}
        </Panel>
      </div>
    </Shell>
  );
}
