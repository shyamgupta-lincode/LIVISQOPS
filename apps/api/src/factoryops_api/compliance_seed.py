"""Idempotent automotive compliance & quality reporting seed."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from . import models

# Stable IDs — b=obligation, c=template, d=instance, e=deadline
def _oid(n: int) -> str:
    return f"bbbbbbbb-bbbb-7bbb-8bbb-{n:012d}"


def _tid(n: int) -> str:
    return f"cccccccc-cccc-7ccc-8ccc-{n:012d}"


def _iid(n: int) -> str:
    return f"dddddddd-dddd-7ddd-8ddd-{n:012d}"


def _did(n: int) -> str:
    return f"eeeeeeee-eeee-7eee-8eee-{n:012d}"


def _upsert(db: Session, model, id_: str, **kwargs):
    row = db.get(model, id_)
    if row:
        for k, v in kwargs.items():
            setattr(row, k, v)
        return row
    row = model(id=id_, **kwargs)
    db.add(row)
    return row


def _trail(actor: str, action: str, status: str, note: str = "") -> dict[str, Any]:
    return {
        "at": datetime.now(timezone.utc).isoformat(),
        "actor": actor,
        "actor_type": "seed",
        "action": action,
        "status": status,
        "note": note,
    }


def seed_compliance(
    db: Session,
    *,
    tenant_id: str,
    site_id: str,
    product_name: str = "Hybrid Gearbox Module",
    asset_bearing_id: str | None = None,
    order_id: str | None = None,
    lot_id: str | None = None,
    unit_id: str | None = None,
    quality_event_ids: list[str] | None = None,
    anomaly_ids: list[str] | None = None,
    id_offset: int = 0,
    demo_label: str = "Midwest Hybrid demo",
    default_country: str = "US",
    default_customer: str | None = None,
) -> dict[str, int]:
    """Upsert obligations, templates, instances, and calendar deadlines.

    ``id_offset`` shifts stable ID namespaces so additional tenants (e.g. Hero)
    do not collide with Midwest Hybrid rows.
    """
    now = datetime.now(timezone.utc)
    qe_ids = quality_event_ids or []
    anom_ids = anomaly_ids or []
    off = id_offset

    def oid(n: int) -> str:
        return _oid(n + off)

    def tid(n: int) -> str:
        return _tid(n + off)

    def iid(n: int) -> str:
        return _iid(n + off)

    def did(n: int) -> str:
        return _did(n + off)

    # ── Obligations (audience × family coverage) ──────────────────────────
    warranty_customer = default_customer or "Harley-Davidson"
    score_customer = default_customer or "GM"
    lpa_customer = default_customer or "Ford"
    obligations = [
        (oid(1), "OBL-QMS-MR", "QMS management review pack", "internal", "qms",
         default_country, None, "annual", "IATF 16949 management review evidence", ["ISO 9001:2015+Amd1:2024", "IATF 16949:2016"], "quality_manager", "Medium"),
        (oid(2), "OBL-LPA", "Layered process audit cadence", "internal", "qms",
         default_country, lpa_customer, "monthly", "Layered process audit evidence", ["IATF 16949", "Plant CSR"], "quality_engineer", "Medium"),
        (oid(3), "OBL-SCORE", "Customer quality scorecard", "customer", "qms",
         default_country, score_customer, "monthly", "Customer scorecard submission", ["OEM CSR"], "customer_quality", "High"),
        (oid(4), "OBL-CERT", "Certificate status register", "customer", "qms",
         default_country, None, "on_change", "IATF / ISO certificate validity for OEMs", ["IATF 16949", "ISO 9001"], "compliance", "High"),
        (oid(5), "OBL-PPAP", "PPAP / PSW package", "customer", "ppap",
         default_country, lpa_customer, "event", "Level 3 PPAP for model-year change", ["AIAG PPAP 4th"], "quality_engineer", "High"),
        (oid(6), "OBL-DAILY-Q", "Daily plant quality report", "internal", "manufacturing",
         default_country, None, "daily", "PPM, FPY, holds, containment", ["Plant QMS"], "quality_engineer", "Low"),
        (oid(7), "OBL-SPC", "SPC / capability summary", "internal", "manufacturing",
         default_country, default_customer, "weekly", "Cp/Cpk for critical characteristics", ["AIAG SPC"], "quality_engineer", "Medium"),
        (oid(8), "OBL-8D", "Customer 8D / problem-solving", "customer", "problem_solving",
         default_country, lpa_customer, "event", "8D when customer issues scorecard alert", ["8D", "CSR"], "quality_manager", "High"),
        (oid(9), "OBL-SCAR", "Supplier SCAR / controlled shipping", "customer", "supplier",
         default_country, None, "event", "SCAR closure + CS1/CS2 evidence", ["IATF 8.4", "OEM CSR"], "quality_engineer", "High"),
        (oid(10), "OBL-WARRANTY", "Warranty claims emerging-issue pack", "internal", "warranty",
         default_country, warranty_customer, "monthly", "Field claims trend + emerging issue", ["Warranty SOP"], "quality_manager", "Medium"),
        (oid(11), "OBL-EWR", "NHTSA Early Warning Reporting (stub)", "regulatory", "us_regulatory",
         "US", None, "quarterly", "EWR quarterly aggregate — local stub only", ["49 CFR 579"], "regulatory", "Critical"),
        (oid(12), "OBL-FMVSS", "FMVSS evidence matrix (stub)", "regulatory", "us_regulatory",
         "US", None, "on_change", "FMVSS applicability evidence matrix", ["FMVSS"], "regulatory", "High"),
        (oid(13), "OBL-573", "Part 573 recall notice (stub)", "regulatory", "us_regulatory",
         "US", None, "event", "Draft Part 573 package — not filed externally", ["49 CFR 573"], "regulatory", "Critical"),
        (oid(14), "OBL-COP", "EU type approval / CoP (stub)", "regulatory", "eu_unece",
         "EU", None, "annual", "CoP evidence; eCoC electronic data from Jul 2026", ["EU 2018/858", "UNECE"], "compliance", "High"),
        (oid(15), "OBL-R155", "UNECE R155/R156 cyber & SUMS (stub)", "regulatory", "eu_unece",
         "EU", None, "annual", "CSMS / SUMS evidence stubs", ["UN R155", "UN R156"], "regulatory", "High"),
        (oid(16), "OBL-IMDS", "IMDS / REACH / SCIP / battery passport", "regulatory", "material",
         "EU", None, "on_change", "Material declarations; battery passport from Feb 2027", ["IMDS", "REACH", "SCIP", "EU Battery Reg"], "compliance", "High"),
        (oid(17), "OBL-PUBLIC", "Public sustainability / quality disclosure", "public", "qms",
         default_country, None, "annual", "Non-confidential quality KPIs for public summary", ["Corporate disclosure"], "compliance", "Low"),
    ]
    if default_country == "IN":
        obligations.append(
            (oid(18), "OBL-CMVR-AIS", "CMVR / AIS type-approval evidence (stub)", "regulatory", "in_regulatory",
             "IN", default_customer, "on_change",
             "Synthetic AIS/CMVR evidence stubs for 2W OEM demo — not a filing channel",
             ["CMVR", "AIS"], "compliance", "High"),
        )

    for oid_, code, title, audience, family, country, customer, cadence, desc, refs, owner, risk in obligations:
        _upsert(
            db, models.ComplianceObligation, oid_,
            tenant_id=tenant_id, site_id=site_id, code=code, title=title,
            description=desc, audience=audience, family=family, country=country,
            customer=customer, product=product_name, model_year="2026",
            component="Spindle / gearbox assembly" if off == 0 else "Crankshaft / engine assembly",
            standard_refs=refs,
            effective_from=now - timedelta(days=365), cadence=cadence,
            status="active", risk=risk, owner_role=owner,
            props={"tier": "OEM demo" if off else "Tier 1 demo", "oem_vs_tier": "OEM" if off else "Tier 1", "demo_label": demo_label},
            updated_at=now,
        )
    db.flush()

    # ── Templates (one+ per major family; OEM-specific where relevant) ────
    templates = [
        (tid(1), "TPL-QMS-MR", "QMS Management Review Pack", "qms", "internal", None, "2024.1",
         ["Agenda", "KPI trends", "Audit findings", "CAPA aging", "Resource needs"], ["quality_event", "audit"]),
        (tid(2), "TPL-LPA", "LPA Evidence Pack", "qms", "internal", lpa_customer, "CSR-2025.2",
         ["Layer schedule", "Nonconformances", "Countermeasures"], ["inspection", "quality_event"]),
        (tid(3), "TPL-SCORE", "Customer Scorecard Response", "qms", "customer", score_customer, "BIQS-3.1",
         ["PPM", "Disruptions", "Warranty", "Containment"], ["quality_event", "genealogy"]),
        (tid(4), "TPL-CERT", "Certificate Status Snapshot", "qms", "customer", None, "1.2",
         ["Certificate list", "Expiry", "Scope", "CB notes"], []),
        (tid(5), "TPL-PPAP-PSW", "PSW / PPAP Level 3", "ppap", "customer", lpa_customer, "PPAP-4",
         ["PSW", "Control plan checklist", "Dim results", "MSA", "Submission level"], ["inspection", "genealogy"]),
        (tid(6), "TPL-DAILY", "Daily Plant Quality Report", "manufacturing", "internal", None, "1.0",
         ["PPM", "FPY", "Holds", "NCR", "Containment"], ["quality_event", "anomaly"]),
        (tid(7), "TPL-SPC", "SPC / Capability Summary", "manufacturing", "internal", default_customer, "1.1",
         ["Characteristic", "Cp/Cpk", "Control limits", "Outliers"], ["inspection"]),
        (tid(8), "TPL-NCR", "NCR / Containment Summary", "manufacturing", "internal", None, "1.0",
         ["NCR list", "Genealogy scope", "Calibration status"], ["quality_event", "genealogy"]),
        (tid(9), "TPL-8D", "8D Problem-Solving Draft", "problem_solving", "customer", lpa_customer, "8D-2.0",
         ["D0–D8", "Root cause", "Corrective action", "Prevention"], ["quality_event", "rca", "anomaly"]),
        (tid(10), "TPL-CAPA", "CAPA Effectiveness Pack", "problem_solving", "internal", None, "1.0",
         ["Problem", "CAPA", "Verification", "Recurrence"], ["quality_event", "rca"]),
        (tid(11), "TPL-SCAR", "Supplier SCAR Closure", "supplier", "customer", None, "1.0",
         ["SCAR", "PPM", "Controlled shipping", "Exit criteria"], ["quality_event"]),
        (tid(12), "TPL-CS", "Controlled Shipping Status", "supplier", "customer", score_customer, "CS-1.0",
         ["CS level", "Exit plan", "Defect Pareto"], ["inspection"]),
        (tid(13), "TPL-WARRANTY", "Warranty Claims Summary", "warranty", "internal", warranty_customer, "1.0",
         ["Claims", "Emerging issue", "Field actions"], ["quality_event"]),
        (tid(14), "TPL-EWR", "EWR Quarterly Stub (local)", "us_regulatory", "regulatory", None, "579-stub",
         ["Deaths/injuries", "Property damage", "Consumer complaints", "Warranty claims"], []),
        (tid(15), "TPL-FMVSS", "FMVSS Evidence Matrix Stub", "us_regulatory", "regulatory", None, "stub-1",
         ["Standard", "Applicability", "Test evidence refs"], ["inspection"]),
        (tid(16), "TPL-573", "Part 573 Recall Draft Stub", "us_regulatory", "regulatory", None, "stub-1",
         ["Defect description", "Risk", "Remedy", "Chronology"], ["genealogy", "quality_event"]),
        (tid(17), "TPL-COP", "EU CoP / Type Approval Stub", "eu_unece", "regulatory", None, "stub-2026",
         ["Type approval", "CoP plan", "eCoC readiness"], ["inspection"]),
        (tid(18), "TPL-R155", "UN R155/R156 Evidence Stub", "eu_unece", "regulatory", None, "stub-1",
         ["CSMS", "SUMS", "Threat analysis refs"], []),
        (tid(19), "TPL-IMDS", "IMDS/REACH/SCIP/Battery Passport Stub", "material", "regulatory", None, "stub-2027",
         ["IMDS MDS", "REACH SVHC", "SCIP", "Battery passport readiness"], []),
    ]

    for tpl_id, code, name, family, audience, customer, version, sections, evid in templates:
        _upsert(
            db, models.ReportTemplate, tpl_id,
            tenant_id=tenant_id, code=code, name=name, family=family,
            audience=audience, customer=customer, version=version,
            description=f"{name} — versioned template for {demo_label}",
            sections=[{"id": s.lower().replace(" ", "_"), "title": s} for s in sections],
            required_evidence_kinds=evid, status="active",
            props={"demo": True, "demo_label": demo_label}, updated_at=now,
        )
    db.flush()

    # Link first open/closed quality event for problem-solving evidence
    primary_qe = qe_ids[0] if qe_ids else None
    evid_qe = (
        [{"kind": "quality_event", "id": primary_qe, "label": "Seeded quality event"}]
        if primary_qe else []
    )
    evid_anom = (
        [{"kind": "anomaly", "id": anom_ids[0], "label": "Vibration anomaly"}]
        if anom_ids else []
    )
    evid_gene = []
    if lot_id:
        evid_gene.append({"kind": "genealogy", "id": lot_id, "label": lot_id})
    if unit_id:
        evid_gene.append({"kind": "genealogy", "id": unit_id, "label": unit_id})
    if asset_bearing_id:
        evid_gene.append({"kind": "asset", "id": asset_bearing_id, "label": "Critical bearing station"})

    def inst(
        n: int, tpl: str, obl: str | None, title: str, family: str, audience: str,
        customer: str | None, status: str, period: str, due_days: int,
        summary: str, payload: dict, evidence: list, ai: bool = False,
        filing: str = "none", owner: str = "quality_manager",
    ):
        due = now + timedelta(days=due_days)
        trail = [_trail("seed", "created", "DRAFT", "Idempotent demo seed")]
        if status != "DRAFT":
            trail.append(_trail("qe@factoryops.local", "validated", "VALIDATED"))
        if status in ("APPROVED", "SUBMITTED", "ACCEPTED", "REJECTED", "AMENDED"):
            trail.append(_trail("qm@factoryops.local", "approved", "APPROVED"))
        if status in ("SUBMITTED", "ACCEPTED", "REJECTED"):
            trail.append(_trail("qm@factoryops.local", "submitted", "SUBMITTED", "Local portal stub — not filed externally"))
        if status == "ACCEPTED":
            trail.append(_trail("customer_portal_stub", "accepted", "ACCEPTED", "Demo acceptance only"))
        if status == "REJECTED":
            trail.append(_trail("customer_portal_stub", "rejected", "REJECTED", "Demo rejection"))
        if status == "AMENDED":
            trail.append(_trail("qe@factoryops.local", "amended", "AMENDED"))
        submitted = due - timedelta(days=2) if status in ("SUBMITTED", "ACCEPTED", "REJECTED") else None
        _upsert(
            db, models.ReportInstance, iid(n),
            tenant_id=tenant_id, site_id=site_id, template_id=tpl,
            obligation_id=obl, title=title, family=family, audience=audience,
            customer=customer, status=status, version=1 if status != "AMENDED" else 2,
            period_label=period, due_at=due, submitted_at=submitted,
            owner_role=owner, ai_draft=ai, filing_channel=filing,
            external_ref=None if filing in ("none", "stub") else f"DEMO-{n:04d}",
            summary=summary, payload=payload, evidence_links=evidence,
            audit_trail=trail, rejection_reason="Incomplete dimensional results" if status == "REJECTED" else None,
            updated_at=now,
        )

    # Instances — at least one per major family
    inst(1, tid(1), oid(1), "Q2 Management Review Pack", "qms", "internal", None,
         "APPROVED", "2026-Q2", 14,
         f"Management review draft covering FPY, open CAPA, and bearing risk ({demo_label}).",
         {"fpy": 0.972, "open_capa": 3, "critical_audits": 1},
         evid_qe + evid_anom, owner="quality_manager")
    inst(2, tid(2), oid(2), f"{lpa_customer or 'Plant'} LPA — June layered audits", "qms", "internal", lpa_customer,
         "VALIDATED", "2026-06", 5,
         "LPA nonconformances and countermeasures for primary assembly.",
         {"layers_completed": 12, "nc_open": 2}, evid_qe, owner="quality_engineer")
    inst(3, tid(3), oid(3), f"{score_customer or 'Customer'} scorecard response — May", "qms", "customer", score_customer,
         "SUBMITTED", "2026-05", -3,
         "Customer scorecard response with PPM and disruption narrative.",
         {"ppm": 42, "disruptions": 1}, evid_qe + evid_gene, filing="portal", owner="customer_quality")
    inst(4, tid(4), oid(4), f"Certificate status — {demo_label}", "qms", "customer", None,
         "ACCEPTED", "2026", 60,
         "IATF 16949 and ISO 9001 certificate validity snapshot.",
         {"iatf_expiry": (now + timedelta(days=180)).date().isoformat(), "iso_expiry": (now + timedelta(days=200)).date().isoformat()},
         [], filing="email", owner="compliance")
    inst(5, tid(5), oid(5), f"PPAP Level 3 — {product_name}", "ppap", "customer", lpa_customer,
         "DRAFT", "MY2026", 21,
         f"PSW + control plan checklist in progress for {product_name}.",
         {"submission_level": 3, "psw_complete": False, "control_plan_pct": 70},
         evid_gene, owner="quality_engineer")
    inst(6, tid(6), oid(6), "Daily plant quality — today", "manufacturing", "internal", None,
         "DRAFT", now.date().isoformat(), 0,
         "Live daily quality summary from plant KPIs and open events.",
         {"source": "plant_overview"}, evid_qe + evid_anom, owner="quality_engineer")
    inst(7, tid(7), oid(7), "SPC capability — critical characteristics", "manufacturing", "internal", default_customer,
         "VALIDATED", "2026-W32", 7,
         "Cp/Cpk for dimensional characteristics on primary lines.",
         {"characteristics": [{"name": "bearing_bore", "cpk": 1.21}, {"name": "runout", "cpk": 0.98}]},
         [], owner="quality_engineer")
    inst(8, tid(8), oid(6), "NCR / containment — bearing wear lot", "manufacturing", "internal", None,
         "APPROVED", "LOT-SEED", 3,
         "Containment and genealogy for bearing vibration trend lot.",
         {"containment": "Hold seeded lot", "units_suspect": 42},
         evid_qe + evid_gene, owner="quality_engineer")
    inst(9, tid(9), oid(8), "8D draft — bearing dimensional drift", "problem_solving", "customer", lpa_customer,
         "DRAFT", "QE-linked", 10,
         "AI-assisted 8D draft linked to quality event — requires human approval before customer send.",
         {"d3_containment": "Hold lot", "d4_root_cause": "Pending confirmation"},
         evid_qe + evid_anom + evid_gene, ai=True, owner="quality_manager")
    inst(10, tid(10), oid(8), "CAPA pack — lubrication starvation", "problem_solving", "internal", None,
         "VALIDATED", "CAPA-SEED-01", 12,
         "CAPA effectiveness evidence from closed historical events.",
         {"effectiveness_window_days": 30}, evid_qe, owner="quality_manager")
    inst(11, tid(11), oid(9), "SCAR-118 closure — seal supplier", "supplier", "customer", None,
         "SUBMITTED", "SCAR-118", 2,
         "Supplier SCAR closure with PPM recovery plan.",
         {"supplier": "SealCo", "ppm_before": 210, "ppm_after": 45},
         evid_qe, filing="portal", owner="quality_engineer")
    inst(12, tid(12), oid(9), f"{score_customer or 'OEM'} controlled shipping CS1 status", "supplier", "customer", score_customer,
         "DRAFT", "CS1-2026", 8,
         "CS1 exit criteria tracking — not yet customer-submitted.",
         {"cs_level": "CS1", "exit_ready": False}, [], owner="customer_quality")
    inst(13, tid(13), oid(10), f"Warranty emerging issue — {warranty_customer}", "warranty", "internal", warranty_customer,
         "DRAFT", "2026-07", 15,
         "Emerging field noise claims correlated with vibration trend.",
         {"claims_30d": 6, "emerging": True}, evid_qe + evid_anom, owner="quality_manager")
    inst(14, tid(14), oid(11), "EWR Q2 2026 stub (not filed)", "us_regulatory", "regulatory", None,
         "DRAFT", "2026-Q2", 25,
         "Local EWR aggregate stub. Does not transmit to NHTSA.",
         {"filed_externally": False, "channel": "local_stub_only"},
         [], filing="stub", owner="regulatory")
    inst(15, tid(15), oid(12), "FMVSS evidence matrix stub", "us_regulatory", "regulatory", None,
         "DRAFT", "2026", 40,
         "Applicability matrix stub — no regulatory attestation claimed.",
         {"standards": ["FMVSS 105", "FMVSS 135"], "filed_externally": False},
         [], filing="stub", owner="regulatory")
    inst(16, tid(16), oid(13), "Part 573 draft stub — inactive", "us_regulatory", "regulatory", None,
         "DRAFT", "n/a", 90,
         "Empty Part 573 scaffold for process training. Not a recall filing.",
         {"filed_externally": False, "recall_active": False},
         evid_gene, filing="stub", owner="regulatory")
    inst(17, tid(17), oid(14), "EU CoP annual stub — eCoC readiness", "eu_unece", "regulatory", None,
         "DRAFT", "2026", 50,
         "CoP evidence stub noting electronic CoC data obligation from Jul 2026.",
         {"ecoc_electronic_from": "2026-07-01", "filed_externally": False},
         [], filing="stub", owner="compliance")
    inst(18, tid(18), oid(15), "R155/R156 CSMS-SUMS stub", "eu_unece", "regulatory", None,
         "DRAFT", "2026", 55,
         "Cybersecurity and software-update evidence placeholders.",
         {"filed_externally": False}, [], filing="stub", owner="regulatory")
    inst(19, tid(19), oid(16), "IMDS + battery passport readiness", "material", "regulatory", None,
         "DRAFT", "2026/2027", 70,
         "Material declaration status; battery passport obligation from Feb 2027.",
         {"battery_passport_from": "2027-02-18", "imds_complete_pct": 88, "filed_externally": False},
         [], filing="stub", owner="compliance")
    inst(20, tid(3), oid(3), f"{score_customer or 'Customer'} scorecard — rejected revision", "qms", "customer", score_customer,
         "REJECTED", "2026-04", -20,
         "Prior scorecard rejected for incomplete disruption narrative; amend in progress path.",
         {"ppm": 55}, evid_qe, filing="portal", owner="customer_quality")

    # Calendar deadlines
    deadlines = [
        (did(1), oid(11), iid(14), "EWR Q2 filing window closes", "ewr", "regulatory", 25, "regulatory"),
        (did(2), oid(4), iid(4), "IATF certificate surveillance", "cert", "customer", 180, "compliance"),
        (did(3), oid(1), iid(1), "CQI-9 annual special process", "cqi", "internal", 45, "quality_manager"),
        (did(4), oid(5), iid(5), "PPAP Level 3 due", "ppap", "customer", 21, "quality_engineer"),
        (did(5), oid(3), iid(3), "Customer scorecard monthly", "audit", "customer", 7, "customer_quality"),
        (did(6), oid(14), iid(17), "EU eCoC electronic data readiness", "regulatory", "regulatory", 50, "compliance"),
        (did(7), oid(16), iid(19), "Battery passport go-live (Feb 2027)", "regulatory", "regulatory", 200, "compliance"),
        (did(8), oid(8), iid(9), "8D customer response SLA", "audit", "customer", 10, "quality_manager"),
        (did(9), oid(9), iid(11), "SCAR-118 exit review", "audit", "customer", 2, "quality_engineer"),
        (did(10), oid(10), iid(13), "Warranty emerging-issue review", "other", "internal", 15, "quality_manager"),
    ]
    for deadline_id, obl, rid, title, kind, audience, due_days, owner in deadlines:
        due = now + timedelta(days=due_days)
        status = "overdue" if due_days < 0 else ("due" if due_days <= 7 else "upcoming")
        _upsert(
            db, models.ComplianceDeadline, deadline_id,
            tenant_id=tenant_id, site_id=site_id, obligation_id=obl,
            report_instance_id=rid, title=title, kind=kind, audience=audience,
            due_at=due, status=status, owner_role=owner,
            props={"demo": True, "demo_label": demo_label},
        )

    return {
        "obligations": len(obligations),
        "templates": len(templates),
        "instances": 20,
        "deadlines": len(deadlines),
    }
