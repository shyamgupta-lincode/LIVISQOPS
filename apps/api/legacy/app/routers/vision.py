"""Vision platform: models, Production Fitness Passports, deployments, drift."""

from fastapi import APIRouter, HTTPException

from ..store import DB, new_id, now

router = APIRouter(prefix="/api", tags=["vision"])

RINGS = ["Bench", "Replay", "Shadow", "Assisted", "Canary", "Production"]


@router.get("/models")
def models():
    return list(DB["models"].values())


@router.get("/models/{model_id}")
def model_detail(model_id: str):
    m = DB["models"].get(model_id)
    if not m:
        raise HTTPException(404, "model not found")
    deployments = [d for d in DB["deployments"].values() if d["model_id"] == model_id]
    drift = [d for d in DB["drift_events"].values() if d["model_id"] == model_id]
    return {**m, "deployments": deployments, "drift_events": drift}


@router.post("/models/{model_id}/promote")
def promote(model_id: str):
    m = DB["models"].get(model_id)
    if not m:
        raise HTTPException(404, "model not found")
    idx = RINGS.index(m["stage"]) if m["stage"] in RINGS else 2
    if idx >= len(RINGS) - 1:
        raise HTTPException(400, "already in production ring")
    # Fitness gate: block promotion if any segment is unfit
    unfit = [s for s in m["fitness_passport"]["segments"] if not s["fit"]]
    if unfit and RINGS[idx + 1] == "Production":
        return {
            "promoted": False,
            "blocked_by_fitness": True,
            "unfit_segments": unfit,
            "message": "Production release blocked: model is unfit for named segments. "
                       "Fix segment performance or restrict the operating envelope.",
        }
    m["stage"] = RINGS[idx + 1]
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "model.promote", "actor": "J. Dsouza",
        "detail": f"Promoted {m['slug']}@{m['version']} to {m['stage']} ring",
        "at": now(), "source": "vision-platform",
    }
    return {"promoted": True, "model": m}


@router.post("/models/{model_id}/rollback")
def rollback(model_id: str):
    m = DB["models"].get(model_id)
    if not m:
        raise HTTPException(404, "model not found")
    target = m["fitness_passport"]["rollback_target"]
    m["stage"] = "Shadow"
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "model.rollback", "actor": "J. Dsouza",
        "detail": f"Rolled back {m['slug']} to {target}; active moved to Shadow",
        "at": now(), "source": "vision-platform",
    }
    return {"rolled_back": True, "target": target, "model": m}


@router.get("/deployments")
def deployments():
    return list(DB["deployments"].values())


@router.get("/drift")
def drift():
    return list(DB["drift_events"].values())
