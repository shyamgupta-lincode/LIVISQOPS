"""Idempotent Hero MotoCorp demo tenant seed (synthetic 2W OEM plant).

Creates a second tenant with a full Dharuhera-style plant comparable to Midwest
Hybrid — not a stub site label. All identifiers are stable for demo-reset.
Data is labeled as synthetic FactoryOps demo content, not proprietary OEM data.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from factoryops_config import get_settings
from factoryops_domain.ids import new_id

from . import models
from .compliance_seed import seed_compliance
from .context_graph_seed import seed_hero_context_graph

# Distinct ID namespace from Midwest STABLE (…111 / …222 / …).
HERO_STABLE = {
    "tenant": "11111111-1111-7111-8111-111111111211",
    "site": "22222222-2222-7222-8222-222222222211",
    "line1": "33333333-3333-7333-8333-333333333311",
    "line2": "33333333-3333-7333-8333-333333333312",
    "asset_bearing": "44444444-4444-7444-8444-444444444411",
    "fm_bearing": "55555555-5555-7555-8555-555555555511",
    "product": "66666666-6666-7666-8666-666666666611",
    "product2": "66666666-6666-7666-8666-666666666612",
    "order": "77777777-7777-7777-8777-777777777711",
    "lot": "88888888-8888-7888-8888-888888888811",
    "unit": "99999999-9999-7999-8999-999999999911",
    "anomaly": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaab01",
    "prediction": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaab02",
    "work_task": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaab03",
    "qe_open": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaab04",
    "conn_opcua": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaab01",
    "conn_mes": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaab02",
    "conn_qms": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaab03",
    "conn_cmms": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaab04",
}


def _upsert(db: Session, model, id_: str, **kwargs):
    row = db.get(model, id_)
    if row:
        for k, v in kwargs.items():
            setattr(row, k, v)
        return row
    row = model(id=id_, **kwargs)
    db.add(row)
    return row


def seed_hero_tenant(db: Session) -> dict:
    """Seed Hero MotoCorp tenant + Dharuhera plant; idempotent via stable IDs."""
    tenant = _upsert(
        db,
        models.Tenant,
        HERO_STABLE["tenant"],
        name="Hero MotoCorp (Demo)",
    )
    db.flush()
    site = _upsert(
        db,
        models.Site,
        HERO_STABLE["site"],
        tenant_id=tenant.id,
        name="Hero Dharuhera Vehicle Plant",
        code="HMC-DHR",
        timezone="Asia/Kolkata",
    )
    db.flush()

    line1 = _upsert(
        db,
        models.Line,
        HERO_STABLE["line1"],
        site_id=site.id,
        name="Splendor Final Assembly",
        takt_s=48,
    )
    line2 = _upsert(
        db,
        models.Line,
        HERO_STABLE["line2"],
        site_id=site.id,
        name="Engine Machining Line",
        takt_s=72,
    )
    db.flush()

    cells: list[models.Cell] = []
    cell_defs = [
        (1, line1.id, "Frame Join Cell"),
        (2, line1.id, "Powertrain Dress Cell"),
        (3, line1.id, "Final Fit & Torque Cell"),
        (4, line2.id, "Crankcase Machine Cell"),
        (5, line2.id, "Crankshaft Balance Cell"),
        (6, line2.id, "Engine Hot Test Cell"),
    ]
    for i, lid, name in cell_defs:
        cid = f"33333333-3333-7333-8333-33333333510{i}"
        cells.append(_upsert(db, models.Cell, cid, line_id=lid, name=name))
    db.flush()

    assets: list[models.Asset] = []
    for i, cell in enumerate(cells):
        for j in range(1, 4):
            is_critical = i == 4 and j == 1  # Crankshaft Balance Cell Asset 1
            aid = HERO_STABLE["asset_bearing"] if is_critical else f"44444444-4444-7444-8444-44444445{i+1:02d}{j}"
            name = (
                "Crankshaft Main Bearing Station"
                if is_critical
                else f"{cell.name} Asset {j}"
            )
            assets.append(
                _upsert(
                    db,
                    models.Asset,
                    aid,
                    cell_id=cell.id,
                    name=name,
                    asset_type="equipment",
                    criticality="High",
                    health_index=0.68 if is_critical else 0.93,
                    operating_state="Running",
                )
            )
    db.flush()

    fm = _upsert(
        db,
        models.FailureMode,
        HERO_STABLE["fm_bearing"],
        asset_id=HERO_STABLE["asset_bearing"],
        code="crankshaft_bearing_wear",
        name="Crankshaft main bearing wear",
        horizon_hours=96,
        run_to_failure_history=False,
    )
    product = _upsert(
        db,
        models.Product,
        HERO_STABLE["product"],
        tenant_id=tenant.id,
        name="Splendor+ 110 (Demo)",
        revision="C",
    )
    _upsert(
        db,
        models.Product,
        HERO_STABLE["product2"],
        tenant_id=tenant.id,
        name="Xtreme 160R (Demo)",
        revision="B",
    )
    db.flush()
    order = _upsert(
        db,
        models.ProductionOrder,
        HERO_STABLE["order"],
        site_id=site.id,
        product_id=product.id,
        external_id="HMC-WO-CB-2401",
        status="Released",
        qty=480,
    )
    db.flush()
    lot = _upsert(db, models.Lot, HERO_STABLE["lot"], order_id=order.id, code="LOT-HMC-CB-088")
    db.flush()
    unit = _upsert(
        db,
        models.SerialUnit,
        HERO_STABLE["unit"],
        lot_id=lot.id,
        serial="HMC-UNIT-CB-00088",
        status="InProcess",
    )
    db.flush()

    users = [
        ("op.hero@heromotocorp.demo", "Priya Operator", "operator"),
        ("qe.hero@heromotocorp.demo", "Arjun Quality Engineer", "quality_engineer"),
        ("qm.hero@heromotocorp.demo", "Neha Quality Manager", "quality_manager"),
        ("mt.hero@heromotocorp.demo", "Vikram Maintenance", "maintenance_technician"),
        ("ks.hero@heromotocorp.demo", "Meera Knowledge Steward", "knowledge_steward"),
        ("admin.hero@heromotocorp.demo", "Ananya Admin", "admin"),
        ("compliance.hero@heromotocorp.demo", "Rohan Compliance", "compliance"),
    ]
    for email, name, role in users:
        existing = db.query(models.User).filter(models.User.email == email).one_or_none()
        if existing:
            existing.role = role
            existing.site_id = site.id
            existing.name = name
        else:
            db.add(
                models.User(
                    id=new_id(),
                    email=email,
                    name=name,
                    role=role,
                    site_id=site.id,
                    password_hash="demo",
                )
            )

    # Approved knowledge cases (stable IDs; tenant-scoped)
    causes = [
        ("crankshaft_bearing_wear", "Main journal scoring from lubrication starvation", True),
        ("crankshaft_bearing_wear", "Shell crush loss after improper torque", True),
        ("piston_clearance", "Cylinder bore ovality after hone drift", False),
        ("chain_tension", "Cam chain tensioner fatigue", False),
        ("paint_orange_peel", "Booth humidity excursion (irrelevant to bearing)", False),
        ("crankshaft_bearing_wear", "Contamination after filter bypass", True),
        ("sensor_fault", "Knock sensor bias mimicking vibration (counter-example)", False),
        ("torque_gun_drift", "Wheel-nut torque tool calibration lag", False),
    ]
    for i, (code, cause, similar) in enumerate(causes):
        kid = f"a1111111-1111-7111-8111-1111111120{i+1:02d}"
        _upsert(
            db,
            models.KnowledgeCase,
            kid,
            tenant_id=tenant.id,
            title=f"Hero demo case {i+1}: {code}",
            problem="Elevated crankshaft vibration and oil temperature on machining / hot-test path",
            confirmed_cause=cause,
            corrective_action="Inspect/replace main bearings; restore lubrication; verify crush and alignment",
            effectiveness="No recurrence 30d" if similar else "Partial",
            applicability={
                "asset_type": "crankshaft_balance",
                "failure_mode": code,
                "similar_to_crankshaft_bearing_wear": similar,
                "plant": "HMC-DHR",
                "synthetic_demo": True,
            },
            status="approved",
            version=1,
            source_event_ids=[],
            embedding_text=f"{code} {cause} crankshaft vibration temperature torque Hero Dharuhera",
        )

    graph_stats = seed_hero_context_graph(
        db,
        tenant=tenant,
        site=site,
        line1=line1,
        line2=line2,
        cells=cells,
        assets=assets,
        product=product,
        order=order,
        lot=lot,
        unit=unit,
        failure_mode=fm,
        asset_bearing_id=HERO_STABLE["asset_bearing"],
    )

    # 90-day summarized history on critical asset
    hist_marker = (
        db.query(models.SignalSample)
        .filter(
            models.SignalSample.asset_id == HERO_STABLE["asset_bearing"],
            models.SignalSample.signal == "vibration_mm_s_daily",
        )
        .count()
    )
    if hist_marker < 90:
        now = datetime.now(timezone.utc)
        for d in range(90):
            ts = now - timedelta(days=89 - d)
            vib = 1.6 + (d / 90.0) * 1.5 + (0.06 if d % 8 == 0 else 0.0)
            db.add(
                models.SignalSample(
                    id=new_id(),
                    asset_id=HERO_STABLE["asset_bearing"],
                    signal="vibration_mm_s_daily",
                    value=vib,
                    unit="mm/s",
                    quality="good",
                    observed_at=ts,
                )
            )
            if d % 10 == 0:
                db.add(
                    models.QualityEvent(
                        id=new_id(),
                        tenant_id=tenant.id,
                        site_id=site.id,
                        status="CLOSED",
                        severity="Medium" if d < 70 else "High",
                        characteristic="Crankshaft bearing vibration trend (synthetic demo)",
                        measured_value=vib,
                        units="mm/s",
                        specification="<= 4.2 mm/s RMS",
                        origin="rule",
                        asset_id=HERO_STABLE["asset_bearing"],
                        order_id=order.id,
                        lot_id=lot.id,
                        unit_id=unit.id,
                        line_id=line2.id,
                        owner_role="quality_engineer",
                        containment="Segregated suspect engines for re-check",
                        disposition="Rework",
                        rca_summary="Lubrication / main bearing wear trend (seed history)",
                        corrective_action="Oil system flush; schedule bearing PM",
                        effectiveness="Accepted",
                        opened_at=ts,
                        closed_at=ts + timedelta(hours=10),
                        updated_at=ts + timedelta(hours=10),
                    )
                )

    now = datetime.now(timezone.utc)
    # Open degradation scenario (analogous to Midwest bearing_wear)
    _upsert(
        db,
        models.Anomaly,
        HERO_STABLE["anomaly"],
        site_id=site.id,
        asset_id=HERO_STABLE["asset_bearing"],
        signal="vibration_mm_s",
        severity="High",
        confidence=0.86,
        status="Open",
        features={
            "robust_z": 4.1,
            "ewma": 3.4,
            "demo_scenario": "crankshaft_bearing_wear",
            "synthetic_demo": True,
        },
        baseline_version="hero-v1",
        model_version="iforest-crank-bearing-v1",
        evidence_ref=f"minio://evidence/hero/{HERO_STABLE['anomaly']}",
        created_at=now - timedelta(hours=6),
    )
    _upsert(
        db,
        models.Prediction,
        HERO_STABLE["prediction"],
        asset_id=HERO_STABLE["asset_bearing"],
        failure_mode_id=fm.id,
        health_index=0.68,
        probability_in_horizon=0.62,
        horizon_hours=96,
        model_version="bearing-degrade-hero-v1",
        status="Open",
        created_at=now - timedelta(hours=5),
    )
    qe_open = _upsert(
        db,
        models.QualityEvent,
        HERO_STABLE["qe_open"],
        tenant_id=tenant.id,
        site_id=site.id,
        status="INVESTIGATION",
        version=2,
        severity="High",
        characteristic="Crankshaft main bearing vibration vs specification",
        measured_value=4.6,
        units="mm/s",
        specification="<= 4.2 mm/s RMS",
        origin="model",
        product_id=product.id,
        order_id=order.id,
        lot_id=lot.id,
        unit_id=unit.id,
        asset_id=HERO_STABLE["asset_bearing"],
        line_id=line2.id,
        owner_role="quality_engineer",
        containment="Hold LOT-HMC-CB-088 pending dimensional recheck",
        disposition=None,
        rca_summary=None,
        corrective_action=None,
        effectiveness=None,
        context={
            "failure_mode": "crankshaft_bearing_wear",
            "product": product.name,
            "synthetic_demo": True,
            "plant": "HMC-DHR",
        },
        affected_scope={"lot_id": lot.id, "unit_id": unit.id},
        opened_at=now - timedelta(hours=5),
        updated_at=now - timedelta(hours=1),
    )
    _upsert(
        db,
        models.WorkTask,
        HERO_STABLE["work_task"],
        site_id=site.id,
        title="Inspect crankshaft main bearings (Hero demo)",
        status="Accepted",
        priority="High",
        role="maintenance_technician",
        source_event_id=qe_open.id,
        asset_id=HERO_STABLE["asset_bearing"],
        due_at=now + timedelta(hours=18),
        evidence=[],
        finding=None,
        created_at=now - timedelta(hours=4),
    )

    # Site-scoped connectors (synthetic endpoints)
    if hasattr(models, "IntegrationConnector"):
        settings = get_settings()
        sim = getattr(settings, "connector_sim_base_url", None) or "http://api:8000"
        sim = str(sim).rstrip("/")
        connectors = [
            (
                HERO_STABLE["conn_opcua"],
                "Dharuhera OPC UA (crankshaft)",
                "opc_ua",
                f"{sim}/api/v1/connector-sim/opcua",
                "secret:demo-hero-opcua-token",
                {
                    "security_mode": "None",
                    "security_policy": "None",
                    "node_ids": [
                        "ns=2;s=Crank.Vibration",
                        "ns=2;s=Crank.Temperature",
                        "ns=2;s=Crank.Torque",
                    ],
                    "allow_local_substitute": True,
                    "http_bridge_url": f"{sim}/api/v1/connector-sim/opcua",
                    "protocol_profile": "OPC UA 1.05",
                    "plant": "HMC-DHR",
                },
                "Hero Dharuhera OPC UA bridge substitute (synthetic demo).",
            ),
            (
                HERO_STABLE["conn_mes"],
                "Hero MES REST (Dharuhera)",
                "mes_rest",
                f"{sim}/api/v1/connector-sim/mes",
                "secret:demo-hero-mes-token",
                {"auth_kind": "bearer", "api_version": "2024-06", "plant": "HMC-DHR"},
                "Hero plant MES orders / lots / genealogy (synthetic).",
            ),
            (
                HERO_STABLE["conn_qms"],
                "Hero QMS REST (Dharuhera)",
                "qms_rest",
                f"{sim}/api/v1/connector-sim/qms",
                "secret:demo-hero-qms-token",
                {"auth_kind": "bearer", "api_version": "3.2.1", "plant": "HMC-DHR"},
                "Hero QMS NCR / inspection contract (synthetic).",
            ),
            (
                HERO_STABLE["conn_cmms"],
                "Hero CMMS REST (Dharuhera)",
                "cmms_rest",
                f"{sim}/api/v1/connector-sim/cmms",
                "secret:demo-hero-cmms-token",
                {"auth_kind": "bearer", "api_version": "2.8.0", "plant": "HMC-DHR"},
                "Hero CMMS work orders / findings (synthetic).",
            ),
        ]
        for cid, name, kind, url, secret_ref, cfg, desc in connectors:
            existing = db.get(models.IntegrationConnector, cid)
            if existing:
                existing.name = name
                existing.endpoint_url = url
                existing.secret_ref = secret_ref
                existing.config = cfg
                existing.description = desc
                existing.site_id = site.id
                existing.tenant_id = tenant.id
            else:
                db.add(
                    models.IntegrationConnector(
                        id=cid,
                        tenant_id=tenant.id,
                        site_id=site.id,
                        name=name,
                        kind=kind,
                        status="unknown",
                        endpoint_url=url,
                        secret_ref=secret_ref,
                        config=cfg,
                        enabled=True,
                        description=desc,
                    )
                )

    qe_ids = [
        r.id
        for r in db.query(models.QualityEvent)
        .filter(models.QualityEvent.site_id == site.id)
        .order_by(models.QualityEvent.opened_at.desc())
        .limit(5)
        .all()
    ]
    anom_ids = [
        r.id
        for r in db.query(models.Anomaly).filter(models.Anomaly.site_id == site.id).limit(5).all()
    ]
    compliance_stats = seed_compliance(
        db,
        tenant_id=tenant.id,
        site_id=site.id,
        product_name=product.name,
        asset_bearing_id=HERO_STABLE["asset_bearing"],
        order_id=order.id,
        lot_id=lot.id,
        unit_id=unit.id,
        quality_event_ids=qe_ids,
        anomaly_ids=anom_ids,
        id_offset=1000,
        demo_label="Hero Dharuhera synthetic demo",
        default_country="IN",
        default_customer="Hero MotoCorp",
    )

    return {
        "tenant": tenant.id,
        "site": site.id,
        "bearing_asset": HERO_STABLE["asset_bearing"],
        "lines": 2,
        "cells": len(cells),
        "assets": len(assets),
        "products": 2,
        "knowledge_cases": len(causes),
        "users": len(users),
        "graph": graph_stats,
        "compliance": compliance_stats,
        "open_quality_event": HERO_STABLE["qe_open"],
    }
