"""
Lam Research seed — Fremont Chamber Ops.

Semiconductor capital equipment plant building dielectric etch / deposition
chamber modules and tool subsystems for leading wafer-fab customers.
Serials use TOOL-LR- / CHM-LR- prefixes (stored in the VIN field for API compat).
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

random.seed(303)

PRODUCT = "Dielectric Etch Chamber Module"
VARIANTS = [
    "Sense.i Etch Gen3", "Coventor Deposition Pack",
    "Kiyo Conductor Etch", "Versys Metal Etch Module",
    "VECTOR PECVD Chamber",
]
FINISHES = ["Cleanroom White", "Anodize Al", "SS Electropolish"]
OPERATORS = [
    "M. Chen", "R. Patel", "K. Nakamura", "A. Vogel",
    "J. Kim", "S. Ortiz", "L. Berg", "D. Wu",
]
ORDER_SOURCES = ["SAP", "ERP", "APS", "Manual"]
TOOL_PREFIX = "TOOL-LR-"
CHM_PREFIX = "CHM-LR-"
RF_PREFIX = "RF-LR-"
GAS_PREFIX = "GAS-LR-"

DEFECT_CLASSES = [
    ("Chamber O-ring nick", "leak"), ("Electrode flatness out", "surface"),
    ("RF connector pin bent", "presence"), ("Gas-box seal void", "leak"),
    ("Torque under-spec on flange", "torque"), ("Particle residue on liner", "surface"),
    ("CMM dimensional oversize", "process"), ("Helium leak rate high", "leak"),
]


def _set_state(station_id: str, state: str):
    st = DB["stations"].get(station_id)
    if st:
        st["state"] = state
        st["state_since"] = ts_offset(minutes=random.randint(4, 40))


def _seed_topology():
    site = {
        "id": "site-fremont-lr",
        "name": "Lam Research · Fremont Chamber Ops",
        "code": "LR-FCO",
        "timezone": "America/Los_Angeles",
        "shift": "Shift A (06:00-14:30)",
        "oem": "Lam Research",
        "tier": "oem",
        "customer": "Leading Foundry · Fab 18 / Logic",
    }
    DB["sites"][site["id"]] = site

    area_specs = [
        ("Chamber Fabrication", "CHF", ["Chamber Shell Line"]),
        ("RF & Controls", "RFC", ["RF Generator Line"]),
        ("Module Assembly", "ASM", ["Etch Module Line"]),
        ("Final Test & Ship", "TST", ["System Test Line"]),
    ]
    station_specs = {
        "Chamber Shell Line": [
            ("Shell CNC Mill", "process"), ("Plasma Spray Coat", "process"),
            ("Shell Vision Check", "surface"), ("Chamber Serial Mark", "presence"),
        ],
        "RF Generator Line": [
            ("RF Board Populate", "sequence"), ("RF Module Bond", "torque"),
            ("Connector Pin Check", "presence"), ("RF Sweep Bench", "eol"),
        ],
        "Etch Module Line": [
            ("Electrode Install", "torque"), ("Chamber Marriage", "sequence"),
            ("Gas Box Seal", "leak"), ("Config Label / Tool Serial", "presence"),
        ],
        "System Test Line": [
            ("Helium Leak Check", "leak"), ("Process Recipe Dry Run", "eol"),
            ("CMM Metrology Sample", "presence"), ("Pack & Ship Scan", "presence"),
        ],
    }
    takt_by_line = {
        "Chamber Shell Line": 180,
        "RF Generator Line": 150,
        "Etch Module Line": 240,
        "System Test Line": 300,
    }

    line_x = 0
    for area_name, code, line_names in area_specs:
        area_id = f"area-lr-{code.lower()}"
        DB["areas"][area_id] = {
            "id": area_id, "site_id": site["id"], "name": area_name, "code": code,
        }
        for ln in line_names:
            line_id = f"line-lr-{ln.lower().replace(' ', '-')}"
            takt = takt_by_line.get(ln, 200)
            DB["lines"][line_id] = {
                "id": line_id, "area_id": area_id, "site_id": site["id"],
                "name": ln, "takt_seconds": takt, "x": line_x,
            }
            for idx, (st_name, archetype) in enumerate(station_specs[ln]):
                st_id = f"st-{line_id[5:]}-{idx + 1:02d}"
                device_kinds = ["PLC", "Camera"]
                if archetype == "torque":
                    device_kinds.append("Torque Tool")
                if "CMM" in st_name or archetype == "leak":
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
                            "helium_leak_rate_sccm": {
                                "address": f"ns=2;s={st_name.replace(' ', '')}.HeliumLeak",
                                "unit": "sccm", "data_type": "float",
                            },
                            "chamber_pressure_mTorr": {
                                "address": f"ns=2;s={st_name.replace(' ', '')}.Pressure",
                                "unit": "mTorr", "data_type": "float",
                            },
                        }
                    DB["devices"][dev_id] = device
            line_x += 1

    _set_state("st-lr-etch-module-line-03", "Faulted")
    _set_state("st-lr-chamber-shell-line-03", "Quality Hold")
    _set_state("st-lr-system-test-line-01", "Starved")
    _set_state("st-lr-rf-generator-line-02", "Changeover")


def _tool_serial(i: int, v: int) -> str:
    return f"{TOOL_PREFIX}{9000 + i:04d}{v}"


def _seed_production():
    op_names = [
        "Shell machine", "Coat & inspect", "RF assemble", "Electrode install",
        "Chamber marriage", "Leak & dry-run", "Ship scan",
    ]
    assembly = ["line-lr-etch-module-line"]
    customers = [
        ("Leading Foundry Fab 18", "Hsinchu Logic"),
        ("Global Logic Fab 5", "Dresden"),
        ("MemoryTech Fab 3", "Boise"),
    ]
    for i in range(12):
        order_id = f"WO-LR{7000 + i}"
        variant = random.choice(VARIANTS)
        qty = random.choice([4, 6, 8, 12])
        completed = random.randint(1, qty - 1) if i < 9 else 0
        status = "Released" if i < 9 else "Planned"
        if i < 2:
            status = "Completed"
            completed = qty
        source = ORDER_SOURCES[i % len(ORDER_SOURCES)]
        customer, ship_to = customers[i % len(customers)]
        customer_po = f"FAB-PO-{920000 + i}"
        DB["orders"][order_id] = {
            "id": order_id,
            "source": source,
            "erp_ref": f"SAP-LR-{710000 + i}",
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
                serial = _tool_serial(i, v)
                chamber = f"{CHM_PREFIX}{8000 + i}{v}"
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
                            {"type": "metrology", "ref": f"CMM-{random.randint(10000, 99999)}"}
                            if op_name in ("Leak & dry-run", "Coat & inspect") else None,
                        ],
                        "instruction_version": f"WI-LR-{random.randint(10, 40)}.v{random.randint(1, 5)}",
                        "model_version": f"vision-{random.choice(['surface', 'leak', 'presence'])}@{random.randint(1, 6)}.{random.randint(0, 9)}",
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
                        {"part": "Chamber Shell", "serial": chamber,
                         "lot": f"L-LR-{random.randint(100, 999)}", "supplier": "Lam Fremont CHF"},
                        {"part": "RF Generator", "serial": f"{RF_PREFIX}{6000 + i}{v}",
                         "lot": f"L-LR-{random.randint(100, 999)}", "supplier": "Lam Fremont RFC"},
                        {"part": "Gas Box Assembly", "serial": f"{GAS_PREFIX}{5000 + i}{v}",
                         "lot": f"L-LR-{random.randint(100, 999)}", "supplier": "Lam Fremont ASM"},
                        {"part": "Upper Electrode", "serial": f"UEL-LR-{random.randint(100000, 999999)}",
                         "lot": f"L-LR-{random.randint(100, 999)}"},
                        {"part": "O-ring Kit", "serial": f"ORG-LR-{random.randint(10000, 99999)}",
                         "lot": f"L-LR-{441 if i < 3 else random.randint(100, 999)}"},
                    ],
                    "downstream": {
                        "customer": customer,
                        "ship_to": ship_to,
                        "customer_po": customer_po,
                        "fab_tool_bay": f"Bay-{random.randint(10, 40)}",
                    },
                    "warranty": {
                        "status": "Active" if progress >= 7 else "Build",
                        "starts": ts_offset(days=random.randint(0, 30)) if progress >= 7 else None,
                        "months": 24,
                        "claims": [
                            {
                                "id": f"CLM-LR-{9000 + i}{v}",
                                "opened": ts_offset(days=random.randint(5, 40)),
                                "symptom": "Elevated particle counts after install",
                                "status": random.choice(["Open", "Investigating", "Closed"]),
                                "linked_serial": chamber,
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
        ("WI-LR-CHM-12", "Chamber Marriage & Seal", "st-lr-etch-module-line-02", [
            ("Scan chamber shell and tool carrier", "scan", "Must match SAP BOM / fab PO"),
            ("Seat chamber on module frame", "manual", "Orientation key toward gas box"),
            ("Torque flange bolts to recipe", "tool", "Torque 28±2 Nm, star pattern"),
            ("Vision O-ring seating check", "vision", "Model chamber-oring@3.2 threshold 0.95"),
            ("Confirm genealogy", "confirm", "TOOL-LR serial bound to CHM-LR + RF-LR"),
        ]),
        ("WI-LR-GAS-07", "Gas Box Seal & Helium Pre-check", "st-lr-etch-module-line-03", [
            ("Scan gas box serial", "scan", "Pair to tool serial"),
            ("Install seal kit lot", "manual", "Lot must be L-LR qualified"),
            ("Vision seal void check", "vision", "No voids > 0.2 mm"),
            ("Helium spot check", "tool", "Pass band < 1e-8 sccm equiv"),
            ("Disposition", "confirm", "Hold if leak above band"),
        ]),
        ("WI-LR-TST-04", "System Helium Leak & Dry Run", "st-lr-system-test-line-01", [
            ("Clamp module on test stand", "manual", "Ports A/B sealed"),
            ("Run helium leak cycle", "tool", "Pass band per Sense.i Gen3 recipe"),
            ("Process recipe dry run", "tool", "Capture RF / pressure curves as evidence"),
            ("CMM sample points", "vision", "Electrode flatness within band"),
            ("Ship disposition", "confirm", "ASN hold if any fail"),
        ]),
    ]
    for wi_id, name, station_id, steps in specs:
        DB["work_instructions"][wi_id] = {
            "id": wi_id, "name": name, "station_id": station_id,
            "version": f"v{random.randint(2, 6)}", "status": "Deployed",
            "effective": ts_offset(days=random.randint(5, 60)),
            "approved_by": "R. Patel (Quality Lead)",
            "steps": [
                {"seq": i + 1, "title": t, "kind": k, "criteria": c,
                 "evidence_required": k in ("scan", "vision", "tool")}
                for i, (t, k, c) in enumerate(steps)
            ],
        }
    for wf_name, target, status in [
        ("Tighten gas-box seal window after fab particle NCR", "WI-LR-GAS-07", "In Review"),
        ("Sense.i Gen3 dry-run recipe sync with Fab 18 tool map", "WI-LR-TST-04", "Approved"),
    ]:
        wf_id = new_id("wf")
        DB["workflows"][wf_id] = {
            "id": wf_id, "name": wf_name, "target_instruction": target,
            "status": status, "author": "K. Nakamura",
            "created": ts_offset(days=random.randint(1, 9)),
            "compiled_outputs": [
                "Operator guidance package", "Edge state machine v2",
                "Evidence schema", "PLC handshake test set",
            ],
        }


def _seed_quality_and_vision():
    model_specs = [
        ("chamber-oring-seat", "Chamber O-ring seating", "st-lr-etch-module-line-02", "3.2", "Production"),
        ("gas-box-seal-void", "Gas box seal void", "st-lr-etch-module-line-03", "2.6", "Production"),
        ("shell-surface", "Chamber shell surface", "st-lr-chamber-shell-line-03", "1.9", "Shadow"),
        ("electrode-flatness", "Electrode flatness / CMM assist", "st-lr-system-test-line-03", "4.1", "Production"),
        ("rf-pin-presence", "RF connector pin presence", "st-lr-rf-generator-line-03", "2.3", "Production"),
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
                    "escape_cost_usd": 185000, "false_reject_cost_usd": 420,
                    "reinspect_cost_usd": 95,
                },
                "hardware_profile": "IPC-NVIDIA A2 · GigE 2×12MP · He leak sensor",
                "approved_by": "R. Patel (Quality Lead)",
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
                        if s["archetype"] in ("surface", "presence", "leak", "sequence", "process")]
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
                "repeat_rate_shift": round(random.uniform(0.0, 0.08), 3),
            }

    hold_id = new_id("hold")
    DB["holds"][hold_id] = {
        "id": hold_id,
        "reason": "Gas-box seal void cluster — Etch Module Line",
        "defect_class": "Gas-box seal void",
        "scope": "Carriers E-020..E-028 (Gas Box Seal, O-ring lot L-LR-441)",
        "units_estimated": 8,
        "units_confirmed": 3,
        "applied_by": "R. Patel",
        "applied": ts_offset(hours=3),
        "status": "Active",
        "integration": {
            "wms": "Notified", "erp": "Blocked-for-ship",
            "qms": "NCR-LR-552 created",
            "customer": "Leading Foundry Fab 18 notified (ASN hold)",
        },
    }
    DB["defect_classes"] = list(DEFECT_CLASSES)


def _seed_agents():
    agent_specs = [
        ("Constraint Radar", "L1 · Recommend",
         "Ranks chamber-line constraints by fab ship-date and tool-bay impact.",
         "Watch etch module and system test for cycle creep; rank by fab PO risk.",
         ["bind-status", "bind-timeseries", "bind-order", "bind-defect"]),
        ("Containment Assistant", "L3 · Execute with approval",
         "Walks O-ring lot → chamber → tool serial genealogy for fab-bound holds.",
         "Given a gas-box seal defect, walk genealogy into TOOL-LR serials and draft holds.",
         ["bind-defect", "bind-vin", "bind-inspection", "bind-order"]),
        ("RCA Investigator", "L2 · Draft",
         "Correlates helium leak curves with O-ring lot and spray-coat signals.",
         "Assemble leak events with lot L-LR-441 history into a cause hypothesis.",
         ["bind-defect", "bind-timeseries", "bind-status", "bind-inspection"]),
        ("Shift Brief Writer", "L0 · Retrieve",
         "Morning brief with fab ship commitments and open NCRs.",
         "Retrieve overnight orders, station status, and quality events for Fremont.",
         ["bind-order", "bind-status", "bind-defect", "bind-vin"]),
        ("Reinspection Trigger", "L4 · Bounded automation",
         "Second capture on borderline O-ring / seal confidence.",
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
        ("agent-containment-assistant", "Hold TOOL-LR-90000..TOOL-LR-90007",
         "Gas-box seal void cluster on O-ring lot L-LR-441. Genealogy maps to 8 etch modules for Fab 18.",
         {"products_affected": 8, "reversible": True, "downstream": ["WMS ship-block", "Fab ASN hold"]},
         "Approved", "M. Chen (Ops Lead)"),
        ("agent-rca-investigator", "Root cause: O-ring lot L-LR-441 compression set",
         "Helium leak correlates 0.91 with lot L-LR-441 after supplier cure change. Quarantine remaining kits.",
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
            "outcome": ("8 modules held; Fab 18 ASN updated." if status == "Approved" else None),
        }


def _seed_edge():
    node_specs = [
        ("edge-lr-asm", "Etch Module Edge", "Module Assembly", ["line-lr-etch-module-line"], "Healthy"),
        ("edge-lr-rfc", "RF Controls Edge", "RF & Controls", ["line-lr-rf-generator-line"], "Degraded"),
        ("edge-lr-chf", "Chamber Fab Edge", "Chamber Fabrication", ["line-lr-chamber-shell-line"], "Healthy"),
        ("edge-lr-tst", "System Test Edge", "Final Test & Ship", ["line-lr-system-test-line"], "Healthy"),
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
                "score": {"Healthy": random.randint(92, 99), "Degraded": 73, "Offline": 18}[health],
                "limiting_factors": {
                    "Healthy": [],
                    "Degraded": ["RF Sweep Bench camera intermittent"],
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
        ("OPC UA", "opc.tcp://plc-lr-asm:4840", "edge-lr-asm", "Connected", 112),
        ("GigE Vision", "cam-gasbox-01", "edge-lr-asm", "Connected", 2),
        ("MQTT Sparkplug B", "mqtt://broker-fremont:1883", "edge-lr-tst", "Connected", 48),
        ("REST/ERP", "sap-lr-fremont", "central", "Connected", 8),
        ("QMS Webhook", "qms.fremont.lam.local/ncr", "central", "Connected", 3),
    ]:
        cid = new_id("conn")
        DB["connectors"][cid] = {
            "id": cid, "protocol": proto, "endpoint": endpoint,
            "node_id": node, "status": status, "mapped_tags": tags,
            "quality": round(random.uniform(0.95, 1.0), 3),
            "last_sample": now(),
        }

    # Edge+ recipe for Gas Box Seal station (helium / vision live uplink)
    try:
        from ..edge_recipe import materialize_recipe
        seal_station = "st-lr-etch-module-line-03"
        recipe = materialize_recipe(
            node_id="edge-lr-asm",
            station_id=seal_station,
            name="Gas Box Seal · Edge+",
            description=(
                "Lam Fremont Edge+ recipe for Gas Box Seal — "
                "OPC-UA / helium leak tags map via source_address for Twin live charts."
            ),
        )
        DB.setdefault("edge_recipes", {})["edge-lr-asm"] = recipe
        n = DB["edge_nodes"]["edge-lr-asm"]
        n["station_id"] = seal_station
        n["recipe_id"] = recipe.get("recipe_id")
        n["recipe_version"] = recipe.get("recipe_version")
        n["version"] = "livis-edge-plus 0.1.0"
    except Exception:
        pass


def _seed_events_actions():
    for pri, kind, title, st, impact, owner, owned in [
        ("P1", "Faulted", "Gas Box Seal faulted — helium sensor timeout",
         "st-lr-etch-module-line-03", "Fab 18 ship risk for PO FAB-PO-920000", "M. Chen", False),
        ("P1", "Quality", "Gas-box seal void cluster — containment active",
         "st-lr-etch-module-line-03", "8 etch modules held", "R. Patel", True),
        ("P2", "Quality Hold", "Shell vision hold — particle residue on liner",
         "st-lr-chamber-shell-line-03", "4 shells awaiting disposition", "R. Patel", True),
        ("P3", "Starved", "Helium Leak Check starved — upstream seal lag",
         "st-lr-system-test-line-01", "Throughput risk after lunch", "K. Nakamura", False),
        ("P3", "Changeover", "RF Module Bond changeover — Sense.i → VECTOR recipe",
         "st-lr-rf-generator-line-02", "Schedule impact minor", "A. Vogel", True),
    ]:
        eid = new_id("evt")
        DB["events"][eid] = {
            "id": eid, "priority": pri, "kind": kind, "title": title,
            "station_id": st, "impact": impact, "owner": owner if owned else None,
            "owned": owned, "created": ts_offset(hours=random.randint(1, 8)),
            "acked": owned, "status": "Open",
        }
    for title, owner, pri, status, context in [
        ("Replace helium sensor cable on Gas Box Seal", "Maintenance", "P1", "In Progress",
         "Helium sensor timeout on Gas Box Seal; Fab 18 ship risk"),
        ("Quarantine O-ring lot L-LR-441; open supplier NCR", "R. Patel", "P1", "Open",
         "Containment Assistant: seal void cluster maps to lot L-LR-441"),
        ("Release held TOOL-LR lot after retest", "M. Chen", "P2", "Open",
         "NCR-LR-552; ASN hold for Leading Foundry Fab 18"),
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
        ("Escape prevented (to fab)", 1, 185000),
        ("False reject avoided", 6, 420),
        ("Rework hours saved", 14, 95),
        ("Warranty claim avoided", 2, 48000),
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
        ("Maya Chen", "Ops Lead", "plant-manager"),
        ("Raj Patel", "Quality Lead", "quality"),
        ("K. Nakamura", "Supervisor", "supervisor"),
        ("A. Vogel", "Operator", "operator"),
        ("J. Kim", "Manufacturing Engineer", "mfg-engineer"),
        ("S. Ortiz", "OT/Controls Engineer", "ot-engineer"),
    ]:
        uid = new_id("user")
        DB["users"][uid] = {
            "id": uid, "name": name, "role": role, "role_id": role_id,
            "site": "Lam Research · Fremont Chamber Ops",
            "skills": random.sample(
                ["Chamber Seal L2", "Vision Review", "Helium Leak", "CMM Metrology", "RF Sweep"],
                k=2,
            ),
            "sso": "OIDC (Okta)", "active": True,
        }
    for kind, actor, detail in [
        ("hold.apply", "R. Patel", "Applied hold TOOL-LR-90000..90007 (NCR-LR-552)"),
        ("agent.action.approve", "M. Chen", "Approved containment for Fab 18-bound etch lot"),
        ("workflow.approve", "J. Kim", "Approved Sense.i Gen3 dry-run recipe sync"),
    ]:
        aid = new_id("audit")
        DB["audit"][aid] = {
            "id": aid, "kind": kind, "actor": actor, "detail": detail,
            "at": ts_offset(hours=random.randint(1, 70)), "source": "central",
        }


def _seed_kpis():
    DB["kpis"] = {
        "plan_units": 48, "actual_units": 41,
        "oee": 0.742, "fpy": 0.964,
        "open_stops": 2, "escapes_mtd": 0,
        "takt_adherence": 0.91,
        "money_saved_today_usd": 198640.0,
        "hours_saved_today": 22.4,
        "scrap_prevented_today": 3,
        "co2_saved_kg": 28.0,
        "payback_months": 4.8,
        "projected_annual_value_usd": 4200000,
        "oee_trend": [round(random.uniform(0.68, 0.80), 3) for _ in range(24)],
        "fpy_trend": [round(random.uniform(0.94, 0.99), 3) for _ in range(24)],
        "output_by_hour": [random.randint(2, 5) for _ in range(12)],
        "plan_by_hour": [4] * 12,
    }
    DB["shift_briefs"]["today"] = {
        "id": "today",
        "generated": now(),
        "agent": "Shift Brief Writer v2.1",
        "headline": "8 etch modules on hold for O-ring lot L-LR-441 — Fab 18 ASN updated.",
        "sections": [
            {"title": "Customer risk",
             "body": "FAB-PO-920000 partial ship delayed; Leading Foundry Fab 18 notified.",
             "evidence": ["NCR-LR-552"]},
            {"title": "Biggest cause",
             "body": "Gas-box seal voids correlated with O-ring lot L-LR-441 compression set.",
             "evidence": ["EV-LR-441"]},
            {"title": "Suggested fix",
             "body": "Quarantine remaining kits; retest held modules; resume ship after helium pass.",
             "evidence": ["CMMS-DRAFT-LR-14"]},
        ],
        "actions_proposed": 2,
    }


def _seed_graph_schema():
    schema = {
        "id": "schema-fremont-lr",
        "name": "Lam Fremont Chamber Ops context model",
        "version": "1.0",
        "status": "Draft",
        "updated_at": now(),
        "updated_by": "J. Kim",
        "description": "Semiconductor equipment plant — etch/deposition chamber modules for fab customers.",
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
             "enabled": True, "description": "Vision and metrology captures for chamber quality.",
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
             "enabled": True, "description": "Fab POs from ERP / SAP.", "protocol": "REST/JSON",
             "properties": []},
            {"id": "bind-vin", "object_type": "genealogy", "label": "Tool / chamber serial genealogy",
             "report_at": "station", "rollup_to": ["line", "facility"],
             "lenses": ["production", "supply_chain", "quality", "warranty"], "enabled": True,
             "description": "TOOL-LR identity with chamber, RF, gas-box components and fab ship link.",
             "protocol": "MES Context", "properties": []},
            {"id": "bind-timeseries", "object_type": "timeseries", "label": "Process time series",
             "report_at": "device", "rollup_to": ["station", "line"], "lenses": ["production", "maintenance"],
             "enabled": True, "description": "Historian tags (helium, RF, pressure).", "protocol": "OPC UA",
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
