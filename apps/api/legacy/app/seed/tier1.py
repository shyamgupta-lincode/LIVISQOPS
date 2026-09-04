"""
Tier 1 seed — Meridian Dynamics · Columbus Module Plant.

Builds ABS brake-control modules for Harley-Davidson York Vehicle Ops.
Genealogy links: ABS-MD-* serials appear on Harley VIN component trees;
valve bodies / sensors come from Apex Precision (Tier 2).
"""

from __future__ import annotations

import random
import uuid

from .. import tenants
from ..store import (
    DB,
    new_id,
    now,
    snapshot_history,
    ts_offset,
    _seed_device_tags,
)

random.seed(101)

PRODUCT = "ABS Brake Control Module"
VARIANTS = [
    "ABS-Touring Gen4", "ABS-Softail Gen4", "ABS-Sport Gen3",
    "Linked Brake Module HD", "Cornering ABS Pack",
]
COLORS = ["Natural Al", "Black Anodize", "Clear Coat"]
OPERATORS = [
    "A. Reyes", "S. Okonkwo", "J. Park", "L. Nguyen",
    "C. Brooks", "M. Hassan", "E. Soto", "N. Patel",
]
ORDER_SOURCES = ["SAP", "ERP", "APS", "Manual"]
ABS_PREFIX = tenants.LINKED["abs_serial_prefix"]
VLV_PREFIX = tenants.LINKED["valve_serial_prefix"]
WSS_PREFIX = tenants.LINKED["sensor_serial_prefix"]

DEFECT_CLASSES = [
    ("Valve body leak", "leak"), ("Sensor harness open", "presence"),
    ("PCB solder bridge", "surface"), ("Housing porosity", "weld"),
    ("Connector pin bent", "presence"), ("Torque under-spec", "torque"),
]


def _set_state(station_id: str, state: str):
    st = DB["stations"].get(station_id)
    if st:
        st["state"] = state
        st["state_since"] = ts_offset(minutes=random.randint(4, 40))


def _seed_topology():
    site = {
        "id": "site-columbus-md",
        "name": "Meridian Dynamics · Columbus Module Plant",
        "code": "MD-CMP",
        "timezone": "America/New_York",
        "shift": "Shift A (06:00-14:30)",
        "oem": "Meridian Dynamics",
        "tier": "tier1",
        "customer": "Harley-Davidson York Vehicle Ops",
    }
    DB["sites"][site["id"]] = site

    area_specs = [
        ("Housing & Machining", "HSG", ["Housing Cell"]),
        ("Electronics", "ELC", ["PCB & Sensor Line"]),
        ("Module Assembly", "ASM", ["ABS Assembly Line"]),
        ("Test & Pack", "TST", ["Module Test Line"]),
    ]
    station_specs = {
        "Housing Cell": [
            ("CNC Pocket Mill", "process"), ("Housing Deburr", "process"),
            ("Housing Vision Check", "surface"), ("Part Mark & Scan", "presence"),
        ],
        "PCB & Sensor Line": [
            ("SMT Load", "sequence"), ("Sensor Pair Bond", "torque"),
            ("Harness Seat Check", "presence"), ("Board AOI", "surface"),
        ],
        "ABS Assembly Line": [
            ("Valve Body Install", "torque"), ("PCB Marriage", "sequence"),
            ("Housing Close & Seal", "leak"), ("Customer Label / ABS Serial", "presence"),
        ],
        "Module Test Line": [
            ("Hydraulic Bench Test", "leak"), ("CAN / Diagnostics", "eol"),
            ("Final Appearance", "surface"), ("Pack & Ship Scan", "presence"),
        ],
    }
    takt_by_line = {
        "Housing Cell": 90,
        "PCB & Sensor Line": 75,
        "ABS Assembly Line": 110,
        "Module Test Line": 95,
    }

    line_x = 0
    for area_name, code, line_names in area_specs:
        area_id = f"area-md-{code.lower()}"
        DB["areas"][area_id] = {
            "id": area_id, "site_id": site["id"], "name": area_name, "code": code,
        }
        for ln in line_names:
            line_id = f"line-md-{ln.lower().replace(' ', '-')}"
            takt = takt_by_line.get(ln, 100)
            DB["lines"][line_id] = {
                "id": line_id, "area_id": area_id, "site_id": site["id"],
                "name": ln, "takt_seconds": takt, "x": line_x,
            }
            for idx, (st_name, archetype) in enumerate(station_specs[ln]):
                st_id = f"st-{line_id[5:]}-{idx + 1:02d}"
                DB["stations"][st_id] = {
                    "id": st_id, "line_id": line_id, "area_id": area_id,
                    "site_id": site["id"], "name": st_name, "position": idx + 1,
                    "archetype": archetype, "state": "Running",
                    "state_since": ts_offset(minutes=random.randint(1, 90)),
                    "cycle_time_s": round(random.uniform(takt * 0.82, takt * 1.08), 1),
                    "takt_s": takt,
                    "current_vin": None,
                    "operator": random.choice(OPERATORS),
                    "health": {
                        "availability": round(random.uniform(0.88, 0.99), 3),
                        "quality": round(random.uniform(0.95, 0.999), 3),
                        "performance": round(random.uniform(0.85, 0.98), 3),
                        "ai_confidence": round(random.uniform(0.9, 0.99), 3),
                        "operator_efficiency": round(random.uniform(0.85, 0.98), 3),
                        "safety": round(random.uniform(0.97, 1.0), 3),
                    },
                }
                for d_kind in ["PLC", "Camera"] + (["Torque Tool"] if archetype == "torque" else []):
                    dev_id = new_id("dev")
                    protocol = {"PLC": "OPC UA", "Camera": "GigE Vision", "Torque Tool": "Open Protocol"}[d_kind]
                    device = {
                        "id": dev_id, "station_id": st_id, "kind": d_kind,
                        "name": f"{st_name} {d_kind}", "protocol": protocol,
                        "status": "Online",
                        "timestamp_trust": round(random.uniform(0.92, 1.0), 2),
                    }
                    if d_kind in ("PLC", "Torque Tool"):
                        device["tags"] = _seed_device_tags(st_name, archetype, d_kind)
                    DB["devices"][dev_id] = device
            line_x += 1

    _set_state("st-md-abs-assembly-line-01", "Faulted")
    _set_state("st-md-pcb-and-sensor-line-04", "Quality Hold")
    _set_state("st-md-module-test-line-01", "Starved")
    _set_state("st-md-housing-cell-02", "Changeover")


