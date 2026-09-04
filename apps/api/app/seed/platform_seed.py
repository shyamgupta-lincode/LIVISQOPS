"""Harley-rich seed for contextual platform golden path (+ thin stubs for other tenants)."""

from __future__ import annotations

import random

from ..store import DB, new_id, now, ts_offset
from ..platform.semantic import ISA95_LEVEL_ALIASES, build_context_from_station, attach_context
from ..platform.stores import event_ledger, knowledge, lakehouse, retrieval, timeseries
from ..platform import bus, detection
from ..routers.learning import register_version


def seed_platform_for_workspace(*, rich: bool = False):
    """Populate platform planes. rich=True for Harley golden path."""
    if rich:
        _seed_harley_platform()
    else:
        _seed_thin_stub()


def _site_bundle():
    site = next(iter(DB["sites"].values()), None)
    return site


def _seed_thin_stub():
    """Minimal planes so Data Planes / Backbone pages are non-empty for non-Harley tenants."""
    bus.publish("it.mes.sync", {"hello": True}, source_system="seed://stub")
    lakehouse.put_dataset_version(
        "context_coverage_daily",
        {"fields": ["pct_valid_context"]},
        {"rows": 1, "pct_valid_context": 0.82},
        actor="seed",
    )
    DB["learning_metrics"] = {
        "event_precision": 0.71,
        "false_alert_rate": 0.14,
        "detection_to_containment_hours": 3.2,
        "top3_rca_hypothesis_accuracy": 0.58,
        "time_to_confirmed_rca_hours": 18.0,
        "recurrence_after_corrective_action": 0.11,
        "pdm_lead_time_hours": None,
        "pdm_precision": None,
        "pct_signals_with_valid_context": 0.82,
        "model_drift_by_segment": [],
        "updated_at": now(),
    }


