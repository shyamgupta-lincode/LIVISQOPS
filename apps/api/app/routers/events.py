"""Command Center: events, actions, KPIs and the Constraint Radar."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..store import DB, new_id, now

router = APIRouter(prefix="/api", tags=["events"])

PRIORITY_ORDER = {"P1": 0, "P2": 1, "P3": 2, "P4": 3}


@router.get("/events")
def events(priority: str | None = None):
    result = [e for e in DB["events"].values() if e["status"] == "Open"]
    if priority:
        result = [e for e in result if e["priority"] == priority]
    return sorted(result, key=lambda e: (PRIORITY_ORDER.get(e["priority"], 9), e["created"]))


class Ack(BaseModel):
    actor: str = "R. Menon"


@router.post("/events/{event_id}/ack")
def ack_event(event_id: str, body: Ack):
    e = DB["events"].get(event_id)
    if not e:
        raise HTTPException(404, "event not found")
    e["acknowledged"] = True
    e["acked_by"] = body.actor
    return e


class Assign(BaseModel):
    owner: str


@router.post("/events/{event_id}/assign")
def assign_event(event_id: str, body: Assign):
    e = DB["events"].get(event_id)
    if not e:
        raise HTTPException(404, "event not found")
    e["owner"] = body.owner
    return e


@router.post("/events/{event_id}/resolve")
def resolve_event(event_id: str, body: Ack):
    e = DB["events"].get(event_id)
    if not e:
        raise HTTPException(404, "event not found")
    e["status"] = "Resolved"
    e["resolved_by"] = body.actor
    e["resolved_at"] = now()
    return e


@router.get("/actions")
def actions():
    return sorted(DB["actions"].values(),
                  key=lambda a: (PRIORITY_ORDER.get(a["priority"], 9), a["due"]))


class Complete(BaseModel):
    actor: str
    evidence: str | None = None


@router.post("/actions/{action_id}/complete")
def complete_action(action_id: str, body: Complete):
    a = DB["actions"].get(action_id)
    if not a:
        raise HTTPException(404, "action not found")
    a["status"] = "Completed"
    a["completed_by"] = body.actor
    a["completed_at"] = now()
    a["completion_evidence"] = body.evidence
    return a


@router.get("/kpis")
def kpis():
    return DB["kpis"]


@router.get("/command-center")
def command_center():
    """Aggregate payload for the Command Center including Constraint Radar."""
    k = DB["kpis"]
    stations = list(DB["stations"].values())
    abnormal = [s for s in stations if s["state"] not in ("Running", "Changeover")]

    # Constraint Radar: rank emerging losses by delivery/quality/cost impact
    radar = []
    for s in stations:
        score = 0.0
        reasons = []
        if s["state"] in ("Faulted", "Blocked"):
            score += 40
            reasons.append(f"{s['state']} for active takt loss")
        if s["state"] == "Starved":
            score += 25
            reasons.append("Starvation chain from upstream")
        if s["state"] == "Quality Hold":
            score += 30
            reasons.append("Units accumulating in hold")
        creep = s["cycle_time_s"] - s["takt_s"]
        if creep > 0:
            score += min(25, creep * 2)
            reasons.append(f"Cycle-time creep +{creep:.1f}s over takt")
        st_defects = [d for d in DB["defects"].values()
                      if d["station_id"] == s["id"] and d["status"] == "Open"]
        if len(st_defects) >= 2:
            score += 15
            reasons.append(f"{len(st_defects)} open defects clustering")
        if score > 12:
            radar.append({
                "station_id": s["id"], "station": s["name"],
                "line_id": s["line_id"], "state": s["state"],
                "impact_score": round(score, 1),
                "predicted_loss_units": int(score / 3),
                "reasons": reasons,
            })
    radar.sort(key=lambda r: -r["impact_score"])

    open_events = [e for e in DB["events"].values() if e["status"] == "Open"]
    return {
        "kpis": k,
        "abnormal_stations": len(abnormal),
        "total_stations": len(stations),
        "constraint_radar": radar[:8],
        "events": sorted(open_events,
                         key=lambda e: (PRIORITY_ORDER.get(e.get("priority", "P3"), 9),
                                        e.get("created") or ""))[:12],
        "actions": sorted(DB["actions"].values(),
                          key=lambda a: (PRIORITY_ORDER.get(a.get("priority", "P3"), 9),
                                         a.get("due") or ""))[:8],
        "shift_brief": DB["shift_briefs"].get("today") or {
            "id": "today", "generated": now(), "agent": "Shift Brief Writer",
            "headline": "No shift brief seeded for this workspace.",
            "sections": [], "actions_proposed": 0,
        },
    }
