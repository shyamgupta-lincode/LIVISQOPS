"""
Context plane: the operational knowledge graph.

Projects the operational store into a navigable graph: a focus entity in the
center, contextualized neighbors around it (data objects, documents, evidence,
models, time series), domain lenses on top (production / maintenance /
supply_chain / quality) and the source-system strip underneath
(field workers, OT, IT, ET, robotics).

Also exposes a composition schema (how the graph is defined) and a reporting
tree (inspection / status / genealogy objects organized by that hierarchy).
"""

import base64
import copy
import random
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..store import (
    DB,
    append_tag_sample,
    ensure_tag_series,
    next_tag_value,
    now,
)

router = APIRouter(prefix="/api/graph", tags=["graph"])

LENSES = ["production", "maintenance", "supply_chain", "quality"]
ALL = LENSES  # entity nodes belong to every lens


def _node(nid: str, kind: str, label: str, lenses: list[str],
          meta: dict | None = None, focusable: bool = False,
          workspace: str | None = None) -> dict:
    return {
        "id": nid, "kind": kind, "label": label, "lenses": lenses,
        "meta": meta or {}, "focusable": focusable, "workspace": workspace,
    }


def _entity_node(nid: str) -> dict | None:
    """Resolve a focusable entity id to its graph node."""
    if nid in DB["sites"]:
        s = DB["sites"][nid]
        return _node(nid, "facility", s["name"], ALL,
                     {"code": s["code"], "shift": s["shift"]}, focusable=True)
    if nid in DB["areas"]:
        a = DB["areas"][nid]
        return _node(nid, "area", a["name"], ALL, {"code": a["code"]}, focusable=True)
    if nid in DB["lines"]:
        ln = DB["lines"][nid]
        return _node(nid, "line", ln["name"], ALL,
                     {"takt_s": ln["takt_seconds"]}, focusable=True)
    if nid in DB["stations"]:
        st = DB["stations"][nid]
        return _node(nid, "station", st["name"], ALL,
                     {"state": st["state"], "archetype": st["archetype"],
                      "cycle_s": st["cycle_time_s"]},
                     focusable=True, workspace=f"/operate/station/{nid}")
    if nid in DB["devices"]:
        d = DB["devices"][nid]
        return _node(nid, "device", d["name"], ALL,
                     {"protocol": d["protocol"], "kind": d["kind"],
                      "timestamp_trust": d["timestamp_trust"]}, focusable=True)
    if nid in DB["models"]:
        m = DB["models"][nid]
        return _node(nid, "model", m["name"], ["quality"],
                     {"version": m["version"], "stage": m["stage"]},
                     focusable=True, workspace="/quality/vision")
    if nid in DB["work_instructions"]:
        wi = DB["work_instructions"][nid]
        return _node(nid, "doc", wi["name"], ["production", "quality"],
                     {"version": wi["version"], "steps": len(wi["steps"])},
                     focusable=True, workspace="/engineer")
    return None


# Default transport / acquisition method by graph object kind
_KIND_LINK = {
    "facility": ("MES Context", "hierarchy", "Internal model"),
    "area": ("MES Context", "hierarchy", "Internal model"),
    "line": ("MES Context", "hierarchy", "Internal model"),
    "station": ("MES Context", "hierarchy", "Internal model"),
    "device": ("OPC UA", "subscribe", "Edge connector"),
    "model": ("gRPC", "infer", "Vision runtime"),
    "doc": ("HTTPS", "fetch", "Document store"),
    "image": ("GigE Vision", "capture", "Object store"),
    "timeseries": ("OPC UA", "subscribe", "Edge historian"),
    "production": ("REST/ERP", "poll", "ERP → MES"),
    "event": ("MQTT Sparkplug B", "pubsub", "Event bus"),
    "maintenance": ("REST", "poll", "CMMS connector"),
    "map": ("File", "import", "CAD/SVG"),
    "source": ("Connector", "acquire", "Edge / central"),
}

_REL_METHOD = {
    "contains": "expand",
    "part of": "resolve",
    "instruments": "bind",
    "governed by": "govern",
    "inspected by": "infer",
    "inspects": "infer",
    "governs": "govern",
    "evidence": "capture",
    "raised": "emit",
    "produces": "record",
    "measures": "subscribe",
    "maintains": "poll",
    "acquired via": "acquire",
    "documents": "fetch",
    "consumes": "poll",
    "monitors": "stream",
    "trained on": "ingest",
    "monitored by": "stream",
    "compiles to": "compile",
}


def _link_for(node: dict | None, rel: str) -> dict:
    """Protocol / method / endpoint describing the contextualized edge."""
    if not node:
        return {
            "protocol": "Unknown", "method": rel, "transport": "n/a",
            "source": "—", "endpoint": None, "status": "Unknown", "tags": 0,
        }
    kind = node.get("kind", "doc")
    meta = node.get("meta") or {}
    proto_default, method_default, source_default = _KIND_LINK.get(
        kind, ("HTTPS", "fetch", "Platform")
    )
    protocol = meta.get("protocol") or proto_default
    method = _REL_METHOD.get(rel, method_default)
    source = meta.get("source") or source_default
    endpoint = meta.get("endpoint")
    status = "Connected"
    raw_tags = meta.get("mapped_tags")
    if raw_tags is None:
        raw_tags = meta.get("tags")
    if isinstance(raw_tags, list):
        tags = len(raw_tags)
    else:
        tags = raw_tags or 0

    # Prefer live connector row when protocol matches
    conn = next(
        (c for c in DB["connectors"].values() if c["protocol"] == protocol),
        None,
    )
    if conn:
        endpoint = endpoint or conn.get("endpoint")
        status = conn.get("status", status)
        tags = tags or conn.get("mapped_tags", 0)
        protocol = conn["protocol"]

    return {
        "protocol": protocol,
        "method": method,
        "transport": protocol.split()[0] if protocol else "n/a",
        "source": source,
        "endpoint": endpoint,
        "status": status,
        "tags": tags,
        "rel": rel,
    }


