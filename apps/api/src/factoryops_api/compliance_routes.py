"""Compliance & Quality Reporting API — /api/v1/compliance/*."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from factoryops_domain.compliance import can_report_transition
from factoryops_domain.ids import new_id

from . import models
from .audit import audit
from .auth import Principal, get_principal
from .db import get_db

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _obligation(o: models.ComplianceObligation) -> dict[str, Any]:
    return {
        "id": o.id,
        "code": o.code,
        "title": o.title,
        "description": o.description,
        "audience": o.audience,
        "family": o.family,
        "country": o.country,
        "customer": o.customer,
        "product": o.product,
        "model_year": o.model_year,
        "component": o.component,
        "standard_refs": o.standard_refs or [],
        "effective_from": _iso(o.effective_from),
        "effective_to": _iso(o.effective_to),
        "cadence": o.cadence,
        "status": o.status,
        "risk": o.risk,
        "owner_role": o.owner_role,
        "site_id": o.site_id,
        "props": o.props or {},
        "updated_at": _iso(o.updated_at),
    }


def _template(t: models.ReportTemplate) -> dict[str, Any]:
    return {
        "id": t.id,
        "code": t.code,
        "name": t.name,
        "family": t.family,
        "audience": t.audience,
        "customer": t.customer,
        "version": t.version,
        "description": t.description,
        "sections": t.sections or [],
        "required_evidence_kinds": t.required_evidence_kinds or [],
        "status": t.status,
        "props": t.props or {},
        "updated_at": _iso(t.updated_at),
    }


def _instance(r: models.ReportInstance) -> dict[str, Any]:
    return {
        "id": r.id,
        "template_id": r.template_id,
        "obligation_id": r.obligation_id,
        "title": r.title,
        "family": r.family,
        "audience": r.audience,
        "customer": r.customer,
        "status": r.status,
        "version": r.version,
        "period_label": r.period_label,
        "due_at": _iso(r.due_at),
        "submitted_at": _iso(r.submitted_at),
        "owner_role": r.owner_role,
        "owner_user_id": r.owner_user_id,
        "ai_draft": bool(r.ai_draft),
        "filing_channel": r.filing_channel,
        "external_ref": r.external_ref,
        "summary": r.summary,
        "payload": r.payload or {},
        "evidence_links": r.evidence_links or [],
        "audit_trail": r.audit_trail or [],
        "rejection_reason": r.rejection_reason,
        "site_id": r.site_id,
        "created_at": _iso(r.created_at),
        "updated_at": _iso(r.updated_at),
        "external_filing_claimed": False,
        "disclaimer": (
            "Local FactoryOps record only. Regulatory stubs do not transmit to NHTSA, EPA, "
            "or EU type-approval authorities."
            if (r.audience == "regulatory" or (r.filing_channel or "") == "stub")
            else None
        ),
    }


def _deadline(d: models.ComplianceDeadline) -> dict[str, Any]:
    return {
        "id": d.id,
        "title": d.title,
        "kind": d.kind,
        "audience": d.audience,
        "due_at": _iso(d.due_at),
        "status": d.status,
        "owner_role": d.owner_role,
        "obligation_id": d.obligation_id,
        "report_instance_id": d.report_instance_id,
        "site_id": d.site_id,
        "props": d.props or {},
    }


def _append_trail(row: models.ReportInstance, actor: str, action: str, note: str = "") -> None:
    trail = list(row.audit_trail or [])
    trail.append({
        "at": datetime.now(timezone.utc).isoformat(),
        "actor": actor,
        "actor_type": "human",
        "action": action,
        "status": row.status,
        "note": note,
    })
    row.audit_trail = trail


@router.get("/cockpit")
def cockpit(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    """Quality / compliance cockpit summary from plant + report state."""
    site_id = p.site_id
    qe_q = db.query(models.QualityEvent)
    if site_id:
        qe_q = qe_q.filter(models.QualityEvent.site_id == site_id)
    events = qe_q.all()
    open_events = [e for e in events if e.status != "CLOSED"]
    critical = [e for e in open_events if e.severity in ("Critical", "High")]
    capa_aging = [
        e for e in open_events
        if e.status in ("CORRECTIVE_ACTION", "EFFECTIVENESS_CHECK", "DISPOSITION")
    ]

    assets_q = db.query(models.Asset)
    # assets linked via cells/lines/sites — approximate via health
    at_risk = db.query(models.Asset).filter(models.Asset.health_index < 0.85).count()

    reports_q = db.query(models.ReportInstance)
    if site_id:
        reports_q = reports_q.filter(models.ReportInstance.site_id == site_id)
    reports = reports_q.all()
    by_status: dict[str, int] = {}
    for r in reports:
        by_status[r.status] = by_status.get(r.status, 0) + 1
    overdue = [
        r for r in reports
        if r.due_at and r.due_at < datetime.now(timezone.utc)
        and r.status not in ("ACCEPTED", "SUBMITTED")
    ]
    ai_drafts = [r for r in reports if r.ai_draft and r.status == "DRAFT"]
    regulatory_drafts = [r for r in reports if r.audience == "regulatory" and r.status == "DRAFT"]

    # Approximate FPY / PPM from overview-like heuristics
    closed = [e for e in events if e.status == "CLOSED"]
    fpy = round(1.0 - (len(critical) / max(len(events), 1)) * 0.15, 3)
    ppm = int(20 + len(open_events) * 8 + len(critical) * 12)

    deadlines_q = db.query(models.ComplianceDeadline)
    if site_id:
        deadlines_q = deadlines_q.filter(models.ComplianceDeadline.site_id == site_id)
    deadlines = deadlines_q.order_by(models.ComplianceDeadline.due_at.asc()).limit(12).all()
    due_soon = [d for d in deadlines if d.status in ("due", "overdue")]

    risk_score = min(
        100,
        20
        + len(critical) * 12
        + len(overdue) * 10
        + len(due_soon) * 6
        + len(regulatory_drafts) * 4
        + (at_risk * 5),
    )

    return {
        "kpis": {
            "ppm": ppm,
            "fpy": fpy,
            "open_critical_events": len(critical),
            "open_quality_events": len(open_events),
            "capa_aging": len(capa_aging),
            "assets_at_risk": at_risk,
            "reports_overdue": len(overdue),
            "ai_drafts_pending": len(ai_drafts),
            "regulatory_stubs_open": len(regulatory_drafts),
            "compliance_risk": risk_score,
            "warranty_emerging": sum(1 for r in reports if r.family == "warranty" and r.status == "DRAFT"),
            "supplier_open": sum(1 for r in reports if r.family == "supplier" and r.status not in ("ACCEPTED",)),
        },
        "reports_by_status": by_status,
        "audience_counts": {
            a: sum(1 for r in reports if r.audience == a)
            for a in ("internal", "customer", "regulatory", "public")
        },
        "upcoming_deadlines": [_deadline(d) for d in deadlines[:8]],
        "attention": {
            "overdue_reports": [_instance(r) for r in overdue[:5]],
            "ai_drafts": [_instance(r) for r in ai_drafts[:5]],
            "critical_events": [
                {"id": e.id, "characteristic": e.characteristic, "severity": e.severity, "status": e.status}
                for e in critical[:5]
            ],
        },
        "disclaimers": [
            "Compliance risk is a demo heuristic from open events, overdue reports, and deadlines.",
            "Regulatory report stubs never claim external NHTSA/EPA/EU filing success.",
            "AI-generated drafts remain unapproved until a quality_manager / compliance role acts.",
        ],
    }


@router.get("/obligations")
def list_obligations(
    audience: Optional[str] = None,
    family: Optional[str] = None,
    customer: Optional[str] = None,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    q = db.query(models.ComplianceObligation)
    if p.site_id:
        q = q.filter(
            (models.ComplianceObligation.site_id == p.site_id)
            | (models.ComplianceObligation.site_id.is_(None))
        )
    if audience:
        q = q.filter(models.ComplianceObligation.audience == audience)
    if family:
        q = q.filter(models.ComplianceObligation.family == family)
    if customer:
        q = q.filter(models.ComplianceObligation.customer == customer)
    rows = q.order_by(models.ComplianceObligation.risk.desc(), models.ComplianceObligation.code).all()
    return {"items": [_obligation(o) for o in rows], "total": len(rows)}


@router.get("/templates")
def list_templates(
    family: Optional[str] = None,
    audience: Optional[str] = None,
    customer: Optional[str] = None,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    q = db.query(models.ReportTemplate)
    if family:
        q = q.filter(models.ReportTemplate.family == family)
    if audience:
        q = q.filter(models.ReportTemplate.audience == audience)
    if customer:
        q = q.filter(models.ReportTemplate.customer == customer)
    rows = q.order_by(models.ReportTemplate.family, models.ReportTemplate.code).all()
    return {"items": [_template(t) for t in rows], "total": len(rows)}


@router.get("/templates/{template_id}")
def get_template(template_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    t = db.get(models.ReportTemplate, template_id)
    if not t:
        raise HTTPException(404, detail="template not found")
    return _template(t)


@router.get("/reports")
def list_reports(
    status: Optional[str] = None,
    family: Optional[str] = None,
    audience: Optional[str] = None,
    customer: Optional[str] = None,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    q = db.query(models.ReportInstance)
    if p.site_id:
        q = q.filter(models.ReportInstance.site_id == p.site_id)
    if status:
        q = q.filter(models.ReportInstance.status == status)
    if family:
        q = q.filter(models.ReportInstance.family == family)
    if audience:
        q = q.filter(models.ReportInstance.audience == audience)
    if customer:
        q = q.filter(models.ReportInstance.customer == customer)
    rows = q.order_by(models.ReportInstance.due_at.asc().nullslast(), models.ReportInstance.updated_at.desc()).limit(200).all()
    return {"items": [_instance(r) for r in rows], "total": len(rows)}


@router.get("/reports/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    r = db.get(models.ReportInstance, report_id)
    if not r:
        raise HTTPException(404, detail="report not found")
    out = _instance(r)
    tpl = db.get(models.ReportTemplate, r.template_id)
    obl = db.get(models.ComplianceObligation, r.obligation_id) if r.obligation_id else None
    out["template"] = _template(tpl) if tpl else None
    out["obligation"] = _obligation(obl) if obl else None
    return out


class TransitionReportIn(BaseModel):
    to_status: str
    expected_version: Optional[int] = None
    note: Optional[str] = None
    rejection_reason: Optional[str] = None


@router.post("/reports/{report_id}/transition")
def transition_report(
    report_id: str,
    body: TransitionReportIn,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    r = db.get(models.ReportInstance, report_id)
    if not r:
        raise HTTPException(404, detail="report not found")
    if body.expected_version is not None and body.expected_version != r.version:
        raise HTTPException(409, detail="stale version")
    ok, reason = can_report_transition(r.status, body.to_status, p.role)
    if not ok:
        raise HTTPException(403, detail=reason)
    # Never claim external regulatory success
    if body.to_status in ("SUBMITTED", "ACCEPTED") and (r.audience == "regulatory" or r.filing_channel == "stub"):
        if body.to_status == "ACCEPTED":
            raise HTTPException(
                400,
                detail="Regulatory stubs cannot be marked ACCEPTED — no external filing channel is connected.",
            )
        # SUBMITTED on stub is allowed as "prepared for portal" with explicit local-only note
    before = {"status": r.status, "version": r.version}
    r.status = body.to_status
    r.version += 1
    r.updated_at = datetime.now(timezone.utc)
    if body.to_status == "SUBMITTED":
        r.submitted_at = datetime.now(timezone.utc)
        if r.filing_channel == "stub":
            note = (body.note or "") + " Local stub only — not transmitted to regulator."
        else:
            note = body.note or "Submitted via configured portal/email channel (demo)."
        _append_trail(r, p.email, "submitted", note.strip())
    elif body.to_status == "REJECTED":
        r.rejection_reason = body.rejection_reason or body.note or "Rejected"
        _append_trail(r, p.email, "rejected", r.rejection_reason)
    elif body.to_status == "AMENDED":
        r.ai_draft = False
        _append_trail(r, p.email, "amended", body.note or "Amended after review")
    elif body.to_status == "APPROVED":
        if r.ai_draft:
            r.ai_draft = False  # human approval clears AI-only flag
        _append_trail(r, p.email, "approved", body.note or "Human approved")
    else:
        _append_trail(r, p.email, body.to_status.lower(), body.note or "")
    audit(
        db, actor=p.email, action=f"report_transition:{body.to_status}",
        target_type="report_instance", target_id=r.id, site_id=r.site_id,
        before=before, after={"status": r.status, "version": r.version},
        correlation_id=idempotency_key,
    )
    db.commit()
    db.refresh(r)
    return _instance(r)


class CreateReportIn(BaseModel):
    template_id: str
    title: str
    obligation_id: Optional[str] = None
    period_label: Optional[str] = None
    due_at: Optional[datetime] = None
    summary: Optional[str] = None
    evidence_links: list[dict[str, Any]] = Field(default_factory=list)
    ai_draft: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)


@router.post("/reports")
def create_report(body: CreateReportIn, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    tpl = db.get(models.ReportTemplate, body.template_id)
    if not tpl:
        raise HTTPException(404, detail="template not found")
    site_id = p.site_id or (db.query(models.Site).first().id if db.query(models.Site).first() else None)
    tenant_id = tpl.tenant_id
    r = models.ReportInstance(
        id=new_id(),
        tenant_id=tenant_id,
        site_id=site_id,
        template_id=tpl.id,
        obligation_id=body.obligation_id,
        title=body.title,
        family=tpl.family,
        audience=tpl.audience,
        customer=tpl.customer,
        status="DRAFT",
        version=1,
        period_label=body.period_label,
        due_at=body.due_at,
        owner_role=p.role,
        owner_user_id=p.user_id,
        ai_draft=body.ai_draft,
        filing_channel="stub" if tpl.audience == "regulatory" else "none",
        summary=body.summary or f"Draft from template {tpl.code}",
        payload=body.payload or {},
        evidence_links=body.evidence_links or [],
        audit_trail=[{
            "at": datetime.now(timezone.utc).isoformat(),
            "actor": p.email,
            "actor_type": "agent" if body.ai_draft else "human",
            "action": "created",
            "status": "DRAFT",
            "note": "AI draft — requires human approval" if body.ai_draft else "Created",
        }],
    )
    db.add(r)
    audit(db, actor=p.email, action="report_create", target_type="report_instance",
          target_id=r.id, site_id=site_id, after={"title": r.title, "ai_draft": r.ai_draft})
    db.commit()
    db.refresh(r)
    return _instance(r)


class AiDraftIn(BaseModel):
    template_id: str
    quality_event_id: Optional[str] = None
    title: Optional[str] = None
    prompt_hint: Optional[str] = None


@router.post("/reports/ai-draft")
def ai_draft_report(body: AiDraftIn, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    """Create an unapproved AI draft only — never auto-submits."""
    tpl = db.get(models.ReportTemplate, body.template_id)
    if not tpl:
        raise HTTPException(404, detail="template not found")
    evidence: list[dict[str, Any]] = []
    summary_bits = [f"Mock AI draft for {tpl.name}."]
    if body.quality_event_id:
        qe = db.get(models.QualityEvent, body.quality_event_id)
        if qe:
            evidence.append({
                "kind": "quality_event",
                "id": qe.id,
                "label": qe.characteristic,
            })
            summary_bits.append(f"Linked event: {qe.characteristic} ({qe.status}).")
            if qe.rca_summary:
                summary_bits.append(f"RCA note: {qe.rca_summary}")
            if qe.lot_id:
                evidence.append({"kind": "genealogy", "id": qe.lot_id, "label": "Linked lot"})
            if qe.anomaly_id:
                evidence.append({"kind": "anomaly", "id": qe.anomaly_id, "label": "Source anomaly"})
    title = body.title or f"AI draft: {tpl.name}"
    if body.prompt_hint:
        summary_bits.append(f"Hint: {body.prompt_hint}")
    summary_bits.append("Status remains DRAFT until a qualified human validates and approves.")
    site_id = p.site_id or (db.query(models.Site).first().id if db.query(models.Site).first() else None)
    r = models.ReportInstance(
        id=new_id(),
        tenant_id=tpl.tenant_id,
        site_id=site_id,
        template_id=tpl.id,
        title=title,
        family=tpl.family,
        audience=tpl.audience,
        customer=tpl.customer,
        status="DRAFT",
        version=1,
        owner_role=p.role,
        owner_user_id=p.user_id,
        ai_draft=True,
        filing_channel="stub" if tpl.audience == "regulatory" else "none",
        summary=" ".join(summary_bits),
        payload={
            "generator": "MockAgentProvider",
            "untrusted": True,
            "requires_human_approval": True,
        },
        evidence_links=evidence,
        audit_trail=[{
            "at": datetime.now(timezone.utc).isoformat(),
            "actor": p.email,
            "actor_type": "agent",
            "action": "created",
            "status": "DRAFT",
            "note": "AI draft — requires human approval",
        }],
    )
    db.add(r)
    audit(db, actor=p.email, action="report_ai_draft", target_type="report_instance",
          target_id=r.id, site_id=site_id, after={"title": r.title, "ai_draft": True})
    db.commit()
    db.refresh(r)
    return _instance(r)


@router.get("/calendar")
def calendar(
    days: int = Query(120, ge=1, le=400),
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    q = db.query(models.ComplianceDeadline)
    if p.site_id:
        q = q.filter(models.ComplianceDeadline.site_id == p.site_id)
    rows = q.order_by(models.ComplianceDeadline.due_at.asc()).all()
    # refresh status relative to now
    now = datetime.now(timezone.utc)
    items = []
    for d in rows:
        due = d.due_at
        if due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        delta = (due - now).days
        if d.status != "done":
            if delta < 0:
                d.status = "overdue"
            elif delta <= 7:
                d.status = "due"
            else:
                d.status = "upcoming"
        items.append(_deadline(d))
    db.commit()
    return {"items": items, "total": len(items)}


@router.get("/regulatory-changes")
def regulatory_changes(p: Principal = Depends(get_principal)):
    """Static awareness feed — not a live regulatory intelligence feed."""
    return {
        "items": [
            {
                "id": "reg-iso-2026",
                "title": "ISO 9001:2026 edition expected",
                "summary": "Baseline remains ISO 9001:2015+Amd1:2024 until the 2026 edition is published and adopted in customer CSRs.",
                "effective": "2026 (expected)",
                "audience": "internal",
                "impact": "Update QMS management review and certificate narratives when edition lands.",
            },
            {
                "id": "reg-iatf-csr",
                "title": "IATF 16949 + OEM CSR versioning",
                "summary": "Customer-specific requirements (Ford/GM/Stellantis) version independently of IATF; templates are OEM-keyed.",
                "effective": "ongoing",
                "audience": "customer",
                "impact": "Do not collapse OEM packs into one universal IATF report.",
            },
            {
                "id": "reg-ecoc-2026",
                "title": "EU Certificate of Conformity electronic data",
                "summary": "Electronic CoC data exchange obligations apply from July 2026 for relevant type-approved vehicles/components.",
                "effective": "2026-07-01",
                "audience": "regulatory",
                "impact": "CoP / type-approval stubs track readiness only — no authority filing.",
            },
            {
                "id": "reg-battery-2027",
                "title": "EU battery passport",
                "summary": "Battery passport obligations phase in from February 2027 for in-scope batteries.",
                "effective": "2027-02-18",
                "audience": "regulatory",
                "impact": "Material/chemical family template tracks readiness; not a live passport issuer.",
            },
        ],
        "source": "docs/decisions.md + seeded stubs",
        "live_feed": False,
    }