def _abs_serial(i: int, v: int) -> str:
    # Deterministic shared serials that Harley seed also references for the first few
    return f"{ABS_PREFIX}{7000 + i:04d}{v}"


def _seed_production():
    op_names = [
        "Housing release", "PCB populate", "Valve install", "Module seal",
        "Hydraulic test", "Diagnostics", "Pack",
    ]
    assembly = ["line-md-abs-assembly-line"]
    for i in range(12):
        order_id = f"WO-MD{5000 + i}"
        variant = random.choice(VARIANTS)
        qty = random.choice([24, 36, 48, 60])
        completed = random.randint(4, qty - 4) if i < 9 else 0
        status = "Released" if i < 9 else "Planned"
        if i < 2:
            status = "Completed"
            completed = qty
        source = ORDER_SOURCES[i % len(ORDER_SOURCES)]
        # Customer PO echoes Harley demand
        customer_po = f"HD-PO-{820000 + i}"
        DB["orders"][order_id] = {
            "id": order_id,
            "source": source,
            "erp_ref": f"SAP-MD-{510000 + i}",
            "customer_po": customer_po,
            "customer": "Harley-Davidson",
            "ship_to": "York Vehicle Operations",
            "product": PRODUCT,
            "variant": variant,
            "color": random.choice(COLORS),
            "qty": qty,
            "completed": completed,
            "status": status,
            "due": ts_offset(hours=-random.randint(4, 72)),
            "line_id": random.choice(assembly),
            "released_at": ts_offset(hours=random.randint(2, 30)),
            "created_by": "System sync" if source != "Manual" else "Planner",
        }
        if status != "Planned":
            for v in range(min(qty, 6)):
                serial = _abs_serial(i, v)
                station_ids = list(DB["stations"].keys())
                progress = random.randint(2, 7)
                ops = []
                for op_i, op_name in enumerate(op_names[:progress]):
                    ops.append({
                        "id": new_id("op"),
                        "name": op_name,
                        "station_id": random.choice(station_ids),
                        "status": "Completed" if op_i < progress - 1 else "In Progress",
                        "completed_at": ts_offset(hours=progress - op_i),
                        "operator": random.choice(OPERATORS),
                        "evidence": [
                            {"type": "barcode_scan", "ref": f"SCAN-{random.randint(10000, 99999)}"},
                            {"type": "vision", "ref": f"IMG-{random.randint(10000, 99999)}",
                             "confidence": round(random.uniform(0.9, 0.999), 3)},
                        ],
                        "instruction_version": f"WI-MD-{random.randint(10, 40)}.v{random.randint(1, 5)}",
                        "model_version": f"vision-{random.choice(['presence', 'surface', 'leak'])}@{random.randint(1, 6)}.{random.randint(0, 9)}",
                    })
                DB["vins"][serial] = {
                    "vin": serial,
                    "order_id": order_id,
                    "variant": variant,
                    "color": DB["orders"][order_id]["color"],
                    "status": "In Process" if progress < 7 else "Complete",
                    "current_station": ops[-1]["station_id"] if ops else None,
                    "operations": ops,
                    "components": [
                        {"part": "Valve Body (Apex)", "serial": f"{VLV_PREFIX}{8000 + i}{v}", "lot": f"L-AP-{random.randint(100, 999)}",
                         "supplier": "Apex Precision", "tier": "tier2"},
                        {"part": "Wheel Speed Sensor (Apex)", "serial": f"{WSS_PREFIX}{9000 + i}{v}", "lot": f"L-AP-{random.randint(100, 999)}",
                         "supplier": "Apex Precision", "tier": "tier2"},
                        {"part": "Control PCB", "serial": f"PCB-MD-{random.randint(100000, 999999)}", "lot": f"L-MD-{random.randint(100, 999)}"},
                        {"part": "Housing Casting", "serial": f"HSG-MD-{random.randint(100000, 999999)}", "lot": f"L-MD-{random.randint(100, 999)}"},
                    ],
                    "downstream": {
                        "customer": "Harley-Davidson",
                        "ship_to": "York Vehicle Operations",
                        "customer_po": customer_po,
                    },
                }

    vins = list(DB["vins"].keys())
    for st in DB["stations"].values():
        if st["state"] in ("Running", "Blocked", "Faulted") and vins:
            st["current_vin"] = random.choice(vins)


