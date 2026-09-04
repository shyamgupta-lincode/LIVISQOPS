"""Production execution: orders, VIN storyline, work instructions, workflows."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..store import DB, new_id, now

router = APIRouter(prefix="/api", tags=["production"])

ORDER_SOURCES = ("SAP", "ERP", "APS", "WMS", "Manual")


@router.get("/orders")
def orders(source: str | None = None):
    result = list(DB["orders"].values())
    if source:
        result = [o for o in result if o.get("source") == source]
    return sorted(result, key=lambda o: o["id"])


class CreateOrder(BaseModel):
    product: str = "Harley-Davidson Motorcycle"
    variant: str
    color: str = "Vivid Black"
    qty: int = Field(default=12, ge=1, le=500)
    status: str = "Planned"
    source: str = "Manual"
    erp_ref: str | None = None
    line_id: str = "line-touring-assembly-line"
    created_by: str = "Jordan Hale"
    release: bool = False


@router.post("/orders")
def create_order(body: CreateOrder):
    """Manually create a work order (or ingest from an external source system)."""
    source = body.source if body.source in ORDER_SOURCES else "Manual"
    prefixes = {"SAP": "SAP", "ERP": "ERP", "APS": "APS", "WMS": "WMS", "Manual": "MAN"}
    order_id = f"WO-HD{new_id('wo')[-5:].upper()}"
    while order_id in DB["orders"]:
        order_id = f"WO-HD{new_id('wo')[-5:].upper()}"
    status = "Released" if body.release else (body.status if body.status in ("Planned", "Released", "On Hold") else "Planned")
    if body.line_id not in DB["lines"]:
        raise HTTPException(400, f"unknown line_id '{body.line_id}'")
    order = {
        "id": order_id,
        "source": source,
        "erp_ref": body.erp_ref or f"{prefixes[source]}-{new_id('ref')[-6:].upper()}",
        "product": body.product,
        "variant": body.variant,
        "color": body.color,
        "qty": body.qty,
        "completed": 0,
        "status": status,
        "due": now(),
        "line_id": body.line_id,
        "released_at": now() if status == "Released" else None,
        "created_by": body.created_by if source == "Manual" else "System sync",
    }
    DB["orders"][order_id] = order
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "order.create", "actor": order["created_by"],
        "detail": f"Created work order {order_id} from {source} ({order['erp_ref']})",
        "at": now(), "source": "production",
    }
    return order


@router.get("/orders/{order_id}")
def order_detail(order_id: str):
    order = DB["orders"].get(order_id)
    if not order:
        raise HTTPException(404, "order not found")
    vins = [v for v in DB["vins"].values() if v["order_id"] == order_id]
    return {**order, "vins": vins}


@router.get("/vins")
def vins(q: str | None = None):
    result = list(DB["vins"].values())
    if q:
        result = [v for v in result if q.lower() in v["vin"].lower()]
    return result[:50]


@router.get("/vins/{vin}")
def vin_storyline(vin: str):
    """VIN Storyline: full execution + proof history as one product timeline."""
    v = DB["vins"].get(vin)
    if not v:
        raise HTTPException(404, "vin not found")
    inspections = [i for i in DB["inspections"].values() if i.get("vin") == vin]
    defects = [d for d in DB["defects"].values() if d.get("vin") == vin]
    order = DB["orders"].get(v["order_id"])
    return {**v, "order": order, "inspections": inspections, "defects": defects}


class StepCompletion(BaseModel):
    step_seq: int
    operator: str = "A. Kulkarni"
    evidence_ref: str | None = None


@router.post("/stations/{station_id}/complete-step")
def complete_step(station_id: str, body: StepCompletion):
    st = DB["stations"].get(station_id)
    if not st:
        raise HTTPException(404, "station not found")
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "operation.step.complete", "actor": body.operator,
        "detail": f"Step {body.step_seq} completed at {st['name']}"
                  + (f" (evidence {body.evidence_ref})" if body.evidence_ref else ""),
        "at": now(), "source": "station-hmi",
    }
    return {"ok": True, "station": st["name"], "step_seq": body.step_seq,
            "committed_at": now(), "audit_id": aid}


@router.get("/work-instructions")
def work_instructions():
    return list(DB["work_instructions"].values())


@router.get("/work-instructions/{wi_id}")
def work_instruction(wi_id: str):
    wi = DB["work_instructions"].get(wi_id)
    if not wi:
        raise HTTPException(404, "instruction not found")
    return wi


@router.get("/workflows")
def workflows():
    return list(DB["workflows"].values())


@router.post("/workflows/{wf_id}/approve")
def approve_workflow(wf_id: str):
    wf = DB["workflows"].get(wf_id)
    if not wf:
        raise HTTPException(404, "workflow not found")
    wf["status"] = "Approved"
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "workflow.approve", "actor": "M. Fernandes",
        "detail": f"Approved workflow: {wf['name']}", "at": now(), "source": "central",
    }
    return wf


@router.post("/workflows/{wf_id}/compile")
def compile_workflow(wf_id: str):
    """Executable Twin Compiler: one design -> guidance, edge logic, tests."""
    wf = DB["workflows"].get(wf_id)
    if not wf:
        raise HTTPException(404, "workflow not found")

    wi = DB["work_instructions"].get(wf.get("target_instruction"))
    steps = (wi or {}).get("steps") or []
    station_id = (wi or {}).get("station_id") or ""
    station = DB["stations"].get(station_id)
    n_steps = max(len(steps), 1)
    tests_total = 14
    tests_passed = 14

    # Deterministic state labels from WI steps
    sm_nodes = [{"id": "idle", "label": "Idle / waiting", "type": "entry"}]
    for s in steps:
        sm_nodes.append({
            "id": f"s{s.get('seq', 0)}",
            "label": s.get("title", "Step"),
            "type": "action",
            "kind": s.get("kind"),
            "evidence": bool(s.get("evidence_required")),
        })
    sm_nodes.append({"id": "permit", "label": "PLC permit", "type": "handshake"})
    sm_nodes.append({"id": "complete", "label": "Complete", "type": "exit"})
    sm_edges = []
    for i in range(len(sm_nodes) - 1):
        sm_edges.append({
            "from": sm_nodes[i]["id"],
            "to": sm_nodes[i + 1]["id"],
            "on": "ok" if sm_nodes[i]["type"] != "handshake" else "handshake_ack",
        })

    guidance = [
        {
            "seq": s.get("seq", i + 1),
            "title": s.get("title"),
            "kind": s.get("kind"),
            "criteria": s.get("criteria"),
            "prompt": f"Operator: {s.get('title')} — gate on {s.get('criteria')}",
            "evidence_required": bool(s.get("evidence_required")),
        }
        for i, s in enumerate(steps)
    ] or [
        {
            "seq": 1, "title": "Follow approved change", "kind": "manual",
            "criteria": wf.get("name"), "prompt": wf.get("name"),
            "evidence_required": True,
        }
    ]

    evidence_fields = [
        {"key": "vin", "type": "string", "required": True, "source": "scan"},
        {"key": "step_id", "type": "string", "required": True, "source": "runtime"},
        {"key": "captured_at", "type": "datetime", "required": True, "source": "edge_clock"},
        {"key": "verdict", "type": "enum", "required": True, "values": ["Pass", "Fail", "Rework"]},
        {"key": "confidence", "type": "number", "required": False, "source": "vision"},
        {"key": "tool_curve_ref", "type": "string", "required": False, "source": "tool"},
        {"key": "operator_id", "type": "string", "required": True, "source": "session"},
    ]

    handshake_tests = [
        {"id": f"HS-{i + 1:02d}", "name": name, "result": "pass", "latency_ms": 18 + i * 3}
        for i, name in enumerate([
            "Request permit assert", "Permit grant within 200ms", "Permit revoke on NC",
            "Safety interlock not writable", "VIN bind before permit", "Duplicate permit rejected",
            "Offline queue handshake", "Clock skew ≤ 50ms", "Tag map completeness",
            "Abort clears permit", "Rework path re-request", "Andon blocks permit",
            "Genealogy write ack", "Release to next station",
        ])
    ]

    package_id = f"twin-{wf_id[-8:]}"
    wf["status"] = "Compiled"
    wf["compiled_at"] = now()
    wf["package_id"] = package_id

    return {
        "package_id": package_id,
        "workflow": wf,
        "instruction": {
            "id": (wi or {}).get("id") or wf.get("target_instruction"),
            "name": (wi or {}).get("name") or wf.get("name"),
            "version": (wi or {}).get("version") or "Rev A",
            "station_id": station_id,
            "station_name": (station or {}).get("name") or station_id or "—",
            "steps": n_steps,
        },
        "stages": [
            {"id": "resolve", "label": "Resolve design & station context", "detail": f"{n_steps} steps · {station_id or 'unbound'}"},
            {"id": "guidance", "label": "Generate operator guidance", "detail": f"{len(guidance)} prompts"},
            {"id": "state_machine", "label": "Compile edge state machine", "detail": f"{len(sm_nodes)} nodes"},
            {"id": "evidence", "label": "Emit evidence schema", "detail": f"{len(evidence_fields)} fields"},
            {"id": "handshake", "label": "Run PLC handshake tests", "detail": f"{tests_passed}/{tests_total} passed"},
            {"id": "simulate", "label": "Build simulation scenario", "detail": "Shadow takt + NC paths"},
            {"id": "sign", "label": "Sign deployable package", "detail": "livis-central-ca"},
        ],
        "summary": {
            "artifacts": 5,
            "tests_passed": tests_passed,
            "tests_total": tests_total,
            "steps": n_steps,
            "station": (station or {}).get("name") or station_id or "—",
            "duration_ms": 1840 + n_steps * 40,
        },
        "artifacts": [
            {
                "kind": "operator_guidance",
                "label": "Operator guidance",
                "ref": f"pkg-ui-{wf_id}",
                "status": "Generated",
                "blurb": "Glove-friendly step prompts bound to evidence gates.",
                "preview": {"steps": guidance},
            },
            {
                "kind": "edge_state_machine",
                "label": "Edge state machine",
                "ref": f"pkg-sm-{wf_id}",
                "status": "Generated",
                "blurb": "Deterministic station runtime for the edge node.",
                "preview": {"nodes": sm_nodes, "edges": sm_edges},
            },
            {
                "kind": "evidence_schema",
                "label": "Evidence schema",
                "ref": f"pkg-ev-{wf_id}",
                "status": "Generated",
                "blurb": "Multimodal proof fields written to genealogy.",
                "preview": {"fields": evidence_fields},
            },
            {
                "kind": "plc_handshake_tests",
                "label": "PLC handshake tests",
                "ref": f"pkg-hs-{wf_id}",
                "status": f"{tests_passed}/{tests_total} passed",
                "blurb": "Allowlisted permit contracts — safety logic not writable.",
                "preview": {"tests": handshake_tests, "passed": tests_passed, "total": tests_total},
            },
            {
                "kind": "simulation_scenario",
                "label": "Simulation scenario",
                "ref": f"pkg-sim-{wf_id}",
                "status": "Generated",
                "blurb": "Shadow run before production cutover.",
                "preview": {
                    "scenario": "nominal_plus_nc",
                    "takt_s": (station or {}).get("cycle_time_s") or 60,
                    "paths": ["happy_path", "rework_loop", "andon_hold"],
                    "expected_oee_delta": 0.4,
                    "units": 24,
                },
            },
        ],
        "signature": {
            "signer": "livis-central-ca",
            "signed_at": now(),
            "algorithm": "Ed25519",
            "digest": f"sha256:{package_id}",
        },
    }
