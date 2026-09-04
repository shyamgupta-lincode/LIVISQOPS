"""Predictive maintenance by failure mode — not generic machine-health AI."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..platform import bus
from ..platform.stores import event_ledger
from ..store import DB, new_id, now

router = APIRouter(prefix="/api/pdm", tags=["pdm"])


class FindingBody(BaseModel):
    actor: str
    finding: str
    replaced_component: str | None = None
    confirms_failure_mode_id: str | None = None


class CreateWO(BaseModel):
    prediction_id: str
    actor: str


@router.get("/assets")
def list_assets():
    return {"assets": list((DB.get("pdm_assets") or {}).values())}


@router.get("/assets/{asset_id}")
def get_asset(asset_id: str):
    a = (DB.get("pdm_assets") or {}).get(asset_id)
    if not a:
        raise HTTPException(404, "asset not found")
    fms = [f for f in (DB.get("failure_modes") or {}).values() if f.get("asset_id") == asset_id]
    preds = [p for p in (DB.get("pdm_predictions") or {}).values() if p.get("asset_id") == asset_id]
    return {"asset": a, "failure_modes": fms, "predictions": preds}


@router.get("/failure-modes")
def list_failure_modes(asset_id: str | None = None):
    rows = list((DB.get("failure_modes") or {}).values())
    if asset_id:
        rows = [r for r in rows if r.get("asset_id") == asset_id]
    return {"failure_modes": rows}


@router.get("/predictions")
def list_predictions(status: str | None = None):
    rows = list((DB.get("pdm_predictions") or {}).values())
    if status:
        rows = [r for r in rows if r.get("status") == status]
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"predictions": rows}


@router.post("/predictions/{pred_id}/work-order")
def create_work_order(pred_id: str, body: CreateWO):
    pred = (DB.get("pdm_predictions") or {}).get(pred_id)
    if not pred:
        raise HTTPException(404, "prediction not found")
    aid = new_id("act")
    action = {
        "id": aid,
        "title": f"PdM inspection · {pred.get('failure_mode_name') or pred.get('failure_mode_id')}",
        "owner": "Maintenance",
        "priority": "P2",
        "status": "Open",
        "context": pred.get("rationale"),
        "created": now(),
        "due": now(),
        "completion_evidence": None,
        "pdm_prediction_id": pred_id,
        "source": "pdm",
    }
    DB.setdefault("actions", {})[aid] = action
    pred["status"] = "RoutedToMaintenance"
    pred["work_order_id"] = aid
    event_ledger.append("pdm.prediction.route", pred_id, {"action_id": aid}, actor=body.actor)
    bus.publish(
        "it.cmms.sync",
        {"action_id": aid, "prediction_id": pred_id, "kind": "inspection_recommended"},
        source_system="cmms://livis",
    )
    return {"prediction": pred, "action": action}


@router.post("/predictions/{pred_id}/finding")
def capture_finding(pred_id: str, body: FindingBody):
    pred = (DB.get("pdm_predictions") or {}).get(pred_id)
    if not pred:
        raise HTTPException(404, "prediction not found")
    finding = {
        "id": new_id("find"),
        "at": now(),
        "actor": body.actor,
        "finding": body.finding,
        "replaced_component": body.replaced_component,
        "confirms_failure_mode_id": body.confirms_failure_mode_id,
    }
    pred.setdefault("technician_findings", []).append(finding)
    pred["status"] = "FindingCaptured"
    # Ground truth for learning
    fm_id = body.confirms_failure_mode_id or pred.get("failure_mode_id")
    if fm_id and fm_id in (DB.get("failure_modes") or {}):
        DB["failure_modes"][fm_id].setdefault("ground_truth", []).append(finding)
    event_ledger.append("pdm.finding.capture", pred_id, finding, actor=body.actor)
    return pred