def _seed_work_instructions():
    specs = [
        ("WI-MD-VLV-11", "Valve Body Install & Torque", "st-md-abs-assembly-line-01", [
            ("Scan Apex valve body serial", "scan", "Must match Meridian BOM / HD customer PO"),
            ("Seat valve body in housing", "manual", "Orientation key toward CAN connector"),
            ("Torque flange bolts to recipe", "tool", "Torque 12±1 Nm, star pattern"),
            ("Vision seal seating check", "vision", "Model valve-seal@3.1 threshold 0.94"),
            ("Confirm and release", "confirm", "Genealogy updated with Apex serial"),
        ]),
        ("WI-MD-PCB-08", "PCB Marriage & Harness", "st-md-abs-assembly-line-02", [
            ("Scan PCB and module carrier", "scan", "Pair to ABS serial"),
            ("Mate board connectors", "manual", "Click-feel on all 4 connectors"),
            ("Vision pin presence", "vision", "No bent pins; all seats flush"),
            ("Commit", "confirm", "Trace to Harley ship lot"),
        ]),
        ("WI-MD-HYD-05", "Hydraulic Bench Test", "st-md-module-test-line-01", [
            ("Clamp module on bench", "manual", "Ports A/B sealed"),
            ("Run pressure cycle", "tool", "Pass band per Touring Gen4 recipe"),
            ("Capture leak curve", "vision", "Store as evidence for HD birth record"),
            ("Disposition", "confirm", "Ship-hold if leak > threshold"),
        ]),
    ]
    for wi_id, name, station_id, steps in specs:
        DB["work_instructions"][wi_id] = {
            "id": wi_id, "name": name, "station_id": station_id,
            "version": f"v{random.randint(2, 6)}", "status": "Deployed",
            "effective": ts_offset(days=random.randint(5, 60)),
            "approved_by": "S. Okonkwo (Quality Lead)",
            "steps": [
                {"seq": i + 1, "title": t, "kind": k, "criteria": c,
                 "evidence_required": k in ("scan", "vision", "tool")}
                for i, (t, k, c) in enumerate(steps)
            ],
        }
    for wf_name, target, status in [
        ("Valve torque window tighten for HD Gen4", "WI-MD-VLV-11", "In Review"),
        ("Hydraulic recipe sync with York ABS map", "WI-MD-HYD-05", "Approved"),
    ]:
        wf_id = new_id("wf")
        DB["workflows"][wf_id] = {
            "id": wf_id, "name": wf_name, "target_instruction": target,
            "status": status, "author": "J. Park",
            "created": ts_offset(days=random.randint(1, 9)),
            "compiled_outputs": [
                "Operator guidance package", "Edge state machine v2",
                "Evidence schema", "PLC handshake test set",
            ],
        }


