"""Quality: vision review queue, defects, Defect DNA, containment holds."""

from __future__ import annotations

import base64
import random

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..store import DB, new_id, now

router = APIRouter(prefix="/api", tags=["quality"])


def _evidence_urls(insp: dict) -> tuple[str, str]:
    """Deterministic SVG evidence + photo URL (aligned with context-graph frames)."""
    stored = insp.get("image_url") or insp.get("thumbnail_url")
    iid = str(insp.get("id") or "insp")
    verdict = str(insp.get("verdict") or "Pass")
    ref = str(insp.get("evidence_ref") or iid)
    seed = insp.get("image_seed")
    if seed is None:
        seed = abs(hash(iid)) % 10_000
    photo = stored or f"https://picsum.photos/seed/livis-{seed}/400/240"
    accent = {"Pass": "#1F9D5C", "Fail": "#C93C32", "Review": "#C4841D"}.get(verdict, "#3E96F4")
    hx = 40 + (int(seed) % 90)
    hy = 30 + ((int(seed) // 7) % 70)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="#1a2332"/><stop offset="100%" stop-color="#0d1218"/>'
        f'</linearGradient></defs>'
        f'<rect width="400" height="240" fill="url(#g)"/>'
        f'<g opacity=".35" stroke="#4a5d73" stroke-width="1">'
        + "".join(f'<line x1="0" y1="{y}" x2="400" y2="{y}"/>' for y in range(20, 240, 20))
        + "".join(f'<line x1="{x}" y1="0" x2="{x}" y2="240"/>' for x in range(20, 400, 20))
        + "</g>"
        f'<rect x="{hx}" y="{hy}" width="110" height="72" fill="none" stroke="{accent}" '
        f'stroke-width="2.5" stroke-dasharray="6 3"/>'
        f'<circle cx="{hx + 55}" cy="{hy + 36}" r="8" fill="none" stroke="{accent}" stroke-width="2"/>'
        f'<text x="12" y="22" fill="#9eb0c4" font-family="ui-monospace,monospace" font-size="12">'
        f"{ref}</text>"
        f'<text x="12" y="228" fill="{accent}" font-family="ui-monospace,monospace" '
        f'font-size="13" font-weight="700">{verdict.upper()} FRAME</text>'
        f"</svg>"
    )
    data_uri = "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return data_uri, photo


def _enrich_inspection(insp: dict) -> dict:
    thumb, photo = _evidence_urls(insp)
    st = DB["stations"].get(insp.get("station_id") or "")
    line = DB["lines"].get(st["line_id"]) if st else None
    area = DB["areas"].get(st["area_id"]) if st else None
    defect = next(
        (d for d in DB["defects"].values() if d.get("inspection_id") == insp.get("id")),
        None,
    )
    model = DB["models"].get(insp.get("model_id") or "")
    return {
        **insp,
        "thumbnail_url": thumb,
        "image_url": thumb,
        "photo_url": photo,
        "station_name": (st or {}).get("name"),
        "line_id": (st or {}).get("line_id"),
        "line_name": (line or {}).get("name"),
        "area_name": (area or {}).get("name"),
        "model_name": (model or {}).get("name"),
        "model_version": (model or {}).get("version"),
        "linked_defect_id": (defect or {}).get("id"),
        "linked_defect_class": (defect or {}).get("class"),
        "linked_defect_status": (defect or {}).get("status"),
        "path": [
            x for x in [
                (area or {}).get("name"),
                (line or {}).get("name"),
                (st or {}).get("name"),
            ] if x
        ],
    }


def _enrich_defect(d: dict) -> dict:
    insp = DB["inspections"].get(d.get("inspection_id") or "")
    enriched_insp = _enrich_inspection(insp) if insp else None
    st = DB["stations"].get(d.get("station_id") or "")
    line = DB["lines"].get(st["line_id"]) if st else None
    area = DB["areas"].get(st["area_id"]) if st else None
    return {
        **d,
        "station_name": (st or {}).get("name"),
        "line_id": (st or {}).get("line_id"),
        "line_name": (line or {}).get("name"),
        "area_name": (area or {}).get("name"),
        "path": [
            x for x in [
                (area or {}).get("name"),
                (line or {}).get("name"),
                (st or {}).get("name"),
            ] if x
        ],
        "inspection": enriched_insp,
    }


@router.get("/inspections")
def inspections(verdict: str | None = None, station_id: str | None = None):
    result = list(DB["inspections"].values())
    if verdict:
        result = [i for i in result if i["verdict"] == verdict]
    if station_id:
        result = [i for i in result if i["station_id"] == station_id]
    return [_enrich_inspection(i) for i in sorted(result, key=lambda i: i["captured"], reverse=True)[:100]]


@router.get("/inspections/{inspection_id}")
def inspection_detail(inspection_id: str):
    insp = DB["inspections"].get(inspection_id)
    if not insp:
        raise HTTPException(404, "inspection not found")
    return _enrich_inspection(insp)


class InspectionDisposition(BaseModel):
    disposition: str = Field(description="Accept | Repair | Reject | Re-inspect | Escalate | Accept-with-deviation")
    reason_code: str
    comment: str | None = None
    actor: str = "Q. Batra"


@router.post("/inspections/{inspection_id}/disposition")
def disposition_inspection(inspection_id: str, body: InspectionDisposition):
    """Disposition a borderline review inspection; updates linked defect when present."""
    insp = DB["inspections"].get(inspection_id)
    if not insp:
        raise HTTPException(404, "inspection not found")
    allowed = ("Accept", "Repair", "Reject", "Re-inspect", "Escalate", "Accept-with-deviation")
    if body.disposition not in allowed:
        raise HTTPException(400, f"disposition must be one of {allowed}")
    insp["disposition"] = body.disposition
    insp["disposition_reason"] = body.reason_code
    insp["disposition_comment"] = body.comment
    insp["disposition_actor"] = body.actor
    insp["disposition_at"] = now()
    # Clear from review queue once human decides
    if body.disposition in ("Accept", "Accept-with-deviation", "Reject", "Repair"):
        insp["verdict"] = "Fail" if body.disposition in ("Reject", "Repair") else "Pass"
    defect = next(
        (d for d in DB["defects"].values() if d.get("inspection_id") == inspection_id),
        None,
    )
    if defect:
        defect["disposition"] = body.disposition
        defect["disposition_reason"] = body.reason_code
        defect["status"] = "Dispositioned"
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "inspection.disposition", "actor": body.actor,
        "detail": f"{body.disposition} ({body.reason_code}) on {insp.get('evidence_ref')}"
                  + (f" — {body.comment}" if body.comment else ""),
        "at": now(), "source": "quality-review",
    }
    return _enrich_inspection(insp)