def _neighbors(focus_id: str) -> list[dict]:
    """Neighbors as {node, rel, link} triples — contextualized edges carry
    protocol / method so the cinema fan connectors are inspectable."""
    out: list[dict] = []

    def add(node: dict, rel: str):
        out.append({"node": node, "rel": rel, "link": _link_for(node, rel)})

    if focus_id in DB["sites"]:
        for a in DB["areas"].values():
            add(_entity_node(a["id"]), "contains")
        add(_node("data-layout", "map", "Plant layout (2D map)", ALL,
                  {"source": "CAD/SVG import"}), "documents")
        add(_node("data-orders", "production", f"{len(DB['orders'])} production orders", ["production", "supply_chain"],
                  {"source": "ERP", "released": sum(1 for o in DB['orders'].values() if o['status'] == 'Released')}), "consumes")
        add(_node("data-ledger", "production", "Value ledger", ["production"],
                  {"source": "Proof Engine"}, ), "measures")
        add(_node("data-calendar", "doc", "Shift calendar", ["production", "supply_chain"],
                  {"shift": DB["sites"][focus_id]["shift"]}), "documents")
        return out

    if focus_id in DB["areas"]:
        add(_entity_node(next(iter(DB["sites"]))), "part of")
        for ln in DB["lines"].values():
            if ln["area_id"] == focus_id:
                add(_entity_node(ln["id"]), "contains")
        st_count = sum(1 for s in DB["stations"].values() if s["area_id"] == focus_id)
        add(_node(f"data-{focus_id}-events", "event", "Area event stream", ["production", "maintenance"],
                  {"stations": st_count}), "monitors")
        return out

    if focus_id in DB["lines"]:
        ln = DB["lines"][focus_id]
        add(_entity_node(ln["area_id"]), "part of")
        for s in DB["stations"].values():
            if s["line_id"] == focus_id:
                add(_entity_node(s["id"]), "contains")
        orders = [o for o in DB["orders"].values() if o.get("line_id") == focus_id]
        if orders:
            add(_node(f"data-{focus_id}-orders", "production", f"{len(orders)} orders dispatched",
                      ["production", "supply_chain"], {"source": "ERP → MES dispatch"}), "produces")
        add(_node(f"data-{focus_id}-takt", "timeseries", f"Takt / cycle series ({ln['takt_seconds']}s)",
                  ["production"], {"source": "Edge historian"}), "measures")
        return out

    if focus_id in DB["stations"]:
        st = DB["stations"][focus_id]
        add(_entity_node(st["line_id"]), "part of")
        for d in DB["devices"].values():
            if d["station_id"] == focus_id:
                add(_entity_node(d["id"]), "instruments")
        for wi in DB["work_instructions"].values():
            if wi["station_id"] == focus_id:
                add(_entity_node(wi["id"]), "governed by")
        for m in DB["models"].values():
            if m["station_id"] == focus_id:
                add(_entity_node(m["id"]), "inspected by")
        insp = [i for i in DB["inspections"].values() if i["station_id"] == focus_id]
        if insp:
            add(_node(f"data-{focus_id}-evidence", "image", f"{len(insp)} evidence captures",
                      ["quality"], {"source": "Vision runtime / object store"}), "evidence")
        defects = [d for d in DB["defects"].values() if d["station_id"] == focus_id]
        if defects:
            add(_node(f"data-{focus_id}-defects", "event", f"{len(defects)} quality events",
                      ["quality"], {"open": sum(1 for d in defects if d["status"] == "Open")}), "raised")
        vins = [v for v in DB["vins"].values()
                if any(op["station_id"] == focus_id for op in v["operations"])]
        if vins:
            add(_node(f"data-{focus_id}-genealogy", "production", f"{len(vins)} VINs in genealogy",
                      ["production", "supply_chain"], {"source": "MES operation records"}), "produces")
        add(_node(f"data-{focus_id}-ts", "timeseries", "Cycle & process time series",
                  ["production", "maintenance"], {"source": "Edge historian",
                                                  "cycle_s": st["cycle_time_s"]}), "measures")
        add(_node(f"data-{focus_id}-maint", "maintenance", "Maintenance history",
                  ["maintenance"], {"source": "CMMS connector",
                                    "state": st["state"]}), "maintains")
        return out

    if focus_id in DB["devices"]:
        d = DB["devices"][focus_id]
        # Up-link to station (asymmetric: station→device uses "instruments")
        add(_entity_node(d["station_id"]), "part of")
        device_tags = d.get("tags") or []
        add(_node(f"data-{focus_id}-ts", "timeseries",
                  "PLC tag time series" if device_tags else "Signal time series",
                  ["production", "maintenance"],
                  {"protocol": d["protocol"], "timestamp_trust": d["timestamp_trust"],
                   "tags": device_tags, "mapped_tags": len(device_tags)}), "measures")
        conn = next((c for c in DB["connectors"].values() if c["protocol"] == d["protocol"]), None)
        if conn:
            add(_node(f"data-{focus_id}-conn", "source", f"{conn['protocol']} connector",
                      ["maintenance"], {"endpoint": conn["endpoint"],
                                        "tags": len(device_tags) or conn["mapped_tags"],
                                        "mapped_tags": len(device_tags) or conn["mapped_tags"],
                                        "protocol": conn["protocol"]}), "acquired via")
        if d["kind"] == "Camera":
            add(_node(f"data-{focus_id}-frames", "image", "Frame captures",
                      ["quality"], {"source": "GigE Vision"}), "evidence")
        return out

    if focus_id in DB["models"]:
        m = DB["models"][focus_id]
        # Up-link to station (asymmetric: station→model uses "inspected by")
        add(_entity_node(m["station_id"]), "part of")
        add(_node(f"data-{focus_id}-passport", "doc", "Production Fitness Passport",
                  ["quality"], {"approved_by": m["fitness_passport"]["approved_by"],
                                "recall": m["fitness_passport"]["locked_test_metrics"]["critical_recall"]}), "documents")
        add(_node(f"data-{focus_id}-dataset", "image", "Training dataset",
                  ["quality"], {"source": "Labeled evidence review"}), "trained on")
        drift = [x for x in DB["drift_events"].values() if x["model_id"] == focus_id]
        if drift:
            add(_node(f"data-{focus_id}-drift", "event", f"{len(drift)} drift events",
                      ["quality", "maintenance"], {}), "monitored by")
        return out

    if focus_id in DB["work_instructions"]:
        wi = DB["work_instructions"][focus_id]
        # Up-link to station (asymmetric: station→WI uses "governed by")
        add(_entity_node(wi["station_id"]), "part of")
        add(_node(f"data-{focus_id}-steps", "doc", f"{len(wi['steps'])} composable steps",
                  ["production"], {"version": wi["version"]}), "contains")
        add(_node(f"data-{focus_id}-compiled", "doc", "Compiled edge package",
                  ["production"], {"outputs": "UI · state machine · evidence schema · handshake tests"}), "compiles to")
        return out

    return out


def _path(focus_id: str) -> list[dict]:
    """Breadcrumb chain from facility down to the focus entity."""
    chain: list[dict] = []
    site_id = next(iter(DB["sites"]))
    if focus_id in DB["stations"]:
        st = DB["stations"][focus_id]
        chain = [site_id, st["area_id"], st["line_id"], focus_id]
    elif focus_id in DB["lines"]:
        ln = DB["lines"][focus_id]
        chain = [site_id, ln["area_id"], focus_id]
    elif focus_id in DB["areas"]:
        chain = [site_id, focus_id]
    elif focus_id in DB["devices"]:
        d = DB["devices"][focus_id]
        st = DB["stations"][d["station_id"]]
        chain = [site_id, st["area_id"], st["line_id"], st["id"], focus_id]
    elif focus_id in DB["models"] or focus_id in DB["work_instructions"]:
        obj = DB["models"].get(focus_id) or DB["work_instructions"].get(focus_id)
        st = DB["stations"][obj["station_id"]]
        chain = [site_id, st["area_id"], st["line_id"], st["id"], focus_id]
    else:
        chain = [site_id]
    return [n for n in (_entity_node(c) for c in chain) if n]


@router.get("")
def graph(focus: str | None = None):
    focus_id = focus or next(iter(DB["sites"]))
    focus_node = _entity_node(focus_id)
    if not focus_node:
        raise HTTPException(404, "focus entity not found")

    neighbors = [n for n in _neighbors(focus_id) if n["node"]]
    lens_summary = {
        lens: sum(1 for n in neighbors if lens in n["node"]["lenses"])
        for lens in LENSES
    }
    return {
        "focus": focus_node,
        "neighbors": neighbors,
        "path": _path(focus_id),
        "lens_summary": lens_summary,
    }


def _val(key: str, label: str, value, unit: str = "", spark: list | None = None) -> dict:
    return {"key": key, "label": label, "value": value, "unit": unit, "spark": spark or []}