def _seed_quality_and_vision():
    model_specs = [
        ("valve-seal-seat", "Valve body seal seating", "st-md-abs-assembly-line-01", "3.1", "Production"),
        ("pcb-pin-presence", "Connector pin presence", "st-md-abs-assembly-line-02", "2.4", "Production"),
        ("housing-porosity", "Housing surface porosity", "st-md-housing-cell-03", "1.8", "Shadow"),
        ("board-aoi", "PCB AOI solder quality", "st-md-pcb-and-sensor-line-04", "4.0", "Production"),
    ]
    for slug, name, station, ver, stage in model_specs:
        mid = f"model-{slug}"
        DB["models"][mid] = {
            "id": mid, "name": name, "slug": slug, "version": ver,
            "station_id": station, "stage": stage,
            "architecture": random.choice(["YOLOv8-seg", "EfficientNet-B4", "AnomalyDINO"]),
            "trained": ts_offset(days=random.randint(10, 90)),
            "fitness_passport": {
                "locked_test_metrics": {
                    "critical_recall": round(random.uniform(0.985, 0.998), 4),
                    "false_reject_rate": round(random.uniform(0.004, 0.03), 4),
                    "f1": round(random.uniform(0.95, 0.99), 4),
                },
                "segments": [
                    {"segment": v, "recall": round(random.uniform(0.94, 0.999), 3),
                     "false_reject": round(random.uniform(0.002, 0.05), 3),
                     "fit": random.random() > 0.15}
                    for v in random.sample(VARIANTS, 3)
                ],
                "cost_assumptions": {
                    "escape_cost_usd": 2800, "false_reject_cost_usd": 45,
                    "reinspect_cost_usd": 18,
                },
                "hardware_profile": "IPC-NVIDIA A2 · GigE 2×5MP",
                "approved_by": "S. Okonkwo (Quality Lead)",
                "rollback_target": f"{slug}@{float(ver) - 0.1:.1f}",
            },
            "drift": {
                "confidence_trend": [round(random.uniform(0.92, 0.99), 3) for _ in range(14)],
                "input_shift_score": round(random.uniform(0.01, 0.2), 3),
                "status": random.choice(["Healthy", "Healthy", "Watch"]),
            },
        }
        dep_id = new_id("dep")
        DB["deployments"][dep_id] = {
            "id": dep_id, "model_id": mid, "station_id": station,
            "ring": stage, "version": ver,
            "deployed": ts_offset(days=random.randint(1, 30)),
            "signed_by": "PKI: livis-central-ca", "health": "OK",
        }

    vins = list(DB["vins"].keys())
    stations_surface = [s["id"] for s in DB["stations"].values()
                        if s["archetype"] in ("surface", "presence", "weld", "sequence", "leak")]
    for i in range(40):
        iid = new_id("insp")
        vin = random.choice(vins) if vins else None
        station = random.choice(stations_surface)
        verdict = random.choices(["Pass", "Fail", "Review"], weights=[80, 10, 10])[0]
        conf = round(random.uniform(0.55, 0.98), 3) if verdict == "Review" else round(random.uniform(0.9, 0.999), 3)
        model_id = random.choice(list(DB["models"].keys()))
        insp = {
            "id": iid, "vin": vin, "station_id": station,
            "model_id": model_id,
            "model_version": DB["models"][model_id]["version"],
            "verdict": verdict, "confidence": conf,
            "captured": ts_offset(minutes=random.randint(2, 480)),
            "camera": f"CAM-{random.randint(1, 4)}",
            "lighting_recipe": f"LR-{random.randint(1, 4)}",
            "evidence_ref": f"IMG-{random.randint(100000, 999999)}",
            "image_seed": abs(hash(iid)) % 10_000,
            "disposition": None,
        }
        DB["inspections"][iid] = insp
        if verdict in ("Fail", "Review"):
            defect_name, kind = random.choice(DEFECT_CLASSES)
            defect_id = new_id("def")
            DB["defects"][defect_id] = {
                "id": defect_id, "inspection_id": iid, "vin": vin,
                "station_id": station, "class": defect_name, "kind": kind,
                "severity": random.choice(["Critical", "Major", "Minor"]),
                "confidence": conf, "detected": insp["captured"],
                "status": random.choice(["Open", "Open", "Dispositioned", "Contained"]),
                "disposition": random.choice([None, None, "Repair", "Reject", "Accept-with-deviation"]),
                "defect_dna": {
                    "fingerprint": uuid.uuid4().hex[:16],
                    "similar_events": random.randint(0, 9),
                    "cross_line_matches": random.randint(0, 3),
                },
                "repeat_rate_shift": round(random.uniform(0.0, 0.09), 3),
            }

    hold_id = new_id("hold")
    DB["holds"][hold_id] = {
        "id": hold_id,
        "reason": "Valve body leak cluster — ABS Assembly Line",
        "defect_class": "Valve body leak",
        "scope": "Carriers M-040..M-055 (Valve Body Install, lot L-AP-441)",
        "units_estimated": 14,
        "units_confirmed": 6,
        "applied_by": "S. Okonkwo",
        "applied": ts_offset(hours=2),
        "status": "Active",
        "integration": {"wms": "Notified", "erp": "Blocked-for-ship", "qms": "NCR-MD-991 created",
                        "customer": "Harley York notified (ASN hold)"},
    }
    DB["defect_classes"] = list(DEFECT_CLASSES)