@router.get("/defects")
def defects(status: str | None = None, severity: str | None = None):
    result = list(DB["defects"].values())
    if status:
        result = [d for d in result if d["status"] == status]
    if severity:
        result = [d for d in result if d.get("severity") == severity]
    return [_enrich_defect(d) for d in sorted(result, key=lambda d: d["detected"], reverse=True)[:100]]


@router.get("/defects/{defect_id}")
def defect_detail(defect_id: str):
    d = DB["defects"].get(defect_id)
    if not d:
        raise HTTPException(404, "defect not found")
    return _enrich_defect(d)


@router.get("/defects/{defect_id}/similar")
def similar_defects(defect_id: str):
    """Defect DNA similarity search across stations/variants."""
    d = DB["defects"].get(defect_id)
    if not d:
        raise HTTPException(404, "defect not found")
    same_class = [x for x in DB["defects"].values()
                  if x["class"] == d["class"] and x["id"] != defect_id]
    matches = sorted(same_class, key=lambda x: x["detected"], reverse=True)[:8]
    return {
        "defect": _enrich_defect(d),
        "fingerprint": d["defect_dna"]["fingerprint"],
        "matches": [
            {**_enrich_defect(m), "similarity": round(random.uniform(0.78, 0.97), 2)}
            for m in matches
        ],
        "cross_plant": [
            {"plant": "Plant B (Chennai)", "class": d["class"],
             "resolution": "Fixture replacement", "similarity": 0.91},
        ] if d["defect_dna"]["cross_line_matches"] > 0 else [],
    }


