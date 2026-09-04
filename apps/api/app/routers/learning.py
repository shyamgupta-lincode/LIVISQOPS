"""Governed learning metrics, version registry, shadow gates."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..platform import bus
from ..platform.stores import event_ledger
from ..store import DB, new_id, now

router = APIRouter(prefix="/api/learning", tags=["learning"])


class ApproveVersion(BaseModel):
    actor: str
    note: str | None = None


@router.get("/metrics")
def metrics():
    m = DB.get("learning_metrics") or {}
    if not m:
        m = {
            "event_precision": None,
            "false_alert_rate": None,
            "detection_to_containment_hours": None,
            "top3_rca_hypothesis_accuracy": None,
            "time_to_confirmed_rca_hours": None,
            "recurrence_after_corrective_action": None,
            "pdm_lead_time_hours": None,
            "pdm_precision": None,
            "pct_signals_with_valid_context": None,
            "model_drift_by_segment": [],
        }
    return {"metrics": m, "updated_at": m.get("updated_at")}


@router.get("/versions")
def versions(kind: str | None = None):
    rows = list((DB.get("learning_versions") or {}).values())
    if kind:
        rows = [r for r in rows if r.get("kind") == kind]
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"versions": rows}


@router.get("/gates")
def gates():
    """Shadow deployment and approval gates before ops impact."""
    vers = list((DB.get("learning_versions") or {}).values())
    shadow = [v for v in vers if v.get("ring") == "Shadow"]
    pending = [v for v in vers if v.get("status") == "Pending Approval"]
    return {
        "shadow": shadow,
        "pending_approval": pending,
        "policy": (
            "Only authorized confirmed outcomes become truth. "
            "Shadow deploy and approval gates required before rules/models affect operations. "
            "Aligned with NIST AI RMF monitoring and human oversight."
        ),
    }


@router.post("/versions/{vid}/approve")
def approve(vid: str, body: ApproveVersion):
    v = (DB.get("learning_versions") or {}).get(vid)
    if not v:
        raise HTTPException(404, "version not found")
    v["status"] = "Approved"
    v["approved_by"] = body.actor
    v["approved_at"] = now()
    v["note"] = body.note
    if v.get("ring") == "Shadow":
        v["ring"] = "Assisted"
    event_ledger.append("learning.version.approve", vid, {"kind": v.get("kind")}, actor=body.actor)
    bus.publish(
        "governance.approval",
        {"kind": "learning_version", "version_id": vid, "actor": body.actor},
        source_system="gov://learning",
    )
    return v


@router.post("/versions/{vid}/reject")
def reject(vid: str, body: ApproveVersion):
    v = (DB.get("learning_versions") or {}).get(vid)
    if not v:
        raise HTTPException(404, "version not found")
    v["status"] = "Rejected"
    v["rejected_by"] = body.actor
    v["rejected_at"] = now()
    v["note"] = body.note
    event_ledger.append("learning.version.reject", vid, {"kind": v.get("kind")}, actor=body.actor)
    return v


def register_version(kind: str, name: str, *, ring: str = "Shadow", meta: dict | None = None) -> dict:
    versions = DB.setdefault("learning_versions", {})
    vid = new_id("lver")
    row = {
        "id": vid,
        "kind": kind,  # dataset | prompt | model | feature_def | knowledge
        "name": name,
        "ring": ring,
        "status": "Pending Approval" if ring in ("Shadow", "Bench") else "Approved",
        "meta": meta or {},
        "created_at": now(),
    }
    versions[vid] = row
    return row
