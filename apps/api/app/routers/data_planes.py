"""Specialized data-plane summaries and sample queries."""

from fastapi import APIRouter, HTTPException

from ..platform.semantic import ISA95_LEVEL_ALIASES, SCHEMA_VERSION
from ..platform.stores import (
    event_ledger,
    knowledge,
    lakehouse,
    master_data,
    retrieval,
    timeseries,
)

router = APIRouter(prefix="/api/stores", tags=["stores"])

_PLANES = {
    "timeseries": timeseries,
    "ledger": event_ledger,
    "lakehouse": lakehouse,
    "master": master_data,
    "knowledge": knowledge,
    "retrieval": retrieval,
}


@router.get("")
def list_planes():
    return {
        "schema_version": SCHEMA_VERSION,
        "isa95_levels": ISA95_LEVEL_ALIASES,
        "planes": [mod.summary() for mod in _PLANES.values()],
        "contract": (
            "Specialized stores behind one ObservationContext semantic contract. "
            "Raw lakehouse and ledger writes are append-only; corrections create new versions."
        ),
    }


@router.get("/timeseries/features")
def ts_features(limit: int = 50):
    return {"features": timeseries.list_features(limit)}


@router.get("/ledger/entries")
def ledger_entries(kind: str | None = None, entity_id: str | None = None, limit: int = 100):
    return {"entries": event_ledger.list_entries(kind=kind, entity_id=entity_id, limit=limit)}


@router.get("/knowledge/cases")
def knowledge_cases(limit: int = 50):
    return {"cases": knowledge.list_cases(limit)}


@router.get("/knowledge/lessons")
def knowledge_lessons():
    return {"lessons": knowledge.list_lessons(), "proposals": knowledge.list_proposals()}


@router.get("/retrieval/search")
def retrieval_search(q: str = "", limit: int = 8):
    return {"results": retrieval.search(q, limit)}


@router.get("/{plane_id}")
def get_plane(plane_id: str):
    mod = _PLANES.get(plane_id)
    if not mod:
        raise HTTPException(404, f"unknown plane {plane_id}")
    return {"summary": mod.summary(), "sample": mod.sample_query()}
