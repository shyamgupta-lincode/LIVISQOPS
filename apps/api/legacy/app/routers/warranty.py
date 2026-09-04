"""Warranty & Claims: VIN genealogy, claim reports, and datasheet bundles."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..store import DB

router = APIRouter(prefix="/api/warranty", tags=["warranty"])


def _active_context_graph() -> dict | None:
    graphs = DB.get("context_graphs") or {}
    aid = DB.get("active_context_graph_id")
    if aid and aid in graphs:
        return graphs[aid]
    schema = DB.get("graph_schema")
    return schema if schema else None


def _context_graph_summary(schema: dict | None) -> dict | None:
    if not schema:
        return None
    return {
        "id": schema.get("id"),
        "name": schema.get("name"),
        "status": schema.get("status"),
        "version": schema.get("version"),
        "levels": [
            {
                "id": lv.get("id"),
                "label": lv.get("label"),
                "entity": lv.get("entity"),
                "required": bool(lv.get("required")),
            }
            for lv in (schema.get("levels") or [])
        ],
        "object_bindings": [
            {
                "id": b.get("id"),
                "object_type": b.get("object_type"),
                "label": b.get("label"),
                "report_at": b.get("report_at"),
                "rollup_to": b.get("rollup_to") or [],
                "enabled": b.get("enabled", True),
                "lenses": b.get("lenses") or [],
                "protocol": b.get("protocol"),
            }
            for b in (schema.get("object_bindings") or [])
            if b.get("enabled", True)
        ],
    }


def _resolve_station_path(station_id: str | None) -> list[dict]:
    """Facility → Area → Line → Station → Device nodes for a station."""
    if not station_id:
        return []
    st = DB["stations"].get(station_id)
    if not st:
        return []
    line = DB["lines"].get(st.get("line_id") or "")
    area = DB["areas"].get(st.get("area_id") or (line or {}).get("area_id") or "")
    site = next(iter(DB["sites"].values()), None)
    devices = [d for d in DB["devices"].values() if d.get("station_id") == station_id]
    path: list[dict] = []
    if site:
        path.append({
            "level": "facility",
            "id": site.get("id"),
            "name": site.get("name"),
            "kind": "facility",
        })
    if area:
        path.append({
            "level": "area",
            "id": area.get("id"),
            "name": area.get("name"),
            "kind": "area",
        })
    if line:
        path.append({
            "level": "line",
            "id": line.get("id"),
            "name": line.get("name"),
            "kind": "line",
        })
    path.append({
        "level": "station",
        "id": st.get("id"),
        "name": st.get("name"),
        "kind": "station",
        "state": st.get("state"),
        "archetype": st.get("archetype"),
    })
    for d in devices[:4]:
        path.append({
            "level": "device",
            "id": d.get("id"),
            "name": d.get("name") or d.get("type") or d.get("id"),
            "kind": "device",
            "device_type": d.get("type"),
            "parent_station_id": station_id,
        })
    return path


def _station_meta(station_id: str | None) -> dict:
    if not station_id:
        return {}
    st = DB["stations"].get(station_id) or {}
    line = DB["lines"].get(st.get("line_id") or "") or {}
    area = DB["areas"].get(st.get("area_id") or line.get("area_id") or "") or {}
    return {
        "station_id": station_id,
        "station_name": st.get("name"),
        "line_id": st.get("line_id") or line.get("id"),
        "line_name": line.get("name"),
        "area_id": area.get("id"),
        "area_name": area.get("name"),
    }


def _vin_summary(v: dict) -> dict:
    order = DB["orders"].get(v.get("order_id") or "") or {}
    meta = _station_meta(v.get("current_station"))
    defects = [d for d in DB["defects"].values() if d.get("vin") == v.get("vin")]
    open_defects = sum(1 for d in defects if d.get("status") == "Open")
    return {
        "vin": v.get("vin"),
        "order_id": v.get("order_id"),
        "variant": v.get("variant"),
        "color": v.get("color"),
        "status": v.get("status"),
        "current_station": v.get("current_station"),
        "station_name": meta.get("station_name"),
        "line_name": meta.get("line_name"),
        "ops_count": len(v.get("operations") or []),
        "components_count": len(v.get("components") or []),
        "defect_count": len(defects),
        "open_defect_count": open_defects,
        "order_source": order.get("source"),
        "order_status": order.get("status"),
    }


def _build_genealogy(v: dict, cg: dict | None) -> dict:
    """Full VIN genealogy framed by the active context-graph spine."""
    bindings = (cg or {}).get("object_bindings") or []
    gene_home = next(
        (b.get("report_at") for b in bindings if b.get("object_type") == "genealogy"),
        "station",
    )
    ops = v.get("operations") or []
    stations_seen: list[dict] = []
    seen_ids: set[str] = set()
    for op in ops:
        sid = op.get("station_id")
        if not sid or sid in seen_ids:
            continue
        seen_ids.add(sid)
        meta = _station_meta(sid)
        devices = [
            {
                "id": d.get("id"),
                "name": d.get("name") or d.get("type") or d.get("id"),
                "type": d.get("type"),
            }
            for d in DB["devices"].values()
            if d.get("station_id") == sid
        ][:4]
        stations_seen.append({
            **meta,
            "devices": devices,
            "operation": op.get("name"),
            "op_status": op.get("status"),
            "completed_at": op.get("completed_at"),
            "evidence": op.get("evidence") or [],
            "path": _resolve_station_path(sid),
        })

    current_path = _resolve_station_path(v.get("current_station"))
    components = [
        {
            **c,
            "bound_level": gene_home,
            "kind": "component",
        }
        for c in (v.get("components") or [])
    ]

    # Spine tree: unique Facility→…→Station nodes from ops + current position
    spine_nodes: list[dict] = []
    spine_keys: set[str] = set()
    for node in current_path:
        key = f"{node.get('level')}:{node.get('id')}"
        if key in spine_keys:
            continue
        spine_keys.add(key)
        spine_nodes.append(node)
    for st_node in stations_seen:
        for node in st_node.get("path") or []:
            key = f"{node.get('level')}:{node.get('id')}"
            if key in spine_keys:
                continue
            spine_keys.add(key)
            spine_nodes.append(node)

    linked_objects = [
        b for b in bindings
        if b.get("enabled", True)
        and (
            b.get("object_type") in ("genealogy", "order", "inspection", "defect", "work_instruction")
            or "warranty" in (b.get("lenses") or [])
            or "production" in (b.get("lenses") or [])
            or "quality" in (b.get("lenses") or [])
        )
    ]

    return {
        "home_level": gene_home,
        "current_path": current_path,
        "spine_nodes": spine_nodes,
        "stations": stations_seen,
        "operations": ops,
        "components": components,
        "linked_bindings": linked_objects,
        "context_graph": {
            "id": (cg or {}).get("id"),
            "name": (cg or {}).get("name"),
            "status": (cg or {}).get("status"),
        },
    }


def _build_reports(vin: str, v: dict) -> dict:
    inspections = [
        {
            "id": i.get("id"),
            "verdict": i.get("verdict"),
            "confidence": i.get("confidence"),
            "captured": i.get("captured"),
            "station_id": i.get("station_id"),
            **_station_meta(i.get("station_id")),
            "model_id": i.get("model_id"),
            "evidence_ref": i.get("evidence_ref"),
            "disposition": i.get("disposition"),
        }
        for i in DB["inspections"].values()
        if i.get("vin") == vin
    ]
    inspections.sort(key=lambda x: x.get("captured") or "", reverse=True)

    defects = [
        {
            "id": d.get("id"),
            "class": d.get("class"),
            "kind": d.get("kind"),
            "severity": d.get("severity"),
            "status": d.get("status"),
            "disposition": d.get("disposition"),
            "confidence": d.get("confidence"),
            "detected": d.get("detected"),
            "station_id": d.get("station_id"),
            **_station_meta(d.get("station_id")),
            "defect_dna": d.get("defect_dna"),
            "inspection_id": d.get("inspection_id"),
        }
        for d in DB["defects"].values()
        if d.get("vin") == vin
    ]
    defects.sort(key=lambda x: x.get("detected") or "", reverse=True)

    # Holds that mention the VIN, defect class on this VIN, or order scope
    defect_classes = {d.get("class") for d in defects if d.get("class")}
    order_id = v.get("order_id") or ""
    holds = []
    for h in DB["holds"].values():
        reason = str(h.get("reason") or "")
        scope = str(h.get("scope") or "")
        dclass = h.get("defect_class")
        related = (
            vin in reason
            or vin in scope
            or order_id and order_id in scope
            or (dclass and dclass in defect_classes)
        )
        if related:
            holds.append({
                "id": h.get("id"),
                "reason": h.get("reason"),
                "defect_class": dclass,
                "scope": h.get("scope"),
                "status": h.get("status"),
                "units_estimated": h.get("units_estimated"),
                "units_confirmed": h.get("units_confirmed"),
                "applied_by": h.get("applied_by"),
                "applied": h.get("applied"),
            })

    claim_events: list[dict] = []
    for op in v.get("operations") or []:
        claim_events.append({
            "at": op.get("completed_at"),
            "kind": "operation",
            "title": op.get("name"),
            "detail": f"{op.get('status')} · {op.get('operator')}",
            "station_id": op.get("station_id"),
            **_station_meta(op.get("station_id")),
            "evidence_count": len(op.get("evidence") or []),
        })
    for d in defects:
        claim_events.append({
            "at": d.get("detected"),
            "kind": "defect",
            "title": d.get("class"),
            "detail": f"{d.get('severity')} · {d.get('status')}"
                      + (f" · {d.get('disposition')}" if d.get("disposition") else ""),
            "station_id": d.get("station_id"),
            "station_name": d.get("station_name"),
            "line_name": d.get("line_name"),
            "severity": d.get("severity"),
        })
    for i in inspections:
        if i.get("verdict") in ("Fail", "Review"):
            claim_events.append({
                "at": i.get("captured"),
                "kind": "inspection",
                "title": f"Inspection {i.get('verdict')}",
                "detail": f"conf {(i.get('confidence') or 0) * 100:.1f}% · {i.get('evidence_ref')}",
                "station_id": i.get("station_id"),
                "station_name": i.get("station_name"),
                "line_name": i.get("line_name"),
            })
    for h in holds:
        claim_events.append({
            "at": h.get("applied"),
            "kind": "hold",
            "title": "Containment hold",
            "detail": h.get("reason"),
            "status": h.get("status"),
        })
    claim_events.sort(key=lambda e: e.get("at") or "", reverse=True)

    return {
        "defect_history": defects,
        "inspections": inspections,
        "holds": holds,
        "claim_events": claim_events[:40],
        "summary": {
            "defect_count": len(defects),
            "open_defects": sum(1 for d in defects if d.get("status") == "Open"),
            "critical_defects": sum(1 for d in defects if d.get("severity") == "Critical"),
            "inspection_count": len(inspections),
            "fail_or_review": sum(1 for i in inspections if i.get("verdict") in ("Fail", "Review")),
            "active_holds": sum(1 for h in holds if h.get("status") == "Active"),
        },
    }


def _build_datasheet(v: dict, genealogy: dict, reports: dict) -> dict:
    order = DB["orders"].get(v.get("order_id") or "") or {}
    ops = v.get("operations") or []
    first_op = ops[0] if ops else None
    last_op = ops[-1] if ops else None
    meta = _station_meta(v.get("current_station"))
    site = next(iter(DB["sites"].values()), None)

    build_date = None
    if first_op and first_op.get("completed_at"):
        build_date = first_op["completed_at"]
    elif order.get("released_at"):
        build_date = order["released_at"]

    evidence_total = sum(len(op.get("evidence") or []) for op in ops)
    metrics = {
        "operations_completed": sum(1 for op in ops if op.get("status") == "Completed"),
        "operations_total": len(ops),
        "components": len(v.get("components") or []),
        "evidence_artifacts": evidence_total,
        "defects": reports["summary"]["defect_count"],
        "open_defects": reports["summary"]["open_defects"],
        "inspections": reports["summary"]["inspection_count"],
        "fpy_proxy": (
            round(
                1 - (reports["summary"]["fail_or_review"] / max(1, reports["summary"]["inspection_count"])),
                3,
            )
            if reports["summary"]["inspection_count"]
            else None
        ),
    }

    return {
        "vin": v.get("vin"),
        "product": order.get("product") or "Harley-Davidson Motorcycle",
        "variant": v.get("variant"),
        "color": v.get("color"),
        "status": v.get("status"),
        "build_date": build_date,
        "last_activity": (last_op or {}).get("completed_at"),
        "facility": (site or {}).get("name"),
        "area": meta.get("area_name"),
        "line": meta.get("line_name") or order.get("line_id"),
        "current_station": meta.get("station_name"),
        "order": {
            "id": order.get("id"),
            "source": order.get("source"),
            "erp_ref": order.get("erp_ref"),
            "status": order.get("status"),
            "qty": order.get("qty"),
            "completed": order.get("completed"),
            "due": order.get("due"),
            "released_at": order.get("released_at"),
            "created_by": order.get("created_by"),
            "line_id": order.get("line_id"),
        },
        "components": v.get("components") or [],
        "serials": [
            {"part": c.get("part"), "serial": c.get("serial"), "lot": c.get("lot")}
            for c in (v.get("components") or [])
        ],
        "metrics": metrics,
        "genealogy_home": genealogy.get("home_level"),
        "context_graph_name": (genealogy.get("context_graph") or {}).get("name"),
        "spine_path_labels": [
            n.get("name") for n in (genealogy.get("current_path") or [])
            if n.get("level") != "device"
        ],
    }


@router.get("/vins")
def list_vins(q: str | None = Query(default=None)):
    """Searchable VIN index for warranty lookup."""
    result = [_vin_summary(v) for v in DB["vins"].values()]
    if q:
        ql = q.lower().strip()
        result = [
            v for v in result
            if ql in (v.get("vin") or "").lower()
            or ql in (v.get("order_id") or "").lower()
            or ql in (v.get("variant") or "").lower()
            or ql in (v.get("color") or "").lower()
        ]
    result.sort(key=lambda v: (v.get("open_defect_count") or 0, v.get("defect_count") or 0), reverse=True)
    return result[:80]


@router.get("/vins/{vin}")
def vin_warranty_bundle(vin: str):
    """VIN package: context-graph genealogy + claim reports + datasheet."""
    v = DB["vins"].get(vin)
    if not v:
        raise HTTPException(404, "vin not found")
    cg_raw = _active_context_graph()
    cg = _context_graph_summary(cg_raw)
    genealogy = _build_genealogy(v, cg)
    reports = _build_reports(vin, v)
    datasheet = _build_datasheet(v, genealogy, reports)
    order = DB["orders"].get(v.get("order_id") or "")
    return {
        "vin": vin,
        "status": v.get("status"),
        "variant": v.get("variant"),
        "color": v.get("color"),
        "order_id": v.get("order_id"),
        "order": order,
        "summary": _vin_summary(v),
        "context_graph": cg,
        "genealogy": genealogy,
        "reports": reports,
        "datasheet": datasheet,
    }
