"""
Hemlock Semiconductor seed — Michigan Hyperpure Ops.

Polysilicon / hyperpure silicon manufacturing: trichlorosilane feedstock,
Siemens CVD rod growth, harvest & crush, electronics-grade pack & ship for
wafer and foundry customers. Serials use LOT-HS- / ROD-HS- prefixes
(stored in the VIN field for API compat).
"""

from __future__ import annotations

import random
import uuid

from ..store import (
    DB,
    new_id,
    now,
    snapshot_history,
    ts_offset,
    _seed_device_tags,
)

random.seed(707)

PRODUCT = "Electronics-Grade Polysilicon"
VARIANTS = [
    "EG Chunk 9N+",
    "EG Rod Segment 11N",
    "Solar Plus Chunk 7N",
    "Float-Zone Feed Rod",
    "Granular TCS Route",
]
FINISHES = ["Cleanroom Pack A", "N2 Purged Drum", "Vacuum Foil Bag"]
OPERATORS = [
    "C. Hale", "N. Brooks", "Y. Sato", "E. Vargas",
    "T. Nguyen", "M. Kowalski", "R. Diaz", "P. Anders",
]
ORDER_SOURCES = ["SAP", "ERP", "APS", "Manual"]
LOT_PREFIX = "LOT-HS-"
ROD_PREFIX = "ROD-HS-"
BAG_PREFIX = "BAG-HS-"
DRUM_PREFIX = "DRM-HS-"

DEFECT_CLASSES = [
    ("Metal contamination spike", "process"),
    ("Carbon inclusion on rod", "surface"),
    ("Rod diameter out of band", "process"),
    ("Crush fines oversize", "surface"),
    ("Moisture ingress in drum", "leak"),
    ("Bag seal defect", "presence"),
    ("Phosphorus donor high", "process"),
    ("Vision chunk discoloration", "surface"),
]


def _set_state(station_id: str, state: str):
    st = DB["stations"].get(station_id)
    if st:
        st["state"] = state
        st["state_since"] = ts_offset(minutes=random.randint(4, 40))