def _seed_harley_platform():
    site = _site_bundle()
    station = DB["stations"].get("st-touring-assembly-line-01") or next(
        (s for s in DB["stations"].values() if "Tank" in s.get("name", "")),
        next(iter(DB["stations"].values()), None),
    )
    if not station:
        return _seed_thin_stub()

    area = DB["areas"].get(station.get("area_id") or "")
    line = DB["lines"].get(station.get("line_id") or "")
    devices = [d for d in DB["devices"].values() if d.get("station_id") == station["id"]]
    device = devices[0] if devices else None

    # --- Contextualize 20–50 tags / feature windows ---
    vins = list(DB["vins"].values())
    for i in range(36):
        vin = vins[i % len(vins)] if vins else None
        order = DB["orders"].get((vin or {}).get("order_id") or "") if vin else None
        ctx = build_context_from_station(
            station, site=site, area=area, line=line, device=device,
            order=order, vin=vin, recipe=(order or {}).get("variant") or "Touring",
            process_phase=random.choice(["load", "torque", "seal_check", "confirm"]),
            source_system_ref="opcua://touring-tank/plc",
        )
        samples = [random.uniform(170, 210) for _ in range(24)]
        feats = detection.compute_features(samples, takt_s=float(station.get("takt_s") or 55), recipe_target=185)
        timeseries.put_feature_window({
            "station_id": station["id"],
            "tag": "mount_assist_pressure",
            "features": feats,
            "context": ctx.to_dict(),
        })
        if i % 6 == 0:
            bus.publish(
                "ot.telemetry.sample",
                {"tag": "mount_assist_pressure", "value": samples[-1], "unit": "psi"},
                context=ctx,
                source_system="opcua://touring-tank/plc",
            )

    # Emit a few candidates
    for _ in range(3):
        vin = random.choice(vins) if vins else None
        order = DB["orders"].get((vin or {}).get("order_id") or "") if vin else None
        ctx = build_context_from_station(
            station, site=site, area=area, line=line, device=device, order=order, vin=vin,
            source_system_ref="analytics://detection",
        )
        detection.emit_candidate(
            station=station,
            context=ctx,
            features=detection.compute_features([random.uniform(160, 200) for _ in range(20)], takt_s=55, recipe_target=185),
            reason="Mount assist pressure slope + seal vision borderline cluster",
            severity="Critical",
        )

    # --- PdM asset + failure modes ---
    asset_id = "pdm-fuel-tank-install"
    DB["pdm_assets"][asset_id] = {
        "id": asset_id,
        "name": "Fuel Tank Install cell",
        "station_id": station["id"],
        "criticality": "High",
        "product_families": ["Touring"],
        "telemetry_tags": ["mount_assist_pressure", "torque_ Nm", "cycle_time_s"],
        "health_score": 0.71,
        "mode_aware": True,
        "run_to_failure_history": False,
        "description": "Critical assembly cell — PdM by failure mode, not generic health AI.",
    }
    fms = [
        ("fm-fixture-wear", "Fixture #3 wear face", 72, "Inspect + replace fixture pads"),
        ("fm-seal-feed", "Seal applicator clog / starve", 36, "Clean applicator; verify lot feed"),
        ("fm-assist-valve", "Mount assist pneumatic valve degradation", 96, "Replace valve; recalibrate pressure band"),
    ]
    for fid, name, lead_h, action in fms:
        DB["failure_modes"][fid] = {
            "id": fid,
            "asset_id": asset_id,
            "name": name,
            "actionable_lead_time_hours": lead_h,
            "linked_tags": ["mount_assist_pressure"],
            "preferred_work": action,
            "ground_truth": [],
        }
    pred_id = new_id("pdm")
    DB["pdm_predictions"][pred_id] = {
        "id": pred_id,
        "asset_id": asset_id,
        "failure_mode_id": "fm-fixture-wear",
        "failure_mode_name": "Fixture #3 wear face",
        "kind": "health_score_alert",  # not RUL — insufficient RTF history
        "health_score": 0.64,
        "horizon_hours": 72,
        "precision_prior": 0.78,
        "rationale": "Mode-specific anomaly while producing Touring; pressure slope vs recipe band.",
        "status": "Open",
        "created_at": ts_offset(hours=6),
        "technician_findings": [],
        "product": "Touring",
        "recipe": "Street Glide Special",
        "operating_mode": "Running",
    }

    # --- Quality events lifecycle samples ---
    open_vin = vins[0] if vins else None
    open_order = DB["orders"].get((open_vin or {}).get("order_id") or "") if open_vin else None
    ctx_open = build_context_from_station(
        station, site=site, area=area, line=line, device=device,
        order=open_order, vin=open_vin, source_system_ref="qms://livis",
    )
    # Link first open defect if present
    defect = next((d for d in DB["defects"].values() if d.get("status") == "Open"), None)
    q_open = {
        "id": "qe-tank-seal-open",
        "status": "Investigation",
        "characteristic": "Tank seal discontinuity",
        "measured_value": 0.71,
        "units": "vision_confidence",
        "specification": ">= 0.93 pass threshold",
        "product": (open_order or {}).get("product") or "Harley-Davidson Motorcycle",
        "order_id": (open_vin or {}).get("order_id"),
        "lot": "L-seal-441",
        "serial": (open_vin or {}).get("vin"),
        "operation": station["name"],
        "equipment_id": station["id"],
        "tool_id": "Fixt-3",
        "cavity": None,
        "recipe": (open_order or {}).get("variant"),
        "process_window": "06:40-08:10 Shift A",
        "detection_method": "vision+analytics",
        "anomaly_evidence": [{"defect_id": (defect or {}).get("id"), "candidate": True}],
        "severity": "Critical",
        "risk": "Customer escape on Touring",
        "affected_scope": "Carriers T-118..T-131",
        "defect_id": (defect or {}).get("id"),
        "candidate_id": next(iter(DB.get("candidate_events") or {}), None),
        "context": ctx_open.to_dict(),
        "owner_role": "quality",
        "due_at": ts_offset(hours=2),  # ts_offset subtracts → 2h ago (overdue for workflow demo)
        "containment": "Hold carriers; WMS/ERP/QMS notified",
        "disposition": None,
        "rca_summary": None,
        "corrective_action": None,
        "effectiveness": None,
        "recurrence_history": [],
        "audit": [
            {"at": ts_offset(hours=8), "actor": "system", "action": "created", "status": "Detected"},
            {"at": ts_offset(hours=7), "actor": "A. Kowalski", "action": "transition", "from": "Detected", "to": "Validation"},
            {"at": ts_offset(hours=6), "actor": "T. Brennan", "action": "transition", "from": "Validation", "to": "Containment"},
            {"at": ts_offset(hours=5), "actor": "A. Kowalski", "action": "transition", "from": "Containment", "to": "Investigation"},
        ],
        "model_agent_versions": ["tank-seal@4.2", "agent-rca-investigator@2.1"],
        "opened_at": ts_offset(hours=8),
        "closed_at": None,
    }
    attach_context(q_open, ctx_open)
    DB["quality_events"][q_open["id"]] = q_open
    if defect:
        defect["quality_event_id"] = q_open["id"]
    event_ledger.append("quality.event.create", q_open["id"], {"seed": True}, actor="seed")

    # Closed event with effectiveness
    closed_vin = vins[1] if len(vins) > 1 else open_vin
    closed_order = DB["orders"].get((closed_vin or {}).get("order_id") or "") if closed_vin else None
    ctx_closed = build_context_from_station(
        station, site=site, area=area, line=line, order=closed_order, vin=closed_vin,
        source_system_ref="qms://livis",
    )
    case = knowledge.put_case({
        "title": "Tank seal discontinuity · Fixture #3 wear (closed)",
        "symptom": "Tank seal discontinuity",
        "disposition": "Repair",
        "corrective_action": "Replaced Fixture #3 wear pads; recalibrated mount assist band",
        "effectiveness": "No recurrence in 14 days on Touring",
        "human_notes": "Confirmed by maintenance mic measurement",
    })
    q_closed = {
        "id": "qe-tank-seal-closed",
        "status": "Closed",
        "characteristic": "Tank seal discontinuity",
        "measured_value": 0.68,
        "units": "vision_confidence",
        "specification": ">= 0.93 pass threshold",
        "product": "Harley-Davidson Motorcycle",
        "order_id": (closed_vin or {}).get("order_id"),
        "lot": "L-seal-390",
        "serial": (closed_vin or {}).get("vin"),
        "operation": station["name"],
        "equipment_id": station["id"],
        "tool_id": "Fixt-3",
        "recipe": (closed_order or {}).get("variant"),
        "process_window": "prior shift",
        "detection_method": "vision",
        "anomaly_evidence": [],
        "severity": "Critical",
        "risk": "Escape",
        "affected_scope": "7 VINs",
        "context": ctx_closed.to_dict(),
        "owner_role": "quality-lead",
        "containment": "Applied hold T-100..T-107",
        "disposition": "Repair",
        "rca_summary": "Fixture #3 wear (confirmed)",
        "corrective_action": "Replace fixture pads; recalibrate",
        "effectiveness": "No recurrence 14d",
        "recurrence_history": [],
        "audit": [{"at": ts_offset(days=14), "actor": "A. Kowalski", "action": "closed"}],
        "model_agent_versions": ["tank-seal@4.1", "agent-rca-investigator@2.0"],
        "opened_at": ts_offset(days=16),
        "closed_at": ts_offset(days=14),
        "knowledge_case_id": case["id"],
    }
    DB["quality_events"][q_closed["id"]] = q_closed
    event_ledger.append("quality.event.transition", q_closed["id"], {"to": "Closed"}, actor="A. Kowalski")

    # Knowledge curation proposal from closed case
    prop = knowledge.propose_lesson({
        "title": "Touring tank seal · fixture wear lesson",
        "source_case_id": case["id"],
        "quality_event_id": q_closed["id"],
        "taxonomy": {
            "failure_mode": "Seal discontinuity",
            "cause_class": "Fixture wear",
            "normalized_terms": ["tank_seal", "fixture_wear"],
        },
        "chain": {
            "symptom": "Tank seal discontinuity",
            "condition": "Touring Fuel Tank Install · Fixt #3",
            "cause": "Fixture wear face out of tolerance",
            "correction": "Replace pads + recalibrate mount assist",
            "effectiveness": "No recurrence 14d",
        },
        "proposed_artifacts": ["retrieval_chunk", "feature_definition:mount_assist_pressure_slope"],
        "steward_role": "quality knowledge steward",
        "created_by": "Knowledge Curation Agent",
    })
    bus.publish("knowledge.proposal.lesson", {"proposal_id": prop["id"]}, source_system="agent://knowledge")

    # Index procedures / WI for retrieval
    for wi in list(DB["work_instructions"].values())[:6]:
        retrieval.index_chunk(
            f"{wi.get('name')}: " + "; ".join(s.get("title", "") for s in (wi.get("steps") or [])[:5]),
            kind="procedure",
            ref_id=wi["id"],
        )

    # Typed agents metadata on existing / new agents
    for aid, atype in [
        ("agent-rca-investigator", "rca"),
        ("agent-containment-assistant", "workflow"),
        ("agent-constraint-radar", "workflow"),
    ]:
        if aid in DB["agents"]:
            DB["agents"][aid]["agent_type"] = atype
            DB["agents"][aid]["ot_writes_allowed"] = False
    # Add knowledge curation + workflow agents if missing
    if "agent-knowledge-curation" not in DB["agents"]:
        DB["agents"]["agent-knowledge-curation"] = {
            "id": "agent-knowledge-curation",
            "name": "Knowledge Curation",
            "agent_type": "knowledge",
            "autonomy": "L2 · Draft",
            "description": "Normalizes closed RCAs into approved lessons; steward approval required.",
            "version": "1.0",
            "eval_score": 0.91,
            "evidence_link_coverage": 0.97,
            "status": "Active",
            "permitted_tools": ["draft_artifact", "search_events", "read_genealogy"],
            "prompt": "After human closure, propose normalized lessons — never auto-approve.",
            "data_source_topics": ["bind-defect", "bind-vin"],
            "ot_writes_allowed": False,
        }
    if "agent-workflow-orchestrator" not in DB["agents"]:
        DB["agents"]["agent-workflow-orchestrator"] = {
            "id": "agent-workflow-orchestrator",
            "name": "Workflow Orchestrator",
            "agent_type": "workflow",
            "autonomy": "L3 · Execute with approval",
            "description": "Deterministic routing, deadlines, evidence requests, escalations.",
            "version": "1.0",
            "eval_score": 0.99,
            "evidence_link_coverage": 1.0,
            "status": "Active",
            "permitted_tools": ["open_review_task"],
            "prompt": "State machine only — no generative diagnosis.",
            "data_source_topics": ["bind-status", "bind-defect"],
            "ot_writes_allowed": False,
            "deterministic": True,
        }

    # RCA hypothesis bundle against open QE
    DB["rca_hypotheses"]["hyp-seed-1"] = {
        "id": "hyp-seed-1",
        "rank": 1,
        "bundle_id": "rca-seed-bundle",
        "quality_event_id": q_open["id"],
        "cause": "Fixture #3 wear inducing seal gap under torque",
        "supporting_evidence": ["Pressure slope", "Defect DNA cluster", "Prior closed case match"],
        "contradictory_evidence": ["Seal lot change same shift"],
        "confidence": 0.62,
        "uncertainty": "Medium",
        "affected_lots_or_serials": [q_open.get("serial")],
        "recommended_containment": "Hold Fixt #3 carriers",
        "confirm_tests": ["Mic wear face", "Retorque with replacement fixture"],
        "created_at": now(),
    }

    # Lakehouse dataset versions
    lakehouse.put_dataset_version(
        "tank_seal_feature_daily",
        {"fields": ["mean", "slope", "anomaly", "serial"]},
        {"rows": 36, "station_id": station["id"]},
        actor="seed",
    )
    register_version("feature_def", "mount_assist_pressure_slope", ring="Shadow", meta={"station": station["id"]})
    register_version("model", "tank-seal@4.2", ring="Production", meta={"fitness": "pass"})
    register_version("knowledge", "Touring tank seal fixture wear lesson", ring="Shadow", meta={"proposal_id": prop["id"]})
    register_version("dataset", "tank_seal_feature_daily@v1", ring="Assisted", meta={})

    # Learning metrics
    DB["learning_metrics"] = {
        "event_precision": 0.84,
        "false_alert_rate": 0.09,
        "detection_to_containment_hours": 1.4,
        "top3_rca_hypothesis_accuracy": 0.79,
        "time_to_confirmed_rca_hours": 11.5,
        "recurrence_after_corrective_action": 0.04,
        "pdm_lead_time_hours": 68.0,
        "pdm_precision": 0.78,
        "pct_signals_with_valid_context": 0.94,
        "model_drift_by_segment": [
            {"product": "Touring", "recipe": "Street Glide Special", "mode": "Running", "drift": 0.06},
            {"product": "Touring", "recipe": "Road Glide Limited", "mode": "Running", "drift": 0.04},
        ],
        "updated_at": now(),
    }

    # Enrich active context graph with ISA-95 aliases + new bindings
    gid = DB.get("active_context_graph_id")
    schema = (DB.get("context_graphs") or {}).get(gid) if gid else DB.get("graph_schema")
    if schema:
        # Annotate levels
        for lvl in schema.get("levels") or []:
            alias = next((a for a in ISA95_LEVEL_ALIASES if a["id"] == lvl.get("id") or a["entity"] == lvl.get("entity")), None)
            if alias:
                lvl["isa95"] = alias["isa95"]
                lvl["isa95_label"] = alias["label"]
        bindings = schema.setdefault("object_bindings", [])
        existing = {b.get("id") for b in bindings}
        for bid, otype, label, report_at in [
            ("bind-quality-event", "quality_event", "Quality event objects", "station"),
            ("bind-candidate-event", "candidate_event", "Detection candidate objects", "station"),
            ("bind-failure-mode", "failure_mode", "Failure mode objects", "device"),
            ("bind-lesson", "lesson", "Approved lesson objects", "facility"),
        ]:
            if bid not in existing:
                bindings.append({
                    "id": bid, "object_type": otype, "label": label,
                    "report_at": report_at, "rollup_to": ["line", "area", "facility"],
                    "lenses": ["quality", "maintenance"] if "fail" in otype or "lesson" in otype else ["quality"],
                    "enabled": True,
                    "description": f"Platform binding for {label}",
                    "protocol": "MES Context", "properties": [],
                })
        DB["graph_schema"] = schema
        if gid:
            DB["context_graphs"][gid] = schema