def _spark(base: float, n: int = 12, jitter: float = 0.08) -> list[float]:
    out = []
    v = float(base)
    for _ in range(n):
        v = max(0, v * (1 + random.uniform(-jitter, jitter)))
        out.append(round(v, 3))
    return out


def _scope_from_object_id(object_id: str, focus_id: str) -> dict:
    """Resolve station / device / line scope for any data-* or entity id."""
    st_id = None
    dev_id = None
    line_id = None
    area_id = None

    for sid in DB["stations"]:
        if object_id == sid or object_id.startswith(f"data-{sid}-"):
            st_id = sid
            break
    for did in DB["devices"]:
        if object_id == did or object_id.startswith(f"data-{did}-"):
            dev_id = did
            break
    for lid in DB["lines"]:
        if object_id == lid or object_id.startswith(f"data-{lid}-"):
            line_id = lid
            break
    for aid in DB["areas"]:
        if object_id == aid or object_id.startswith(f"data-{aid}-"):
            area_id = aid
            break

    if focus_id in DB["stations"] and not st_id:
        st_id = focus_id
    if focus_id in DB["devices"] and not dev_id:
        dev_id = focus_id
    if focus_id in DB["lines"] and not line_id:
        line_id = focus_id
    if focus_id in DB["areas"] and not area_id:
        area_id = focus_id

    if dev_id and not st_id:
        st_id = DB["devices"][dev_id].get("station_id")
    if st_id and not line_id:
        line_id = DB["stations"][st_id].get("line_id")
    if st_id and not area_id:
        area_id = DB["stations"][st_id].get("area_id")
    if line_id and not area_id:
        area_id = DB["lines"][line_id].get("area_id")

    return {"station_id": st_id, "device_id": dev_id, "line_id": line_id, "area_id": area_id}


def _synthesize_data_node(object_id: str) -> dict | None:
    """Build a graph node for data-* ids even when outside the current focus neighborhood."""
    if not object_id.startswith("data-"):
        return None
    scope = _scope_from_object_id(object_id, "")
    kind_map = {
        "ts": ("timeseries", "Signal time series", ["production", "maintenance"]),
        "takt": ("timeseries", "Takt / cycle series", ["production"]),
        "evidence": ("image", "Evidence captures", ["quality"]),
        "frames": ("image", "Frame captures", ["quality"]),
        "defects": ("event", "Quality events", ["quality"]),
        "events": ("event", "Area event stream", ["production", "maintenance"]),
        "orders": ("production", "Production orders", ["production", "supply_chain"]),
        "genealogy": ("production", "VIN genealogy", ["production", "supply_chain"]),
        "maint": ("maintenance", "Maintenance history", ["maintenance"]),
        "conn": ("source", "Connector", ["maintenance"]),
        "passport": ("doc", "Fitness passport", ["quality"]),
        "dataset": ("image", "Training dataset", ["quality"]),
        "drift": ("event", "Drift events", ["quality", "maintenance"]),
        "steps": ("doc", "Composable steps", ["production"]),
        "compiled": ("doc", "Compiled edge package", ["production"]),
        "layout": ("map", "Plant layout", ALL),
        "calendar": ("doc", "Shift calendar", ["production", "supply_chain"]),
        "ledger": ("production", "Value ledger", ["production"]),
    }
    # Longer suffixes first (genealogy before etc.)
    kind = "doc"
    label = object_id.replace("data-", "").replace("-", " ").title()
    lenses = ALL
    for key, (k, lab, lens) in sorted(kind_map.items(), key=lambda x: -len(x[0])):
        if object_id.endswith(f"-{key}") or f"-{key}" in object_id:
            kind, label, lenses = k, lab, lens
            break
    meta = {}
    if scope["device_id"] and scope["device_id"] in DB["devices"]:
        d = DB["devices"][scope["device_id"]]
        device_tags = d.get("tags") or []
        meta = {
            "protocol": d.get("protocol"),
            "timestamp_trust": d.get("timestamp_trust", 0.95),
            "tags": device_tags,
            "mapped_tags": len(device_tags),
        }
        if kind == "timeseries" or "Signal" in label or "time series" in label.lower():
            label = f"{d.get('name', 'Device')} · {'PLC tags' if device_tags else label}"
    elif scope["station_id"] and scope["station_id"] in DB["stations"]:
        st = DB["stations"][scope["station_id"]]
        meta = {"cycle_s": st.get("cycle_time_s"), "state": st.get("state")}
    return _node(object_id, kind, label, lenses, meta)


def _evidence_image_urls(insp: dict) -> tuple[str, str]:
    """Deterministic industrial SVG thumbnail + optional picsum photo URL."""
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


def _inspection_sample(insp: dict) -> dict:
    """Rich inspection sample for vision / evidence object payloads."""
    st = DB["stations"].get(insp.get("station_id") or "")
    model = DB["models"].get(insp.get("model_id") or "")
    defect = next(
        (d for d in DB["defects"].values() if d.get("inspection_id") == insp.get("id")),
        None,
    )
    conf = float(insp.get("confidence") or 0.9)
    verdict = insp.get("verdict") or "Pass"
    vin = insp.get("vin") or "—"
    notes = None
    if defect:
        notes = f"{defect.get('class', 'Defect')} · {defect.get('severity', 'Minor')}"
        if defect.get("status"):
            notes += f" · {defect['status']}"
    elif verdict == "Pass":
        notes = "No defect annotations"
    thumb, photo = _evidence_image_urls(insp)
    return {
        "id": insp["id"],
        "label": verdict,
        "at": insp.get("captured"),
        "detail": f"conf {conf * 100:.1f}% · {vin}",
        "verdict": verdict,
        "confidence": conf,
        "vin": vin if vin != "—" else None,
        "station_id": insp.get("station_id"),
        "station_name": (st or {}).get("name"),
        "model_id": insp.get("model_id"),
        "model_name": (model or {}).get("name"),
        "model_version": insp.get("model_version") or (model or {}).get("version"),
        "camera": insp.get("camera"),
        "lighting_recipe": insp.get("lighting_recipe"),
        "evidence_ref": insp.get("evidence_ref"),
        "image_url": thumb,
        "thumbnail_url": thumb,
        "photo_url": photo,
        "defect_class": (defect or {}).get("class"),
        "defect_severity": (defect or {}).get("severity"),
        "defect_status": (defect or {}).get("status"),
        "notes": notes,
        "disposition": insp.get("disposition"),
    }


def _recent_inspections(st_id: str | None, n: int = 5) -> list[dict]:
    """Station-scoped recent inspections, backfilled from plant to guarantee n samples."""
    station = [
        i for i in DB["inspections"].values()
        if not st_id or i.get("station_id") == st_id
    ]
    station = sorted(station, key=lambda x: x.get("captured", ""), reverse=True)
    if len(station) >= n:
        return station[:n]
    seen = {i["id"] for i in station}
    plant = sorted(
        DB["inspections"].values(),
        key=lambda x: x.get("captured", ""),
        reverse=True,
    )
    out = list(station)
    for i in plant:
        if i["id"] in seen:
            continue
        out.append(i)
        if len(out) >= n:
            break
    return out[:n]


