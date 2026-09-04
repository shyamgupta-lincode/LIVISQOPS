"""Idempotent Lam Research demo tenant seed (synthetic semiconductor cap-equipment plant).

Creates a third tenant with Fremont Chamber Ops — etch/deposition chamber module
assembly, tool serial genealogy (TOOL-LR- / CHM-LR-), and fab-ship quality scenarios.
All identifiers are stable for demo-reset. Data is synthetic FactoryOps demo content.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from factoryops_config import get_settings
from factoryops_domain.ids import new_id

from . import models
from .compliance_seed import seed_compliance
from .context_graph_seed import seed_lam_context_graph

# Distinct ID namespace from Midwest (…111) and Hero (…211).
LAM_STABLE = {
    "tenant": "11111111-1111-7111-8111-111111111311",
    "site": "22222222-2222-7222-8222-222222222311",
    "line1": "33333333-3333-7333-8333-333333333311",
    "line2": "33333333-3333-7333-8333-333333333312",
    "line3": "33333333-3333-7333-8333-333333333313",
    "line4": "33333333-3333-7333-8333-333333333314",
    "asset_gas_seal": "44444444-4444-7444-8444-444444443311",
    "fm_gas_seal": "55555555-5555-7555-8555-555555553311",
    "product": "66666666-6666-7666-8666-666666666311",
    "product2": "66666666-6666-7666-8666-666666666312",
    "product3": "66666666-6666-7666-8666-666666666313",
    "order": "77777777-7777-7777-8777-777777777311",
    "order2": "77777777-7777-7777-8777-777777777312",
    "order3": "77777777-7777-7777-8777-777777777313",
    "lot": "88888888-8888-7888-8888-888888888311",
    "unit": "99999999-9999-7999-8999-999999999311",
    "anomaly": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaac01",
    "prediction": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaac02",
    "work_task": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaac03",
    "qe_open": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaac04",
    "qe_containment": "aaaaaaaa-aaaa-7aaa-9aaa-aaaaaaaaac05",
    "conn_opcua": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaac01",
    "conn_mes": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaac02",
    "conn_qms": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaac03",
    "conn_cmms": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaac04",
}

STATION_ASSETS: dict[str, list[tuple[str, str, str]]] = {
    "Chamber Shell Line": [
        ("Shell CNC Mill", "equipment", "Medium"),
        ("Plasma Spray Coat", "equipment", "Medium"),
        ("Shell Vision Check", "vision", "High"),
        ("Chamber Serial Mark", "equipment", "Low"),
    ],
    "RF Generator Line": [
        ("RF Board Populate", "equipment", "Medium"),
        ("RF Module Bond", "equipment", "High"),
        ("Connector Pin Check", "vision", "High"),
        ("RF Sweep Bench", "equipment", "Medium"),
    ],
    "Etch Module Line": [
        ("Electrode Install", "equipment", "High"),
        ("Chamber Marriage", "equipment", "High"),
        ("Gas Box Seal", "equipment", "Critical"),
        ("Config Label / Tool Serial", "equipment", "Medium"),
    ],
    "System Test Line": [
        ("Helium Leak Check", "sensor", "Critical"),
        ("Process Recipe Dry Run", "equipment", "High"),
        ("CMM Metrology Sample", "vision", "High"),
        ("Pack & Ship Scan", "equipment", "Medium"),
    ],
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


def seed_lam_tenant(db: Session) -> dict:
    """Seed Lam Research tenant + Fremont Chamber Ops; idempotent via stable IDs."""
    tenant = _upsert(
        db,
        models.Tenant,
        LAM_STABLE["tenant"],
        name="Lam Research (Demo)",
    )
    db.flush()
    site = _upsert(
        db,
        models.Site,
        LAM_STABLE["site"],
        tenant_id=tenant.id,
        name="Lam Research · Fremont Chamber Ops",
        code="LR-FCO",
        timezone="America/Los_Angeles",
    )
    db.flush()

    line_defs = [
        (LAM_STABLE["line1"], "Chamber Shell Line", 180),
        (LAM_STABLE["line2"], "RF Generator Line", 150),
        (LAM_STABLE["line3"], "Etch Module Line", 240),
        (LAM_STABLE["line4"], "System Test Line", 300),
    ]
    lines: list[models.Line] = []
    for lid, name, takt in line_defs:
        lines.append(_upsert(db, models.Line, lid, site_id=site.id, name=name, takt_s=takt))
    db.flush()

    cells: list[models.Cell] = []
    for i, (_lid, lname, _takt) in enumerate(line_defs):
        cid = f"33333333-3333-7333-8333-33333333531{i + 1}"
        cells.append(_upsert(db, models.Cell, cid, line_id=lines[i].id, name=f"{lname} Cell"))
    db.flush()

    assets: list[models.Asset] = []
    for cell_idx, cell in enumerate(cells):
        line_name = line_defs[cell_idx][1]
        for asset_idx, (name, asset_type, criticality) in enumerate(STATION_ASSETS[line_name]):
            is_critical = name == "Gas Box Seal"
            aid = LAM_STABLE["asset_gas_seal"] if is_critical else (
                f"44444444-4444-7444-8444-44444444{cell_idx + 1}{asset_idx + 1:02d}"
            )
            health = 0.61 if is_critical else (0.88 if criticality == "Critical" else 0.94)
            state = "Faulted" if is_critical else "Running"
            assets.append(
                _upsert(
                    db,
                    models.Asset,
                    aid,
                    cell_id=cell.id,
                    name=name,
                    asset_type=asset_type,
                    criticality=criticality,
                    health_index=health,
                    operating_state=state,
                )
            )
    db.flush()

    fm = _upsert(
        db,
        models.FailureMode,
        LAM_STABLE["fm_gas_seal"],
        asset_id=LAM_STABLE["asset_gas_seal"],
        code="gas_box_seal_void",
        name="Gas box seal void / elevated helium leak",
        horizon_hours=72,
        run_to_failure_history=False,
    )

    product = _upsert(
        db,
        models.Product,
        LAM_STABLE["product"],
        tenant_id=tenant.id,
        name="Dielectric Etch Chamber Module",
        revision="Sense.i Gen3",
    )
    _upsert(
        db,
        models.Product,
        LAM_STABLE["product2"],
        tenant_id=tenant.id,
        name="Kiyo Conductor Etch Module",
        revision="KCE-2.1",
    )
    _upsert(
        db,
        models.Product,
        LAM_STABLE["product3"],
        tenant_id=tenant.id,
        name="VECTOR PECVD Chamber",
        revision="VEC-4.0",
    )
    db.flush()

    order = _upsert(
        db,
        models.ProductionOrder,
        LAM_STABLE["order"],
        site_id=site.id,
        product_id=product.id,
        external_id="WO-LR-7821",
        status="Released",
        qty=8,
    )
    _upsert(
        db,
        models.ProductionOrder,
        LAM_STABLE["order2"],
        site_id=site.id,
        product_id=LAM_STABLE["product2"],
        external_id="WO-LR-7815",
        status="Completed",
        qty=6,
    )
    _upsert(
        db,
        models.ProductionOrder,
        LAM_STABLE["order3"],
        site_id=site.id,
        product_id=LAM_STABLE["product3"],
        external_id="WO-LR-7830",
        status="Planned",
        qty=12,
    )
    db.flush()

    lot = _upsert(db, models.Lot, LAM_STABLE["lot"], order_id=order.id, code="LOT-LR-F18-044")
    db.flush()
    unit = _upsert(
        db,
        models.SerialUnit,
        LAM_STABLE["unit"],
        lot_id=lot.id,
        serial="TOOL-LR-9088",
        status="InProcess",
    )
    db.flush()

    users = [
        ("ops.lead@lamresearch.com", "Maya Chen", "production_supervisor"),
        ("raj.patel@lamresearch.com", "Raj Patel", "quality_manager"),
        ("qe.lam@lamresearch.com", "Lena Quality Engineer", "quality_engineer"),
        ("k.nakamura@lamresearch.com", "Ken Nakamura", "process_engineer"),
        ("mt.lam@lamresearch.com", "Alex Maintenance", "maintenance_technician"),
        ("ks.lam@lamresearch.com", "Sam Knowledge Steward", "knowledge_steward"),
        ("admin.lam@lamresearch.com", "Jordan Admin", "admin"),
        ("compliance.lam@lamresearch.com", "Taylor Compliance", "compliance"),
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

    causes = [
        ("gas_box_seal_void", "O-ring kit lot L-LR-441 seal void at gas-box interface", True),
        ("gas_box_seal_void", "Helium leak rate excursion after flange torque under-spec", True),
        ("helium_leak_elevated", "Particle residue on liner mimicking leak signature (counter)", False),
        ("electrode_flatness", "Upper electrode flatness out of CMM band after marriage", True),
        ("chamber_o_ring_nick", "Chamber O-ring nick at marriage station", True),
        ("rf_connector_bent", "RF connector pin bent at populate station (irrelevant to seal)", False),
        ("torque_under_spec", "Flange bolt torque under recipe on chamber marriage", True),
        ("particle_residue", "Particle residue on liner — unrelated to gas-box seal (negative)", False),
        ("sensor_fault", "He leak sensor drift mimicking void (counter-example)", False),
        ("gas_box_seal_void", "Cross-contamination from spray-coat overspray on seal face", True),
    ]
    for i, (code, cause, similar) in enumerate(causes):
        kid = f"a1111111-1111-7111-8111-1111111130{i + 1:02d}"
        _upsert(
            db,
            models.KnowledgeCase,
            kid,
            tenant_id=tenant.id,
            title=f"Lam demo case {i + 1}: {code}",
            problem="Elevated helium leak / gas-box seal void on Etch Module Line before fab ship",
            confirmed_cause=cause,
            corrective_action=(
                "Replace seal kit; re-torque flange per WI-LR-GAS-07; re-run helium leak cycle; "
                "quarantine O-ring lot L-LR-441 pending supplier review"
            ),
            effectiveness="No recurrence 30d" if similar else "Partial",
            applicability={
                "asset_type": "gas_box_seal",
                "failure_mode": code,
                "similar_to_gas_box_seal_void": similar,
                "plant": "LR-FCO",
                "customer": "Leading Foundry Fab 18",
                "synthetic_demo": True,
            },
            status="approved",
            version=1,
            source_event_ids=[],
            embedding_text=f"{code} {cause} helium leak gas box seal O-ring TOOL-LR CHM-LR Lam Fremont",
        )

    graph_stats = seed_lam_context_graph(
        db,
        tenant=tenant,
        site=site,
        lines=lines,
        cells=cells,
        assets=assets,
        product=product,
        order=order,
        lot=lot,
        unit=unit,
        failure_mode=fm,
        asset_gas_seal_id=LAM_STABLE["asset_gas_seal"],
    )

    hist_marker = (
        db.query(models.SignalSample)
        .filter(
            models.SignalSample.asset_id == LAM_STABLE["asset_gas_seal"],
            models.SignalSample.signal == "helium_leak_sccm_daily",
        )
        .count()
    )
    if hist_marker < 90:
        now = datetime.now(timezone.utc)
        for d in range(90):
            ts = now - timedelta(days=89 - d)
            leak = 1.2e-8 + (d / 90.0) * 4.5e-7 + (2e-7 if d > 75 else 0.0)
            db.add(
                models.SignalSample(
                    id=new_id(),
                    asset_id=LAM_STABLE["asset_gas_seal"],
                    signal="helium_leak_sccm_daily",
                    value=leak,
                    unit="sccm",
                    quality="good" if d < 78 else "degraded",
                    observed_at=ts,
                )
            )
            if d % 11 == 0:
                db.add(
                    models.QualityEvent(
                        id=new_id(),
                        tenant_id=tenant.id,
                        site_id=site.id,
                        status="CLOSED",
                        severity="Medium" if d < 70 else "High",
                        characteristic="Helium leak rate trend (synthetic demo)",
                        measured_value=leak,
                        units="sccm",
                        specification="<= 1.0e-8 sccm equiv",
                        origin="rule",
                        asset_id=LAM_STABLE["asset_gas_seal"],
                        order_id=order.id,
                        lot_id=lot.id,
                        unit_id=unit.id,
                        line_id=lines[2].id,
                        owner_role="quality_engineer",
                        containment="Hold module pending re-seal",
                        disposition="Rework",
                        rca_summary="Seal void / O-ring lot correlation (seed history)",
                        corrective_action="Replace seal kit; verify torque recipe",
                        effectiveness="Accepted",
                        opened_at=ts,
                        closed_at=ts + timedelta(hours=12),
                        updated_at=ts + timedelta(hours=12),
                    )
                )

    now = datetime.now(timezone.utc)
    _upsert(
        db,
        models.Anomaly,
        LAM_STABLE["anomaly"],
        site_id=site.id,
        asset_id=LAM_STABLE["asset_gas_seal"],
        signal="helium_leak_rate_sccm",
        severity="Critical",
        confidence=0.91,
        status="Open",
        features={
            "robust_z": 5.2,
            "ewma": 4.8,
            "seal_void_score": 0.87,
            "demo_scenario": "gas_box_seal_void",
            "o_ring_lot": "L-LR-441",
            "synthetic_demo": True,
        },
        baseline_version="lam-fco-v1",
        model_version="gas-box-seal-void@2.6",
        evidence_ref=f"minio://evidence/lam/{LAM_STABLE['anomaly']}",
        created_at=now - timedelta(hours=4),
    )
    _upsert(
        db,
        models.Prediction,
        LAM_STABLE["prediction"],
        asset_id=LAM_STABLE["asset_gas_seal"],
        failure_mode_id=fm.id,
        health_index=0.61,
        probability_in_horizon=0.74,
        horizon_hours=72,
        model_version="helium-leak-degrade-lam-v1",
        status="Open",
        created_at=now - timedelta(hours=3),
    )
    qe_containment = _upsert(
        db,
        models.QualityEvent,
        LAM_STABLE["qe_containment"],
        tenant_id=tenant.id,
        site_id=site.id,
        status="CONTAINMENT",
        version=2,
        severity="Critical",
        characteristic="Gas-box seal void cluster — O-ring lot L-LR-441",
        measured_value=0.87,
        units="void_score",
        specification="<= 0.15 void score",
        origin="model",
        product_id=product.id,
        order_id=order.id,
        lot_id=lot.id,
        unit_id=unit.id,
        asset_id=LAM_STABLE["asset_gas_seal"],
        line_id=lines[2].id,
        owner_role="quality_engineer",
        containment=(
            "Hold carriers E-020..E-028 at Gas Box Seal; block ASN for Leading Foundry Fab 18; "
            "NCR-LR-552 open"
        ),
        disposition=None,
        rca_summary=None,
        corrective_action=None,
        effectiveness=None,
        context={
            "failure_mode": "gas_box_seal_void",
            "defect_class": "Gas-box seal void",
            "o_ring_lot": "L-LR-441",
            "tool_serial": "TOOL-LR-9088",
            "chamber_serial": "CHM-LR-80880",
            "customer": "Leading Foundry Fab 18",
            "synthetic_demo": True,
        },
        affected_scope={"lot_id": lot.id, "unit_id": unit.id, "estimated_units": 8, "confirmed_units": 3},
        opened_at=now - timedelta(hours=8),
        updated_at=now - timedelta(hours=2),
    )
    qe_open = _upsert(
        db,
        models.QualityEvent,
        LAM_STABLE["qe_open"],
        tenant_id=tenant.id,
        site_id=site.id,
        status="INVESTIGATION",
        version=3,
        severity="Critical",
        characteristic="Helium leak rate high vs Sense.i Gen3 pass band",
        measured_value=3.8e-7,
        units="sccm",
        specification="<= 1.0e-8 sccm equiv",
        origin="model",
        product_id=product.id,
        order_id=order.id,
        lot_id=lot.id,
        unit_id=unit.id,
        asset_id=LAM_STABLE["asset_gas_seal"],
        line_id=lines[2].id,
        owner_role="quality_engineer",
        containment=qe_containment.containment,
        disposition=None,
        rca_summary=None,
        corrective_action=None,
        effectiveness=None,
        context={
            "failure_mode": "gas_box_seal_void",
            "related_event_id": LAM_STABLE["qe_containment"],
            "fab_po": "FAB-PO-920008",
            "ship_to": "Hsinchu Logic",
            "synthetic_demo": True,
        },
        affected_scope={"lot_id": lot.id, "unit_id": unit.id},
        opened_at=now - timedelta(hours=5),
        updated_at=now - timedelta(hours=1),
    )
    _upsert(
        db,
        models.WorkTask,
        LAM_STABLE["work_task"],
        site_id=site.id,
        title="Re-seal gas box & re-run helium spot check (Lam demo)",
        status="Accepted",
        priority="Critical",
        role="maintenance_technician",
        source_event_id=qe_open.id,
        asset_id=LAM_STABLE["asset_gas_seal"],
        due_at=now + timedelta(hours=12),
        evidence=[],
        finding=None,
        created_at=now - timedelta(hours=3),
    )

    if hasattr(models, "IntegrationConnector"):
        settings = get_settings()
        sim = getattr(settings, "connector_sim_base_url", None) or "http://api:8000"
        sim = str(sim).rstrip("/")
        connectors = [
            (
                LAM_STABLE["conn_opcua"],
                "Fremont OPC UA (gas box / helium)",
                "opc_ua",
                f"{sim}/api/v1/connector-sim/opcua",
                "secret:demo-lam-opcua-token",
                {
                    "security_mode": "SignAndEncrypt",
                    "security_policy": "Basic256Sha256",
                    "node_ids": [
                        "ns=2;s=GasBoxSeal.HeliumLeak",
                        "ns=2;s=GasBoxSeal.Pressure",
                        "ns=2;s=GasBoxSeal.SealVoidScore",
                        "ns=2;s=GasBoxSeal.FlangeTorque",
                    ],
                    "allow_local_substitute": True,
                    "http_bridge_url": f"{sim}/api/v1/connector-sim/opcua",
                    "protocol_profile": "OPC UA 1.05",
                    "plant": "LR-FCO",
                },
                "Lam Fremont OPC UA bridge substitute (synthetic demo).",
            ),
            (
                LAM_STABLE["conn_mes"],
                "Lam MES REST (Fremont)",
                "mes_rest",
                f"{sim}/api/v1/connector-sim/mes",
                "secret:demo-lam-mes-token",
                {
                    "auth_kind": "bearer",
                    "api_version": "2024-06",
                    "plant": "LR-FCO",
                    "serial_prefixes": ["TOOL-LR-", "CHM-LR-"],
                },
                "Lam plant MES orders / tool serial genealogy (synthetic).",
            ),
            (
                LAM_STABLE["conn_qms"],
                "Lam QMS REST (Fremont)",
                "qms_rest",
                f"{sim}/api/v1/connector-sim/qms",
                "secret:demo-lam-qms-token",
                {
                    "auth_kind": "bearer",
                    "api_version": "3.2.1",
                    "plant": "LR-FCO",
                    "ncr_ref": "NCR-LR-552",
                },
                "Lam QMS NCR / containment contract (synthetic).",
            ),
            (
                LAM_STABLE["conn_cmms"],
                "Lam CMMS REST (Fremont)",
                "cmms_rest",
                f"{sim}/api/v1/connector-sim/cmms",
                "secret:demo-lam-cmms-token",
                {
                    "auth_kind": "bearer",
                    "api_version": "2.8.0",
                    "plant": "LR-FCO",
                },
                "Lam CMMS work orders / helium sensor calibration (synthetic).",
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
        .limit(6)
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
        asset_bearing_id=LAM_STABLE["asset_gas_seal"],
        order_id=order.id,
        lot_id=lot.id,
        unit_id=unit.id,
        quality_event_ids=qe_ids,
        anomaly_ids=anom_ids,
        id_offset=2000,
        demo_label="Lam Fremont Chamber Ops synthetic demo",
        default_country="US",
        default_customer="Leading Foundry Fab 18",
    )

    return {
        "tenant": tenant.id,
        "site": site.id,
        "gas_seal_asset": LAM_STABLE["asset_gas_seal"],
        "lines": len(lines),
        "cells": len(cells),
        "assets": len(assets),
        "products": 3,
        "orders": 3,
        "knowledge_cases": len(causes),
        "users": len(users),
        "graph": graph_stats,
        "compliance": compliance_stats,
        "open_quality_event": LAM_STABLE["qe_open"],
        "containment_event": LAM_STABLE["qe_containment"],
        "demo_scenario": "gas_box_seal_void",
    }