def _seed_topology():
    site = {
        "id": "site-hemlock-hs",
        "name": "Hemlock Semiconductor · Michigan Hyperpure Ops",
        "code": "HS-MHO",
        "timezone": "America/Detroit",
        "shift": "Shift A (06:00-14:30)",
        "oem": "Hemlock Semiconductor",
        "tier": "materials",
        "customer": "Global Foundries & Wafer Makers",
    }
    DB["sites"][site["id"]] = site

    area_specs = [
        ("Feedstock & Distillation", "FDS", ["TCS Distillation Line"]),
        ("CVD Reactor Farm", "CVD", ["Siemens Reactor Line"]),
        ("Harvest & Size", "HVS", ["Rod Harvest Line"]),
        ("Metrology & Ship", "MTS", ["EG Pack Ship Line"]),
    ]
    station_specs = {
        "TCS Distillation Line": [
            ("TCS Feed Assay", "process"), ("Column Pressure Check", "process"),
            ("Impurity IR Scan", "surface"), ("Lot Tag Print", "presence"),
        ],
        "Siemens Reactor Line": [
            ("Filament Load", "sequence"), ("CVD Heat Cycle", "process"),
            ("Reactor Vision Guard", "surface"), ("Rod Serial Stamp", "presence"),
        ],
        "Rod Harvest Line": [
            ("Cool-Down & Unload", "sequence"), ("Rod Diameter Gauge", "process"),
            ("Crush & Screen", "process"), ("Chunk Vision Sort", "surface"),
        ],
        "EG Pack Ship Line": [
            ("ICP-MS Sample Gate", "eol"), ("Moisture / Leak Check", "leak"),
            ("Drum Pack Scan", "presence"), ("ASN Ship Scan", "presence"),
        ],
    }
    takt_by_line = {
        "TCS Distillation Line": 240,
        "Siemens Reactor Line": 360,
        "Rod Harvest Line": 210,
        "EG Pack Ship Line": 180,
    }

    line_x = 0
    for area_name, code, line_names in area_specs:
        area_id = f"area-hs-{code.lower()}"
        DB["areas"][area_id] = {
            "id": area_id, "site_id": site["id"], "name": area_name, "code": code,
        }
        for ln in line_names:
            line_id = f"line-hs-{ln.lower().replace(' ', '-')}"
            takt = takt_by_line.get(ln, 220)
            DB["lines"][line_id] = {
                "id": line_id, "area_id": area_id, "site_id": site["id"],
                "name": ln, "takt_seconds": takt, "x": line_x,
            }
            for idx, (st_name, archetype) in enumerate(station_specs[ln]):
                st_id = f"st-{line_id[5:]}-{idx + 1:02d}"
                device_kinds = ["PLC", "Camera"]
                if archetype == "torque":
                    device_kinds.append("Torque Tool")
                if "ICP" in st_name or archetype in ("leak", "process", "eol"):
                    device_kinds.append("Sensor")
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
                for d_kind in device_kinds:
                    if d_kind == "Sensor":
                        protocol = "MQTT Sparkplug B"
                    else:
                        protocol = {
                            "PLC": "OPC UA",
                            "Camera": "GigE Vision",
                            "Torque Tool": "Open Protocol",
                        }[d_kind]
                    dev_id = new_id("dev")
                    device = {
                        "id": dev_id, "station_id": st_id, "kind": d_kind,
                        "name": f"{st_name} {d_kind}", "protocol": protocol,
                        "status": "Online",
                        "timestamp_trust": round(random.uniform(0.92, 1.0), 2),
                    }
                    if d_kind in ("PLC", "Torque Tool"):
                        device["tags"] = _seed_device_tags(st_name, archetype, d_kind)
                    elif d_kind == "Sensor":
                        device["tags"] = {
                            "reactor_temp_c": {
                                "address": f"ns=2;s={st_name.replace(' ', '')}.Temp",
                                "unit": "°C", "data_type": "float",
                            },
                            "tcs_flow_slpm": {
                                "address": f"ns=2;s={st_name.replace(' ', '')}.TCSFlow",
                                "unit": "slpm", "data_type": "float",
                            },
                            "ppb_metal_fe": {
                                "address": f"ns=2;s={st_name.replace(' ', '')}.FePPB",
                                "unit": "ppb", "data_type": "float",
                            },
                        }
                    DB["devices"][dev_id] = device
            line_x += 1

    _set_state("st-hs-siemens-reactor-line-02", "Faulted")
    _set_state("st-hs-rod-harvest-line-04", "Quality Hold")
    _set_state("st-hs-eg-pack-ship-line-01", "Starved")
    _set_state("st-hs-tcs-distillation-line-02", "Changeover")


def _lot_serial(i: int, v: int) -> str:
    return f"{LOT_PREFIX}{5000 + i:04d}{v}"