def _ensure_live_values(kind: str, object_id: str, focus_id: str, node: dict, meta: dict) -> tuple[list, list]:
    """Always return a populated values + samples pair for any kind / scope combo."""
    scope = _scope_from_object_id(object_id, focus_id)
    st_id = scope["station_id"]
    dev_id = scope["device_id"]
    line_id = scope["line_id"]
    st = DB["stations"].get(st_id) if st_id else None
    dev = DB["devices"].get(dev_id) if dev_id else None
    ln = DB["lines"].get(line_id) if line_id else None
    values: list[dict] = []
    samples: list[dict] = []

    if kind == "image" or object_id.endswith("-evidence") or object_id.endswith("-frames") or "dataset" in object_id:
        insp = _recent_inspections(st_id, n=5)
        # Metrics still prefer true station scope (not backfill) when available.
        scoped = [i for i in DB["inspections"].values() if not st_id or i.get("station_id") == st_id]
        if not scoped:
            scoped = list(DB["inspections"].values())
        latest = insp[0] if insp else None
        pass_n = sum(1 for i in scoped if i.get("verdict") == "Pass")
        values = [
            _val("count", "Captures", max(len(scoped), 1), spark=_spark(max(len(scoped), 1), jitter=0.15)),
            _val("pass_rate", "Pass rate",
                 round(100 * pass_n / max(1, len(scoped)), 1) if scoped else 97.2, "%", _spark(96, jitter=0.02)),
            _val("confidence", "Latest confidence",
                 round((latest.get("confidence", 0.95) if latest else 0.94) * 100, 1), "%"),
            _val("latency", "Capture latency", round(random.uniform(38, 92), 0), "ms", _spark(60, jitter=0.12)),
        ]
        samples = [_inspection_sample(i) for i in insp]
        while len(samples) < 5:
            idx = len(samples) + 1
            synth = {
                "id": f"frame-seed-{idx}",
                "verdict": "Pass",
                "confidence": round(0.94 + idx * 0.005, 3),
                "vin": None,
                "station_id": st_id,
                "captured": now(),
                "camera": f"CAM-{(idx % 4) + 1}",
                "lighting_recipe": f"LR-{(idx % 4) + 1}",
                "evidence_ref": f"IMG-SEED{idx:04d}",
                "model_id": next(iter(DB["models"]), None),
                "model_version": "1.0",
                "disposition": None,
            }
            samples.append(_inspection_sample(synth))

    elif kind == "event" or "-defects" in object_id or object_id.endswith("-events") or "drift" in object_id:
        defects = [d for d in DB["defects"].values() if not st_id or d["station_id"] == st_id]
        if not defects:
            defects = list(DB["defects"].values())
        open_d = [d for d in defects if d.get("status") == "Open"]
        values = [
            _val("open", "Open", max(len(open_d), 0), spark=_spark(max(len(open_d), 1), jitter=0.2)),
            _val("total", "Total events", max(len(defects), 1)),
            _val("critical", "Critical", sum(1 for d in defects if d.get("severity") in ("Critical", "Major"))),
            _val("mttr", "MTTR", round(random.uniform(12, 48), 0), "min", _spark(28, jitter=0.1)),
        ]
        samples = [
            {"id": d["id"], "label": d.get("class", d.get("kind", "event")),
             "at": d.get("detected_at") or d.get("at"),
             "detail": f"{d.get('severity', 'Minor')} · {d.get('status', 'Open')}"}
            for d in sorted(defects, key=lambda x: x.get("detected_at") or "", reverse=True)[:6]
        ] or [
            {"id": "evt-1", "label": "Signal spike", "at": now(), "detail": "Minor · Cleared"},
        ]

    elif kind == "timeseries" or object_id.endswith("-ts") or object_id.endswith("-takt"):
        cycle = float(st["cycle_time_s"]) if st else float(meta.get("cycle_s") or (dev and 2.4) or 60)
        takt = float(ln["takt_seconds"]) if ln else float(meta.get("takt_s") or cycle * 0.95 or 60)
        trust = float(meta.get("timestamp_trust") or (dev or {}).get("timestamp_trust") or 0.96)
        protocol = meta.get("protocol") or (dev or {}).get("protocol") or "OPC UA"
        configured = list((dev or {}).get("tags") or meta.get("tags") or [])
        # Device PLC / Open Protocol path: live values keyed by configured tag keys.
        if configured and dev and (object_id.endswith("-ts") or object_id.startswith(f"data-{dev['id']}-")):
            ensure_tag_series(dev["id"], configured, st, n=12)
            values = []
            samples = []
            for tag in configured[:4]:
                tag_key = tag["key"]
                val = next_tag_value(tag, st)
                series = append_tag_sample(dev["id"], tag_key, val, maxlen=60)
                spark = series[-24:]
                # Chart label is the PLC tag key; unit from tag definition.
                entry = _val(tag_key, tag_key, val, tag.get("unit") or "", spark)
                entry["tag_key"] = tag_key
                entry["tag_name"] = tag.get("name") or tag_key
                entry["source_tag"] = tag.get("source_tag")
                entry["data_type"] = tag.get("data_type")
                values.append(entry)
                samples.append({
                    "id": tag_key,
                    "label": tag.get("name") or tag_key,
                    "at": now(),
                    "detail": (
                        f"{val}{((' ' + tag['unit']) if tag.get('unit') else '')}"
                        f" · {tag.get('source_tag') or protocol} · good"
                    ),
                })
        else:
            values = [
                _val("signal", "Signal level", round(random.uniform(0.82, 0.99) * 100, 1), "%",
                     _spark(92, jitter=0.04)),
                _val("cycle", "Cycle / sample", round(cycle, 2), "s", _spark(cycle, jitter=0.05)),
                _val("trust", "Timestamp trust", round(trust * 100, 1), "%",
                     _spark(trust * 100, jitter=0.01)),
                _val("rate", "Sample rate", round(random.uniform(8, 50), 1), "Hz",
                     _spark(24, jitter=0.08)),
            ]
            samples = [
                {"id": f"tag-{i + 1}", "label": f"{protocol} tag", "at": now(),
                 "detail": f"{round(random.uniform(0.1, 9.9), 2)} eng · good"}
                for i in range(4)
            ]

    elif kind == "production" or "genealogy" in object_id or "orders" in object_id or "ledger" in object_id:
        if "orders" in object_id or meta.get("source") in ("ERP", "ERP → MES dispatch") or "ledger" in object_id:
            orders = [o for o in DB["orders"].values() if not line_id or o.get("line_id") == line_id]
            if not orders:
                orders = list(DB["orders"].values())
            values = [
                _val("orders", "Orders", max(len(orders), 1), spark=_spark(max(len(orders), 1))),
                _val("released", "Released", sum(1 for o in orders if o.get("status") == "Released")),
                _val("completed", "Units complete", sum(o.get("completed", 0) for o in orders)),
                _val("plan", "Units planned", max(sum(o.get("qty", 0) for o in orders), 1)),
            ]
            samples = [
                {"id": o["id"], "label": o.get("variant", "Order"), "at": o.get("released_at"),
                 "detail": f"{o.get('status')} · {o.get('completed', 0)}/{o.get('qty', 0)}"}
                for o in orders[:6]
            ]
        else:
            vins = [v for v in DB["vins"].values()
                    if not st_id or any(op.get("station_id") == st_id for op in v.get("operations", []))]
            if not vins:
                vins = list(DB["vins"].values())
            values = [
                _val("vins", "VINs in context", max(len(vins), 1), spark=_spark(max(len(vins), 1))),
                _val("wip", "In process", sum(1 for v in vins if v.get("status") != "Complete")),
                _val("complete", "Complete", sum(1 for v in vins if v.get("status") == "Complete")),
                _val("ops", "Avg ops / VIN",
                     round(sum(len(v.get("operations", [])) for v in vins) / max(1, len(vins)), 1)),
            ]
            samples = [
                {"id": v.get("vin", v.get("id", "vin")), "label": v.get("variant", "VIN"), "at": None,
                 "detail": f"{v.get('status')} · {len(v.get('operations', []))} ops"}
                for v in vins[:6]
            ]

    elif kind == "maintenance":
        values = [
            _val("state", "State", (st or {}).get("state") or meta.get("state") or "Running"),
            _val("safety", "Safety",
                 round(((st or {}).get("health") or {}).get("safety", 0.99) * 100, 1), "%"),
            _val("ai", "AI confidence",
                 round(((st or {}).get("health") or {}).get("ai_confidence", 0.95) * 100, 1), "%"),
            _val("work_orders", "Open WOs", random.randint(0, 3), spark=_spark(2, jitter=0.3)),
        ]
        samples = [
            {"id": "wo-1", "label": "Pm check", "at": now(), "detail": "Scheduled · CMMS"},
            {"id": "wo-2", "label": "Sensor clean", "at": now(), "detail": "Complete · CMMS"},
        ]

    elif kind == "source" or object_id.endswith("-conn"):
        protocol = meta.get("protocol") or (dev or {}).get("protocol") or "OPC UA"
        tags = meta.get("tags") or random.randint(24, 220)
        values = [
            _val("status", "Connector", "Connected"),
            _val("protocol", "Protocol", protocol),
            _val("tags", "Mapped tags", tags, spark=_spark(tags, jitter=0.05)),
            _val("lag", "Bus lag", round(random.uniform(8, 45), 0), "ms", _spark(22, jitter=0.15)),
        ]
        samples = [
            {"id": "ep-1", "label": protocol, "at": now(), "detail": meta.get("endpoint") or "edge endpoint"},
        ]

    elif kind == "doc" or kind == "map" or kind == "model":
        values = [
            _val("status", "Status", meta.get("status") or "Current"),
            _val("version", "Version", meta.get("version") or meta.get("model_version") or "1.0"),
            _val("refs", "Linked refs", random.randint(2, 18), spark=_spark(8, jitter=0.2)),
            _val("freshness", "Freshness", round(random.uniform(92, 99.5), 1), "%"),
        ]
        samples = [
            {"id": "doc-1", "label": node.get("label", "Document"), "at": now(),
             "detail": meta.get("source") or "Document store"},
        ]

    elif kind == "device" or object_id in DB["devices"]:
        d = DB["devices"].get(object_id) or dev
        values = [
            _val("state", "State", (d or {}).get("state") or "Online"),
            _val("protocol", "Protocol", (d or {}).get("protocol") or "OPC UA"),
            _val("trust", "Timestamp trust",
                 round(float((d or {}).get("timestamp_trust", 0.96)) * 100, 1), "%"),
            _val("signal", "Signal quality", round(random.uniform(88, 99), 1), "%", _spark(94, jitter=0.03)),
        ]

    elif kind == "station" or object_id in DB["stations"]:
        s = DB["stations"].get(object_id) or st
        health = (s or {}).get("health") or {}
        values = [
            _val("state", "State", (s or {}).get("state") or "Running"),
            _val("cycle", "Cycle", round(float((s or {}).get("cycle_time_s") or 60), 1), "s",
                 _spark(float((s or {}).get("cycle_time_s") or 60))),
            _val("quality", "Quality", round(float(health.get("quality", 0.97)) * 100, 1), "%"),
            _val("vin", "Current VIN", (s or {}).get("current_vin") or "—"),
        ]

    elif kind == "line" or object_id in DB["lines"]:
        line = DB["lines"].get(object_id) or ln
        lid = (line or {}).get("id") or object_id
        sts = [s for s in DB["stations"].values() if s.get("line_id") == lid]
        values = [
            _val("takt", "Takt", (line or {}).get("takt_seconds") or 60, "s"),
            _val("stations", "Stations", max(len(sts), 1)),
            _val("running", "Running", sum(1 for s in sts if s.get("state") == "Running") or max(len(sts) - 1, 0)),
            _val("oee", "Line OEE", round(random.uniform(72, 91), 1), "%", _spark(82, jitter=0.04)),
        ]

    elif kind == "area" or object_id in DB["areas"]:
        lines = [x for x in DB["lines"].values() if x.get("area_id") == object_id]
        sts = [s for s in DB["stations"].values() if s.get("area_id") == object_id]
        values = [
            _val("lines", "Lines", max(len(lines), 1)),
            _val("stations", "Stations", max(len(sts), 1)),
            _val("running", "Running", sum(1 for s in sts if s.get("state") == "Running")),
            _val("alerts", "Open alerts", random.randint(0, 4), spark=_spark(2, jitter=0.25)),
        ]

    elif kind == "facility" or object_id in DB["sites"]:
        values = [
            _val("areas", "Areas", len(DB["areas"])),
            _val("lines", "Lines", len(DB["lines"])),
            _val("stations", "Stations", len(DB["stations"])),
            _val("oee", "Plant OEE", round(float(DB.get("kpis", {}).get("oee") or 0.78) * 100, 1), "%",
                 _spark(78, jitter=0.03)),
        ]

    else:
        values = [_val(k, k.replace("_", " ").title(), v) for k, v in list(meta.items())[:4]]
        if len(values) < 4:
            values.extend([
                _val("status", "Status", "Active"),
                _val("health", "Health", round(random.uniform(90, 99), 1), "%", _spark(95, jitter=0.02)),
                _val("updates", "Updates / min", random.randint(4, 40), spark=_spark(18, jitter=0.2)),
                _val("lag", "Context lag", round(random.uniform(5, 35), 0), "ms"),
            ])
            values = values[:4]
        samples = samples or [
            {"id": "live-1", "label": node.get("label", "Object"), "at": now(), "detail": "Live context sample"},
        ]

    if not values:
        values = [
            _val("status", "Status", "Active"),
            _val("health", "Health", 96.5, "%", _spark(96, jitter=0.02)),
            _val("throughput", "Throughput", random.randint(10, 80), "/h", _spark(40, jitter=0.1)),
            _val("lag", "Lag", round(random.uniform(6, 28), 0), "ms"),
        ]
    if not samples:
        samples = [
            {"id": f"rec-{i + 1}", "label": f"Live record {i + 1}", "at": now(),
             "detail": f"{kind} · connected"}
            for i in range(3)
        ]
    return values[:4], samples[:6]