class Disposition(BaseModel):
    disposition: str  # Accept | Repair | Reject | Re-inspect | Escalate | Accept-with-deviation
    reason_code: str
    comment: str | None = None
    actor: str = "Q. Batra"


@router.post("/defects/{defect_id}/disposition")
def disposition_defect(defect_id: str, body: Disposition):
    d = DB["defects"].get(defect_id)
    if not d:
        raise HTTPException(404, "defect not found")
    allowed = ("Accept", "Repair", "Reject", "Re-inspect", "Escalate", "Accept-with-deviation")
    if body.disposition not in allowed:
        raise HTTPException(400, f"disposition must be one of {allowed}")
    d["disposition"] = body.disposition
    d["status"] = "Dispositioned"
    d["disposition_reason"] = body.reason_code
    d["disposition_comment"] = body.comment
    d["disposition_actor"] = body.actor
    d["disposition_at"] = now()
    insp = DB["inspections"].get(d["inspection_id"])
    if insp:
        insp["disposition"] = body.disposition
        insp["disposition_reason"] = body.reason_code
        if body.disposition in ("Accept", "Accept-with-deviation"):
            insp["verdict"] = "Pass"
        elif body.disposition in ("Reject", "Repair"):
            insp["verdict"] = "Fail"
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "defect.disposition", "actor": body.actor,
        "detail": f"{body.disposition} ({body.reason_code}) on {d['class']} "
                  f"VIN {d.get('vin') or 'n/a'}"
                  + (f" — {body.comment}" if body.comment else ""),
        "at": now(), "source": "quality-review",
    }
    return _enrich_defect(d)


@router.get("/holds")
def holds():
    return list(DB["holds"].values())


class HoldRequest(BaseModel):
    reason: str
    defect_class: str
    scope: str
    units_estimated: int
    actor: str = "Q. Batra"
    defect_id: str | None = None


@router.post("/holds")
def apply_hold(body: HoldRequest):
    hid = new_id("hold")
    DB["holds"][hid] = {
        "id": hid, "reason": body.reason, "defect_class": body.defect_class,
        "scope": body.scope, "units_estimated": body.units_estimated,
        "units_confirmed": 0, "applied_by": body.actor, "applied": now(),
        "status": "Active",
        "defect_id": body.defect_id,
        "integration": {"wms": "Notified", "erp": "Blocked-for-ship",
                        "qms": f"NCR-HD-{random.randint(2000, 4000)} created"},
    }
    if body.defect_id and body.defect_id in DB["defects"]:
        DB["defects"][body.defect_id]["status"] = "Contained"
        DB["defects"][body.defect_id]["hold_id"] = hid
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "hold.apply", "actor": body.actor,
        "detail": f"Applied hold: {body.reason} ({body.scope})",
        "at": now(), "source": "quality-containment",
    }
    return DB["holds"][hid]


@router.post("/holds/{hold_id}/release")
def release_hold(hold_id: str, actor: str = Query(default="Q. Batra")):
    h = DB["holds"].get(hold_id)
    if not h:
        raise HTTPException(404, "hold not found")
    h["status"] = "Released"
    h["released"] = now()
    h["released_by"] = actor
    if h.get("defect_id") and h["defect_id"] in DB["defects"]:
        d = DB["defects"][h["defect_id"]]
        if d.get("status") == "Contained":
            d["status"] = "Dispositioned" if d.get("disposition") else "Open"
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "hold.release", "actor": actor,
        "detail": f"Released hold: {h.get('reason')}",
        "at": now(), "source": "quality-containment",
    }
    return h