def _seed_production():
    op_names = [
        "TCS assay", "CVD grow", "Rod harvest", "Crush & sort",
        "ICP-MS gate", "Pack & ASN", "Ship scan",
    ]
    assembly = ["line-hs-eg-pack-ship-line", "line-hs-rod-harvest-line"]
    customers = [
        ("GlobalWafer Fab 7", "Hsinchu"),
        ("Summit Silicon Ingots", "Sherman TX"),
        ("Nordic Float Zone", "Drammen"),
    ]
    for i in range(12):
        order_id = f"WO-HS{4000 + i}"
        variant = random.choice(VARIANTS)
        qty = random.choice([6, 8, 10, 12])
        completed = random.randint(1, qty - 1) if i < 9 else 0
        status = "Released" if i < 9 else "Planned"
        if i < 2:
            status = "Completed"
            completed = qty
        source = ORDER_SOURCES[i % len(ORDER_SOURCES)]
        customer, ship_to = customers[i % len(customers)]
        customer_po = f"POLY-PO-{310000 + i}"
        DB["orders"][order_id] = {
            "id": order_id,
            "source": source,
            "erp_ref": f"SAP-HS-{420000 + i}",
            "customer_po": customer_po,
            "customer": customer,
            "ship_to": ship_to,
            "product": PRODUCT,
            "variant": variant,
            "color": random.choice(FINISHES),
            "qty": qty,
            "completed": completed,
            "status": status,
            "due": ts_offset(hours=-random.randint(8, 120)),
            "line_id": random.choice(assembly),
            "released_at": ts_offset(hours=random.randint(4, 48)),
            "created_by": "System sync" if source != "Manual" else "Planner",
        }
        if status != "Planned":
            for v in range(min(qty, 5)):
                serial = _lot_serial(i, v)
                rod = f"{ROD_PREFIX}{7000 + i}{v}"
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
                            {"type": "metrology", "ref": f"ICP-{random.randint(10000, 99999)}"}
                            if op_name in ("ICP-MS gate", "TCS assay") else None,
                        ],
                        "instruction_version": f"WI-HS-{random.randint(10, 40)}.v{random.randint(1, 5)}",
                        "model_version": f"vision-{random.choice(['surface', 'chunk', 'presence'])}@{random.randint(1, 6)}.{random.randint(0, 9)}",
                    })
                    ops[-1]["evidence"] = [e for e in ops[-1]["evidence"] if e]
                DB["vins"][serial] = {
                    "vin": serial,
                    "order_id": order_id,
                    "variant": variant,
                    "color": DB["orders"][order_id]["color"],
                    "status": "In Process" if progress < 7 else "Complete",
                    "current_station": ops[-1]["station_id"] if ops else None,
                    "operations": ops,
                    "components": [
                        {"part": "CVD Rod Bundle", "serial": rod,
                         "lot": f"L-HS-{random.randint(100, 999)}", "supplier": "Hemlock CVD Farm"},
                        {"part": "TCS Feed Lot", "serial": f"TCS-HS-{4000 + i}{v}",
                         "lot": f"L-HS-{random.randint(100, 999)}", "supplier": "Hemlock Distillation"},
                        {"part": "Chunk Bag", "serial": f"{BAG_PREFIX}{3000 + i}{v}",
                         "lot": f"L-HS-{random.randint(100, 999)}", "supplier": "Hemlock Harvest"},
                        {"part": "Ship Drum", "serial": f"{DRUM_PREFIX}{random.randint(100000, 999999)}",
                         "lot": f"L-HS-{random.randint(100, 999)}"},
                        {"part": "Desiccant Kit", "serial": f"DSC-HS-{random.randint(10000, 99999)}",
                         "lot": f"L-HS-{228 if i < 3 else random.randint(100, 999)}"},
                    ],
                    "downstream": {
                        "customer": customer,
                        "ship_to": ship_to,
                        "customer_po": customer_po,
                        "ingot_campaign": f"ING-{random.randint(100, 400)}",
                    },
                    "warranty": {
                        "status": "Active" if progress >= 7 else "Build",
                        "starts": ts_offset(days=random.randint(0, 30)) if progress >= 7 else None,
                        "months": 12,
                        "claims": [
                            {
                                "id": f"CLM-HS-{8000 + i}{v}",
                                "opened": ts_offset(days=random.randint(5, 40)),
                                "symptom": "Elevated Fe ppb on inbound assay",
                                "status": random.choice(["Open", "Investigating", "Closed"]),
                                "linked_serial": rod,
                            }
                        ] if i == 0 and v == 0 else [],
                    },
                }

    vins = list(DB["vins"].keys())
    for st in DB["stations"].values():
        if st["state"] in ("Running", "Blocked", "Faulted") and vins:
            st["current_vin"] = random.choice(vins)


