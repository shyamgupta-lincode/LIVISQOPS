"""AI agents: catalog, Bounded Action Ledger, shift brief."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..store import DB, new_id, now

router = APIRouter(prefix="/api", tags=["agents"])

AUTONOMY_LEVELS = (
    "L0 · Retrieve",
    "L1 · Recommend",
    "L2 · Draft",
    "L3 · Execute with approval",
    "L4 · Bounded automation",
)

DEFAULT_TOOLS = {
    "L0 · Retrieve": ["search_events", "read_genealogy"],
    "L1 · Recommend": ["search_events", "read_genealogy", "rank_losses"],
    "L2 · Draft": ["search_events", "read_genealogy", "draft_artifact"],
    "L3 · Execute with approval": ["draft_hold", "apply_hold(approved)", "create_ncr(approved)"],
    "L4 · Bounded automation": ["trigger_recapture", "open_review_task"],
}


def _slugify(name: str) -> str:
    raw = "".join(ch.lower() if ch.isalnum() else "-" for ch in name.strip())
    while "--" in raw:
        raw = raw.replace("--", "-")
    return raw.strip("-") or "agent"


def _active_context_graph() -> dict | None:
    graphs = DB.get("context_graphs") or {}
    aid = DB.get("active_context_graph_id")
    if aid and aid in graphs:
        return graphs[aid]
    return DB.get("graph_schema")


def _data_source_topics() -> list[dict]:
    """Selectable data-source topics = enabled object bindings on the active context graph."""
    schema = _active_context_graph() or {}
    topics = []
    for b in schema.get("object_bindings") or []:
        if b.get("enabled", True) is False:
            continue
        tid = b.get("id") or b.get("object_type")
        if not tid:
            continue
        topics.append({
            "id": tid,
            "object_type": b.get("object_type") or tid,
            "label": b.get("label") or tid,
            "report_at": b.get("report_at"),
            "lenses": b.get("lenses") or [],
            "protocol": b.get("protocol"),
        })
    return topics


def _normalize_topics(raw: list[str] | None) -> list[str]:
    known = {t["id"] for t in _data_source_topics()}
    if not raw:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        tid = (item or "").strip()
        if not tid or tid in seen:
            continue
        if known and tid not in known:
            continue
        seen.add(tid)
        out.append(tid)
    return out


def _public_agent(ag: dict) -> dict:
    """Ensure prompt / data_source_topics always present on agent payloads."""
    return {
        **ag,
        "prompt": ag.get("prompt") or "",
        "data_source_topics": list(ag.get("data_source_topics") or []),
    }


@router.get("/agents")
def agents():
    return [_public_agent(a) for a in DB["agents"].values()]


@router.get("/agent-data-source-topics")
def agent_data_source_topics():
    """Topics agents may bind to — derived from active context-graph object bindings."""
    schema = _active_context_graph()
    return {
        "context_graph_id": (schema or {}).get("id"),
        "context_graph_name": (schema or {}).get("name"),
        "topics": _data_source_topics(),
    }


@router.get("/agents/{agent_id}")
def agent_detail(agent_id: str):
    ag = DB["agents"].get(agent_id)
    if not ag:
        raise HTTPException(404, "agent not found")
    ledger = sorted(
        [a for a in DB["agent_actions"].values() if a["agent_id"] == agent_id],
        key=lambda a: a["created"],
        reverse=True,
    )
    return {
        **_public_agent(ag),
        "ledger": ledger,
        "ledger_counts": {
            "all": len(ledger),
            "pending": sum(1 for a in ledger if a["status"] == "Pending Approval"),
            "approved": sum(1 for a in ledger if a["status"] == "Approved"),
            "auto": sum(1 for a in ledger if a["status"] == "Auto-executed"),
            "rejected": sum(1 for a in ledger if a["status"] == "Rejected"),
        },
    }


class CreateAgent(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    autonomy: str = "L1 · Recommend"
    description: str = Field(min_length=8, max_length=500)
    version: str = "1.0"
    permitted_tools: list[str] | None = None
    prompt: str = ""
    data_source_topics: list[str] | None = None
    created_by: str = "Jordan Hale"


@router.post("/agents")
def create_agent(body: CreateAgent):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "name is required")
    autonomy = body.autonomy if body.autonomy in AUTONOMY_LEVELS else "L1 · Recommend"
    slug = _slugify(name)
    aid = f"agent-{slug}"
    n = 2
    while aid in DB["agents"]:
        aid = f"agent-{slug}-{n}"
        n += 1
    tools = body.permitted_tools if body.permitted_tools else DEFAULT_TOOLS[autonomy]
    tools = [t.strip() for t in tools if t and t.strip()]
    if not tools:
        tools = DEFAULT_TOOLS[autonomy]
    prompt = (body.prompt or "").strip()
    if len(prompt) > 4000:
        raise HTTPException(400, "prompt is too long (max 4000 characters)")
    topics = _normalize_topics(body.data_source_topics)
    agent = {
        "id": aid,
        "name": name,
        "autonomy": autonomy,
        "description": body.description.strip(),
        "version": (body.version or "1.0").strip().lstrip("v"),
        "eval_score": 0.0,
        "evidence_link_coverage": 0.0,
        "status": "Active",
        "permitted_tools": tools,
        "prompt": prompt,
        "data_source_topics": topics,
        "created_by": body.created_by,
        "created_at": now(),
    }
    DB["agents"][aid] = agent
    audit_id = new_id("audit")
    DB["audit"][audit_id] = {
        "id": audit_id,
        "kind": "agent.create",
        "actor": body.created_by,
        "detail": f"Added agent {name} ({autonomy})",
        "at": now(),
        "source": "agent-workspace",
    }
    return _public_agent(agent)


@router.get("/agent-actions")
def agent_actions():
    return sorted(DB["agent_actions"].values(), key=lambda a: a["created"], reverse=True)


class Approval(BaseModel):
    approver: str = "S. Verghese"
    comment: str | None = None


@router.post("/agent-actions/{action_id}/approve")
def approve_action(action_id: str, body: Approval):
    a = DB["agent_actions"].get(action_id)
    if not a:
        raise HTTPException(404, "action not found")
    if a["status"] not in ("Pending Approval",):
        raise HTTPException(400, f"action is {a['status']}, not approvable")
    a["status"] = "Approved"
    a["approver"] = body.approver
    a["approved_at"] = now()
    a["outcome"] = "Executing; outcome will be measured against baseline."
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "agent.action.approve", "actor": body.approver,
        "detail": f"Approved: {a['title']} "
                  f"(blast radius {a['blast_radius']['products_affected']} units)",
        "at": now(), "source": "agent-workspace",
    }
    return a


@router.post("/agent-actions/{action_id}/reject")
def reject_action(action_id: str, body: Approval):
    a = DB["agent_actions"].get(action_id)
    if not a:
        raise HTTPException(404, "action not found")
    a["status"] = "Rejected"
    a["approver"] = body.approver
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "agent.action.reject", "actor": body.approver,
        "detail": f"Rejected: {a['title']}" + (f" - {body.comment}" if body.comment else ""),
        "at": now(), "source": "agent-workspace",
    }
    return a


@router.get("/shift-brief")
def shift_brief():
    return DB["shift_briefs"]["today"]


# --- Typed agent surfaces: RCA / Knowledge curation / Workflow ---

OT_DENIED_TOOLS = {"plc_write", "safety_override", "direct_control"}


@router.get("/agent-types/{agent_type}")
def agents_by_type(agent_type: str):
    rows = [
        _public_agent(a) for a in DB["agents"].values()
        if (a.get("agent_type") or "").lower() == agent_type.lower()
        or agent_type.lower() in (a.get("name") or "").lower()
    ]
    return {"agents": rows, "agent_type": agent_type}


@router.get("/rca/hypotheses")
def list_hypotheses(quality_event_id: str | None = None):
    rows = list((DB.get("rca_hypotheses") or {}).values())
    if quality_event_id:
        rows = [r for r in rows if r.get("quality_event_id") == quality_event_id]
    rows.sort(key=lambda r: -float(r.get("confidence") or 0))
    return {"hypotheses": rows}


class RunRCA(BaseModel):
    quality_event_id: str | None = None
    candidate_id: str | None = None
    actor: str = "RCA Investigator"


@router.post("/rca/investigate")
def run_rca(body: RunRCA):
    """Production/RCA agent — ranked hypotheses with evidence, never definitive diagnosis."""
    from ..platform.stores import knowledge, retrieval
    from ..platform import bus as event_bus

    qe = None
    if body.quality_event_id:
        qe = (DB.get("quality_events") or {}).get(body.quality_event_id)
    cand = None
    if body.candidate_id:
        cand = (DB.get("candidate_events") or {}).get(body.candidate_id)
    context = (qe or cand or {}).get("context") or {}
    symptom = (qe or {}).get("characteristic") or (cand or {}).get("reason") or "process anomaly"

    # Freeze window
    freeze = {
        "frozen_at": now(),
        "context": context,
        "comparable_runs": [],
        "similar_cases": retrieval.search(str(symptom), 4),
    }
    # Comparable runs: same product/recipe
    product = context.get("product") or (qe or {}).get("product")
    for v in list((DB.get("vins") or {}).values())[:80]:
        if product and (v.get("variant") == product or product in str(v.get("variant"))):
            freeze["comparable_runs"].append({
                "serial": v.get("vin"), "order_id": v.get("order_id"), "status": v.get("status"),
            })
            if len(freeze["comparable_runs"]) >= 5:
                break

    hypotheses = [
        {
            "rank": 1,
            "cause": "Fixture #3 wear inducing seal gap under torque",
            "supporting_evidence": [
                "Mount assist pressure trend down-shift on last 40 cycles",
                "Defect DNA cluster shares station + Fixt #3 genealogy",
                f"Similar closed case overlap: {len(freeze['similar_cases'])} retrieval hits",
            ],
            "contradictory_evidence": [
                "Seal lot change occurred same shift — competing cause",
            ],
            "confidence": 0.62,
            "uncertainty": "Medium — requires fixture wear mic measurement",
            "affected_lots_or_serials": [
                (qe or {}).get("serial") or context.get("serial") or "multiple Touring VINs"
            ],
            "recommended_containment": "Hold carriers at Fuel Tank Install; quarantine Fixt #3",
            "confirm_tests": [
                "Mic Fixt #3 wear face vs baseline",
                "Retorque sample with replacement fixture",
            ],
        },
        {
            "rank": 2,
            "cause": "Seal lot compression set / supplier material shift",
            "supporting_evidence": [
                "Lot commonality across open defects",
                "Helium / vision borderline on night-shift lighting recipe",
            ],
            "contradictory_evidence": [
                "Prior lot with same supplier SKU passed FPY gate",
            ],
            "confidence": 0.41,
            "uncertainty": "High without material COA review",
            "affected_lots_or_serials": [(qe or {}).get("lot") or "seal lot cluster"],
            "recommended_containment": "Segregate remaining seal kits from lot",
            "confirm_tests": ["Lab compression set on retain samples", "Supplier NCR ask"],
        },
        {
            "rank": 3,
            "cause": "Operator torque sequence deviation",
            "supporting_evidence": ["Step evidence gaps on 2 units"],
            "contradictory_evidence": ["Most units show complete WI evidence trail"],
            "confidence": 0.22,
            "uncertainty": "Low prior — weak signal",
            "affected_lots_or_serials": [],
            "recommended_containment": "Coach + requalify WI step evidence",
            "confirm_tests": ["Review station video evidence", "Torque curve compare"],
        },
    ]
    bundle_id = new_id("rca")
    bundle = {
        "id": bundle_id,
        "agent_type": "rca",
        "quality_event_id": body.quality_event_id,
        "candidate_id": body.candidate_id,
        "freeze": freeze,
        "hypotheses": hypotheses,
        "disclaimer": "Possible causes with evidence — not a definitive diagnosis.",
        "created_at": now(),
        "created_by": body.actor,
        "confidence": hypotheses[0]["confidence"],
    }
    DB.setdefault("rca_hypotheses", {})[bundle_id] = bundle
    # Also flatten for list view
    for h in hypotheses:
        hid = new_id("hyp")
        DB["rca_hypotheses"][hid] = {**h, "id": hid, "bundle_id": bundle_id,
                                     "quality_event_id": body.quality_event_id,
                                     "created_at": now()}
    event_bus.publish(
        "agent.proposal.action",
        {"kind": "rca_hypotheses", "bundle_id": bundle_id, "top_cause": hypotheses[0]["cause"]},
        context=context,
        source_system="agent://rca",
    )
    return bundle


class CurateBody(BaseModel):
    quality_event_id: str
    actor: str = "Knowledge Curation Agent"


@router.post("/knowledge/curate")
def curate_knowledge(body: CurateBody):
    from ..platform.stores import knowledge as know
    from ..platform import bus as event_bus

    qe = (DB.get("quality_events") or {}).get(body.quality_event_id)
    if not qe:
        raise HTTPException(404, "quality event not found")
    if qe.get("status") != "Closed" and not qe.get("knowledge_case_id"):
        raise HTTPException(400, "quality event must be closed (or have a case) before curation")
    case_id = qe.get("knowledge_case_id")
    prop = know.propose_lesson({
        "title": f"Lesson · {qe.get('characteristic')}",
        "source_case_id": case_id,
        "quality_event_id": body.quality_event_id,
        "taxonomy": {
            "failure_mode": "Seal discontinuity",
            "cause_class": "Fixture wear",
            "normalized_terms": ["tank_seal", "fixture_wear", "touring_assembly"],
        },
        "chain": {
            "symptom": qe.get("characteristic"),
            "condition": qe.get("affected_scope"),
            "cause": (qe.get("rca_summary") or "Fixture #3 wear (leading hypothesis)"),
            "correction": qe.get("corrective_action") or "Replace fixture; re-torque recipe",
            "effectiveness": qe.get("effectiveness") or "pending_verification",
        },
        "duplicates_detected": 0,
        "conflicts_detected": 0,
        "proposed_artifacts": [
            "retrieval_chunk",
            "feature_definition:mount_assist_pressure_slope",
            "training_example:tank_seal_vision",
        ],
        "steward_role": "quality knowledge steward",
        "created_by": body.actor,
    })
    event_bus.publish(
        "knowledge.proposal.lesson",
        {"proposal_id": prop["id"], "quality_event_id": body.quality_event_id},
        context=qe.get("context"),
        source_system="agent://knowledge",
    )
    return prop


class ApproveLesson(BaseModel):
    actor: str


@router.post("/knowledge/proposals/{pid}/approve")
def approve_knowledge_proposal(pid: str, body: ApproveLesson):
    from ..platform.stores import knowledge as know
    from .learning import register_version

    try:
        lesson = know.approve_lesson(pid, actor=body.actor)
    except KeyError:
        raise HTTPException(404, "proposal not found")
    register_version("knowledge", lesson.get("title") or pid, ring="Assisted", meta={"lesson_id": lesson["id"]})
    return lesson


@router.get("/knowledge/proposals")
def list_knowledge_proposals(status: str | None = None):
    from ..platform.stores import knowledge as know
    return {"proposals": know.list_proposals(status=status), "lessons": know.list_lessons()}


class WorkflowTick(BaseModel):
    actor: str = "Workflow Agent"


@router.post("/workflow/orchestrate")
def workflow_orchestrate(body: WorkflowTick):
    """Deterministic workflow agent — deadlines, evidence requests, escalations (not LLM)."""
    from ..platform import bus as event_bus

    actions_made = []
    for qe in (DB.get("quality_events") or {}).values():
        if qe.get("status") in ("Closed",):
            continue
        due = qe.get("due_at")
        if due and due < now() and qe.get("status") not in ("Containment",):
            already = any(e.get("reason") == "overdue" for e in (qe.get("escalations") or []))
            if not already:
                qe.setdefault("escalations", []).append({
                    "at": now(), "by": body.actor, "reason": "overdue",
                })
                actions_made.append({"quality_event_id": qe["id"], "action": "escalate_overdue"})
        if qe.get("status") == "Detected" and not qe.get("owner_role"):
            qe["owner_role"] = "quality"
            actions_made.append({"quality_event_id": qe["id"], "action": "assign_default_owner"})
        if qe.get("status") == "Investigation" and not qe.get("rca_summary"):
            reqs = qe.setdefault("evidence_requests", [])
            if not any(r.get("request", "").startswith("RCA") for r in reqs):
                reqs.append({
                    "at": now(),
                    "request": "RCA hypotheses + feature window + genealogy evidence",
                })
                actions_made.append({"quality_event_id": qe["id"], "action": "request_evidence"})
        if qe.get("status") == "Validation":
            actions_made.append({"quality_event_id": qe["id"], "action": "remind_validate", "owner": qe.get("owner_role")})
    event_bus.publish(
        "agent.proposal.action",
        {"kind": "workflow_orchestration", "actions": actions_made, "deterministic": True},
        source_system="agent://workflow",
    )
    return {"deterministic": True, "actions": actions_made, "ot_writes": False}