def _seed_agents():
    agent_specs = [
        ("Constraint Radar", "L1 · Recommend",
         "Ranks module-line constraints by Harley ship-date impact.",
         "Watch ABS assembly and test for cycle creep; rank by customer PO risk.",
         ["bind-status", "bind-timeseries", "bind-order", "bind-defect"]),
        ("Containment Assistant", "L3 · Execute with approval",
         "Walks Apex→Meridian→Harley genealogy for affected ABS serial ranges.",
         "Given a valve-body defect, walk Tier-2 genealogy into ABS serials and draft holds.",
         ["bind-defect", "bind-vin", "bind-inspection", "bind-order"]),
        ("RCA Investigator", "L2 · Draft",
         "Correlates Apex lot signals with Meridian leak events.",
         "Assemble leak events with Apex lot history into a cause hypothesis.",
         ["bind-defect", "bind-timeseries", "bind-status", "bind-inspection"]),
        ("Shift Brief Writer", "L0 · Retrieve",
         "Morning brief with HD ship commitments and open NCRs.",
         "Retrieve overnight orders, station status, and quality events for Columbus.",
         ["bind-order", "bind-status", "bind-defect", "bind-vin"]),
        ("Reinspection Trigger", "L4 · Bounded automation",
         "Second capture on borderline seal confidence.",
         "Trigger reversible second capture when seal confidence is borderline.",
         ["bind-inspection"]),
    ]
    for name, level, desc, prompt, topics in agent_specs:
        aid = f"agent-{name.lower().replace(' ', '-')}"
        DB["agents"][aid] = {
            "id": aid, "name": name, "autonomy": level, "description": desc,
            "version": f"{random.randint(1, 3)}.{random.randint(0, 9)}",
            "eval_score": round(random.uniform(0.88, 0.98), 3),
            "evidence_link_coverage": round(random.uniform(0.93, 1.0), 3),
            "status": "Active",
            "permitted_tools": {
                "L0 · Retrieve": ["search_events", "read_genealogy"],
                "L1 · Recommend": ["search_events", "read_genealogy", "rank_losses"],
                "L2 · Draft": ["search_events", "read_genealogy", "draft_artifact"],
                "L3 · Execute with approval": ["draft_hold", "apply_hold(approved)", "create_ncr(approved)"],
                "L4 · Bounded automation": ["trigger_recapture", "open_review_task"],
            }[level],
            "prompt": prompt,
            "data_source_topics": topics,
        }
    proposals = [
        ("agent-containment-assistant", "Hold ABS serials ABS-MD-70000..ABS-MD-70015",
         "Valve body leak cluster on Apex lot L-AP-441. Genealogy maps to 14 ABS modules destined for Harley York.",
         {"products_affected": 14, "reversible": True, "downstream": ["WMS ship-block", "HD ASN hold"]},
         "Approved", "A. Reyes (Plant Mgr)"),
        ("agent-rca-investigator", "Root cause: Apex valve seat grind drift",
         "Leak curve correlates 0.88 with Apex grind cell #2 after grit change. Notify Tier 2.",
         {"products_affected": 0, "reversible": True, "downstream": ["Supplier NCR draft"]},
         "Pending Approval", None),
    ]
    for agent_id, title, evidence, blast, status, approver in proposals:
        pid = new_id("act")
        DB["agent_actions"][pid] = {
            "id": pid, "agent_id": agent_id, "title": title,
            "evidence_summary": evidence,
            "evidence_links": [f"EV-{random.randint(10000, 99999)}" for _ in range(3)],
            "blast_radius": blast,
            "confidence": round(random.uniform(0.72, 0.97), 2),
            "status": status, "approver": approver,
            "created": ts_offset(hours=random.randint(1, 9)),
            "outcome": ("14 modules held; Harley ASN updated." if status == "Approved" else None),
        }


