"""
Tier 2 seed — Apex Precision · Dayton Components.

Precision hydraulic valve bodies and wheel-speed sensors feeding
Meridian Dynamics (Tier 1) ABS modules for Harley-Davidson.
Genealogy links: VLV-AP-* / WSS-AP-* serials appear in Meridian component trees.
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

random.seed(202)

PRODUCT = "Precision Hydraulic Valve Body"
VARIANTS = [
    "Valve Body Gen4 Touring", "Valve Body Gen4 Softail",
    "Valve Body Gen3 Sport", "WSS Dual-Channel Pack",
]
COLORS = ["Raw Steel", "Phosphate Coat", "Zinc Flash"]
OPERATORS = [
    "P. Shah", "M. Lee", "R. Gomez", "K. Ito",
    "H. Berg", "T. Wells", "Y. Cho", "F. Diaz",
]
ORDER_SOURCES = ["ERP", "EDI", "APS", "Manual"]
VLV_PREFIX = tenants.LINKED["valve_serial_prefix"]
WSS_PREFIX = tenants.LINKED["sensor_serial_prefix"]

DEFECT_CLASSES = [
    ("Seat grind out of round", "surface"), ("Port burr retained", "presence"),
    ("Coat thickness low", "surface"), ("Sensor coil open", "presence"),
    ("Dimensional oversize", "process"), ("Leak at seat", "leak"),
]


def _set_state(station_id: str, state: str):
    st = DB["stations"].get(station_id)
    if st:
        st["state"] = state
        st["state_since"] = ts_offset(minutes=random.randint(4, 40))


def _seed_topology():
    site = {
        "id": "site-dayton-ap",
        "name": "Apex Precision · Dayton Components",
        "code": "AP-DAY",
        "timezone": "America/New_York",
        "shift": "Shift A (06:00-14:30)",
        "oem": "Apex Precision",
        "tier": "tier2",
        "customer": "Meridian Dynamics Columbus",
    }
    DB["sites"][site["id"]] = site

    area_specs = [
        ("Machining", "MCN", ["Grind & Mill Cell"]),
        ("Coat & Finish", "FIN", ["Finish Line"]),
        ("Sensor Build", "SNS", ["WSS Assembly"]),
        ("Inspect & Ship", "QA", ["Final Inspect Line"]),
    ]
    station_specs = {
        "Grind & Mill Cell": [
            ("Blank Saw", "process"), ("CNC Seat Grind", "process"),
            ("Port Mill", "process"), ("In-process Gauge", "presence"),
        ],
        "Finish Line": [
            ("Wash & Prep", "process"), ("Phosphate Coat", "process"),
            ("Coat Thickness Check", "surface"), ("Visual Finish Audit", "surface"),
        ],
        "WSS Assembly": [
            ("Coil Wind", "process"), ("Sensor Mold", "process"),
            ("Cable Terminate", "torque"), ("Continuity Test", "eol"),
        ],
        "Final Inspect Line": [
            ("CMM Sample", "presence"), ("Leak / Seat Check", "leak"),
            ("Serial Laser Mark", "presence"), ("Ship Scan to Meridian", "presence"),
        ],
    }
    takt_by_line = {
        "Grind & Mill Cell": 45,
        "Finish Line": 55,
        "WSS Assembly": 40,
        "Final Inspect Line": 35,
    }

    line_x = 0
    for area_name, code, line_names in area_specs:
        area_id = f"area-ap-{code.lower()}"
        DB["areas"][area_id] = {
            "id": area_id, "site_id": site["id"], "name": area_name, "code": code,
        }
        for ln in line_names:
            line_id = f"line-ap-{ln.lower().replace(' ', '-').replace('&', 'and')}"
            takt = takt_by_line.get(ln, 50)
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

    _set_state("st-ap-grind-and-mill-cell-02", "Faulted")
    _set_state("st-ap-finish-line-03", "Quality Hold")
    _set_state("st-ap-wss-assembly-04", "Starved")
    _set_state("st-ap-final-inspect-line-02", "Changeover")


def _vlv_serial(i: int, v: int) -> str:
    return f"{VLV_PREFIX}{8000 + i}{v}"


def _seed_production():
    op_names = [
        "Blank cut", "Seat grind", "Port mill", "Coat",
        "Inspect", "Mark", "Ship scan",
    ]
    primary_line = ["line-ap-grind-and-mill-cell"]
    for i in range(12):
        order_id = f"WO-AP{3000 + i}"
        variant = random.choice(VARIANTS)
        qty = random.choice([80, 120, 160, 200])
        completed = random.randint(20, qty - 20) if i < 9 else 0
        status = "Released" if i < 9 else "Planned"
        if i < 2:
            status = "Completed"
            completed = qty
        source = ORDER_SOURCES[i % len(ORDER_SOURCES)]
        customer_po = f"MD-PO-{610000 + i}"
        DB["orders"][order_id] = {
            "id": order_id,
            "source": source,
            "erp_ref": f"ERP-AP-{310000 + i}",
            "customer_po": customer_po,
            "customer": "Meridian Dynamics",
            "ship_to": "Columbus Module Plant",
            "product": PRODUCT if "WSS" not in variant else "Wheel Speed Sensor Pack",
            "variant": variant,
            "color": random.choice(COLORS),
            "qty": qty,
            "completed": completed,
            "status": status,
            "due": ts_offset(hours=-random.randint(4, 72)),
            "line_id": random.choice(primary_line),
            "released_at": ts_offset(hours=random.randint(2, 30)),
            "created_by": "System sync" if source != "Manual" else "Planner",
        }
        if status != "Planned":
            for v in range(min(8, 6)):
                is_sensor = "WSS" in variant
                serial = f"{WSS_PREFIX}{9000 + i}{v}" if is_sensor else _vlv_serial(i, v)
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
                        "instruction_version": f"WI-AP-{random.randint(10, 40)}.v{random.randint(1, 5)}",
                        "model_version": f"vision-surface@{random.randint(1, 6)}.{random.randint(0, 9)}",
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
                        {"part": "Bar Stock Lot", "serial": f"BAR-AP-{random.randint(100000, 999999)}",
                         "lot": f"L-AP-{random.randint(100, 999)}"},
                        {"part": "Grit Media", "serial": f"GRIT-{random.randint(1000, 9999)}",
                         "lot": f"L-AP-{441 if i < 3 else random.randint(100, 999)}"},
                        {"part": "Coat Bath", "serial": f"BATH-{random.randint(10, 99)}",
                         "lot": f"L-AP-{random.randint(100, 999)}"},
                    ],
                    "downstream": {
                        "customer": "Meridian Dynamics",
                        "ship_to": "Columbus Module Plant",
                        "customer_po": customer_po,
                        "oem_end": "Harley-Davidson York",
                    },
                }

    vins = list(DB["vins"].keys())
    for st in DB["stations"].values():
        if st["state"] in ("Running", "Blocked", "Faulted") and vins:
            st["current_vin"] = random.choice(vins)


def _seed_work_instructions():
    specs = [
        ("WI-AP-GRD-04", "CNC Seat Grind Recipe", "st-ap-grind-and-mill-cell-02", [
            ("Load blank and scan lot", "scan", "Lot must match Meridian call-off"),
            ("Select Gen4 Touring grind recipe", "tool", "Recipe locked to customer PO"),
            ("Run grind cycle", "tool", "Ra and roundness within band"),
            ("In-process gauge capture", "vision", "Store curve as evidence"),
            ("Release to finish", "confirm", "Genealogy lot L-AP stamped"),
        ]),
        ("WI-AP-COAT-09", "Phosphate Coat Thickness", "st-ap-finish-line-03", [
            ("Scan carrier", "scan", "Bind to valve serial"),
            ("Coat thickness probe", "tool", "Min 8 µm"),
            ("Vision finish audit", "vision", "No bare spots"),
            ("Disposition", "confirm", "Hold if below min"),
        ]),
        ("WI-AP-SHIP-02", "Ship Scan to Meridian", "st-ap-final-inspect-line-04", [
            ("Scan valve/sensor serial", "scan", "Must match ASN line"),
            ("Confirm Meridian PO", "scan", "MD-PO barcode"),
            ("Commit ship", "confirm", "EDI ASN to Columbus"),
        ]),
    ]
    for wi_id, name, station_id, steps in specs:
        DB["work_instructions"][wi_id] = {
            "id": wi_id, "name": name, "station_id": station_id,
            "version": f"v{random.randint(2, 6)}", "status": "Deployed",
            "effective": ts_offset(days=random.randint(5, 60)),
            "approved_by": "M. Lee (Process Eng)",
            "steps": [
                {"seq": i + 1, "title": t, "kind": k, "criteria": c,
                 "evidence_required": k in ("scan", "vision", "tool")}
                for i, (t, k, c) in enumerate(steps)
            ],
        }
    for wf_name, target, status in [
        ("Tighten Gen4 seat roundness band after MD NCR", "WI-AP-GRD-04", "In Review"),
        ("EDI ASN fields for Meridian Columbus", "WI-AP-SHIP-02", "Approved"),
    ]:
        wf_id = new_id("wf")
        DB["workflows"][wf_id] = {
            "id": wf_id, "name": wf_name, "target_instruction": target,
            "status": status, "author": "M. Lee",
            "created": ts_offset(days=random.randint(1, 9)),
            "compiled_outputs": [
                "Operator guidance package", "Edge state machine v2", "Evidence schema",
            ],
        }


def _seed_quality_and_vision():
    model_specs = [
        ("seat-roundness", "Seat grind roundness", "st-ap-grind-and-mill-cell-02", "2.2", "Production"),
        ("coat-thickness", "Phosphate coat coverage", "st-ap-finish-line-03", "3.0", "Production"),
        ("port-burr", "Port burr presence", "st-ap-grind-and-mill-cell-03", "1.6", "Assisted"),
        ("sensor-continuity", "WSS coil continuity visual", "st-ap-wss-assembly-04", "2.8", "Production"),
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
                     "fit": True}
                    for v in random.sample(VARIANTS, 3)
                ],
                "cost_assumptions": {
                    "escape_cost_usd": 900, "false_reject_cost_usd": 12,
                    "reinspect_cost_usd": 6,
                },
                "hardware_profile": "IPC · GigE 1×5MP",
                "approved_by": "P. Shah (Plant Manager)",
                "rollback_target": f"{slug}@{float(ver) - 0.1:.1f}",
            },
            "drift": {
                "confidence_trend": [round(random.uniform(0.92, 0.99), 3) for _ in range(14)],
                "input_shift_score": round(random.uniform(0.01, 0.25), 3),
                "status": random.choice(["Healthy", "Watch", "Healthy"]),
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
                        if s["archetype"] in ("surface", "presence", "process", "leak")]
    for i in range(36):
        iid = new_id("insp")
        vin = random.choice(vins) if vins else None
        station = random.choice(stations_surface)
        verdict = random.choices(["Pass", "Fail", "Review"], weights=[82, 9, 9])[0]
        conf = round(random.uniform(0.55, 0.98), 3) if verdict == "Review" else round(random.uniform(0.9, 0.999), 3)
        model_id = random.choice(list(DB["models"].keys()))
        insp = {
            "id": iid, "vin": vin, "station_id": station,
            "model_id": model_id,
            "model_version": DB["models"][model_id]["version"],
            "verdict": verdict, "confidence": conf,
            "captured": ts_offset(minutes=random.randint(2, 480)),
            "camera": f"CAM-{random.randint(1, 3)}",
            "lighting_recipe": f"LR-{random.randint(1, 3)}",
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
                    "cross_line_matches": random.randint(0, 2),
                },
                "repeat_rate_shift": round(random.uniform(0.0, 0.12), 3),
            }

    hold_id = new_id("hold")
    DB["holds"][hold_id] = {
        "id": hold_id,
        "reason": "Seat grind out of round — Grind cell #2 after grit change",
        "defect_class": "Seat grind out of round",
        "scope": "Lot L-AP-441 (Grind & Mill, night shift)",
        "units_estimated": 220,
        "units_confirmed": 48,
        "applied_by": "P. Shah",
        "applied": ts_offset(hours=4),
        "status": "Active",
        "integration": {
            "wms": "Notified", "erp": "Blocked-for-ship",
            "qms": "NCR-AP-118 created",
            "customer": "Meridian Dynamics notified (lot L-AP-441)",
        },
    }
    DB["defect_classes"] = list(DEFECT_CLASSES)


def _seed_agents():
    agent_specs = [
        ("Constraint Radar", "L1 · Recommend",
         "Ranks grind/finish constraints by Meridian call-off risk.",
         "Watch grind cell cycle and coat thickness; rank by MD PO impact.",
         ["bind-status", "bind-timeseries", "bind-order", "bind-defect"]),
        ("Containment Assistant", "L3 · Execute with approval",
         "Maps grit-lot defects to valve serials shipped toward Meridian/Harley.",
         "Walk lot genealogy and draft holds for L-AP-441.",
         ["bind-defect", "bind-vin", "bind-inspection", "bind-order"]),
        ("RCA Investigator", "L2 · Draft",
         "Links grit media change to seat roundness drift.",
         "Assemble grind curves and grit lot change into a cause hypothesis.",
         ["bind-defect", "bind-timeseries", "bind-status", "bind-inspection"]),
        ("Shift Brief Writer", "L0 · Retrieve",
         "Morning brief with Meridian ship commitments.",
         "Retrieve overnight orders and quality events for Dayton.",
         ["bind-order", "bind-status", "bind-defect", "bind-vin"]),
        ("Reinspection Trigger", "L4 · Bounded automation",
         "Second gauge capture on borderline roundness.",
         "Trigger reversible second gauge when confidence is borderline.",
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
        ("agent-containment-assistant", "Hold lot L-AP-441 valve bodies",
         "Seat grind out-of-round after grit change. Meridian NCR-MD-991 references this lot.",
         {"products_affected": 220, "reversible": True, "downstream": ["EDI ship-block", "MD notify"]},
         "Approved", "P. Shah (Plant Mgr)"),
        ("agent-rca-investigator", "Root cause: grit media lot change on cell #2",
         "Roundness drift correlates with grit lot swap at 22:10. Recommend media requalification.",
         {"products_affected": 0, "reversible": True, "downstream": ["CMMS grit requal"]},
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
            "outcome": ("Lot held; Meridian ASN corrected." if status == "Approved" else None),
        }


def _seed_edge():
    node_specs = [
        ("edge-ap-mcn", "Grind Cell Edge", "Machining", ["line-ap-grind-and-mill-cell"], "Degraded"),
        ("edge-ap-fin", "Finish Edge", "Coat & Finish", ["line-ap-finish-line"], "Healthy"),
        ("edge-ap-sns", "WSS Edge", "Sensor Build", ["line-ap-wss-assembly"], "Healthy"),
        ("edge-ap-qa", "Final Inspect Edge", "Inspect & Ship", ["line-ap-final-inspect-line"], "Healthy"),
    ]
    for nid, name, area, lines, health in node_specs:
        DB["edge_nodes"][nid] = {
            "id": nid, "name": name, "area": area, "lines": lines,
            "health": health, "version": "livis-edge 1.8.3",
            "k3s": "v1.31.2+k3s1",
            "gpu": "None",
            "queue_depth": random.randint(0, 30),
            "data_lag_s": round(random.uniform(0.2, 4.0), 1),
            "storage_used_pct": random.randint(22, 70),
            "clock": {"source": "NTP", "trust": round(random.uniform(0.9, 1.0), 2)},
            "secure_boot": True, "tpm": True,
            "cert_expiry_days": random.randint(40, 320),
            "last_seen": now(),
            "mission_readiness": {
                "score": {"Healthy": random.randint(92, 99), "Degraded": 68, "Offline": 18}[health],
                "limiting_factors": {
                    "Healthy": [], "Degraded": ["Gauge probe intermittent"], "Offline": ["WAN down"],
                }[health],
            },
            "node_passport": {
                "signed": True, "issuer": "livis-central-ca",
                "capabilities": ["OPC UA client", "MQTT Sparkplug B", "GigE Vision"],
                "semantic_mappings": random.randint(30, 120),
                "fingerprint": uuid.uuid4().hex[:20],
            },
        }
    for proto, endpoint, node, status, tags in [
        ("OPC UA", "opc.tcp://plc-ap-grind:4840", "edge-ap-mcn", "Degraded", 64),
        ("GigE Vision", "cam-seat-01", "edge-ap-mcn", "Connected", 1),
        ("REST/ERP", "erp-ap-dayton", "central", "Connected", 4),
        ("EDI", "edi.meridian.md/asn", "central", "Connected", 2),
    ]:
        cid = new_id("conn")
        DB["connectors"][cid] = {
            "id": cid, "protocol": proto, "endpoint": endpoint,
            "node_id": node, "status": status, "mapped_tags": tags,
            "quality": 0.71 if status == "Degraded" else round(random.uniform(0.95, 1.0), 3),
            "last_sample": now(),
        }


def _seed_events_actions():
    for pri, kind, title, st, impact, owner, owned in [
        ("P1", "Faulted", "CNC Seat Grind faulted — spindle load spike",
         "st-ap-grind-and-mill-cell-02", "Meridian call-off MD-PO-610000 at risk", "P. Shah", False),
        ("P1", "Quality", "Lot L-AP-441 hold — seat out of round",
         "st-ap-grind-and-mill-cell-02", "220 pieces quarantined", "M. Lee", True),
        ("P2", "Quality Hold", "Coat thickness hold on Softail Gen4",
         "st-ap-finish-line-03", "18 carriers awaiting disposition", "M. Lee", True),
        ("P3", "Starved", "WSS continuity starved — cable kit late",
         "st-ap-wss-assembly-04", "Afternoon pack risk", "R. Gomez", False),
    ]:
        eid = new_id("evt")
        DB["events"][eid] = {
            "id": eid, "priority": pri, "kind": kind, "title": title,
            "station_id": st, "impact": impact, "owner": owner if owned else None,
            "owned": owned, "created": ts_offset(hours=random.randint(1, 8)),
            "acked": owned, "status": "Open",
        }
    for title, owner, pri, status, context in [
        ("Requalify grit media on grind cell #2", "Maintenance", "P1", "In Progress",
         "Surface grind drift; VLV seat geometry at risk"),
        ("Respond to Meridian NCR-MD-991", "P. Shah", "P2", "Open",
         "Downstream ABS module hold from Meridian Quality"),
        ("Release L-AP-441 after 100% seat recheck", "M. Lee", "P2", "Open",
         "Containment lot; Meridian WMS ship-block"),
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
        ("Escape prevented (to Meridian)", 5, 900),
        ("False reject avoided", 40, 12),
        ("Rework hours saved", 22, 48),
        ("Lot quarantine cost avoided", 2, 1800),
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
                "source": random.choice(["Part Inspection ROI", "RCA ROI", "Process Monitoring ROI"]),
                "evidence_refs": [f"EV-{random.randint(10000, 99999)}"],
            }


def _seed_admin():
    for name, role, role_id in [
        ("Priya Shah", "Plant Manager", "plant-manager"),
        ("Marcus Lee", "Process Engineer", "mfg-engineer"),
        ("R. Gomez", "Supervisor", "supervisor"),
        ("K. Ito", "Operator", "operator"),
        ("H. Berg", "Quality Technician", "quality"),
        ("T. Wells", "Maintenance Lead", "maintenance"),
    ]:
        uid = new_id("user")
        DB["users"][uid] = {
            "id": uid, "name": name, "role": role, "role_id": role_id,
            "site": "Apex Precision · Dayton Components",
            "skills": random.sample(["Grind Setup", "CMM", "Coat Process", "EDI ASN"], k=2),
            "sso": "OIDC (Okta)", "active": True,
        }
    for kind, actor, detail in [
        ("hold.apply", "P. Shah", "Applied hold on lot L-AP-441 (NCR-AP-118)"),
        ("agent.action.approve", "P. Shah", "Approved containment after Meridian NCR-MD-991"),
        ("workflow.approve", "M. Lee", "Approved Gen4 seat roundness band tighten"),
    ]:
        aid = new_id("audit")
        DB["audit"][aid] = {
            "id": aid, "kind": kind, "actor": actor, "detail": detail,
            "at": ts_offset(hours=random.randint(1, 70)), "source": "central",
        }


def _seed_kpis():
    DB["kpis"] = {
        "plan_units": 1400, "actual_units": 1288,
        "oee": 0.762, "fpy": 0.958,
        "open_stops": 2, "escapes_mtd": 1,
        "takt_adherence": 0.89,
        "money_saved_today_usd": 6840.0,
        "hours_saved_today": 11.4,
        "scrap_prevented_today": 28,
        "co2_saved_kg": 19.0,
        "payback_months": 5.4,
        "projected_annual_value_usd": 420000,
        "oee_trend": [round(random.uniform(0.70, 0.82), 3) for _ in range(24)],
        "fpy_trend": [round(random.uniform(0.93, 0.98), 3) for _ in range(24)],
        "output_by_hour": [random.randint(90, 130) for _ in range(12)],
        "plan_by_hour": [116] * 12,
    }
    DB["shift_briefs"]["today"] = {
        "id": "today",
        "generated": now(),
        "agent": "Shift Brief Writer v2.1",
        "headline": "Lot L-AP-441 held after Meridian leak NCR — grit cell #2 under requalification.",
        "sections": [
            {"title": "Customer risk", "body": "MD-PO-610000 partial; Columbus notified via EDI.",
             "evidence": ["NCR-AP-118", "NCR-MD-991"]},
            {"title": "Biggest cause", "body": "Seat grind roundness drift after grit media change.",
             "evidence": ["EV-AP-441"]},
            {"title": "Suggested fix", "body": "Requalify grit; 100% seat recheck before release.",
             "evidence": ["CMMS-DRAFT-AP-09"]},
        ],
        "actions_proposed": 2,
    }


def _seed_graph_schema():
    schema = {
        "id": "schema-dayton-ap",
        "name": "Apex Dayton context model",
        "version": "1.0",
        "status": "Draft",
        "updated_at": now(),
        "updated_by": "M. Lee",
        "description": "Tier 2 component plant — valve bodies & sensors for Meridian ABS.",
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
             "enabled": True, "description": "Gauge and vision captures.", "protocol": "GigE Vision",
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
             "enabled": True, "description": "Meridian call-offs / EDI.", "protocol": "REST/JSON",
             "properties": []},
            {"id": "bind-vin", "object_type": "genealogy", "label": "Component serial genealogy",
             "report_at": "station", "rollup_to": ["line", "facility"],
             "lenses": ["production", "supply_chain", "quality"], "enabled": True,
             "description": "Valve/sensor serials with lot grit media and Meridian ship link.",
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