def _seed_work_instructions():
    specs = [
        ("WI-HS-CVD-09", "Siemens CVD Heat Cycle", "st-hs-siemens-reactor-line-02", [
            ("Scan filament carrier and recipe card", "scan", "Must match SAP BOM / POLY PO"),
            ("Load slim rods / filaments", "manual", "Contact gloves Class 100"),
            ("Start CVD heat recipe", "tool", "Temp ramp per EG Rod Segment 11N"),
            ("Vision reactor guard check", "vision", "Model reactor-glow@2.4 threshold 0.94"),
            ("Confirm genealogy", "confirm", "LOT-HS bound to ROD-HS + TCS-HS"),
        ]),
        ("WI-HS-HVS-05", "Chunk Vision Sort & Screen", "st-hs-rod-harvest-line-04", [
            ("Scan rod bundle", "scan", "Pair to harvest lot"),
            ("Crush & screen recipe", "tool", "Fines % within EG band"),
            ("Vision chunk discoloration", "vision", "No carbon inclusion blobs"),
            ("Bag sample retain", "manual", "Retain bag for ICP-MS"),
            ("Disposition", "confirm", "Hold if metal or carbon fails"),
        ]),
        ("WI-HS-MTS-03", "ICP-MS Gate & Drum Pack", "st-hs-eg-pack-ship-line-01", [
            ("Pull retain sample", "manual", "Chain of custody tag"),
            ("Run ICP-MS metals panel", "tool", "Fe / Ni / Cu within EG 9N+"),
            ("Moisture / leak on drum", "tool", "Pass band per Cleanroom Pack A"),
            ("Drum pack scan", "vision", "Seal present; desiccant lot L-HS-xxx"),
            ("Ship disposition", "confirm", "ASN hold if any fail"),
        ]),
    ]
    for wi_id, name, station_id, steps in specs:
        DB["work_instructions"][wi_id] = {
            "id": wi_id, "name": name, "station_id": station_id,
            "version": f"v{random.randint(2, 6)}", "status": "Deployed",
            "effective": ts_offset(days=random.randint(5, 60)),
            "approved_by": "N. Brooks (Quality Lead)",
            "steps": [
                {"seq": i + 1, "title": t, "kind": k, "criteria": c,
                 "evidence_required": k in ("scan", "vision", "tool")}
                for i, (t, k, c) in enumerate(steps)
            ],
        }
    for wf_name, target, status in [
        ("Tighten Fe ppb gate after customer NCR", "WI-HS-MTS-03", "In Review"),
        ("EG Rod Segment 11N CVD recipe sync with Summit Silicon", "WI-HS-CVD-09", "Approved"),
    ]:
        wf_id = new_id("wf")
        DB["workflows"][wf_id] = {
            "id": wf_id, "name": wf_name, "target_instruction": target,
            "status": status, "author": "Y. Sato",
            "created": ts_offset(days=random.randint(1, 9)),
            "compiled_outputs": [
                "Operator guidance package", "Edge state machine v2",
                "Evidence schema", "PLC handshake test set",
            ],
        }