def _seed_edge():
    node_specs = [
        ("edge-md-asm", "ABS Assembly Edge", "Module Assembly", ["line-md-abs-assembly-line"], "Healthy"),
        ("edge-md-elc", "Electronics Edge", "Electronics", ["line-md-pcb-and-sensor-line"], "Degraded"),
        ("edge-md-hsg", "Housing Edge", "Housing & Machining", ["line-md-housing-cell"], "Healthy"),
        ("edge-md-tst", "Module Test Edge", "Test & Pack", ["line-md-module-test-line"], "Healthy"),
    ]
    for nid, name, area, lines, health in node_specs:
        DB["edge_nodes"][nid] = {
            "id": nid, "name": name, "area": area, "lines": lines,
            "health": health, "version": "livis-edge 1.8.3",
            "k3s": "v1.31.2+k3s1",
            "gpu": random.choice(["NVIDIA A2", "None"]),
            "queue_depth": random.randint(0, 40) if health != "Offline" else 800,
            "data_lag_s": round(random.uniform(0.2, 3.0), 1),
            "storage_used_pct": random.randint(22, 78),
            "clock": {"source": "PTP", "trust": round(random.uniform(0.9, 1.0), 2)},
            "secure_boot": True, "tpm": True,
            "cert_expiry_days": random.randint(40, 320),
            "last_seen": now(),
            "mission_readiness": {
                "score": {"Healthy": random.randint(92, 99), "Degraded": 74, "Offline": 18}[health],
                "limiting_factors": {
                    "Healthy": [], "Degraded": ["Camera CAM-2 intermittent"], "Offline": ["WAN down"],
                }[health],
            },
            "node_passport": {
                "signed": True, "issuer": "livis-central-ca",
                "capabilities": ["OPC UA client", "MQTT Sparkplug B", "GigE Vision", "Vision runtime"],
                "semantic_mappings": random.randint(40, 180),
                "fingerprint": uuid.uuid4().hex[:20],
            },
        }
    for proto, endpoint, node, status, tags in [
        ("OPC UA", "opc.tcp://plc-md-asm:4840", "edge-md-asm", "Connected", 96),
        ("GigE Vision", "cam-valve-01", "edge-md-asm", "Connected", 2),
        ("REST/ERP", "sap-md-columbus", "central", "Connected", 6),
        ("QMS Webhook", "qms.columbus.md.local/ncr", "central", "Connected", 2),
    ]:
        cid = new_id("conn")
        DB["connectors"][cid] = {
            "id": cid, "protocol": proto, "endpoint": endpoint,
            "node_id": node, "status": status, "mapped_tags": tags,
            "quality": round(random.uniform(0.95, 1.0), 3),
            "last_sample": now(),
        }


