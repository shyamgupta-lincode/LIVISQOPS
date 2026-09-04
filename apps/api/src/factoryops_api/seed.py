from __future__ import annotations
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from factoryops_config import get_settings
from factoryops_domain.ids import new_id
from .db import SessionLocal, Base, engine
from . import models
from .context_graph_seed import seed_context_graph
from .compliance_seed import seed_compliance
from .hero_seed import HERO_STABLE, seed_hero_tenant
from .lam_seed import LAM_STABLE, seed_lam_tenant

STABLE = {
    "tenant": "11111111-1111-7111-8111-111111111111",
    "site": "22222222-2222-7222-8222-222222222222",
    "site_harley": "22222222-2222-7222-8222-222222222201",
    "line1": "33333333-3333-7333-8333-333333333301",
    "line2": "33333333-3333-7333-8333-333333333302",
    "asset_bearing": "44444444-4444-7444-8444-444444444401",
    "fm_bearing": "55555555-5555-7555-8555-555555555501",
    "product": "66666666-6666-7666-8666-666666666601",
    "order": "77777777-7777-7777-8777-777777777701",
    "lot": "88888888-8888-7888-8888-888888888801",
    "unit": "99999999-9999-7999-8999-999999999901",
    "conn_opcua": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaaa01",
    "conn_mes": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaaa02",
    "conn_qms": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaaa03",
    "conn_cmms": "aaaaaaa1-aaaa-7aaa-8aaa-aaaaaaaaaa04",
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

def seed(demo_reset: bool = False):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if demo_reset:
            # wipe operational demo tables but keep users/config; graph is rebuilt idempotently below
            for table in (models.Hypothesis, models.RcaAnalysis, models.KnowledgeProposal,
                          models.WorkTask, models.QualityEvent, models.Anomaly, models.Prediction,
                          models.SignalSample, models.AuditEntry,
                          models.EntityEdge, models.EntityNode,
                          models.ComplianceDeadline, models.ReportInstance,
                          models.ReportTemplate, models.ComplianceObligation):
                db.query(table).delete()
            if hasattr(models, "AgentDefinition"):
                db.query(models.AgentDefinition).delete()
            db.commit()

        tenant = _upsert(db, models.Tenant, STABLE["tenant"], name="FactoryOps Demo Corp")
        db.flush()
        site = _upsert(db, models.Site, STABLE["site"], tenant_id=tenant.id, name="Midwest Hybrid Plant", code="MHP1", timezone="America/Chicago")
        harley = _upsert(db, models.Site, STABLE["site_harley"], tenant_id=tenant.id, name="Harley-Davidson York Vehicle Ops", code="HD-YORK", timezone="America/New_York")
        db.flush()
        line1 = _upsert(db, models.Line, STABLE["line1"], site_id=site.id, name="Discrete Assembly Line", takt_s=55)
        line2 = _upsert(db, models.Line, STABLE["line2"], site_id=site.id, name="Batch Process Line", takt_s=90)
        db.flush()
        cells = []
        for i, lid in enumerate([line1.id, line1.id, line1.id, line2.id, line2.id, line2.id], start=1):
            cid = f"33333333-3333-7333-8333-33333333400{i}"
            cells.append(_upsert(db, models.Cell, cid, line_id=lid, name=f"Cell {i}"))
        db.flush()
        # assets: 3 per line min
        assets = []
        for i, cell in enumerate(cells):
            for j in range(1, 4):
                aid = f"44444444-4444-7444-8444-44444444{i+1:02d}{j}"
                name = "Spindle Bearing Station" if (i == 0 and j == 1) else f"{cell.name} Asset {j}"
                aid = STABLE["asset_bearing"] if (i == 0 and j == 1) else aid
                assets.append(_upsert(db, models.Asset, aid, cell_id=cell.id, name=name, asset_type="equipment",
                                      criticality="High", health_index=0.92 if aid != STABLE["asset_bearing"] else 0.71))
        db.flush()
        fm = _upsert(db, models.FailureMode, STABLE["fm_bearing"], asset_id=STABLE["asset_bearing"],
                     code="bearing_wear", name="Rolling element bearing wear", horizon_hours=72, run_to_failure_history=False)
        product = _upsert(db, models.Product, STABLE["product"], tenant_id=tenant.id, name="Hybrid Gearbox Module", revision="B")
        db.flush()
        order = _upsert(db, models.ProductionOrder, STABLE["order"], site_id=site.id, product_id=product.id,
                        external_id="WO-BEARING-1001", status="Released", qty=240)
        db.flush()
        lot = _upsert(db, models.Lot, STABLE["lot"], order_id=order.id, code="LOT-BW-220")
        db.flush()
        unit = _upsert(db, models.SerialUnit, STABLE["unit"], lot_id=lot.id, serial="UNIT-BW-00042", status="InProcess")
        db.flush()

        users = [
            ("op@factoryops.local", "Alex Operator", "operator", site.id),
            ("qe@factoryops.local", "Quinn Engineer", "quality_engineer", site.id),
            ("qm@factoryops.local", "Morgan Manager", "quality_manager", site.id),
            ("mt@factoryops.local", "Taylor Tech", "maintenance_technician", site.id),
            ("ks@factoryops.local", "Sam Steward", "knowledge_steward", site.id),
            ("admin@factoryops.local", "Ada Admin", "admin", site.id),
            ("compliance@factoryops.local", "Casey Compliance", "compliance", site.id),
            ("cq@factoryops.local", "Chris Customer Quality", "customer_quality", site.id),
            ("reg@factoryops.local", "Riley Regulatory", "regulatory", site.id),
            ("jordan.hale@harleydavidson.com", "Jordan Hale", "Plant Manager", harley.id),
        ]
        for email, name, role, sid in users:
            existing = db.query(models.User).filter(models.User.email == email).one_or_none()
            if existing:
                existing.role = role
                existing.site_id = sid
                existing.name = name
            else:
                db.add(models.User(id=new_id(), email=email, name=name, role=role, site_id=sid, password_hash="demo"))

        # 10 knowledge cases
        causes = [
            ("bearing_wear", "Outer race spalling from lubrication starvation", True),
            ("bearing_wear", "Cage fracture after contamination", True),
            ("torque_drift", "Tool calibration lag", False),
            ("seal_leak", "Fixture wear inducing seal gap", False),
            ("thermal_runaway", "Coolant flow restriction", False),
            ("bearing_wear", "Misalignment after rebuild", True),
            ("vibration_loose", "Mounting bolt torque loss", False),
            ("sensor_fault", "Accelerometer bias drift (contradicts mechanical cause)", False),
            ("recipe_mismatch", "Wrong viscosity lubricant batch", False),
            ("irrelevant_paint", "Paint booth humidity excursion (irrelevant)", False),
        ]
        if db.query(models.KnowledgeCase).count() < 10:
            for i, (code, cause, similar) in enumerate(causes):
                db.add(models.KnowledgeCase(
                    id=new_id(), tenant_id=tenant.id,
                    title=f"Case {i+1}: {code}",
                    problem="Elevated vibration and temperature on rotating equipment",
                    confirmed_cause=cause,
                    corrective_action="Inspect/replace bearing; restore lubrication; verify alignment",
                    effectiveness="No recurrence 30d" if similar else "Partial",
                    applicability={"asset_type": "spindle", "failure_mode": code, "similar_to_bearing_wear": similar},
                    status="approved", version=1, source_event_ids=[],
                    embedding_text=f"{code} {cause} vibration temperature torque",
                ))

        # ISA-95 context graph (Midwest Hybrid + legacy Harley York richness)
        graph_stats = seed_context_graph(
            db,
            tenant=tenant,
            site=site,
            harley=harley,
            line1=line1,
            line2=line2,
            cells=cells,
            assets=assets,
            product=product,
            order=order,
            lot=lot,
            unit=unit,
            failure_mode=fm,
            asset_bearing_id=STABLE["asset_bearing"],
        )

        # 90-day summarized history (daily vibration samples + closed QE cadence)
        hist_marker = db.query(models.SignalSample).filter(
            models.SignalSample.asset_id == STABLE["asset_bearing"],
            models.SignalSample.signal == "vibration_mm_s_daily",
        ).count()
        if hist_marker < 90:
            now = datetime.now(timezone.utc)
            for d in range(90):
                ts = now - timedelta(days=89 - d)
                vib = 1.8 + (d / 90.0) * 1.2 + (0.05 if d % 7 == 0 else 0.0)
                db.add(models.SignalSample(
                    id=new_id(), asset_id=STABLE["asset_bearing"],
                    signal="vibration_mm_s_daily", value=vib, unit="mm/s", quality="good",
                    observed_at=ts,
                ))
                if d % 9 == 0:
                    db.add(models.QualityEvent(
                        id=new_id(), tenant_id=tenant.id, site_id=site.id, status="CLOSED",
                        severity="Medium" if d < 70 else "High",
                        characteristic="Historical bearing vibration trend",
                        measured_value=vib, units="mm/s", specification="<= 4.5 mm/s RMS",
                        origin="rule", asset_id=STABLE["asset_bearing"],
                        order_id=order.id, lot_id=lot.id, unit_id=unit.id, line_id=line1.id,
                        owner_role="quality_engineer",
                        containment="Inspected lubrication", disposition="Rework",
                        rca_summary="Lubrication / wear trend (seed history)",
                        corrective_action="Top-up / schedule bearing PM",
                        effectiveness="Accepted",
                        opened_at=ts, closed_at=ts + timedelta(hours=8), updated_at=ts + timedelta(hours=8),
                    ))

        # OT/IT connectors — local substitutes under /api/v1/connector-sim/*
        if hasattr(models, "IntegrationConnector"):
            settings = get_settings()
            sim = getattr(settings, "connector_sim_base_url", None) or "http://api:8000"
            sim = str(sim).rstrip("/")
            connectors = [
                (
                    STABLE["conn_opcua"],
                    "Line OPC UA (spindle)",
                    "opc_ua",
                    f"{sim}/api/v1/connector-sim/opcua",
                    "secret:demo-opcua-token",
                    {
                        "security_mode": "None",
                        "security_policy": "None",
                        "node_ids": [
                            "ns=2;s=Spindle.Vibration",
                            "ns=2;s=Spindle.Temperature",
                            "ns=2;s=Spindle.Torque",
                        ],
                        "allow_local_substitute": True,
                        "http_bridge_url": f"{sim}/api/v1/connector-sim/opcua",
                        "protocol_profile": "OPC UA 1.05",
                    },
                    "Production-shaped OPC UA client via HTTP bridge substitute (opc.tcp PLC optional).",
                ),
                (
                    STABLE["conn_mes"],
                    "Plant MES REST",
                    "mes_rest",
                    f"{sim}/api/v1/connector-sim/mes",
                    "secret:demo-mes-token",
                    {"auth_kind": "bearer", "api_version": "2024-06"},
                    "MES orders / lots / genealogy REST contract.",
                ),
                (
                    STABLE["conn_qms"],
                    "Plant QMS REST",
                    "qms_rest",
                    f"{sim}/api/v1/connector-sim/qms",
                    "secret:demo-qms-token",
                    {"auth_kind": "bearer", "api_version": "3.2.1"},
                    "QMS NCR and inspection REST contract.",
                ),
                (
                    STABLE["conn_cmms"],
                    "Plant CMMS REST",
                    "cmms_rest",
                    f"{sim}/api/v1/connector-sim/cmms",
                    "secret:demo-cmms-token",
                    {"auth_kind": "bearer", "api_version": "2.8.0"},
                    "CMMS work orders / asset history / work requests.",
                ),
            ]
            for cid, name, kind, url, secret_ref, cfg, desc in connectors:
                existing = db.get(models.IntegrationConnector, cid)
                if existing:
                    # Keep runtime health counters; refresh demo endpoint/secret wiring.
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

        # Automotive compliance & quality reporting (obligations, templates, instances, calendar)
        qe_ids = [r.id for r in db.query(models.QualityEvent).order_by(models.QualityEvent.opened_at.desc()).limit(5).all()]
        anom_ids = [r.id for r in db.query(models.Anomaly).limit(5).all()]
        compliance_stats = seed_compliance(
            db,
            tenant_id=tenant.id,
            site_id=site.id,
            product_name=product.name,
            asset_bearing_id=STABLE["asset_bearing"],
            order_id=order.id,
            lot_id=lot.id,
            unit_id=unit.id,
            quality_event_ids=qe_ids,
            anomaly_ids=anom_ids,
        )

        # Optional draft custom agent with graph / data-plane entity refs
        example_agent_id = None
        if hasattr(models, "AgentDefinition"):
            from .agents_admin import seed_example_agent
            example_agent_id = seed_example_agent(
                db,
                tenant_id=tenant.id,
                site_id=site.id,
                asset_id=STABLE["asset_bearing"],
            )

        # Second full tenant: Hero MotoCorp Dharuhera (synthetic 2W OEM demo)
        hero_stats = seed_hero_tenant(db)

        # Third full tenant: Lam Research Fremont Chamber Ops (synthetic semi cap-equip demo)
        lam_stats = seed_lam_tenant(db)

        db.commit()
        print("seed complete", {
            "tenant": tenant.id,
            "site": site.id,
            "bearing_asset": STABLE["asset_bearing"],
            "graph": graph_stats,
            "compliance": compliance_stats,
            "example_agent": example_agent_id,
            "hero": hero_stats,
            "lam": lam_stats,
        })
        return {**STABLE, "hero": HERO_STABLE, "lam": LAM_STABLE}
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    seed(demo_reset="--demo-reset" in sys.argv)
