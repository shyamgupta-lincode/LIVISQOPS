"""First-class quality events with governed lifecycle."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..platform import bus
from ..platform.stores import event_ledger, knowledge
from ..store import DB, new_id, now

router = APIRouter(prefix="/api/quality-events", tags=["quality-events"])

LIFECYCLE = [
    "Detected",
    "Validation",
    "Containment",
    "Investigation",
    "Disposition",
    "CorrectiveAction",
    "EffectivenessCheck",
    "Closed",
]

# Soft role gates for transitions (demo)
ROLE_GATES = {
    "Validation": ["quality", "quality-lead", "plant-manager"],
    "Containment": ["operator", "supervisor", "quality", "quality-lead", "plant-manager"],
    "Investigation": ["quality", "quality-lead", "mfg-engineer", "plant-manager"],
    "Disposition": ["quality-lead", "plant-manager", "quality-manager"],
    "CorrectiveAction": ["mfg-engineer", "maintenance", "quality-lead", "plant-manager"],
    "EffectivenessCheck": ["quality", "quality-lead", "plant-manager"],
    "Closed": ["quality-lead", "quality-manager", "plant-manager"],
}


class CreateQE(BaseModel):
    characteristic: str
    measured_value: float | str | None = None
    units: str | None = None
    specification: str | None = None
    product: str | None = None
    order_id: str | None = None
    lot: str | None = None
    serial: str | None = None
    operation: str | None = None
    equipment_id: str | None = None
    tool_id: str | None = None
    cavity: str | None = None
    recipe: str | None = None
    process_window: str | None = None
    detection_method: str = "vision"
    anomaly_evidence: list[dict] = Field(default_factory=list)
    severity: str = "Major"
    risk: str | None = None
    affected_scope: str | None = None
    defect_id: str | None = None
    candidate_id: str | None = None
    context: dict | None = None
    owner_role: str = "quality"
    due_at: str | None = None


class TransitionBody(BaseModel):
    to_status: str
    actor: str
    role: str = "quality"
    note: str | None = None
    disposition: str | None = None
    containment: str | None = None
    corrective_action: str | None = None
    effectiveness: str | None = None


class AssignBody(BaseModel):
    owner_role: str
    actor: str
    due_at: str | None = None


@router.get("")
def list_events(status: str | None = None):
    rows = list((DB.get("quality_events") or {}).values())
    if status:
        rows = [r for r in rows if r.get("status") == status]
    rows.sort(key=lambda r: r.get("opened_at") or "", reverse=True)
    return {"lifecycle": LIFECYCLE, "events": rows}


@router.get("/candidates")
def list_candidates(status: str | None = "Open"):
    from ..platform import detection
    return {"candidates": detection.list_candidates(status=status)}


@router.get("/board")
def board():
    rows = list((DB.get("quality_events") or {}).values())
    columns = {s: [] for s in LIFECYCLE}
    for r in rows:
        columns.setdefault(r.get("status") or "Detected", []).append(r)
    return {"columns": columns, "lifecycle": LIFECYCLE}


@router.get("/{qe_id}")
def get_event(qe_id: str):
    qe = (DB.get("quality_events") or {}).get(qe_id)
    if not qe:
        raise HTTPException(404, "quality event not found")
    return qe


@router.post("")
def create_event(body: CreateQE):
    qid = new_id("qe")
    qe = {
        "id": qid,
        "status": "Detected",
        "characteristic": body.characteristic,
        "measured_value": body.measured_value,
        "units": body.units,
        "specification": body.specification,
        "product": body.product,
        "order_id": body.order_id,
        "lot": body.lot,
        "serial": body.serial,
        "operation": body.operation,
        "equipment_id": body.equipment_id,
        "tool_id": body.tool_id,
        "cavity": body.cavity,
        "recipe": body.recipe,
        "process_window": body.process_window,
        "detection_method": body.detection_method,
        "anomaly_evidence": body.anomaly_evidence,
        "severity": body.severity,
        "risk": body.risk,
        "affected_scope": body.affected_scope,
        "defect_id": body.defect_id,
        "candidate_id": body.candidate_id,
        "context": body.context,
        "owner_role": body.owner_role,
        "due_at": body.due_at,
        "containment": None,
        "disposition": None,
        "rca_summary": None,
        "corrective_action": None,
        "effectiveness": None,
        "recurrence_history": [],
        "audit": [{"at": now(), "actor": "system", "action": "created", "status": "Detected"}],
        "model_agent_versions": [],
        "opened_at": now(),
        "closed_at": None,
    }
    DB.setdefault("quality_events", {})[qid] = qe
    if body.defect_id and body.defect_id in (DB.get("defects") or {}):
        DB["defects"][body.defect_id]["quality_event_id"] = qid
    if body.candidate_id and body.candidate_id in (DB.get("candidate_events") or {}):
        DB["candidate_events"][body.candidate_id]["status"] = "Linked"
        DB["candidate_events"][body.candidate_id]["quality_event_id"] = qid
    event_ledger.append("quality.event.create", qid, {"characteristic": body.characteristic})
    bus.publish(
        "quality.event.lifecycle",
        {"quality_event_id": qid, "status": "Detected"},
        context=body.context,
        source_system="qms://livis",
    )
    return qe


@router.post("/from-defect/{defect_id}")
def from_defect(defect_id: str):
    d = (DB.get("defects") or {}).get(defect_id)
    if not d:
        raise HTTPException(404, "defect not found")
    if d.get("quality_event_id") and d["quality_event_id"] in (DB.get("quality_events") or {}):
        return DB["quality_events"][d["quality_event_id"]]
    vin = (DB.get("vins") or {}).get(d.get("vin") or "")
    order = (DB.get("orders") or {}).get((vin or {}).get("order_id") or "")
    body = CreateQE(
        characteristic=d.get("class") or "defect",
        measured_value=d.get("confidence"),
        units="confidence",
        specification="Pass vision / process gate",
        product=(order or {}).get("product") or (vin or {}).get("variant"),
        order_id=(vin or {}).get("order_id"),
        serial=d.get("vin"),
        operation=d.get("station_id"),
        equipment_id=d.get("station_id"),
        detection_method="vision",
        anomaly_evidence=[{"defect_id": defect_id, "dna": d.get("defect_dna")}],
        severity=d.get("severity") or "Major",
        affected_scope=f"Station {d.get('station_id')}",
        defect_id=defect_id,
        context=d.get("context"),
    )
    return create_event(body)


@router.post("/from-candidate/{candidate_id}")
def from_candidate(candidate_id: str):
    c = (DB.get("candidate_events") or {}).get(candidate_id)
    if not c:
        raise HTTPException(404, "candidate not found")
    body = CreateQE(
        characteristic="process_anomaly",
        measured_value=(c.get("context") or {}).get("machine_mode"),
        detection_method="streaming_analytics",
        anomaly_evidence=[{"candidate_id": candidate_id, "reason": c.get("reason")}],
        severity=c.get("severity") or "Major",
        equipment_id=c.get("station_id"),
        operation=c.get("station_id"),
        serial=(c.get("context") or {}).get("serial"),
        order_id=(c.get("context") or {}).get("production_order_id"),
        product=(c.get("context") or {}).get("product"),
        recipe=(c.get("context") or {}).get("recipe"),
        process_window=f"freeze {c.get('freeze_window_s')}s",
        candidate_id=candidate_id,
        affected_scope=c.get("reason"),
        context=c.get("context"),
    )
    return create_event(body)


@router.post("/{qe_id}/transition")
def transition(qe_id: str, body: TransitionBody):
    qe = (DB.get("quality_events") or {}).get(qe_id)
    if not qe:
        raise HTTPException(404, "quality event not found")
    if body.to_status not in LIFECYCLE:
        raise HTTPException(400, f"invalid status {body.to_status}")
    # Soft role gate
    allowed = ROLE_GATES.get(body.to_status)
    if allowed and body.role.lower().replace(" ", "-") not in allowed and body.role.lower() not in (
        "plant manager", "quality lead", "quality manager", "demo operator",
    ):
        # Allow named plant roles by loose match
        role_l = body.role.lower()
        if not any(a.replace("-", " ") in role_l or a in role_l for a in allowed):
            if body.role not in ("Plant Manager", "Quality Lead", "Jordan Hale", "A. Kowalski"):
                pass  # demo: do not hard-block; audit the attempt
    prev = qe["status"]
    qe["status"] = body.to_status
    if body.disposition:
        qe["disposition"] = body.disposition
    if body.containment:
        qe["containment"] = body.containment
    if body.corrective_action:
        qe["corrective_action"] = body.corrective_action
    if body.effectiveness:
        qe["effectiveness"] = body.effectiveness
    qe["audit"].append({
        "at": now(), "actor": body.actor, "role": body.role,
        "action": "transition", "from": prev, "to": body.to_status, "note": body.note,
    })
    if body.to_status == "Closed":
        qe["closed_at"] = now()
        # Seed knowledge case for curation agent
        case = knowledge.put_case({
            "title": f"RCA closed · {qe.get('characteristic')}",
            "quality_event_id": qe_id,
            "serial": qe.get("serial"),
            "symptom": qe.get("characteristic"),
            "disposition": qe.get("disposition"),
            "corrective_action": qe.get("corrective_action"),
            "effectiveness": qe.get("effectiveness"),
            "human_notes": body.note,
        })
        qe["knowledge_case_id"] = case["id"]
    event_ledger.append(
        "quality.event.transition",
        qe_id,
        {"from": prev, "to": body.to_status, "note": body.note},
        actor=body.actor,
    )
    bus.publish(
        "quality.event.lifecycle",
        {"quality_event_id": qe_id, "status": body.to_status, "from": prev},
        context=qe.get("context"),
        source_system="qms://livis",
    )
    bus.publish(
        "governance.approval",
        {"kind": "quality_event_transition", "entity_id": qe_id, "actor": body.actor},
        context=qe.get("context"),
        source_system="gov://livis",
    )
    return qe


@router.post("/{qe_id}/assign")
def assign(qe_id: str, body: AssignBody):
    qe = (DB.get("quality_events") or {}).get(qe_id)
    if not qe:
        raise HTTPException(404, "quality event not found")
    qe["owner_role"] = body.owner_role
    if body.due_at:
        qe["due_at"] = body.due_at
    qe["audit"].append({
        "at": now(), "actor": body.actor, "action": "assign", "owner_role": body.owner_role,
    })
    event_ledger.append("quality.event.assign", qe_id, {"owner_role": body.owner_role}, actor=body.actor)
    return qe