def _seed_events_actions():
    for pri, kind, title, st, impact, owner, owned in [
        ("P1", "Faulted", "Valve Body Install faulted — torque controller timeout",
         "st-md-abs-assembly-line-01", "HD ship risk for PO HD-PO-820000", "A. Reyes", False),
        ("P1", "Quality", "Valve body leak cluster — containment active",
         "st-md-abs-assembly-line-01", "14 ABS modules held", "S. Okonkwo", True),
        ("P2", "Quality Hold", "PCB AOI hold — solder bridge on Sport Gen3",
         "st-md-pcb-and-sensor-line-04", "6 boards awaiting disposition", "S. Okonkwo", True),
        ("P3", "Starved", "Hydraulic bench starved — upstream seal lag",
         "st-md-module-test-line-01", "Throughput risk after lunch", "J. Park", False),
    ]:
        eid = new_id("evt")
        DB["events"][eid] = {
            "id": eid, "priority": pri, "kind": kind, "title": title,
            "station_id": st, "impact": impact, "owner": owner if owned else None,
            "owned": owned, "created": ts_offset(hours=random.randint(1, 8)),
            "acked": owned, "status": "Open",
        }
    for title, owner, pri, status, context in [
        ("Replace torque controller cable on Valve Body Install", "Maintenance", "P1", "In Progress",
         "Torque under-spec cluster; ABS Module Line takt risk"),
        ("Notify Apex of grind cell #2 drift (supplier NCR)", "S. Okonkwo", "P2", "Open",
         "Cross-plant Defect DNA match to Apex VLV lots"),
        ("Release held ABS lot after retest", "A. Reyes", "P2", "Open",
         "Containment hold blast radius to Harley ship lane"),
    ]:
        aid = new_id("act")
        DB["actions"][aid] = {
            "id": aid, "title": title, "owner": owner, "priority": pri,
            "status": status, "context": context,
            "created": ts_offset(hours=random.randint(1, 10)),
            "due": ts_offset(hours=-random.randint(2, 20)),
            "completion_evidence": None,
        }


def _seed_value_ledger():
    categories = [
        ("Escape prevented (to Harley)", 3, 2800),
        ("False reject avoided", 12, 45),
        ("Rework hours saved", 18, 65),
        ("Supplier NCR cycle reduction", 4, 420),
    ]
    for day in range(14):
        for name, base_qty, unit_value in categories:
            qty = max(0, int(random.gauss(base_qty, base_qty * 0.25)))
            vid = new_id("val")
            DB["value_ledger"][vid] = {
                "id": vid, "category": name, "quantity": qty,
                "unit_value_usd": unit_value,
                "value_usd": round(qty * unit_value, 2),
                "date": ts_offset(days=day)[:10],
                "source": random.choice(["Part Inspection ROI", "RCA ROI", "OT Integration ROI"]),
                "evidence_refs": [f"EV-{random.randint(10000, 99999)}"],
            }


def _seed_admin():
    for name, role, role_id in [
        ("Alex Reyes", "Plant Manager", "plant-manager"),
        ("Sam Okonkwo", "Quality Lead", "quality"),
        ("J. Park", "Supervisor", "supervisor"),
        ("L. Nguyen", "Operator", "operator"),
        ("C. Brooks", "Manufacturing Engineer", "mfg-engineer"),
        ("M. Hassan", "OT/Controls Engineer", "ot-engineer"),
    ]:
        uid = new_id("user")
        DB["users"][uid] = {
            "id": uid, "name": name, "role": role, "role_id": role_id,
            "site": "Meridian Dynamics · Columbus Module Plant",
            "skills": random.sample(["Torque L2", "Vision Review", "Hydraulic Test", "AOI"], k=2),
            "sso": "OIDC (Entra)", "active": True,
        }
    for kind, actor, detail in [
        ("hold.apply", "S. Okonkwo", "Applied hold ABS-MD-70000..70015 (NCR-MD-991)"),
        ("agent.action.approve", "A. Reyes", "Approved containment for HD-bound ABS lot"),
        ("workflow.approve", "C. Brooks", "Approved hydraulic recipe sync with York ABS map"),
    ]:
        aid = new_id("audit")
        DB["audit"][aid] = {
            "id": aid, "kind": kind, "actor": actor, "detail": detail,
            "at": ts_offset(hours=random.randint(1, 70)), "source": "central",
        }