@router.get("/object/{object_id:path}")
def object_live_values(object_id: str, focus: str | None = None):
    """Current values for a contextualized data object (click-to-inspect).

    Resolves nodes even when the cinema focus has drilled past the plant root,
    so Explore always has live metrics for any selected leaf.
    """
    focus_id = focus or next(iter(DB["sites"]))
    neighbor = next((n for n in _neighbors(focus_id) if n["node"]["id"] == object_id), None)
    # Walk ancestors / other entity neighborhoods when cinema focus ≠ poll root
    if not neighbor:
        for eid in list(DB.get("sites", {})) + list(DB.get("areas", {})) + list(DB.get("lines", {})) \
                + list(DB.get("stations", {})) + list(DB.get("devices", {})):
            hit = next((n for n in _neighbors(eid) if n["node"]["id"] == object_id), None)
            if hit:
                neighbor = hit
                if focus_id == next(iter(DB["sites"])) or focus_id not in (
                    list(DB.get("stations", {})) + list(DB.get("devices", {})) + list(DB.get("lines", {}))
                ):
                    focus_id = eid
                break

    node = neighbor["node"] if neighbor else _entity_node(object_id)
    if not node:
        node = _synthesize_data_node(object_id)
    if not node:
        raise HTTPException(404, "object not found in current context")

    kind = node["kind"]
    meta = node.get("meta") or {}
    values, samples = _ensure_live_values(kind, object_id, focus_id, node, meta)

    rel = neighbor["rel"] if neighbor else "self"
    link = neighbor.get("link") if neighbor else _link_for(node, rel)

    return {
        "id": object_id,
        "label": node["label"],
        "kind": kind,
        "focusable": node.get("focusable", False),
        "rel": rel,
        "link": link,
        "as_of": now(),
        "meta": meta,
        "lenses": node.get("lenses", []),
        "workspace": node.get("workspace"),
        "values": values,
        "samples": samples,
    }


