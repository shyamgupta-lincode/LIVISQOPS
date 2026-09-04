"""Factory topology, station detail and Causal Time-Travel Twin history."""

from fastapi import APIRouter, HTTPException

from ..store import DB

router = APIRouter(prefix="/api", tags=["topology"])


def _active_context_graph() -> dict | None:
    """Active Engineer context graph (levels + bindings) used as the twin spine."""
    graphs = DB.get("context_graphs") or {}
    aid = DB.get("active_context_graph_id")
    if aid and aid in graphs:
        return graphs[aid]
    schema = DB.get("graph_schema")
    return schema if schema else None


def _context_graph_payload(schema: dict | None) -> dict | None:
    if not schema:
        return None
    return {
        "id": schema.get("id"),
        "name": schema.get("name"),
        "status": schema.get("status"),
        "version": schema.get("version"),
        "description": schema.get("description") or "",
        "levels": schema.get("levels") or [],
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
        ],
    }


@router.get("/topology")
def topology():
    """Plant hierarchy + active context-graph spine for Factory Twin.

    Live entities remain site → areas → lines → stations → devices.
    ``context_graph`` carries the Engineer-composed levels/bindings that
    decide which layers the twin should present and what attaches where.
    """
    site = next(iter(DB["sites"].values()))
    areas = []
    for area in DB["areas"].values():
        lines = []
        for line in DB["lines"].values():
            if line["area_id"] != area["id"]:
                continue
            stations = []
            for s in sorted(
                [st for st in DB["stations"].values() if st["line_id"] == line["id"]],
                key=lambda st: st["position"],
            ):
                devices = [
                    d for d in DB["devices"].values() if d["station_id"] == s["id"]
                ]
                stations.append({**s, "devices": devices})
            lines.append({**line, "stations": stations})
        areas.append({**area, "lines": lines})
    return {
        "site": site,
        "areas": areas,
        "context_graph": _context_graph_payload(_active_context_graph()),
    }


@router.get("/stations/{station_id}")
def station_detail(station_id: str):
    st = DB["stations"].get(station_id)
    if not st:
        raise HTTPException(404, "station not found")
    devices = [d for d in DB["devices"].values() if d["station_id"] == station_id]
    instruction = next(
        (wi for wi in DB["work_instructions"].values() if wi["station_id"] == station_id),
        None,
    )
    events = [e for e in DB["events"].values() if e.get("station_id") == station_id]
    inspections = sorted(
        [i for i in DB["inspections"].values() if i["station_id"] == station_id],
        key=lambda i: i["captured"], reverse=True,
    )[:10]
    defects = [d for d in DB["defects"].values() if d["station_id"] == station_id][:10]
    vin = DB["vins"].get(st.get("current_vin")) if st.get("current_vin") else None
    line = DB["lines"].get(st["line_id"])
    area = DB["areas"].get(st["area_id"])
    schema = _active_context_graph()
    bindings = [
        b for b in (schema or {}).get("object_bindings") or []
        if b.get("enabled", True) and b.get("report_at") in ("station", "device")
    ]
    return {
        "station": st, "devices": devices, "instruction": instruction,
        "events": events, "inspections": inspections, "defects": defects,
        "current_vin": vin, "line": line, "area": area,
        "context_graph": _context_graph_payload(schema),
        "station_bindings": [
            {
                "id": b.get("id"),
                "object_type": b.get("object_type"),
                "label": b.get("label"),
                "report_at": b.get("report_at"),
                "protocol": b.get("protocol"),
            }
            for b in bindings
        ],
    }


@router.get("/twin/history")
def twin_history():
    """Snapshots for the Causal Time-Travel scrubber (oldest first)."""
    return {
        "count": len(DB["history"]),
        "snapshots": [
            {"index": i, "at": h["at"], "kpis": h["kpis"]}
            for i, h in enumerate(DB["history"])
        ],
    }


@router.get("/twin/history/{index}")
def twin_snapshot(index: int):
    if index < 0 or index >= len(DB["history"]):
        raise HTTPException(404, "snapshot not found")
    return DB["history"][index]
