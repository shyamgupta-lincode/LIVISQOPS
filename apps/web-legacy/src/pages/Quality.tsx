// Quality Review — aligned with Engineer context graph.
// Modes: Defect queue · Borderline review · Containment.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ago, get, post, usePoll } from "../api";
import { Drawer, toast } from "../components/ui";

type Mode = "defects" | "review" | "containment";

type Binding = {
  id: string;
  object_type: string;
  label: string;
  report_at: string;
  rollup_to?: string[];
  enabled?: boolean;
  lenses?: string[];
};

const REASON_CODES = [
  "RC-01 Confirmed defect",
  "RC-02 False positive",
  "RC-03 Borderline within spec",
  "RC-04 Lighting artifact",
  "RC-05 Repairable",
  "RC-06 Escalate to process eng",
];

const ACTOR = "Q. Batra";

const OBJECT_STYLE: Record<string, { color: string; glyph: string }> = {
  inspection: { color: "#C94A7A", glyph: "◎" },
  defect: { color: "#D06A1E", glyph: "▲" },
};

const TABS: { id: Mode; title: string; ico: string }[] = [
  { id: "defects", title: "Defect queue", ico: "▲" },
  { id: "review", title: "Borderline review", ico: "◎" },
  { id: "containment", title: "Containment", ico: "⛨" },
];

function EvidenceShot({
  label, src, photo, defect,
}: { label: string; src?: string; photo?: string; defect?: boolean }) {
  return (
    <div className={`q-evidence ${defect ? "has-defect" : ""}`}>
      <span className="q-evidence-label">{label}</span>
      {src ? (
        <img src={src} alt={label} className="q-evidence-img" />
      ) : (
        <div className="q-evidence-empty">No frame</div>
      )}
      {photo && photo !== src && (
        <img src={photo} alt={`${label} photo`} className="q-evidence-photo" />
      )}
    </div>
  );
}

function sevPri(severity: string) {
  return severity === "Critical" ? "P1" : severity === "Major" ? "P2" : "P3";
}