def _seed_quality_and_vision():
    model_specs = [
        ("chunk-discolor", "Chunk discoloration / carbon", "st-hs-rod-harvest-line-04", "2.8", "Production"),
        ("reactor-glow", "CVD reactor vision guard", "st-hs-siemens-reactor-line-03", "2.4", "Production"),
        ("impurity-ir", "TCS impurity IR assist", "st-hs-tcs-distillation-line-03", "1.7", "Shadow"),
        ("drum-seal", "Drum pack seal presence", "st-hs-eg-pack-ship-line-03", "3.1", "Production"),
        ("rod-diameter", "Rod diameter gauge assist", "st-hs-rod-harvest-line-02", "2.1", "Production"),
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
                     "fit": random.random() > 0.12}
                    for v in random.sample(VARIANTS, 3)
                ],
                "cost_assumptions": {
                    "escape_cost_usd": 245000, "false_reject_cost_usd": 680,
                    "reinspect_cost_usd": 140,
                },
                "hardware_profile": "IPC-NVIDIA A2 · GigE 2×12MP · ICP-MS uplink",
                "approved_by": "N. Brooks (Quality Lead)",
                "rollback_target": f"{slug}@{float(ver) - 0.1:.1f}",
            },
            "drift": {
                "confidence_trend": [round(random.uniform(0.92, 0.99), 3) for _ in range(14)],
                "input_shift_score": round(random.uniform(0.01, 0.18), 3),
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
                        if s["archetype"] in ("surface", "presence", "leak", "sequence", "process", "eol")]
    for i in range(42):
        iid = new_id("insp")
        vin = random.choice(vins) if vins else None
        station = random.choice(stations_surface)
        verdict = random.choices(["Pass", "Fail", "Review"], weights=[78, 11, 11])[0]
        conf = round(random.uniform(0.55, 0.98), 3) if verdict == "Review" else round(random.uniform(0.9, 0.999), 3)
        model_id = random.choice(list(DB["models"].keys()))
        insp = {
            "id": iid, "vin": vin, "station_id": station,
            "model_id": model_id,
            "model_version": DB["models"][model_id]["version"],
            "verdict": verdict, "confidence": conf,
            "captured": ts_offset(minutes=random.randint(2, 480)),
            "camera": f"CAM-{random.randint(1, 4)}",
            "lighting_recipe": f"HS-{random.randint(1, 4)}",
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
                "repeat_rate_shift": round(random.uniform(0.0, 0.08), 3),
            }

    hold_id = new_id("hold")
    DB["holds"][hold_id] = {
        "id": hold_id,
        "reason": "Metal contamination spike — Rod Harvest Line",
        "defect_class": "Metal contamination spike",
        "scope": "Lots LOT-HS-50000..LOT-HS-50007 (Desiccant kit L-HS-228)",
        "units_estimated": 8,
        "units_confirmed": 3,
        "applied_by": "N. Brooks",
        "applied": ts_offset(hours=3),
        "status": "Active",
        "integration": {
            "wms": "Notified", "erp": "Blocked-for-ship",
            "qms": "NCR-HS-318 created",
            "customer": "Summit Silicon notified (ASN hold)",
        },
    }
    DB["defect_classes"] = list(DEFECT_CLASSES)