@router.get("/sources")
def sources():
    """The bottom strip: where the graph's data comes from, by source class."""
    total_ops = sum(len(v["operations"]) for v in DB["vins"].values())
    total_tags = sum(c["mapped_tags"] for c in DB["connectors"].values())
    plc_count = sum(1 for d in DB["devices"].values() if d["kind"] == "PLC")
    cam_count = sum(1 for d in DB["devices"].values() if d["kind"] == "Camera")
    weld_robots = sum(2 for s in DB["stations"].values() if s["archetype"] == "weld")
    compiled = sum(1 for w in DB["workflows"].values() if w["status"] == "Compiled")

    return [
        {
            "category": "Field workers", "class": "people",
            "systems": [
                {"name": "Operators & engineers", "icon": "👥", "count": len(DB["users"]),
                 "detail": "dispositions, confirmations, approvals"},
            ],
        },
        {
            "category": "Operational (OT)", "class": "ot",
            "systems": [
                {"name": "Historian", "icon": "🕐", "count": total_tags, "detail": "mapped tags"},
                {"name": "PLC, IoT", "icon": "⚙", "count": plc_count, "detail": "controllers"},
                {"name": "MES", "icon": "▣", "count": total_ops, "detail": "operation records"},
                {"name": "QMS", "icon": "✓", "count": len(DB["holds"]) + len(DB["defects"]), "detail": "quality records"},
            ],
        },
        {
            "category": "Conventional (IT)", "class": "it",
            "systems": [
                {"name": "CMMS", "icon": "🔧", "count": sum(1 for s in DB["stations"].values() if s["state"] == "Maintenance") + 12, "detail": "work orders"},
                {"name": "ERP", "icon": "◫", "count": len(DB["orders"]), "detail": "orders"},
            ],
        },
        {
            "category": "Engineering (ET)", "class": "et",
            "systems": [
                {"name": "Simulation", "icon": "◇", "count": compiled, "detail": "compiled scenarios"},
                {"name": "3D / Layout", "icon": "▦", "count": 1 + len(DB["areas"]), "detail": "layout models"},
                {"name": "Images", "icon": "🖼", "count": len(DB["inspections"]), "detail": "evidence captures"},
                {"name": "Docs", "icon": "🗎", "count": len(DB["work_instructions"]) + len(DB["models"]), "detail": "instructions & passports"},
            ],
        },
        {
            "category": "Robotics", "class": "robotics",
            "systems": [
                {"name": "Robot cells & cameras", "icon": "🤖", "count": weld_robots + cam_count, "detail": "robots + vision heads"},
            ],
        },
    ]


# ── Composition schema + reporting structure ─────────────────────────────

LEVEL_ORDER = ["facility", "area", "line", "station", "device"]


def _canonical_level_keys(schema: dict | None) -> list[str]:
    """Map composed schema.levels to canonical facility→device keys."""
    levels = (schema or {}).get("levels") or []
    keys: list[str] = []
    for lv in levels:
        eid = lv.get("entity") or ""
        lid = lv.get("id") or ""
        if lid == "facility" or eid == "site":
            key = "facility"
        elif eid in LEVEL_ORDER:
            key = eid
        elif lid in LEVEL_ORDER:
            key = lid
        else:
            continue
        if key not in keys:
            keys.append(key)
    return keys or list(LEVEL_ORDER)


def _context_graphs() -> dict:
    graphs = DB.setdefault("context_graphs", {})
    # Migrate legacy single schema into the library if needed.
    if not graphs and DB.get("graph_schema"):
        s = DB["graph_schema"]
        if s.get("id"):
            graphs[s["id"]] = s
            DB["active_context_graph_id"] = s["id"]
    return graphs


def _active_schema() -> dict:
    graphs = _context_graphs()
    aid = DB.get("active_context_graph_id")
    if aid and aid in graphs:
        schema = graphs[aid]
        DB["graph_schema"] = schema
        return schema
    schema = DB.get("graph_schema") or {}
    if schema.get("id"):
        graphs[schema["id"]] = schema
        DB["active_context_graph_id"] = schema["id"]
    return schema


def _set_active_schema(schema: dict) -> dict:
    graphs = _context_graphs()
    graphs[schema["id"]] = schema
    DB["active_context_graph_id"] = schema["id"]
    DB["graph_schema"] = schema
    return schema


def _schema_summary(schema: dict) -> dict:
    bindings = schema.get("object_bindings") or []
    return {
        "id": schema.get("id"),
        "name": schema.get("name"),
        "version": schema.get("version"),
        "status": schema.get("status"),
        "description": schema.get("description") or "",
        "updated_at": schema.get("updated_at"),
        "updated_by": schema.get("updated_by"),
        "binding_count": len(bindings),
        "enabled_bindings": sum(1 for b in bindings if b.get("enabled")),
        "active": schema.get("id") == DB.get("active_context_graph_id"),
    }


@router.get("/contexts")
def list_contexts():
    graphs = _context_graphs()
    rows = [_schema_summary(s) for s in graphs.values()]
    rows.sort(key=lambda r: (not r["active"], r.get("name") or ""))
    return {
        "active_id": DB.get("active_context_graph_id"),
        "items": rows,
    }


class ContextCreate(BaseModel):
    name: str
    description: str | None = None
    clone_from: str | None = None
    actor: str = "M. Sullivan"


@router.post("/contexts")
def create_context(body: ContextCreate):
    graphs = _context_graphs()
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    src = None
    if body.clone_from:
        src = graphs.get(body.clone_from)
        if not src:
            raise HTTPException(404, "clone_from context not found")
    else:
        src = _active_schema() or next(iter(graphs.values()), None)
    if not src:
        raise HTTPException(400, "no template context available to clone")

    new_id = f"schema-{uuid.uuid4().hex[:8]}"
    schema = copy.deepcopy(src)
    schema["id"] = new_id
    schema["name"] = name
    schema["description"] = (body.description or "").strip()
    schema["status"] = "Draft"
    schema["version"] = "1.0"
    schema["updated_at"] = now()
    schema["updated_by"] = body.actor
    # Re-key bindings so clones don't collide on merge
    for i, b in enumerate(schema.get("object_bindings") or []):
        b["id"] = f"bind-{new_id[-6:]}-{i + 1}"
    graphs[new_id] = schema
    aid = f"audit-{len(DB['audit']) + 1}"
    DB["audit"][aid] = {
        "id": aid, "kind": "graph.context.create", "actor": body.actor,
        "detail": f"Created context graph “{name}”",
        "at": now(), "source": "context-graph",
    }
    return schema