export default function Quality() {
  const nav = useNavigate();
  const { data: defects, refresh } = usePoll<any[]>("/api/defects", 6000);
  const { data: holds, refresh: refreshHolds } = usePoll<any[]>("/api/holds", 8000);
  const { data: inspections, refresh: refreshInsp } = usePoll<any[]>(
    "/api/inspections?verdict=Review",
    6000,
  );
  const { data: topo } = usePoll<any>("/api/topology", 20000);

  const [mode, setMode] = useState<Mode>("defects");
  const [statusFilter, setStatusFilter] = useState<"Open" | "All" | "Contained" | "Dispositioned">("Open");
  const [sevFilter, setSevFilter] = useState<"All" | "Critical" | "Major" | "Minor">("All");
  const [selected, setSelected] = useState<any>(null);
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [similar, setSimilar] = useState<any>(null);
  const [reason, setReason] = useState(REASON_CODES[0]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmHold, setConfirmHold] = useState(false);

  const cg = topo?.context_graph || null;

  const qualityBindings: Binding[] = useMemo(
    () => (cg?.object_bindings || []).filter(
      (b: Binding) =>
        b.enabled !== false
        && (["inspection", "defect"].includes(b.object_type)
          || (b.lenses || []).includes("quality")),
    ),
    [cg],
  );

  const open = useMemo(() => (defects || []).filter((d) => d.status === "Open"), [defects]);
  const criticalOpen = open.filter((d) => d.severity === "Critical").length;
  const activeHolds = (holds || []).filter((h) => h.status === "Active");
  const reviewQueue = inspections || [];

  const filteredDefects = useMemo(() => {
    let list = defects || [];
    if (statusFilter !== "All") list = list.filter((d) => d.status === statusFilter);
    if (sevFilter !== "All") list = list.filter((d) => d.severity === sevFilter);
    return list;
  }, [defects, statusFilter, sevFilter]);

  const openDefect = async (d: any) => {
    setReviewItem(null);
    setConfirmHold(false);
    setComment("");
    const detail = await get(`/api/defects/${d.id}`);
    setSelected(detail);
    setSimilar(await get(`/api/defects/${d.id}/similar`));
  };

  const openReview = async (i: any) => {
    setSelected(null);
    setConfirmHold(false);
    setComment("");
    const detail = await get(`/api/inspections/${i.id}`);
    setReviewItem(detail);
    if (detail.linked_defect_id) {
      setSimilar(await get(`/api/defects/${detail.linked_defect_id}/similar`).catch(() => null));
    } else {
      setSimilar(null);
    }
  };

  const openDnaMatch = async (m: any) => {
    await openDefect(m);
  };

  const dispositionDefect = async (kind: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await post(`/api/defects/${selected.id}/disposition`, {
        disposition: kind,
        reason_code: reason,
        comment: comment.trim() || undefined,
        actor: ACTOR,
      });
      toast(`${kind} recorded · ${reason}`);
      setSelected(null);
      setSimilar(null);
      refresh();
      refreshInsp();
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const dispositionReview = async (kind: string) => {
    if (!reviewItem) return;
    setBusy(true);
    try {
      await post(`/api/inspections/${reviewItem.id}/disposition`, {
        disposition: kind,
        reason_code: reason,
        comment: comment.trim() || undefined,
        actor: ACTOR,
      });
      toast(`Review ${kind} · ${reason}`);
      setReviewItem(null);
      refresh();
      refreshInsp();
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const applyContainment = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await post("/api/holds", {
        reason: `${selected.class} containment from Defect DNA radius`,
        defect_class: selected.class,
        scope: `Time window ±45 min around ${selected.detected} at ${selected.station_name || selected.station_id}`,
        units_estimated: (similar?.matches?.length ?? 0) + 1,
        actor: ACTOR,
        defect_id: selected.id,
      });
      toast("Containment hold applied · WMS / ERP / QMS notified");
      setConfirmHold(false);
      setSelected(null);
      refresh();
      refreshHolds();
      setMode("containment");
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const releaseHold = async (id: string) => {
    setBusy(true);
    try {
      await post(`/api/holds/${id}/release?actor=${encodeURIComponent(ACTOR)}`);
      toast("Hold released with named authority");
      refreshHolds();
      refresh();
    } catch (e: any) {
      toast(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!defects) return <p className="dim">Loading quality workspace…</p>;

  const inspHome = qualityBindings.find((b) => b.object_type === "inspection")?.report_at || "station";
  const defectHome = qualityBindings.find((b) => b.object_type === "defect")?.report_at || "station";

  const modeBanner = {
    defects: <>Open a defect · evidence + DNA · disposition or hold.</>,
    review: <>Borderline frames stay here until you accept, reject, or re-inspect.</>,
    containment: <>Active holds block ship · release only with named authority.</>,
  }[mode];

  const insp = selected?.inspection;

  const tabAlerts: Record<Mode, { count: number; alert: boolean; label?: string }> = {
    defects: { count: open.length, alert: open.length > 0, label: criticalOpen > 0 ? `${criticalOpen} critical` : undefined },
    review: { count: reviewQueue.length, alert: reviewQueue.length > 0 },
    containment: { count: activeHolds.length, alert: activeHolds.length > 0 },
  };

  return (
    <div className="q-page" data-tour="page-quality">
      <header className="cg-hero">
        <div>
          <div className="cg-hero-kicker">Quality & AI</div>
          <h1 className="cg-title">Vision Review</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Review evidence, disposition defects, apply holds.
          </p>
        </div>
        <div className="cg-hero-aside">
          <div className="cg-hero-stats" data-tour="quality-kpis">
            <div><em className={open.length > 5 ? "bad" : ""}>{open.length}</em><span>Open</span></div>
            <div><em>{reviewQueue.length}</em><span>Review</span></div>
            <div><em>{activeHolds.length}</em><span>Holds</span></div>
            <div><em className="bad">{criticalOpen}</em><span>Critical</span></div>
          </div>
        </div>
      </header>

      <div className="q-tabs" role="tablist" aria-label="Quality views">
        {TABS.map((t) => {
          const a = tabAlerts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === t.id}
              className={`q-tab ${mode === t.id ? "on" : ""} ${a.alert ? "has-alert" : ""}`}
              onClick={() => setMode(t.id)}
            >
              <span className="q-tab-ico" aria-hidden>{t.ico}</span>
              <span className="q-tab-label">{t.title}</span>
              {a.count > 0 && (
                <span className={`q-tab-badge ${a.alert ? "alert" : ""}`} title={a.label}>
                  {a.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="q-tab-hint">{modeBanner}</div>

      {mode === "defects" && (
        <section className="q-panel">
          <div className="q-panel-head">
            <div className="q-panel-title">
              <span className="q-obj-glyph" style={{ color: OBJECT_STYLE.defect.color }}>▲</span>
              Defect queue
              <span className="tag mono">@{defectHome}</span>
            </div>
            <div className="q-filters">
              {(["Open", "Contained", "Dispositioned", "All"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`source-chip ${statusFilter === s ? "active" : ""}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                  <em>
                    {s === "All"
                      ? (defects?.length ?? 0)
                      : (defects || []).filter((d) => d.status === s).length}
                  </em>
                </button>
              ))}
              {(["All", "Critical", "Major", "Minor"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`source-chip ${sevFilter === s ? "active" : ""}`}
                  onClick={() => setSevFilter(s)}
                >
                  {s === "All" ? "All sev" : s}
                </button>
              ))}
            </div>
          </div>

          <div className="q-defect-list">
            {filteredDefects.length === 0 && (
              <div className="q-empty">No defects for this filter.</div>
            )}
            {filteredDefects.slice(0, 40).map((d) => (
              <button
                key={d.id}
                type="button"
                className={`q-defect-row status-${d.status.toLowerCase()}`}
                onClick={() => openDefect(d)}
              >
                <span className={`pri ${sevPri(d.severity)}`}>{d.severity[0]}</span>
                <div className="q-defect-main">
                  <strong>{d.class}</strong>
                  <em>
                    DNA {d.defect_dna.fingerprint.slice(0, 10)}…
                    {d.path?.length ? ` · ${d.path.join(" → ")}` : ` · ${d.station_id.replace("st-", "")}`}
                  </em>
                </div>
                <span className="mono q-conf">{(d.confidence * 100).toFixed(1)}%</span>
                <span className={`tag status-${d.status.toLowerCase()}`}>{d.status}</span>
                <span className="faint small">{ago(d.detected)}</span>
                <span className="q-chevron" aria-hidden>›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {mode === "review" && (
        <section className="q-panel">
          <div className="q-panel-head">
            <div className="q-panel-title">
              <span className="q-obj-glyph" style={{ color: OBJECT_STYLE.inspection.color }}>◎</span>
              Borderline review queue
              <span className="tag mono">@{inspHome}</span>
            </div>
            <span className="tag mono">{reviewQueue.length} awaiting human</span>
          </div>
          <div className="q-review-grid">
            {reviewQueue.length === 0 && (
              <div className="q-empty">Review queue clear — no borderline inspections.</div>
            )}
            {reviewQueue.map((i) => (
              <button
                key={i.id}
                type="button"
                className="q-review-card"
                onClick={() => openReview(i)}
              >
                <div className="q-review-thumb">
                  {i.thumbnail_url
                    ? <img src={i.thumbnail_url} alt={i.evidence_ref} />
                    : <span className="faint">No frame</span>}
                </div>
                <div className="q-review-meta">
                  <strong className="mono">{i.evidence_ref}</strong>
                  <span className="k-warn mono">{(i.confidence * 100).toFixed(1)}% conf</span>
                  <em>
                    {i.lighting_recipe} · {i.camera}
                    {i.path?.length ? ` · ${i.path.slice(-2).join(" → ")}` : ""}
                  </em>
                  <span className="faint">{ago(i.captured)}</span>
                  {i.linked_defect_class && (
                    <span className="tag">linked · {i.linked_defect_class}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {mode === "containment" && (
        <section className="q-panel">
          <div className="q-panel-head">
            <div className="q-panel-title">
              <span className="q-obj-glyph">⛨</span>
              Containment holds
            </div>
            <button type="button" className="btn ghost" onClick={() => setMode("defects")}>
              Open defect to apply hold →
            </button>
          </div>
          <div className="q-hold-list">
            {activeHolds.length === 0 && (holds || []).every((h) => h.status !== "Active") && (
              <div className="q-empty">No active holds. Apply from a defect drawer after DNA review.</div>
            )}
            {(holds || []).map((h) => (
              <article key={h.id} className={`q-hold-card ${h.status === "Active" ? "active" : ""}`}>
                <div className="q-hold-top">
                  <strong>{h.reason}</strong>
                  <span className={`tag status-${h.status.toLowerCase()}`}>{h.status}</span>
                </div>
                <p>{h.scope}</p>
                <div className="small faint">
                  est. {h.units_estimated} units · confirmed {h.units_confirmed} · by {h.applied_by} · {ago(h.applied)}
                  {h.released ? ` · released ${ago(h.released)}` : ""}
                </div>
                <div className="q-hold-integrations">
                  <span className="tag">WMS: {h.integration.wms}</span>
                  <span className="tag">ERP: {h.integration.erp}</span>
                  <span className="tag">QMS: {h.integration.qms}</span>
                </div>
                {h.status === "Active" && (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy}
                    onClick={() => releaseHold(h.id)}
                  >
                    Release hold (named authority)
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Defect review drawer */}
      {selected && (
        <Drawer onClose={() => { setSelected(null); setConfirmHold(false); }}>
          <div className="cg-hero-kicker">Defect / NCR object</div>
          <h2 style={{ marginTop: 4, fontSize: 17 }}>{selected.class}</h2>
          <div className="small faint">
            {selected.severity} · VIN {selected.vin ?? "n/a"} · conf {(selected.confidence * 100).toFixed(1)}%
          </div>
          {selected.path?.length > 0 && (
            <div className="prod-path mt">
              {selected.path.map((p: string, i: number) => (
                <React.Fragment key={p}>
                  {i > 0 && <span className="twin-spine-arrow">→</span>}
                  <span className="prod-path-chip">{p}</span>
                </React.Fragment>
              ))}
            </div>
          )}
          <div className="row wrap mt" style={{ gap: 6 }}>
            <span className={`tag status-${selected.status.toLowerCase()}`}>{selected.status}</span>
            <span className={`pri ${sevPri(selected.severity)}`}>{selected.severity}</span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => nav(`/operate/station/${selected.station_id}`)}
            >
              Open station →
            </button>
            {selected.vin && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => nav("/operate/production")}
              >
                Production / VIN →
              </button>
            )}
          </div>

          <div className="divider" />
          <div className="panel-title">Evidence · trust the frame</div>
          <div className="q-evidence-grid">
            <EvidenceShot
              label="Model overlay"
              src={insp?.thumbnail_url}
              defect={selected.severity !== "Minor"}
            />
            <EvidenceShot
              label="Capture photo"
              src={insp?.photo_url}
            />
          </div>
          <div className="small faint mt">
            {insp?.evidence_ref || "—"} · {insp?.lighting_recipe || "—"} · {insp?.camera || "—"}
            {insp?.model_name ? ` · ${insp.model_name} v${insp.model_version || "?"}` : ""}
          </div>

          <div className="divider" />
          <div className="panel-title">
            <span>Defect DNA · similar events</span>
            <span className="tag mono">{similar?.fingerprint?.slice(0, 8)}…</span>
          </div>
          {(similar?.matches || []).slice(0, 6).map((m: any) => (
            <button
              key={m.id}
              type="button"
              className="q-dna-row"
              onClick={() => openDnaMatch(m)}
            >
              <span>{m.class}</span>
              <span className="mono">{(m.similarity * 100).toFixed(0)}%</span>
              <span className="faint">{m.station_name || m.station_id.replace("st-", "")}</span>
              <span className="faint">{ago(m.detected)}</span>
            </button>
          ))}
          {(similar?.cross_plant || []).map((c: any, i: number) => (
            <div className="q-cross" key={i}>
              ↳ {c.plant}: same fingerprint · resolved by “{c.resolution}”
            </div>
          ))}

          {selected.status === "Open" && (
            <>
              <div className="divider" />
              <div className="panel-title">Disposition · reason code required</div>
              <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASON_CODES.map((r) => <option key={r}>{r}</option>)}
              </select>
              <textarea
                className="field mt"
                placeholder="Optional comment (feeds governed dataset review)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="row wrap mt" style={{ gap: 8 }}>
                <button type="button" className="btn success" disabled={busy} onClick={() => dispositionDefect("Accept")}>Accept</button>
                <button type="button" className="btn" disabled={busy} onClick={() => dispositionDefect("Accept-with-deviation")}>Accept w/ deviation</button>
                <button type="button" className="btn" disabled={busy} onClick={() => dispositionDefect("Repair")}>Repair</button>
                <button type="button" className="btn danger" disabled={busy} onClick={() => dispositionDefect("Reject")}>Reject</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => dispositionDefect("Re-inspect")}>Re-inspect</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => dispositionDefect("Escalate")}>Escalate</button>
              </div>

              <div className="divider" />
              <div className="panel-title">Smart containment radius</div>
              <p className="small dim">
                Genealogy / time / lot correlation suggests {(similar?.matches?.length ?? 0) + 1} potentially affected units.
                Holds propagate to WMS, ERP and QMS and mark this defect Contained.
              </p>
              {!confirmHold ? (
                <button
                  type="button"
                  className="btn danger"
                  style={{ width: "100%" }}
                  onClick={() => setConfirmHold(true)}
                >
                  Apply containment hold…
                </button>
              ) : (
                <div className="q-confirm-hold">
                  <p className="small">Confirm hold as <b>{ACTOR}</b>? This notifies WMS/ERP/QMS.</p>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn danger" disabled={busy} onClick={applyContainment}>
                      Confirm hold
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setConfirmHold(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {selected.status !== "Open" && (
            <div className="q-outcome mt">
              Status {selected.status}
              {selected.disposition ? ` · ${selected.disposition}` : ""}
              {selected.disposition_reason ? ` · ${selected.disposition_reason}` : ""}
            </div>
          )}

          <div className="audit-footer">
            Human disposition feeds governed dataset review; production models never auto-promote from labels.
          </div>
        </Drawer>
      )}

      {/* Borderline inspection drawer */}
      {reviewItem && (
        <Drawer onClose={() => setReviewItem(null)}>
          <div className="cg-hero-kicker">Inspection / evidence object</div>
          <h2 style={{ marginTop: 4, fontSize: 16 }} className="mono">{reviewItem.evidence_ref}</h2>
          <div className="small faint">
            conf {(reviewItem.confidence * 100).toFixed(1)}% · {reviewItem.verdict}
            {reviewItem.vin ? ` · VIN ${reviewItem.vin}` : ""}
          </div>
          {reviewItem.path?.length > 0 && (
            <div className="prod-path mt">
              {reviewItem.path.map((p: string, i: number) => (
                <React.Fragment key={p}>
                  {i > 0 && <span className="twin-spine-arrow">→</span>}
                  <span className="prod-path-chip">{p}</span>
                </React.Fragment>
              ))}
            </div>
          )}
          <div className="row wrap mt" style={{ gap: 6 }}>
            <span className="tag">{reviewItem.lighting_recipe}</span>
            <span className="tag">{reviewItem.camera}</span>
            {reviewItem.model_name && (
              <span className="tag mono">{reviewItem.model_name} v{reviewItem.model_version}</span>
            )}
            {reviewItem.linked_defect_id && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={async () => {
                  const d = await get(`/api/defects/${reviewItem.linked_defect_id}`);
                  setReviewItem(null);
                  openDefect(d);
                }}
              >
                Open linked defect →
              </button>
            )}
          </div>

          <div className="divider" />
          <div className="panel-title">Evidence comparison</div>
          <div className="q-evidence-grid">
            <EvidenceShot label="Model overlay" src={reviewItem.thumbnail_url} defect />
            <EvidenceShot label="Capture photo" src={reviewItem.photo_url} />
          </div>

          <div className="divider" />
          <div className="panel-title">Review disposition</div>
          <p className="small dim">
            Confidence is borderline. Accept only if the frame supports the call; otherwise re-inspect or escalate.
          </p>
          <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASON_CODES.map((r) => <option key={r}>{r}</option>)}
          </select>
          <textarea
            className="field mt"
            placeholder="Optional comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="row wrap mt" style={{ gap: 8 }}>
            <button type="button" className="btn success" disabled={busy} onClick={() => dispositionReview("Accept")}>Accept</button>
            <button type="button" className="btn" disabled={busy} onClick={() => dispositionReview("Accept-with-deviation")}>Accept w/ deviation</button>
            <button type="button" className="btn danger" disabled={busy} onClick={() => dispositionReview("Reject")}>Reject</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => dispositionReview("Re-inspect")}>Re-inspect</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => dispositionReview("Escalate")}>Escalate</button>
          </div>
          <div className="audit-footer">
            Review dispositions clear the borderline queue and stamp the linked defect when present.
          </div>
        </Drawer>
      )}
    </div>
  );
}