def _seed_kpis():
    DB["kpis"] = {
        "plan_units": 420, "actual_units": 388,
        "oee": 0.781, "fpy": 0.971,
        "open_stops": 2, "escapes_mtd": 0,
        "takt_adherence": 0.93,
        "money_saved_today_usd": 12460.0,
        "hours_saved_today": 16.2,
        "scrap_prevented_today": 9,
        "co2_saved_kg": 42.0,
        "payback_months": 6.1,
        "projected_annual_value_usd": 980000,
        "oee_trend": [round(random.uniform(0.72, 0.84), 3) for _ in range(24)],
        "fpy_trend": [round(random.uniform(0.95, 0.99), 3) for _ in range(24)],
        "output_by_hour": [random.randint(28, 42) for _ in range(12)],
        "plan_by_hour": [35] * 12,
    }
    DB["shift_briefs"]["today"] = {
        "id": "today",
        "generated": now(),
        "agent": "Shift Brief Writer v2.1",
        "headline": "14 ABS modules on hold for Apex valve lot L-AP-441 — Harley ASN updated.",
        "sections": [
            {"title": "Customer risk", "body": "HD-PO-820000 partial ship delayed; York notified.",
             "evidence": ["NCR-MD-991"]},
            {"title": "Biggest cause", "body": "Valve seat grind drift at Apex (Tier 2). RCA confidence 0.88.",
             "evidence": ["EV-MD-441"]},
            {"title": "Suggested fix", "body": "Quarantine Apex lot; retest held modules; resume ship after bench pass.",
             "evidence": ["CMMS-DRAFT-MD-22"]},
        ],
        "actions_proposed": 2,
    }


def _seed_graph_schema():
    schema = {
        "id": "schema-columbus-md",
        "name": "Meridian Columbus context model",
        "version": "1.0",
        "status": "Draft",
        "updated_at": now(),
        "updated_by": "C. Brooks",
        "description": "Tier 1 module plant context model — ABS modules for Harley York.",
        "levels": [
            {"id": "facility", "label": "Facility", "entity": "site", "required": True},
            {"id": "area", "label": "Area", "entity": "area", "required": True},
            {"id": "line", "label": "Line", "entity": "line", "required": True},
            {"id": "station", "label": "Station", "entity": "station", "required": True},
            {"id": "device", "label": "Device / component", "entity": "device", "required": False},
        ],
        "object_bindings": [
            {"id": "bind-inspection", "object_type": "inspection", "label": "Inspection / evidence objects",
             "report_at": "station", "rollup_to": ["line", "area", "facility"], "lenses": ["quality"],
             "enabled": True, "description": "Vision captures for module quality.", "protocol": "GigE Vision",
             "properties": []},
            {"id": "bind-status", "object_type": "status", "label": "Station / line status objects",
             "report_at": "station", "rollup_to": ["line", "area"], "lenses": ["production", "maintenance"],
             "enabled": True, "description": "Live state and health.", "protocol": "OPC UA", "properties": []},
            {"id": "bind-defect", "object_type": "defect", "label": "Defect / NCR objects",
             "report_at": "station", "rollup_to": ["line", "area", "facility"], "lenses": ["quality"],
             "enabled": True, "description": "Quality events and holds.", "protocol": "MQTT Sparkplug B",
             "properties": []},
            {"id": "bind-order", "object_type": "order", "label": "Production order objects",
             "report_at": "line", "rollup_to": ["area", "facility"], "lenses": ["production", "supply_chain"],
             "enabled": True, "description": "Customer POs from Harley / ERP.", "protocol": "REST/JSON",
             "properties": []},
            {"id": "bind-vin", "object_type": "genealogy", "label": "ABS serial / component genealogy",
             "report_at": "station", "rollup_to": ["line", "facility"],
             "lenses": ["production", "supply_chain", "quality"], "enabled": True,
             "description": "ABS serial identity with Apex Tier-2 components and Harley ship link.",
             "protocol": "MES Context", "properties": []},
            {"id": "bind-timeseries", "object_type": "timeseries", "label": "Process time series",
             "report_at": "device", "rollup_to": ["station", "line"], "lenses": ["production", "maintenance"],
             "enabled": True, "description": "Historian tags.", "protocol": "OPC UA", "properties": []},
            {"id": "bind-wi", "object_type": "work_instruction", "label": "Work instruction objects",
             "report_at": "station", "rollup_to": ["line"], "lenses": ["production", "quality"],
             "enabled": True, "description": "Standard work.", "protocol": "MES Context", "properties": []},
        ],
    }
    DB["context_graphs"][schema["id"]] = schema
    DB["active_context_graph_id"] = schema["id"]
    DB["graph_schema"] = schema


def seed():
    _seed_topology()
    _seed_production()
    _seed_work_instructions()
    _seed_quality_and_vision()
    _seed_agents()
    _seed_edge()
    _seed_events_actions()
    _seed_value_ledger()
    _seed_admin()
    _seed_kpis()
    _seed_graph_schema()
    snapshot_history()