@router.get("/contexts/{context_id}")
def get_context(context_id: str):
    schema = _context_graphs().get(context_id)
    if not schema:
        raise HTTPException(404, "context graph not found")
    return schema


class ContextUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    object_bindings: list[dict] | None = None
    levels: list[dict] | None = None
    make_active: bool | None = None
    actor: str = "M. Sullivan"


@router.put("/contexts/{context_id}")
def update_context(context_id: str, body: ContextUpdate):
    graphs = _context_graphs()
    schema = graphs.get(context_id)
    if not schema:
        raise HTTPException(404, "context graph not found")
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "name cannot be empty")
        schema["name"] = name
    if body.description is not None:
        schema["description"] = body.description.strip()
    if body.status is not None:
        if body.status not in ("Draft", "In Review", "Published"):
            raise HTTPException(400, "status must be Draft, In Review, or Published")
        schema["status"] = body.status
    if body.levels is not None:
        schema["levels"] = body.levels
    if body.object_bindings is not None:
        # Full replace so Compose can add/remove selected data objects.
        cleaned: list[dict] = []
        for b in body.object_bindings:
            row = dict(b)
            if not row.get("id"):
                row["id"] = f"bind-{uuid.uuid4().hex[:8]}"
            if "enabled" not in row:
                row["enabled"] = True
            if "rollup_to" not in row:
                row["rollup_to"] = []
            cleaned.append(row)
        schema["object_bindings"] = cleaned
    schema["updated_at"] = now()
    schema["updated_by"] = body.actor
    graphs[context_id] = schema
    if body.make_active or context_id == DB.get("active_context_graph_id"):
        _set_active_schema(schema)
    aid = f"audit-{len(DB['audit']) + 1}"
    DB["audit"][aid] = {
        "id": aid, "kind": "graph.context.update", "actor": body.actor,
        "detail": f"Updated context graph “{schema['name']}” → {schema['status']}",
        "at": now(), "source": "context-graph",
    }
    return schema


@router.post("/contexts/{context_id}/activate")
def activate_context(context_id: str, actor: str = "M. Sullivan"):
    schema = _context_graphs().get(context_id)
    if not schema:
        raise HTTPException(404, "context graph not found")
    _set_active_schema(schema)
    aid = f"audit-{len(DB['audit']) + 1}"
    DB["audit"][aid] = {
        "id": aid, "kind": "graph.context.activate", "actor": actor,
        "detail": f"Activated context graph “{schema['name']}”",
        "at": now(), "source": "context-graph",
    }
    return _schema_summary(schema)


@router.delete("/contexts/{context_id}")
def delete_context(context_id: str, actor: str = "M. Sullivan"):
    graphs = _context_graphs()
    if context_id not in graphs:
        raise HTTPException(404, "context graph not found")
    if len(graphs) <= 1:
        raise HTTPException(400, "cannot delete the last context graph")
    schema = graphs.pop(context_id)
    if DB.get("active_context_graph_id") == context_id:
        nxt = next(iter(graphs.values()))
        _set_active_schema(nxt)
    aid = f"audit-{len(DB['audit']) + 1}"
    DB["audit"][aid] = {
        "id": aid, "kind": "graph.context.delete", "actor": actor,
        "detail": f"Deleted context graph “{schema.get('name')}”",
        "at": now(), "source": "context-graph",
    }
    return {"ok": True, "active_id": DB.get("active_context_graph_id")}


@router.get("/schema")
def get_schema():
    schema = _active_schema()
    if not schema:
        raise HTTPException(404, "graph schema not seeded")
    return schema


class SchemaUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    object_bindings: list[dict] | None = None
    levels: list[dict] | None = None
    actor: str = "M. Sullivan"


@router.put("/schema")
def update_schema(body: SchemaUpdate):
    schema = _active_schema()
    if not schema:
        raise HTTPException(404, "graph schema not seeded")
    return update_context(schema["id"], ContextUpdate(
        name=body.name,
        status=body.status,
        object_bindings=body.object_bindings,
        levels=body.levels,
        make_active=True,
        actor=body.actor,
    ))


def _counts_for_station(st_id: str) -> dict:
    insp = [i for i in DB["inspections"].values() if i["station_id"] == st_id]
    defects = [d for d in DB["defects"].values() if d["station_id"] == st_id]
    vins = [v for v in DB["vins"].values()
            if any(op["station_id"] == st_id for op in v["operations"])]
    wis = [w for w in DB["work_instructions"].values() if w["station_id"] == st_id]
    devices = [d for d in DB["devices"].values() if d["station_id"] == st_id]
    st = DB["stations"][st_id]
    return {
        "inspection": len(insp),
        "defect": len(defects),
        "genealogy": len(vins),
        "work_instruction": len(wis),
        "status": 1 if st.get("state") else 0,
        "timeseries": len(devices),
        "order": 0,
        "state": st.get("state"),
        "cycle_s": st.get("cycle_time_s"),
        "quality": round(st["health"]["quality"] * 100, 1) if st.get("health") else None,
    }