def _seed_agents():
    agent_specs = [
        ("Constraint Radar", "L1 · Recommend",
         "Ranks hyperpure constraints by customer ship-date and ingot campaign impact.",
         "Watch CVD and harvest for cycle creep; rank by POLY PO risk.",
         ["bind-status", "bind-timeseries", "bind-order", "bind-defect"]),
        ("Containment Assistant", "L3 · Execute with approval",
         "Walks desiccant / TCS lot → rod → shipping lot genealogy for holds.",
         "Given a metal contamination defect, walk genealogy into LOT-HS serials and draft holds.",
         ["bind-defect", "bind-vin", "bind-inspection", "bind-order"]),
        ("RCA Investigator", "L2 · Draft",
         "Correlates ICP-MS Fe ppb with desiccant lot and crush fines signals.",
         "Assemble metal events with lot L-HS-228 history into a cause hypothesis.",
         ["bind-defect", "bind-timeseries", "bind-status", "bind-inspection"]),
        ("Shift Brief Writer", "L0 · Retrieve",
         "Morning brief with customer ship commitments and open NCRs.",
         "Retrieve overnight orders, station status, and quality events for Michigan Hyperpure.",
         ["bind-order", "bind-status", "bind-defect", "bind-vin"]),
        ("Reinspection Trigger", "L4 · Bounded automation",
         "Second capture on borderline chunk / drum-seal confidence.",
         "Trigger reversible second capture when chunk confidence is borderline.",
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
        ("agent-containment-assistant", "Hold LOT-HS-50000..LOT-HS-50007",
         "Metal contamination spike on desiccant kit L-HS-228. Genealogy maps to 8 EG lots for Summit Silicon.",
         {"products_affected": 8, "reversible": True, "downstream": ["WMS ship-block", "Customer ASN hold"]},
         "Approved", "C. Hale (Plant Manager)"),
        ("agent-rca-investigator", "Root cause: desiccant kit L-HS-228 moisture ingress",
         "Fe ppb correlates 0.89 with kit L-HS-228 after supplier change. Quarantine remaining kits.",
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
            "outcome": ("8 lots held; Summit Silicon ASN updated." if status == "Approved" else None),
        }


def _seed_edge():
    node_specs = [
        ("edge-hs-cvd", "CVD Reactor Edge", "CVD Reactor Farm", ["line-hs-siemens-reactor-line"], "Healthy"),
        ("edge-hs-hvs", "Harvest Edge", "Harvest & Size", ["line-hs-rod-harvest-line"], "Degraded"),
        ("edge-hs-fds", "Distillation Edge", "Feedstock & Distillation", ["line-hs-tcs-distillation-line"], "Healthy"),
        ("edge-hs-mts", "Pack & Ship Edge", "Metrology & Ship", ["line-hs-eg-pack-ship-line"], "Healthy"),
    ]
    for nid, name, area, lines, health in node_specs:
        DB["edge_nodes"][nid] = {
            "id": nid, "name": name, "area": area, "lines": lines,
            "health": health, "version": "livis-edge 1.8.3",
            "k3s": "v1.31.2+k3s1",
            "gpu": random.choice(["NVIDIA A2", "NVIDIA A2", "None"]),
            "queue_depth": random.randint(0, 40) if health != "Offline" else 800,
            "data_lag_s": round(random.uniform(0.2, 3.0), 1),
            "storage_used_pct": random.randint(22, 78),
            "clock": {"source": "PTP", "trust": round(random.uniform(0.9, 1.0), 2)},
            "secure_boot": True, "tpm": True,
            "cert_expiry_days": random.randint(40, 320),
            "last_seen": now(),
            "mission_readiness": {
                "score": {"Healthy": random.randint(92, 99), "Degraded": 71, "Offline": 18}[health],
                "limiting_factors": {
                    "Healthy": [],
                    "Degraded": ["Chunk Vision Sort camera intermittent"],
                    "Offline": ["WAN down"],
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
        ("OPC UA", "opc.tcp://plc-hs-cvd:4840", "edge-hs-cvd", "Connected", 128),
        ("GigE Vision", "cam-chunk-01", "edge-hs-hvs", "Connected", 2),
        ("MQTT Sparkplug B", "mqtt://broker-hemlock:1883", "edge-hs-mts", "Connected", 52),
        ("REST/ERP", "sap-hs-michigan", "central", "Connected", 8),
        ("QMS Webhook", "qms.michigan.hemlock.local/ncr", "central", "Connected", 3),
    ]:
        cid = new_id("conn")
        DB["connectors"][cid] = {
            "id": cid, "protocol": proto, "endpoint": endpoint,
            "node_id": node, "status": status, "mapped_tags": tags,
            "quality": round(random.uniform(0.95, 1.0), 3),
            "last_sample": now(),
        }

    try:
        from ..edge_recipe import materialize_recipe
        sort_station = "st-hs-rod-harvest-line-04"
        recipe = materialize_recipe(
            node_id="edge-hs-hvs",
            station_id=sort_station,
            name="Chunk Vision Sort · Edge+",
            description=(
                "Hemlock Michigan Edge+ recipe for Chunk Vision Sort — "
                "OPC-UA / metals tags map via source_address for Twin live charts."
            ),
        )
        DB.setdefault("edge_recipes", {})["edge-hs-hvs"] = recipe
        n = DB["edge_nodes"]["edge-hs-hvs"]
        n["station_id"] = sort_station
        n["recipe_id"] = recipe.get("recipe_id")
        n["recipe_version"] = recipe.get("recipe_version")
        n["version"] = "livis-edge-plus 0.1.0"
    except Exception:
        pass


def _seed_events_actions():
    for pri, kind, title, st, impact, owner, owned in [
        ("P1", "Faulted", "CVD Heat Cycle faulted — filament temp runaway",
         "st-hs-siemens-reactor-line-02", "Summit Silicon ship risk for POLY-PO-310000", "C. Hale", False),
        ("P1", "Quality", "Metal contamination cluster — containment active",
         "st-hs-rod-harvest-line-04", "8 EG lots held", "N. Brooks", True),
        ("P2", "Quality Hold", "Chunk vision hold — carbon inclusion",
         "st-hs-rod-harvest-line-04", "5 bags awaiting disposition", "N. Brooks", True),
        ("P3", "Starved", "ICP-MS Sample Gate starved — upstream harvest lag",
         "st-hs-eg-pack-ship-line-01", "Throughput risk after lunch", "Y. Sato", False),
        ("P3", "Changeover", "Column pressure recipe changeover — EG → Solar Plus",
         "st-hs-tcs-distillation-line-02", "Schedule impact minor", "E. Vargas", True),
        ("P2", "Edge", "Harvest edge degraded — Chunk Vision camera intermittent",
         "st-hs-rod-harvest-line-04", "Store-and-forward queue growing", "M. Kowalski", True),
        ("P4", "Info", "WI-HS-MTS-03 Rev D awaiting Fe ppb gate approval",
         None, "Change board Thursday", "T. Nguyen", True),
    ]:
        eid = new_id("evt")
        DB["events"][eid] = {
            "id": eid, "priority": pri, "kind": kind, "title": title,
            "station_id": st, "impact": impact, "owner": owner if owned else None,
            "owned": owned, "acknowledged": owned,
            "acked": owned, "created": ts_offset(hours=random.randint(1, 8)),
            "status": "Open",
        }
    for title, owner, pri, status, context in [
        ("Replace filament TC on Siemens reactor R-12", "Maintenance", "P1", "In Progress",
         "RCA: filament temp runaway on CVD Heat Cycle; Summit Silicon ship risk"),
        ("Quarantine desiccant kit L-HS-228; open supplier NCR", "N. Brooks", "P1", "Open",
         "Containment Assistant: metal spike maps to kit L-HS-228 genealogy"),
        ("Release held LOT-HS lot after ICP-MS retest", "C. Hale", "P2", "Open",
         "Constraint Radar + NCR-HS-318; ASN hold for Summit Silicon"),
        ("Rebalance operator to ICP-MS Sample Gate", "Y. Sato", "P3", "Open",
         "Starvation chain from harvest lag"),
        ("Approve WI-HS-MTS-03 Fe ppb gate tighten", "T. Nguyen", "P3", "Open",
         "Customer NCR follow-up; Twin Compiler ready"),
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
        ("Escape prevented (to customer)", 1, 245000),
        ("False reject avoided", 5, 680),
        ("Rework hours saved", 12, 140),
        ("Customer claim avoided", 1, 92000),
    ]
    for day in range(14):
        for name, base_qty, unit_value in categories:
            qty = max(0, int(random.gauss(base_qty, max(1, base_qty * 0.25))))
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
        ("Claire Hale", "Plant Manager", "plant-manager"),
        ("Nora Brooks", "Quality Lead", "quality"),
        ("Y. Sato", "Supervisor", "supervisor"),
        ("E. Vargas", "Operator", "operator"),
        ("T. Nguyen", "Process Engineer", "mfg-engineer"),
        ("M. Kowalski", "OT/Controls Engineer", "ot-engineer"),
    ]:
        uid = new_id("user")
        DB["users"][uid] = {
            "id": uid, "name": name, "role": role, "role_id": role_id,
            "site": "Hemlock Semiconductor · Michigan Hyperpure Ops",
            "skills": random.sample(
                ["CVD Recipes L2", "Vision Review", "ICP-MS Gate", "TCS Distillation", "Chunk Sort"],
                k=2,
            ),
            "sso": "OIDC (Entra)", "active": True,
        }
    for kind, actor, detail in [
        ("hold.apply", "N. Brooks", "Applied hold LOT-HS-50000..50007 (NCR-HS-318)"),
        ("agent.action.approve", "C. Hale", "Approved containment for Summit-bound EG lot"),
        ("workflow.approve", "T. Nguyen", "Approved EG Rod Segment 11N CVD recipe sync"),
    ]:
        aid = new_id("audit")
        DB["audit"][aid] = {
            "id": aid, "kind": kind, "actor": actor, "detail": detail,
            "at": ts_offset(hours=random.randint(1, 70)), "source": "central",
        }


def _seed_kpis():
    DB["kpis"] = {
        "plan_units": 56, "actual_units": 49,
        "oee": 0.761, "fpy": 0.971,
        "open_stops": 2, "escapes_mtd": 0,
        "takt_adherence": 0.93,
        "money_saved_today_usd": 264820.0,
        "hours_saved_today": 18.6,
        "scrap_prevented_today": 4,
        "co2_saved_kg": 41.0,
        "payback_months": 5.2,
        "projected_annual_value_usd": 5100000,
        "oee_trend": [round(random.uniform(0.70, 0.82), 3) for _ in range(24)],
        "fpy_trend": [round(random.uniform(0.94, 0.99), 3) for _ in range(24)],
        "output_by_hour": [random.randint(3, 7) for _ in range(12)],
        "plan_by_hour": [5] * 12,
    }
    DB["shift_briefs"]["today"] = {
        "id": "today",
        "generated": now(),
        "agent": "Shift Brief Writer v2.1",
        "headline": "8 EG lots on hold for desiccant kit L-HS-228 — Summit Silicon ASN updated.",
        "sections": [
            {"title": "Customer risk",
             "body": "POLY-PO-310000 partial ship delayed; Summit Silicon notified.",
             "evidence": ["NCR-HS-318"]},
            {"title": "Biggest cause",
             "body": "Metal contamination correlated with desiccant kit L-HS-228 moisture ingress.",
             "evidence": ["EV-HS-228"]},
            {"title": "Suggested fix",
             "body": "Quarantine remaining kits; retest held lots; resume ship after ICP-MS pass.",
             "evidence": ["CMMS-DRAFT-HS-09"]},
        ],
        "actions_proposed": 2,
    }


def _seed_graph_schema():
    schema = {
        "id": "schema-hemlock-hs",
        "name": "Hemlock Michigan Hyperpure Ops context model",
        "version": "1.0",
        "status": "Draft",
        "updated_at": now(),
        "updated_by": "T. Nguyen",
        "description": "Polysilicon / hyperpure silicon plant — TCS, CVD rods, harvest, EG pack & ship.",
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
             "enabled": True, "description": "Vision and ICP-MS captures for EG quality.",
             "protocol": "GigE Vision", "properties": []},
            {"id": "bind-status", "object_type": "status", "label": "Station / line status objects",
             "report_at": "station", "rollup_to": ["line", "area"], "lenses": ["production", "maintenance"],
             "enabled": True, "description": "Live state and health.", "protocol": "OPC UA", "properties": []},
            {"id": "bind-defect", "object_type": "defect", "label": "Defect / NCR objects",
             "report_at": "station", "rollup_to": ["line", "area", "facility"], "lenses": ["quality"],
             "enabled": True, "description": "Quality events and holds.", "protocol": "MQTT Sparkplug B",
             "properties": []},
            {"id": "bind-order", "object_type": "order", "label": "Production order objects",
             "report_at": "line", "rollup_to": ["area", "facility"], "lenses": ["production", "supply_chain"],
             "enabled": True, "description": "Customer POs from ERP / SAP.", "protocol": "REST/JSON",
             "properties": []},
            {"id": "bind-vin", "object_type": "genealogy", "label": "Lot / rod / bag genealogy",
             "report_at": "station", "rollup_to": ["line", "facility"],
             "lenses": ["production", "supply_chain", "quality", "warranty"], "enabled": True,
             "description": "LOT-HS identity with rod, TCS, bag, drum components and customer ship link.",
             "protocol": "MES Context", "properties": []},
            {"id": "bind-timeseries", "object_type": "timeseries", "label": "Process time series",
             "report_at": "device", "rollup_to": ["station", "line"], "lenses": ["production", "maintenance"],
             "enabled": True, "description": "Historian tags (temp, TCS flow, Fe ppb).", "protocol": "OPC UA",
             "properties": []},
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
