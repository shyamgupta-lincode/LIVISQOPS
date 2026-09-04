"""Idempotent ISA-95 context-graph seed.

Carries forward richness from the legacy LIVIS MES / web-legacy context-graph
schemas (Harley York object bindings + ISA-95 levels) into the Midwest Hybrid
bearing_wear demo plant without inventing a conflicting topology.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from . import models

# Stable UUIDv7-shaped IDs (36 chars) — never regenerate.
def _nid(n: int) -> str:
    return f"aaaaaaaa-aaaa-7aaa-8aaa-{n:012d}"


def _eid(src_id: str, dst_id: str, rel_type: str) -> str:
    digest = hashlib.sha1(f"{src_id}|{dst_id}|{rel_type}".encode()).hexdigest()[:12]
    return f"bbbbbbbb-bbbb-7bbb-8bbb-{digest}"

# Levels adapted from legacy store._seed_graph_schema + platform ISA-95 aliases,
# remapped to FactoryOps domain kinds (cell≈station, asset≈device).
CONTEXT_GRAPH_LEVELS: list[dict[str, Any]] = [
    {"id": "enterprise", "label": "Enterprise", "entity": "enterprise", "isa95": "Level 4", "required": False},
    {"id": "facility", "label": "Site / Facility", "entity": "site", "isa95": "Level 3–4", "required": True},
    {"id": "area", "label": "Area", "entity": "area", "isa95": "Level 3", "required": True},
    {"id": "line", "label": "Line / Process segment", "entity": "line", "isa95": "Level 3", "required": True},
    {"id": "cell", "label": "Work cell / Station", "entity": "cell", "isa95": "Level 2", "required": True},
    {"id": "asset", "label": "Equipment / Device", "entity": "asset", "isa95": "Level 1–2", "required": False},
]

# Object bindings from legacy Harley York + platform_seed enrichments,
# report_at adjusted to FactoryOps kinds (station→cell/asset, device→asset).
CONTEXT_GRAPH_BINDINGS: list[dict[str, Any]] = [
    {
        "id": "bind-status",
        "object_type": "status",
        "label": "Station / line status objects",
        "report_at": "asset",
        "rollup_to": ["cell", "line", "area", "site"],
        "lenses": ["production", "maintenance"],
        "enabled": True,
        "description": "Live state, cycle, takt and health metrics for operations reporting.",
        "protocol": "OPC UA",
        "transport": "opc.tcp",
        "direction": "subscribe",
        "topic": "ns=2;s=Station.Status",
        "endpoint": "opc.tcp://line-opcua/UA/FactoryOps",
    },
    {
        "id": "bind-inspection",
        "object_type": "inspection",
        "label": "Inspection / evidence objects",
        "report_at": "unit",
        "rollup_to": ["asset", "cell", "line", "site"],
        "lenses": ["quality"],
        "enabled": True,
        "description": "Vision captures and dispositions roll up the hierarchy for quality reporting.",
        "protocol": "GigE Vision",
        "transport": "gige",
        "direction": "publish",
        "topic": None,
        "endpoint": "gige://camera/station",
    },
    {
        "id": "bind-defect",
        "object_type": "defect",
        "label": "Defect / NCR / anomaly objects",
        "report_at": "asset",
        "rollup_to": ["cell", "line", "area", "site"],
        "lenses": ["quality"],
        "enabled": True,
        "description": "Quality events and holds organized by asset context.",
        "protocol": "MQTT Sparkplug B",
        "transport": "mqtt",
        "direction": "publish",
        "topic": "spBv1.0/FactoryOps/DDATA/quality/defect",
        "endpoint": "mqtt://mosquitto:1883",
    },
    {
        "id": "bind-order",
        "object_type": "order",
        "label": "Production order objects",
        "report_at": "line",
        "rollup_to": ["area", "site"],
        "lenses": ["production", "supply_chain"],
        "enabled": True,
        "description": "ERP/MES work orders dispatched to lines.",
        "protocol": "MES REST",
        "transport": "https",
        "direction": "subscribe",
        "topic": "mes.production.orders",
        "endpoint": "/api/v1/connector-sim/mes/orders",
    },
    {
        "id": "bind-genealogy",
        "object_type": "genealogy",
        "label": "Lot / unit genealogy",
        "report_at": "unit",
        "rollup_to": ["lot", "order", "line", "site"],
        "lenses": ["production", "supply_chain", "quality"],
        "enabled": True,
        "description": "Product identity and serials through the process path (legacy VIN binding).",
        "protocol": "MES REST",
        "transport": "https",
        "direction": "subscribe",
        "topic": "mes.genealogy.units",
        "endpoint": "/api/v1/connector-sim/mes/genealogy",
    },
    {
        "id": "bind-timeseries",
        "object_type": "timeseries",
        "label": "Process time series",
        "report_at": "asset",
        "rollup_to": ["cell", "line"],
        "lenses": ["production", "maintenance"],
        "enabled": True,
        "description": "Historian tags and cycle series attached to instruments.",
        "protocol": "OPC UA",
        "transport": "opc.tcp",
        "direction": "subscribe",
        "topic": "ns=2;s=Spindle.*",
        "endpoint": "opc.tcp://line-opcua/UA/FactoryOps",
    },
    {
        "id": "bind-quality-event",
        "object_type": "quality_event",
        "label": "Quality event objects",
        "report_at": "asset",
        "rollup_to": ["cell", "line", "area", "site"],
        "lenses": ["quality"],
        "enabled": True,
        "description": "Platform binding for quality workflow events.",
        "protocol": "Kafka/Redpanda",
        "transport": "kafka",
        "direction": "publish",
        "topic": "quality.events",
        "endpoint": "redpanda:9092",
    },
    {
        "id": "bind-failure-mode",
        "object_type": "failure_mode",
        "label": "Failure mode objects",
        "report_at": "asset",
        "rollup_to": ["cell", "line", "site"],
        "lenses": ["quality", "maintenance"],
        "enabled": True,
        "description": "Predictive-maintenance failure modes (bearing_wear demo).",
        "protocol": "CMMS REST",
        "transport": "https",
        "direction": "subscribe",
        "topic": None,
        "endpoint": "/api/v1/connector-sim/cmms/failure-modes",
    },
    {
        "id": "bind-lesson",
        "object_type": "lesson",
        "label": "Approved lesson / knowledge objects",
        "report_at": "site",
        "rollup_to": ["enterprise"],
        "lenses": ["quality", "maintenance"],
        "enabled": True,
        "description": "Approved RCA cases promoted to reusable knowledge.",
        "protocol": "HTTP ingest",
        "transport": "https",
        "direction": "publish",
        "topic": "knowledge.proposals",
        "endpoint": "/api/v1/knowledge",
    },
]

# Parent→child hierarchy connectivity (how the child joins the spine / publishes).
# Keys are destination graph kinds. Used for seeded `contains` edge provenance.
FLOW_LINK_BY_DST_KIND: dict[str, dict[str, Any]] = {
    "site": {
        "protocol": "simulated",
        "transport": "seed",
        "direction": "publish",
        "topic": "context.sites",
        "endpoint": "context://enterprise/sites",
        "connector_kind": "seed",
    },
    "area": {
        "protocol": "MES REST",
        "transport": "https",
        "direction": "subscribe",
        "topic": "mes.areas",
        "endpoint": "/api/v1/connector-sim/mes/areas",
        "connector_kind": "mes_rest",
    },
    "line": {
        "protocol": "MES REST",
        "transport": "https",
        "direction": "subscribe",
        "topic": "mes.production.context",
        "endpoint": "/api/v1/connector-sim/mes/lines",
        "connector_kind": "mes_rest",
    },
    "cell": {
        "protocol": "MQTT Sparkplug B",
        "transport": "mqtt",
        "direction": "publish",
        "topic": "spBv1.0/FactoryOps/DBIRTH/{line}/{cell}",
        "endpoint": "mqtt://mosquitto:1883",
        "connector_kind": "mqtt_sparkplug",
    },
    "station": {
        "protocol": "MQTT Sparkplug B",
        "transport": "mqtt",
        "direction": "publish",
        "topic": "spBv1.0/FactoryOps/DDATA/{line}/{station}",
        "endpoint": "mqtt://mosquitto:1883",
        "connector_kind": "mqtt_sparkplug",
    },
    "asset": {
        "protocol": "OPC UA",
        "transport": "opc.tcp",
        "direction": "subscribe",
        "topic": "ns=2;s={asset}",
        "endpoint": "opc.tcp://line-opcua/UA/FactoryOps",
        "connector_kind": "opc_ua",
    },
}


def link_profile_for_kind(kind: str, *, legacy: bool = False, **subs: str) -> dict[str, Any]:
    """Resolved protocol / transport profile for a hierarchy edge destination."""
    base = dict(FLOW_LINK_BY_DST_KIND.get(kind) or {
        "protocol": "MES Context",
        "transport": "internal",
        "direction": "publish",
        "topic": None,
        "endpoint": None,
        "connector_kind": "internal",
    })
    if legacy:
        base["protocol"] = "simulated"
        base["transport"] = "seed"
        base["connector_kind"] = "seed"
        base["endpoint"] = base.get("endpoint") or "context://harley-york"
    topic = base.get("topic")
    if isinstance(topic, str) and "{" in topic:
        try:
            base["topic"] = topic.format(**{k: v or "" for k, v in subs.items()})
        except KeyError:
            pass
    return base


def edge_link_from_provenance(provenance: dict[str, Any] | None) -> dict[str, Any] | None:
    """Normalize link fields stored under edge.provenance.link (or flat provenance)."""
    if not provenance:
        return None
    link = provenance.get("link") if isinstance(provenance.get("link"), dict) else None
    src = link or provenance
    protocol = src.get("protocol")
    if not protocol:
        return None
    return {
        "protocol": protocol,
        "transport": src.get("transport"),
        "direction": src.get("direction") or "publish",
        "topic": src.get("topic"),
        "endpoint": src.get("endpoint"),
        "connector_kind": src.get("connector_kind"),
        "provenance_source": provenance.get("source") or (link or {}).get("source") or "seed",
    }

# Midwest Hybrid areas (graph-only; domain uses site→line→cell).
AREA_DISCRETE = _nid(10)
AREA_BATCH = _nid(11)
# Harley York areas carried from legacy store._seed_topology (graph enrichment).
AREA_HD_FRAME = _nid(20)
AREA_HD_PAINT = _nid(21)
AREA_HD_PWT = _nid(22)
AREA_HD_FA = _nid(23)
AREA_HD_EOL = _nid(24)

ENTERPRISE = _nid(1)
META_MODEL = _nid(2)

# Signals on the bearing asset (legacy device-tag idea → graph signal nodes).
SIGNAL_SPECS = [
    (_nid(50), "vibration_rms", "mm/s", "Accelerometer RMS"),
    (_nid(51), "temperature_c", "°C", "Bearing housing temperature"),
    (_nid(52), "torque_nm", "N·m", "Spindle process torque"),
    (_nid(53), "speed_rpm", "rpm", "Spindle speed"),
]


def _upsert_node(db: Session, id_: str, tenant_id: str, kind: str, label: str, props: dict | None = None) -> models.EntityNode:
    row = db.get(models.EntityNode, id_)
    props = props or {}
    if row:
        row.tenant_id = tenant_id
        row.kind = kind
        row.label = label
        row.props = props
        return row
    row = models.EntityNode(id=id_, tenant_id=tenant_id, kind=kind, label=label, props=props)
    db.add(row)
    return row


def _upsert_edge(
    db: Session,
    id_: str,
    tenant_id: str,
    src_id: str,
    dst_id: str,
    rel_type: str,
    *,
    provenance: dict | None = None,
    confidence: float = 1.0,
    creator_type: str = "seed",
    approval_status: str = "approved",
) -> models.EntityEdge:
    now = datetime.now(timezone.utc)
    row = db.get(models.EntityEdge, id_)
    prov = provenance or {"source": "seed", "schema": "midwest-hybrid-v1"}
    if row:
        row.tenant_id = tenant_id
        row.src_id = src_id
        row.dst_id = dst_id
        row.rel_type = rel_type
        row.provenance = prov
        row.confidence = confidence
        row.creator_type = creator_type
        row.approval_status = approval_status
        row.tx_time = now
        return row
    row = models.EntityEdge(
        id=id_,
        tenant_id=tenant_id,
        src_id=src_id,
        dst_id=dst_id,
        rel_type=rel_type,
        provenance=prov,
        valid_from=now,
        tx_time=now,
        confidence=confidence,
        creator_type=creator_type,
        approval_status=approval_status,
    )
    db.add(row)
    return row


def seed_context_graph(
    db: Session,
    *,
    tenant: models.Tenant,
    site: models.Site,
    harley: models.Site,
    line1: models.Line,
    line2: models.Line,
    cells: list[models.Cell],
    assets: list[models.Asset],
    product: models.Product,
    order: models.ProductionOrder,
    lot: models.Lot,
    unit: models.SerialUnit,
    failure_mode: models.FailureMode,
    asset_bearing_id: str,
) -> dict[str, int]:
    """Upsert the full published context graph; remove orphan seed rows."""
    tid = tenant.id
    pending_nodes: list[tuple[str, str, str, dict]] = []
    pending_edges: list[tuple[str, str, str, dict]] = []
    wanted_nodes: set[str] = set()
    wanted_edges: set[str] = set()

    def node(nid: str, kind: str, label: str, props: dict | None = None) -> str:
        pending_nodes.append((nid, kind, label, props or {}))
        wanted_nodes.add(nid)
        return nid

    def edge(src: str, dst: str, rel: str, **kw: Any) -> None:
        eid = _eid(src, dst, rel)
        # Attach protocol-aware link metadata on hierarchy edges when missing.
        provenance = dict(kw.get("provenance") or {"source": "seed", "schema": "midwest-hybrid-v1"})
        if rel == "contains" and "link" not in provenance:
            dst_kind = next((k for nid, k, _l, _p in pending_nodes if nid == dst), None)
            legacy = bool(provenance.get("legacy")) or bool(
                next((p.get("legacy") for nid, _k, _l, p in pending_nodes if nid == dst), False)
            )
            subs = {
                "line": next(
                    (p.get("code") or _l for nid, _k, _l, p in pending_nodes if nid == src),
                    "line",
                ),
                "cell": next(( _l for nid, _k, _l, _p in pending_nodes if nid == dst), "cell"),
                "station": next((_l for nid, _k, _l, _p in pending_nodes if nid == dst), "station"),
                "asset": next((_l for nid, _k, _l, _p in pending_nodes if nid == dst), "asset"),
            }
            if dst_kind:
                provenance["link"] = link_profile_for_kind(dst_kind, legacy=legacy, **{k: str(v) for k, v in subs.items()})
            kw["provenance"] = provenance
        elif rel == "measures" and "link" not in provenance:
            sig_props = next((p for nid, _k, _l, p in pending_nodes if nid == dst), {}) or {}
            key = sig_props.get("key") or "Signal"
            provenance["link"] = {
                "protocol": sig_props.get("protocol") or "OPC UA",
                "transport": "opc.tcp",
                "direction": "publish",
                "topic": f"ns=2;s=Spindle.{str(key).replace('_', '.').title().replace(' ', '')}",
                "endpoint": "opc.tcp://line-opcua/UA/FactoryOps",
                "connector_kind": "opc_ua",
            }
            kw["provenance"] = provenance
        pending_edges.append((eid, src, dst, {"rel_type": rel, **kw}))
        wanted_edges.add(eid)

    # --- Meta + enterprise -------------------------------------------------
    node(
        META_MODEL,
        "context_model",
        "Midwest Hybrid context model",
        {
            "schema_id": "schema-midwest-hybrid",
            "version": "1.1",
            "status": "published",
            "source": "legacy LIVIS MES context_graphs + Midwest Hybrid plant",
            "levels": CONTEXT_GRAPH_LEVELS,
            "object_bindings": CONTEXT_GRAPH_BINDINGS,
        },
    )
    node(ENTERPRISE, "enterprise", tenant.name, {"id": tenant.id, "isa95": "Level 4"})
    edge(META_MODEL, ENTERPRISE, "describes", provenance={"source": "seed", "legacy": "context_graphs"})

    # --- Midwest Hybrid spine ----------------------------------------------
    n_site = node(site.id, "site", site.name, {"id": site.id, "code": site.code, "timezone": site.timezone})
    edge(ENTERPRISE, n_site, "contains")

    n_area_d = node(AREA_DISCRETE, "area", "Discrete Assembly", {"code": "DIS", "site_id": site.id})
    n_area_b = node(AREA_BATCH, "area", "Batch Process", {"code": "BAT", "site_id": site.id})
    edge(n_site, n_area_d, "contains")
    edge(n_site, n_area_b, "contains")

    n_line1 = node(line1.id, "line", line1.name, {"id": line1.id, "takt_s": line1.takt_s})
    n_line2 = node(line2.id, "line", line2.name, {"id": line2.id, "takt_s": line2.takt_s})
    edge(n_area_d, n_line1, "contains")
    edge(n_area_b, n_line2, "contains")

    for cell in cells:
        node(cell.id, "cell", cell.name, {"id": cell.id, "line_id": cell.line_id})
        parent_line = line1.id if cell.line_id == line1.id else line2.id
        edge(parent_line, cell.id, "contains")

    for asset in assets:
        props = {
            "id": asset.id,
            "cell_id": asset.cell_id,
            "asset_type": asset.asset_type,
            "criticality": asset.criticality,
            "health_index": asset.health_index,
            "state": asset.operating_state,
        }
        if asset.id == asset_bearing_id:
            props["demo_scenario"] = "bearing_wear"
            props["archetype"] = "process"
        node(asset.id, "asset", asset.name, props)
        edge(asset.cell_id, asset.id, "contains")

    # Failure mode + signals on bearing asset
    node(
        failure_mode.id,
        "failure_mode",
        failure_mode.name,
        {"id": failure_mode.id, "code": failure_mode.code, "horizon_hours": failure_mode.horizon_hours},
    )
    edge(asset_bearing_id, failure_mode.id, "has_failure_mode", confidence=1.0)

    for sid, key, eng_unit, label in SIGNAL_SPECS:
        node(sid, "signal", label, {"key": key, "unit": eng_unit, "asset_id": asset_bearing_id, "protocol": "OPC UA"})
        edge(asset_bearing_id, sid, "measures", provenance={"source": "seed", "legacy": "device_tags"})

    # Production / genealogy thread (legacy bind-vin → lot/unit)
    node(product.id, "product", product.name, {"id": product.id, "revision": product.revision})
    node(
        order.id,
        "order",
        order.external_id,
        {"id": order.id, "external_id": order.external_id, "status": order.status, "qty": order.qty},
    )
    node(lot.id, "lot", lot.code, {"id": lot.id, "code": lot.code})
    node(unit.id, "unit", unit.serial, {"id": unit.id, "serial": unit.serial, "status": unit.status})
    edge(n_site, product.id, "makes")
    edge(order.id, product.id, "for_product")
    edge(order.id, n_line1, "runs_on")
    edge(lot.id, order.id, "belongs_to")
    edge(unit.id, lot.id, "belongs_to")
    edge(unit.id, asset_bearing_id, "processed_at", confidence=0.95)

    # --- Harley York enrichment (legacy topology, graph-only) --------------
    n_hd = node(
        harley.id,
        "site",
        harley.name,
        {"id": harley.id, "code": harley.code, "timezone": harley.timezone, "legacy_site": "site-york1", "tier": "oem"},
    )
    edge(ENTERPRISE, n_hd, "contains", provenance={"source": "seed", "legacy": "harley_york"})
    edge(
        n_hd,
        n_site,
        "supplies_context_to",
        confidence=0.7,
        provenance={"source": "seed", "note": "OEM customer of Midwest Hybrid demo"},
    )

    harley_areas = [
        (AREA_HD_FRAME, "Frame & Fabrication", "FRM", [
            (_nid(30), "line", "Frame Weld Line", 240),
            (_nid(31), "station", "Main Frame Weld Cell", None),
        ]),
        (AREA_HD_PAINT, "Paint & Finishing", "PNT", [
            (_nid(32), "line", "Paint Line 1", 280),
            (_nid(33), "station", "Paint Surface Inspection", None),
        ]),
        (AREA_HD_PWT, "Powertrain", "PWT", [
            (_nid(34), "line", "Milwaukee-Eight Dress Line", 220),
        ]),
        (AREA_HD_FA, "Final Assembly", "FA", [
            (_nid(35), "line", "Touring Assembly Line", 300),
            (_nid(36), "line", "Softail Assembly Line", 270),
            (_nid(37), "station", "Fuel Tank Install", None),
        ]),
        (AREA_HD_EOL, "Vehicle Test", "EOL", [
            (_nid(38), "line", "Final Test Line", 320),
            (_nid(39), "station", "ABS & Lighting Check", None),
        ]),
    ]
    for area_id, area_name, code, children in harley_areas:
        node(area_id, "area", area_name, {"code": code, "site_id": harley.id, "legacy": True})
        edge(n_hd, area_id, "contains", provenance={"source": "seed", "legacy": "harley_york"})
        last_line = None
        for cid, kind, label, takt in children:
            props: dict[str, Any] = {"site_id": harley.id, "legacy": True}
            if takt is not None:
                props["takt_s"] = takt
            node(cid, kind, label, props)
            if kind == "line":
                edge(area_id, cid, "contains", provenance={"source": "seed", "legacy": "harley_york"})
                last_line = cid
            else:
                parent = last_line or area_id
                edge(parent, cid, "contains", provenance={"source": "seed", "legacy": "harley_york"})

    for nid, kind, label, props in pending_nodes:
        _upsert_node(db, nid, tid, kind, label, props)
    db.flush()

    for eid, src, dst, kw in pending_edges:
        rel = kw.pop("rel_type")
        _upsert_edge(db, eid, tid, src, dst, rel, **kw)
    db.flush()

    # Drop orphan graph rows from earlier sparse seeds (random UUIDs).
    for e in db.query(models.EntityEdge).filter(models.EntityEdge.tenant_id == tid).all():
        if e.id not in wanted_edges:
            db.delete(e)
    db.flush()
    for n in db.query(models.EntityNode).filter(models.EntityNode.tenant_id == tid).all():
        if n.id not in wanted_nodes:
            db.delete(n)
    db.flush()

    return {"nodes": len(wanted_nodes), "edges": len(wanted_edges)}


# Hero MotoCorp (separate tenant) — graph ID namespace avoids Midwest _nid collisions.
HERO_META = _nid(201)
HERO_ENTERPRISE = _nid(202)
HERO_AREA_FRAME = _nid(210)
HERO_AREA_ENGINE = _nid(211)
HERO_AREA_PAINT = _nid(212)
HERO_AREA_FA = _nid(213)
HERO_AREA_EOL = _nid(214)
HERO_SIGNAL_SPECS = [
    (_nid(250), "vibration_rms", "mm/s", "Crankshaft accelerometer RMS"),
    (_nid(251), "temperature_c", "°C", "Main bearing housing temperature"),
    (_nid(252), "torque_nm", "N·m", "Balance-machine process torque"),
    (_nid(253), "speed_rpm", "rpm", "Crankshaft speed"),
    (_nid(254), "oil_pressure_bar", "bar", "Engine oil gallery pressure"),
]


def seed_hero_context_graph(
    db: Session,
    *,
    tenant: models.Tenant,
    site: models.Site,
    line1: models.Line,
    line2: models.Line,
    cells: list[models.Cell],
    assets: list[models.Asset],
    product: models.Product,
    order: models.ProductionOrder,
    lot: models.Lot,
    unit: models.SerialUnit,
    failure_mode: models.FailureMode,
    asset_bearing_id: str,
) -> dict[str, int]:
    """Upsert Hero Dharuhera ISA-95 graph under its own tenant_id (orphan-safe)."""
    tid = tenant.id
    pending_nodes: list[tuple[str, str, str, dict]] = []
    pending_edges: list[tuple[str, str, str, dict]] = []
    wanted_nodes: set[str] = set()
    wanted_edges: set[str] = set()

    def node(nid: str, kind: str, label: str, props: dict | None = None) -> str:
        pending_nodes.append((nid, kind, label, props or {}))
        wanted_nodes.add(nid)
        return nid

    def edge(src: str, dst: str, rel: str, **kw: Any) -> None:
        eid = _eid(src, dst, rel)
        provenance = dict(kw.get("provenance") or {"source": "seed", "schema": "hero-dharuhera-v1"})
        if rel == "contains" and "link" not in provenance:
            dst_kind = next((k for nid, k, _l, _p in pending_nodes if nid == dst), None)
            subs = {
                "line": next(
                    (p.get("code") or _l for nid, _k, _l, p in pending_nodes if nid == src),
                    "line",
                ),
                "cell": next((_l for nid, _k, _l, _p in pending_nodes if nid == dst), "cell"),
                "station": next((_l for nid, _k, _l, _p in pending_nodes if nid == dst), "station"),
                "asset": next((_l for nid, _k, _l, _p in pending_nodes if nid == dst), "asset"),
            }
            if dst_kind:
                provenance["link"] = link_profile_for_kind(
                    dst_kind, legacy=False, **{k: str(v) for k, v in subs.items()}
                )
            kw["provenance"] = provenance
        elif rel == "measures" and "link" not in provenance:
            sig_props = next((p for nid, _k, _l, p in pending_nodes if nid == dst), {}) or {}
            key = sig_props.get("key") or "Signal"
            provenance["link"] = {
                "protocol": sig_props.get("protocol") or "OPC UA",
                "transport": "opc.tcp",
                "direction": "publish",
                "topic": f"ns=2;s=Crank.{str(key).replace('_', '.').title().replace(' ', '')}",
                "endpoint": "opc.tcp://hero-dhr-opcua/UA/FactoryOps",
                "connector_kind": "opc_ua",
            }
            kw["provenance"] = provenance
        pending_edges.append((eid, src, dst, {"rel_type": rel, **kw}))
        wanted_edges.add(eid)

    node(
        HERO_META,
        "context_model",
        "Hero Dharuhera context model",
        {
            "schema_id": "schema-hero-dharuhera",
            "version": "1.0",
            "status": "published",
            "source": "synthetic FactoryOps demo — not proprietary Hero data",
            "levels": CONTEXT_GRAPH_LEVELS,
            "object_bindings": CONTEXT_GRAPH_BINDINGS,
            "synthetic_demo": True,
        },
    )
    node(
        HERO_ENTERPRISE,
        "enterprise",
        tenant.name,
        {"id": tenant.id, "isa95": "Level 4", "synthetic_demo": True, "oem": "2W"},
    )
    edge(HERO_META, HERO_ENTERPRISE, "describes", provenance={"source": "seed", "schema": "hero-dharuhera-v1"})

    n_site = node(
        site.id,
        "site",
        site.name,
        {
            "id": site.id,
            "code": site.code,
            "timezone": site.timezone,
            "region": "IN",
            "footprint": "Dharuhera, Haryana (synthetic demo)",
            "synthetic_demo": True,
        },
    )
    edge(HERO_ENTERPRISE, n_site, "contains")

    areas = [
        (HERO_AREA_FRAME, "Frame & Chassis", "FRM", line1.id),
        (HERO_AREA_ENGINE, "Engine Machining", "ENG", line2.id),
        (HERO_AREA_PAINT, "Paint & Finishing", "PNT", None),
        (HERO_AREA_FA, "Final Assembly", "FA", line1.id),
        (HERO_AREA_EOL, "EOL / Vehicle Test", "EOL", None),
    ]
    # Primary line containment: Frame/FA → assembly line; Engine → machining line
    for area_id, area_name, code, _line in areas:
        node(area_id, "area", area_name, {"code": code, "site_id": site.id, "synthetic_demo": True})
        edge(n_site, area_id, "contains")

    n_line1 = node(line1.id, "line", line1.name, {"id": line1.id, "takt_s": line1.takt_s, "code": "SPL-FA"})
    n_line2 = node(line2.id, "line", line2.name, {"id": line2.id, "takt_s": line2.takt_s, "code": "ENG-MACH"})
    edge(HERO_AREA_FA, n_line1, "contains")
    edge(HERO_AREA_FRAME, n_line1, "feeds", provenance={"source": "seed", "schema": "hero-dharuhera-v1", "note": "frame feeds final assembly"})
    edge(HERO_AREA_ENGINE, n_line2, "contains")

    # Graph-only paint / EOL stations (enrichment, not domain Line rows)
    paint_line = _nid(220)
    eol_line = _nid(221)
    node(paint_line, "line", "2W Paint Line", {"site_id": site.id, "takt_s": 90, "synthetic_demo": True})
    node(eol_line, "line", "Roller Test / EOL", {"site_id": site.id, "takt_s": 110, "synthetic_demo": True})
    edge(HERO_AREA_PAINT, paint_line, "contains")
    edge(HERO_AREA_EOL, eol_line, "contains")
    for sid, label in ((_nid(222), "Paint Booth Inspection"), (_nid(223), "Brake & Lighting Check")):
        node(sid, "station", label, {"site_id": site.id, "synthetic_demo": True})
        edge(paint_line if "Paint" in label else eol_line, sid, "contains")

    for cell in cells:
        node(cell.id, "cell", cell.name, {"id": cell.id, "line_id": cell.line_id})
        parent_line = line1.id if cell.line_id == line1.id else line2.id
        edge(parent_line, cell.id, "contains")

    for asset in assets:
        props = {
            "id": asset.id,
            "cell_id": asset.cell_id,
            "asset_type": asset.asset_type,
            "criticality": asset.criticality,
            "health_index": asset.health_index,
            "state": asset.operating_state,
            "synthetic_demo": True,
        }
        if asset.id == asset_bearing_id:
            props["demo_scenario"] = "crankshaft_bearing_wear"
            props["archetype"] = "process"
        node(asset.id, "asset", asset.name, props)
        edge(asset.cell_id, asset.id, "contains")

    node(
        failure_mode.id,
        "failure_mode",
        failure_mode.name,
        {"id": failure_mode.id, "code": failure_mode.code, "horizon_hours": failure_mode.horizon_hours},
    )
    edge(asset_bearing_id, failure_mode.id, "has_failure_mode", confidence=1.0)

    for sid, key, eng_unit, label in HERO_SIGNAL_SPECS:
        node(
            sid,
            "signal",
            label,
            {"key": key, "unit": eng_unit, "asset_id": asset_bearing_id, "protocol": "OPC UA"},
        )
        edge(asset_bearing_id, sid, "measures", provenance={"source": "seed", "schema": "hero-dharuhera-v1"})

    node(product.id, "product", product.name, {"id": product.id, "revision": product.revision, "synthetic_demo": True})
    node(
        order.id,
        "order",
        order.external_id,
        {"id": order.id, "external_id": order.external_id, "status": order.status, "qty": order.qty},
    )
    node(lot.id, "lot", lot.code, {"id": lot.id, "code": lot.code})
    node(unit.id, "unit", unit.serial, {"id": unit.id, "serial": unit.serial, "status": unit.status})
    edge(n_site, product.id, "makes")
    edge(order.id, product.id, "for_product")
    edge(order.id, n_line2, "runs_on")
    edge(lot.id, order.id, "belongs_to")
    edge(unit.id, lot.id, "belongs_to")
    edge(unit.id, asset_bearing_id, "processed_at", confidence=0.95)

    for nid, kind, label, props in pending_nodes:
        _upsert_node(db, nid, tid, kind, label, props)
    db.flush()
    for eid, src, dst, kw in pending_edges:
        rel = kw.pop("rel_type")
        _upsert_edge(db, eid, tid, src, dst, rel, **kw)
    db.flush()

    for e in db.query(models.EntityEdge).filter(models.EntityEdge.tenant_id == tid).all():
        if e.id not in wanted_edges:
            db.delete(e)
    db.flush()
    for n in db.query(models.EntityNode).filter(models.EntityNode.tenant_id == tid).all():
        if n.id not in wanted_nodes:
            db.delete(n)
    db.flush()

    return {"nodes": len(wanted_nodes), "edges": len(wanted_edges)}


# Lam Research (separate tenant) — graph ID namespace avoids Midwest/Hero collisions.
LAM_META = _nid(301)
LAM_ENTERPRISE = _nid(302)
LAM_AREA_CHF = _nid(310)
LAM_AREA_RFC = _nid(311)
LAM_AREA_ASM = _nid(312)
LAM_AREA_TST = _nid(313)
LAM_SIGNAL_SPECS = [
    (_nid(350), "helium_leak_rate_sccm", "sccm", "Helium leak rate (gas box seal)"),
    (_nid(351), "chamber_pressure_mTorr", "mTorr", "Chamber pressure during seal check"),
    (_nid(352), "seal_void_score", "score", "Vision seal void model score"),
    (_nid(353), "flange_torque_nm", "N·m", "Gas box flange torque"),
    (_nid(354), "rf_power_w", "W", "RF dry-run power (downstream test)"),
]


def seed_lam_context_graph(
    db: Session,
    *,
    tenant: models.Tenant,
    site: models.Site,
    lines: list[models.Line],
    cells: list[models.Cell],
    assets: list[models.Asset],
    product: models.Product,
    order: models.ProductionOrder,
    lot: models.Lot,
    unit: models.SerialUnit,
    failure_mode: models.FailureMode,
    asset_gas_seal_id: str,
) -> dict[str, int]:
    """Upsert Lam Fremont ISA-95 graph under its own tenant_id (orphan-safe)."""
    tid = tenant.id
    pending_nodes: list[tuple[str, str, str, dict]] = []
    pending_edges: list[tuple[str, str, str, dict]] = []
    wanted_nodes: set[str] = set()
    wanted_edges: set[str] = set()

    def node(nid: str, kind: str, label: str, props: dict | None = None) -> str:
        pending_nodes.append((nid, kind, label, props or {}))
        wanted_nodes.add(nid)
        return nid

    def edge(src: str, dst: str, rel: str, **kw: Any) -> None:
        eid = _eid(src, dst, rel)
        provenance = dict(kw.get("provenance") or {"source": "seed", "schema": "lam-fremont-v1"})
        if rel == "contains" and "link" not in provenance:
            dst_kind = next((k for nid, k, _l, _p in pending_nodes if nid == dst), None)
            subs = {
                "line": next(
                    (p.get("code") or _l for nid, _k, _l, p in pending_nodes if nid == src),
                    "line",
                ),
                "cell": next((_l for nid, _k, _l, _p in pending_nodes if nid == dst), "cell"),
                "station": next((_l for nid, _k, _l, _p in pending_nodes if nid == dst), "station"),
                "asset": next((_l for nid, _k, _l, _p in pending_nodes if nid == dst), "asset"),
            }
            if dst_kind:
                provenance["link"] = link_profile_for_kind(
                    dst_kind, legacy=False, **{k: str(v) for k, v in subs.items()}
                )
            kw["provenance"] = provenance
        elif rel == "measures" and "link" not in provenance:
            sig_props = next((p for nid, _k, _l, p in pending_nodes if nid == dst), {}) or {}
            key = sig_props.get("key") or "Signal"
            provenance["link"] = {
                "protocol": sig_props.get("protocol") or "OPC UA",
                "transport": "opc.tcp",
                "direction": "publish",
                "topic": f"ns=2;s=GasBox.{str(key).replace('_', '.').title().replace(' ', '')}",
                "endpoint": "opc.tcp://lam-fco-opcua/UA/FactoryOps",
                "connector_kind": "opc_ua",
            }
            kw["provenance"] = provenance
        pending_edges.append((eid, src, dst, {"rel_type": rel, **kw}))
        wanted_edges.add(eid)

    node(
        LAM_META,
        "context_model",
        "Lam Fremont Chamber Ops context model",
        {
            "schema_id": "schema-lam-fremont",
            "version": "1.0",
            "status": "published",
            "source": "synthetic FactoryOps demo — not proprietary Lam data",
            "levels": CONTEXT_GRAPH_LEVELS,
            "object_bindings": CONTEXT_GRAPH_BINDINGS,
            "synthetic_demo": True,
            "segment": "semiconductor_cap_equipment",
        },
    )
    node(
        LAM_ENTERPRISE,
        "enterprise",
        tenant.name,
        {
            "id": tenant.id,
            "isa95": "Level 4",
            "synthetic_demo": True,
            "oem": "semiconductor_equipment",
            "customer": "Leading Foundry · Fab 18 / Logic",
        },
    )
    edge(LAM_META, LAM_ENTERPRISE, "describes", provenance={"source": "seed", "schema": "lam-fremont-v1"})

    n_site = node(
        site.id,
        "site",
        site.name,
        {
            "id": site.id,
            "code": site.code,
            "timezone": site.timezone,
            "region": "US-CA",
            "footprint": "Fremont, CA (synthetic demo)",
            "shift": "Shift A (06:00-14:30)",
            "synthetic_demo": True,
        },
    )
    edge(LAM_ENTERPRISE, n_site, "contains")

    area_line_map = [
        (LAM_AREA_CHF, "Chamber Fabrication", "CHF", lines[0].id),
        (LAM_AREA_RFC, "RF & Controls", "RFC", lines[1].id),
        (LAM_AREA_ASM, "Module Assembly", "ASM", lines[2].id),
        (LAM_AREA_TST, "Final Test & Ship", "TST", lines[3].id),
    ]
    for area_id, area_name, code, line_id in area_line_map:
        node(area_id, "area", area_name, {"code": code, "site_id": site.id, "synthetic_demo": True})
        edge(n_site, area_id, "contains")
        n_line = node(
            line_id,
            "line",
            next(ln.name for ln in lines if ln.id == line_id),
            {"id": line_id, "takt_s": next(ln.takt_s for ln in lines if ln.id == line_id), "code": code},
        )
        edge(area_id, n_line, "contains")

    line_by_id = {ln.id: ln for ln in lines}
    for cell in cells:
        node(cell.id, "cell", cell.name, {"id": cell.id, "line_id": cell.line_id})
        edge(cell.line_id, cell.id, "contains")

    for asset in assets:
        props = {
            "id": asset.id,
            "cell_id": asset.cell_id,
            "asset_type": asset.asset_type,
            "criticality": asset.criticality,
            "health_index": asset.health_index,
            "state": asset.operating_state,
            "synthetic_demo": True,
            "protocols": ["OPC UA", "GigE Vision"] if asset.asset_type == "vision" else ["OPC UA"],
        }
        if asset.id == asset_gas_seal_id:
            props["demo_scenario"] = "gas_box_seal_void"
            props["archetype"] = "leak"
            props["o_ring_lot"] = "L-LR-441"
        node(asset.id, "asset", asset.name, props)
        edge(asset.cell_id, asset.id, "contains")

    node(
        failure_mode.id,
        "failure_mode",
        failure_mode.name,
        {"id": failure_mode.id, "code": failure_mode.code, "horizon_hours": failure_mode.horizon_hours},
    )
    edge(asset_gas_seal_id, failure_mode.id, "has_failure_mode", confidence=1.0)

    for sid, key, eng_unit, label in LAM_SIGNAL_SPECS:
        node(
            sid,
            "signal",
            label,
            {
                "key": key,
                "unit": eng_unit,
                "asset_id": asset_gas_seal_id,
                "protocol": "OPC UA" if key != "seal_void_score" else "GigE Vision",
            },
        )
        edge(asset_gas_seal_id, sid, "measures", provenance={"source": "seed", "schema": "lam-fremont-v1"})

    node(
        product.id,
        "product",
        product.name,
        {"id": product.id, "revision": product.revision, "variant": "Sense.i Etch Gen3", "synthetic_demo": True},
    )
    node(
        order.id,
        "order",
        order.external_id,
        {
            "id": order.id,
            "external_id": order.external_id,
            "status": order.status,
            "qty": order.qty,
            "customer_po": "FAB-PO-920008",
            "customer": "Leading Foundry Fab 18",
        },
    )
    node(lot.id, "lot", lot.code, {"id": lot.id, "code": lot.code})
    node(
        unit.id,
        "unit",
        unit.serial,
        {
            "id": unit.id,
            "serial": unit.serial,
            "status": unit.status,
            "chamber_serial": "CHM-LR-80880",
            "fab_tool_bay": "Bay-24",
        },
    )
    edge(n_site, product.id, "makes")
    edge(order.id, product.id, "for_product")
    edge(order.id, lines[2].id, "runs_on")
    edge(lot.id, order.id, "belongs_to")
    edge(unit.id, lot.id, "belongs_to")
    edge(unit.id, asset_gas_seal_id, "processed_at", confidence=0.96)

    for nid, kind, label, props in pending_nodes:
        _upsert_node(db, nid, tid, kind, label, props)
    db.flush()
    for eid, src, dst, kw in pending_edges:
        rel = kw.pop("rel_type")
        _upsert_edge(db, eid, tid, src, dst, rel, **kw)
    db.flush()

    for e in db.query(models.EntityEdge).filter(models.EntityEdge.tenant_id == tid).all():
        if e.id not in wanted_edges:
            db.delete(e)
    db.flush()
    for n in db.query(models.EntityNode).filter(models.EntityNode.tenant_id == tid).all():
        if n.id not in wanted_nodes:
            db.delete(n)
    db.flush()

    return {"nodes": len(wanted_nodes), "edges": len(wanted_edges)}


def published_bindings() -> list[dict[str, Any]]:
    """Compact bindings for /api/v1/graph (UI-facing)."""
    return [
        {
            "id": b["id"],
            "object_type": b["object_type"],
            "label": b["label"],
            "report_at": b["report_at"],
            "rollup_to": b.get("rollup_to", []),
            "lenses": b.get("lenses", []),
            "protocol": b.get("protocol"),
            "transport": b.get("transport"),
            "direction": b.get("direction"),
            "topic": b.get("topic"),
            "endpoint": b.get("endpoint"),
            "enabled": b.get("enabled", True),
            "description": b.get("description"),
        }
        for b in CONTEXT_GRAPH_BINDINGS
    ]


def published_levels() -> list[dict[str, Any]]:
    return list(CONTEXT_GRAPH_LEVELS)


# Flow-tree backplane: plant → area → line → station → device.
# Maps domain graph kinds onto the Engineer-facing spine (cell≈station, asset≈device).
KIND_TO_BACKPLANE_LEVEL: dict[str, str] = {
    "site": "plant",
    "area": "area",
    "line": "line",
    "cell": "station",
    "station": "station",
    "asset": "device",
}

BACKPLANE_LEVEL_KINDS: dict[str, list[str]] = {
    "plant": ["site"],
    "area": ["area"],
    "line": ["line"],
    "station": ["cell", "station"],
    "device": ["asset"],
}

# Domain kind aliases used in object_bindings report_at / rollup_to.
BINDING_KIND_TO_LEVEL: dict[str, str] = {
    "enterprise": "plant",
    "site": "plant",
    "facility": "plant",
    "area": "area",
    "line": "line",
    "cell": "station",
    "station": "station",
    "asset": "device",
    "device": "device",
    "unit": "device",
    "lot": "line",
    "order": "line",
    "product": "plant",
}


def published_backplane() -> dict[str, Any]:
    """Default backplane schema seeded for the flow-tree canvas form."""
    dataplanes = [
        {
            "id": "dp-entities",
            "object_type": "entities",
            "label": "Context entities",
            "attach_at": "plant",
            "rollup_to": ["area", "line", "station", "device"],
            "enabled": True,
            "description": "ISA-95 entity nodes on the published context graph.",
            "source_binding": None,
        }
    ]
    for b in CONTEXT_GRAPH_BINDINGS:
        attach = BINDING_KIND_TO_LEVEL.get(b["report_at"], b["report_at"])
        rollup = [BINDING_KIND_TO_LEVEL.get(x, x) for x in b.get("rollup_to", [])]
        # Keep only rollups that sit on the flow spine.
        rollup = [x for x in rollup if x in BACKPLANE_LEVEL_KINDS]
        if attach not in BACKPLANE_LEVEL_KINDS:
            # unit/lot genealogy still surfaces via rollup onto device/line.
            attach = rollup[0] if rollup else "device"
        dataplanes.append(
            {
                "id": b["id"],
                "object_type": b["object_type"],
                "label": b["label"],
                "attach_at": attach,
                "rollup_to": rollup,
                "enabled": b.get("enabled", True),
                "description": b.get("description"),
                "protocol": b.get("protocol"),
                "transport": b.get("transport"),
                "direction": b.get("direction"),
                "topic": b.get("topic"),
                "endpoint": b.get("endpoint"),
                "source_binding": b["id"],
                "lenses": b.get("lenses", []),
            }
        )
    return {
        "id": "backplane-isa95-flow-v1",
        "name": "ISA-95 flow tree",
        "version": "1.0",
        "direction": "ltr",
        "default_site": "midwest",
        "levels": [
            {
                "id": "plant",
                "label": "Plant",
                "kinds": list(BACKPLANE_LEVEL_KINDS["plant"]),
                "isa95": "Level 3–4",
                "required": True,
                "enabled": True,
                "order": 0,
            },
            {
                "id": "area",
                "label": "Area",
                "kinds": list(BACKPLANE_LEVEL_KINDS["area"]),
                "isa95": "Level 3",
                "required": True,
                "enabled": True,
                "order": 1,
            },
            {
                "id": "line",
                "label": "Line",
                "kinds": list(BACKPLANE_LEVEL_KINDS["line"]),
                "isa95": "Level 3",
                "required": True,
                "enabled": True,
                "order": 2,
            },
            {
                "id": "station",
                "label": "Station",
                "kinds": list(BACKPLANE_LEVEL_KINDS["station"]),
                "isa95": "Level 2",
                "required": True,
                "enabled": True,
                "order": 3,
            },
            {
                "id": "device",
                "label": "Device",
                "kinds": list(BACKPLANE_LEVEL_KINDS["device"]),
                "isa95": "Level 1–2",
                "required": False,
                "enabled": True,
                "order": 4,
            },
        ],
        "dataplanes": dataplanes,
    }


def build_flow_forest(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    *,
    backplane: dict[str, Any] | None = None,
    site_id: str | None = None,
) -> dict[str, Any]:
    """Build hierarchical flow forest (plant→…→device) from contains edges.

    Non-spine neighbors (signals, failure modes, genealogy) become dataplane
    attachments on the nearest spine node — they do not form layout columns.
    """
    bp = backplane or published_backplane()
    enabled_levels = [lvl for lvl in bp["levels"] if lvl.get("enabled", True)]
    enabled_levels = sorted(enabled_levels, key=lambda x: x.get("order", 0))
    level_ids = [lvl["id"] for lvl in enabled_levels]
    kind_to_level = dict(KIND_TO_BACKPLANE_LEVEL)
    for lvl in enabled_levels:
        for k in lvl.get("kinds") or []:
            kind_to_level[k] = lvl["id"]

    by_id = {n["id"]: n for n in nodes}
    contains_children: dict[str, list[str]] = {}
    contains_parent: dict[str, str] = {}
    contains_edge: dict[str, dict[str, Any]] = {}  # dst_id → edge payload
    related: dict[str, list[dict[str, Any]]] = {n["id"]: [] for n in nodes}

    for e in edges:
        src, dst = e.get("src_id"), e.get("dst_id")
        if src not in by_id or dst not in by_id:
            continue
        rel = e.get("rel_type") or ""
        if rel == "contains":
            contains_children.setdefault(src, []).append(dst)
            contains_parent[dst] = src
            contains_edge[dst] = e
        else:
            related.setdefault(src, []).append(
                {
                    "edge_id": e.get("id"),
                    "rel_type": rel,
                    "direction": "out",
                    "node_id": dst,
                    "kind": by_id[dst]["kind"],
                    "label": by_id[dst]["label"],
                    "props": by_id[dst].get("props") or {},
                    "confidence": e.get("confidence"),
                    "link": edge_link_from_provenance(e.get("provenance") or {}),
                }
            )
            related.setdefault(dst, []).append(
                {
                    "edge_id": e.get("id"),
                    "rel_type": rel,
                    "direction": "in",
                    "node_id": src,
                    "kind": by_id[src]["kind"],
                    "label": by_id[src]["label"],
                    "props": by_id[src].get("props") or {},
                    "confidence": e.get("confidence"),
                    "link": edge_link_from_provenance(e.get("provenance") or {}),
                }
            )

    # Ancestor site resolution for filtering.
    site_of: dict[str, str | None] = {}

    def resolve_site(nid: str, seen: set[str] | None = None) -> str | None:
        if nid in site_of:
            return site_of[nid]
        seen = seen or set()
        if nid in seen:
            return None
        seen.add(nid)
        node = by_id.get(nid)
        if not node:
            site_of[nid] = None
            return None
        if node["kind"] == "site":
            site_of[nid] = nid
            return nid
        props = node.get("props") or {}
        if props.get("site_id"):
            site_of[nid] = props["site_id"]
            return props["site_id"]
        parent = contains_parent.get(nid)
        if parent:
            sid = resolve_site(parent, seen)
            site_of[nid] = sid
            return sid
        site_of[nid] = None
        return None

    for nid in by_id:
        resolve_site(nid)

    dataplanes = [d for d in bp.get("dataplanes", []) if d.get("enabled", True)]

    def slots_for_level(level_id: str) -> list[dict[str, Any]]:
        out = []
        for d in dataplanes:
            home = d.get("attach_at") == level_id
            rolled = level_id in (d.get("rollup_to") or [])
            if home or rolled:
                out.append(
                    {
                        "id": d["id"],
                        "object_type": d["object_type"],
                        "label": d["label"],
                        "mode": "home" if home else "rollup",
                        "protocol": d.get("protocol"),
                        "transport": d.get("transport"),
                        "direction": d.get("direction"),
                        "topic": d.get("topic"),
                        "endpoint": d.get("endpoint"),
                    }
                )
        return out

    def attachments_for(nid: str) -> list[dict[str, Any]]:
        """Group non-spine related nodes into dataplane-ish attachments."""
        groups: dict[str, list[dict[str, Any]]] = {}
        for r in related.get(nid, []):
            if r["direction"] != "out":
                continue
            kind = r["kind"]
            if kind in kind_to_level:
                continue  # spine child handled via tree
            key = {
                "signal": "timeseries",
                "failure_mode": "failure_mode",
                "unit": "genealogy",
                "lot": "genealogy",
                "order": "order",
                "product": "entities",
                "anomaly": "defect",
                "quality_event": "quality_event",
            }.get(kind, kind)
            groups.setdefault(key, []).append(
                {
                    "id": r["node_id"],
                    "kind": kind,
                    "label": r["label"],
                    "rel_type": r["rel_type"],
                    "props": r["props"],
                    "link": r.get("link"),
                }
            )
        return [
            {"object_type": ot, "items": items, "count": len(items)}
            for ot, items in sorted(groups.items())
        ]

    def make_node(nid: str, stack: set[str] | None = None) -> dict[str, Any] | None:
        raw = by_id.get(nid)
        if not raw:
            return None
        stack = set(stack or ())
        if nid in stack:
            return None
        stack.add(nid)
        level_id = kind_to_level.get(raw["kind"])
        if not level_id or level_id not in level_ids:
            return None
        if site_id and site_of.get(nid) not in (None, site_id) and raw["kind"] != "site":
            return None
        if site_id and raw["kind"] == "site" and nid != site_id:
            return None

        # Children: follow contains, but skip disabled / out-of-spine levels by
        # collapsing through (e.g. if area disabled, lines hang under plant).
        child_ids = contains_children.get(nid, [])
        children: list[dict[str, Any]] = []
        for cid in child_ids:
            child_raw = by_id.get(cid)
            if not child_raw:
                continue
            child_level = kind_to_level.get(child_raw["kind"])
            if child_level and child_level in level_ids:
                built = make_node(cid, stack)
                if built:
                    children.append(built)
            else:
                # Collapse through non-enabled spine kinds.
                for gc in contains_children.get(cid, []):
                    built = make_node(gc, stack)
                    if built:
                        children.append(built)

        children.sort(key=lambda c: (c.get("label") or "").lower())
        atts = attachments_for(nid)
        props = raw.get("props") or {}
        edge_meta = contains_edge.get(nid) or {}
        link = edge_link_from_provenance(edge_meta.get("provenance") or {})
        if not link:
            # Deterministic fallback from kind when seed edges lack provenance (synth / tests).
            link = {
                **link_profile_for_kind(
                    raw["kind"],
                    legacy=bool(props.get("legacy") or props.get("legacy_site")),
                    line=str(props.get("line_id") or ""),
                    cell=str(raw.get("label") or ""),
                    station=str(raw.get("label") or ""),
                    asset=str(raw.get("label") or ""),
                ),
                "provenance_source": "derived",
            } if contains_parent.get(nid) else None
        return {
            "id": nid,
            "kind": raw["kind"],
            "level": level_id,
            "label": raw["label"],
            "props": props,
            "site_id": site_of.get(nid),
            "binding_slots": slots_for_level(level_id),
            "attachments": atts,
            "attachment_count": sum(a["count"] for a in atts),
            "link": link,
            "children": children,
        }

    plant_ids = [n["id"] for n in nodes if n["kind"] == "site"]
    if site_id:
        plant_ids = [site_id] if site_id in by_id else []
    roots = []
    for pid in plant_ids:
        built = make_node(pid)
        if built:
            roots.append(built)
    roots.sort(key=lambda r: (r.get("label") or "").lower())

    def walk_stats(node: dict[str, Any], acc: dict[str, Any] | None = None) -> dict[str, Any]:
        if acc is None:
            acc = {"nodes": 0, "by_level": {}, "attachments": 0}
        acc["nodes"] += 1
        acc["by_level"][node["level"]] = acc["by_level"].get(node["level"], 0) + 1
        acc["attachments"] += node.get("attachment_count") or 0
        for ch in node.get("children") or []:
            walk_stats(ch, acc)
        return acc

    stats = {"nodes": 0, "by_level": {}, "attachments": 0, "roots": len(roots)}
    for r in roots:
        walk_stats(r, stats)

    sites = [
        {
            "id": n["id"],
            "label": n["label"],
            "code": (n.get("props") or {}).get("code"),
            "legacy": bool((n.get("props") or {}).get("legacy_site") or (n.get("props") or {}).get("tier")),
        }
        for n in nodes
        if n["kind"] == "site"
    ]
    return {
        "backplane_id": bp.get("id"),
        "levels": level_ids,
        "roots": roots,
        "stats": stats,
        "sites": sites,
    }