def _objects_at(entity_kind: str, entity_id: str, bindings: list[dict]) -> list[dict]:
    """Materialize reporting objects attached at a given hierarchy level."""
    enabled = {b["object_type"]: b for b in bindings if b.get("enabled")}
    objects: list[dict] = []

    if entity_kind == "station" and entity_id in DB["stations"]:
        c = _counts_for_station(entity_id)
        st = DB["stations"][entity_id]
        if "status" in enabled:
            objects.append({
                "type": "status", "label": f"Status · {st['state']}",
                "count": 1, "detail": f"cycle {st['cycle_time_s']}s · Q {c['quality']}%",
                "binding": enabled["status"]["id"],
            })
        if "inspection" in enabled and c["inspection"]:
            objects.append({
                "type": "inspection", "label": "Inspection / evidence",
                "count": c["inspection"], "detail": "vision captures at station",
                "binding": enabled["inspection"]["id"],
            })
        if "defect" in enabled and c["defect"]:
            objects.append({
                "type": "defect", "label": "Defect / NCR",
                "count": c["defect"], "detail": "quality events",
                "binding": enabled["defect"]["id"],
            })
        if "genealogy" in enabled and c["genealogy"]:
            objects.append({
                "type": "genealogy", "label": "VIN genealogy",
                "count": c["genealogy"], "detail": "product identities through station",
                "binding": enabled["genealogy"]["id"],
            })
        if "work_instruction" in enabled and c["work_instruction"]:
            objects.append({
                "type": "work_instruction", "label": "Work instructions",
                "count": c["work_instruction"], "detail": "governing standard work",
                "binding": enabled["work_instruction"]["id"],
            })

    if entity_kind == "line" and entity_id in DB["lines"]:
        orders = [o for o in DB["orders"].values() if o.get("line_id") == entity_id]
        if "order" in enabled and orders:
            objects.append({
                "type": "order", "label": "Production orders",
                "count": len(orders),
                "detail": f"{sum(1 for o in orders if o['status'] == 'Released')} released",
                "binding": enabled["order"]["id"],
            })
        # Roll-up status / inspection from child stations when binding says so
        station_ids = [s["id"] for s in DB["stations"].values() if s["line_id"] == entity_id]
        rolled = {"inspection": 0, "defect": 0, "status_abnormal": 0}
        for sid in station_ids:
            c = _counts_for_station(sid)
            rolled["inspection"] += c["inspection"]
            rolled["defect"] += c["defect"]
            if DB["stations"][sid]["state"] not in ("Running", "Changeover"):
                rolled["status_abnormal"] += 1
        for b in bindings:
            if not b.get("enabled"):
                continue
            if "line" not in (b.get("rollup_to") or []) and b.get("report_at") != "line":
                continue
            if b["object_type"] == "inspection" and rolled["inspection"]:
                objects.append({
                    "type": "inspection", "label": "Inspections (rolled up)",
                    "count": rolled["inspection"], "detail": "from stations on line",
                    "binding": b["id"], "rolled_up": True,
                })
            if b["object_type"] == "defect" and rolled["defect"]:
                objects.append({
                    "type": "defect", "label": "Defects (rolled up)",
                    "count": rolled["defect"], "detail": "from stations on line",
                    "binding": b["id"], "rolled_up": True,
                })
            if b["object_type"] == "status":
                objects.append({
                    "type": "status", "label": "Station status rollup",
                    "count": len(station_ids),
                    "detail": f"{rolled['status_abnormal']} abnormal of {len(station_ids)}",
                    "binding": b["id"], "rolled_up": True,
                })

    if entity_kind == "device" and entity_id in DB["devices"]:
        d = DB["devices"][entity_id]
        if "timeseries" in enabled:
            objects.append({
                "type": "timeseries", "label": "Signal time series",
                "count": 1, "detail": f"{d['protocol']} · trust {d['timestamp_trust']}",
                "binding": enabled["timeseries"]["id"],
            })
        if d["kind"] == "Camera" and "inspection" in enabled:
            objects.append({
                "type": "inspection", "label": "Frame captures",
                "count": sum(1 for i in DB["inspections"].values()
                             if i["station_id"] == d["station_id"]),
                "detail": "camera evidence stream",
                "binding": enabled["inspection"]["id"],
            })

    if entity_kind == "area" and entity_id in DB["areas"]:
        line_ids = [ln["id"] for ln in DB["lines"].values() if ln["area_id"] == entity_id]
        st_ids = [s["id"] for s in DB["stations"].values() if s["area_id"] == entity_id]
        insp = sum(len([i for i in DB["inspections"].values() if i["station_id"] == sid]) for sid in st_ids)
        for b in bindings:
            if not b.get("enabled") or "area" not in (b.get("rollup_to") or []):
                continue
            if b["object_type"] == "inspection" and insp:
                objects.append({
                    "type": "inspection", "label": "Inspections (area rollup)",
                    "count": insp, "detail": f"across {len(st_ids)} stations",
                    "binding": b["id"], "rolled_up": True,
                })
            if b["object_type"] == "order":
                n_orders = sum(1 for o in DB["orders"].values() if o.get("line_id") in line_ids)
                if n_orders:
                    objects.append({
                        "type": "order", "label": "Orders (area rollup)",
                        "count": n_orders, "detail": f"{len(line_ids)} lines",
                        "binding": b["id"], "rolled_up": True,
                    })

    if entity_kind == "facility":
        for b in bindings:
            if not b.get("enabled") or "facility" not in (b.get("rollup_to") or []):
                continue
            if b["object_type"] == "inspection":
                objects.append({
                    "type": "inspection", "label": "Plant inspections",
                    "count": len(DB["inspections"]), "detail": "facility rollup",
                    "binding": b["id"], "rolled_up": True,
                })
            if b["object_type"] == "order":
                objects.append({
                    "type": "order", "label": "Plant orders",
                    "count": len(DB["orders"]), "detail": "facility rollup",
                    "binding": b["id"], "rolled_up": True,
                })
            if b["object_type"] == "defect":
                objects.append({
                    "type": "defect", "label": "Plant defects",
                    "count": len(DB["defects"]), "detail": "facility rollup",
                    "binding": b["id"], "rolled_up": True,
                })

    return objects


def _reporting_node(kind: str, eid: str, label: str, bindings: list[dict],
                    children: list | None = None) -> dict:
    return {
        "id": eid,
        "kind": kind,
        "label": label,
        "objects": _objects_at(kind, eid, bindings),
        "children": children or [],
    }


@router.get("/reporting")
def reporting_tree(root: str | None = None):
    """Reporting structure: hierarchy with inspection/status/etc. objects per node.

    Nesting follows the active context-graph ``levels`` (skipping levels not in
    the composed model). Object slots still come from ``object_bindings``.
    """
    schema = _active_schema() or {}
    bindings = schema.get("object_bindings", [])
    level_keys = set(_canonical_level_keys(schema))
    site_id = root if root and root in DB["sites"] else next(iter(DB["sites"]))
    site = DB["sites"][site_id]

    def station_node(st: dict) -> dict:
        device_nodes = []
        if "device" in level_keys:
            device_nodes = [
                _reporting_node("device", d["id"], d["name"], bindings)
                for d in DB["devices"].values() if d["station_id"] == st["id"]
            ]
        if "station" in level_keys:
            return _reporting_node("station", st["id"], st["name"], bindings, device_nodes)
        # Station omitted from spine — surface devices (or nothing) directly.
        if device_nodes:
            return device_nodes[0] if len(device_nodes) == 1 else {
                "id": f"devices-{st['id']}", "kind": "device", "label": st["name"],
                "objects": [], "children": device_nodes,
            }
        return _reporting_node("station", st["id"], st["name"], bindings, [])

    def line_children(ln: dict) -> list:
        stations = [x for x in DB["stations"].values() if x["line_id"] == ln["id"]]
        return [station_node(st) for st in stations]

    def area_children(area: dict) -> list:
        lines = [x for x in DB["lines"].values() if x["area_id"] == area["id"]]
        if "line" in level_keys:
            return [
                _reporting_node("line", ln["id"], ln["name"], bindings, line_children(ln))
                for ln in lines
            ]
        # Flatten lines: stations (or devices) hang directly under area/facility.
        kids = []
        for ln in lines:
            kids.extend(line_children(ln))
        return kids

    if "area" in level_keys:
        facility_children = [
            _reporting_node("area", area["id"], area["name"], bindings, area_children(area))
            for area in DB["areas"].values()
        ]
    else:
        facility_children = []
        for area in DB["areas"].values():
            facility_children.extend(area_children(area))

    if "facility" in level_keys:
        tree = _reporting_node("facility", site_id, site["name"], bindings, facility_children)
    elif len(facility_children) == 1:
        tree = facility_children[0]
    else:
        tree = {
            "id": site_id, "kind": "facility", "label": site["name"],
            "objects": _objects_at("facility", site_id, bindings),
            "children": facility_children,
        }

    def walk_stats(node, acc=None):
        if acc is None:
            acc = {"nodes": 0, "objects": 0, "by_type": {}}
        acc["nodes"] += 1
        for o in node["objects"]:
            acc["objects"] += 1
            acc["by_type"][o["type"]] = acc["by_type"].get(o["type"], 0) + o["count"]
        for ch in node["children"]:
            walk_stats(ch, acc)
        return acc

    return {
        "schema_id": schema.get("id"),
        "schema_status": schema.get("status"),
        "levels": _canonical_level_keys(schema),
        "tree": tree,
        "stats": walk_stats(tree),
        "bindings": [
            {"id": b["id"], "object_type": b["object_type"], "label": b["label"],
             "report_at": b["report_at"], "rollup_to": b.get("rollup_to", []),
             "enabled": b.get("enabled", True)}
            for b in bindings
        ],
    }
