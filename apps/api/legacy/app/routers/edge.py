"""Edge fleet: nodes, Mission Readiness, Node Passports, connectors, Edge+ recipe flash."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..edge_recipe import materialize_edge_node, materialize_recipe
from ..store import (
    DB,
    get_edge_live_series,
    ingest_edge_envelopes,
    new_id,
    now,
    resolve_edge_binding_for_device,
)

router = APIRouter(prefix="/api/edge", tags=["edge"])


# ---------------------------------------------------------------------------
# Existing fleet APIs
# ---------------------------------------------------------------------------


def _enrich_node(n: dict) -> dict:
    """Attach Edge+ recipe summary when present."""
    stored = DB.get("edge_recipes", {}).get(n["id"])
    out = dict(n)
    if stored:
        out["recipe_id"] = stored.get("recipe_id") or out.get("recipe_id")
        out["recipe_version"] = stored.get("recipe_version") or out.get("recipe_version")
        out["edgeplus_ready"] = True
        st = stored.get("station") or {}
        out.setdefault("station_id", st.get("station_id") or out.get("station_id"))
        out.setdefault("facility_id", st.get("facility_id"))
        out.setdefault("area_id", st.get("area_id"))
        out.setdefault("line_id", st.get("line_id"))
        meta = stored.get("metadata") or {}
        if meta.get("last_usb_flash"):
            out.setdefault("last_usb_flash", meta["last_usb_flash"])
    return out


@router.get("/nodes")
def nodes():
    return [_enrich_node(n) for n in DB["edge_nodes"].values()]


class CreateEdgeNodeBody(BaseModel):
    """Govern → Entity Manager: create Edge+ node from context-graph device def."""

    station_id: str
    device_id: str | None = None
    node_id: str | None = None
    name: str | None = None
    protocols: list[str] = Field(
        default_factory=lambda: ["mqtt", "opcua", "vision", "livis_edge", "mes", "sap"]
    )
    gpu: str | None = "NVIDIA A2"
    actor: str = "entity-manager"


@router.post("/nodes")
def create_node(body: CreateEdgeNodeBody):
    """Materialize an Edge node + Edge+ recipe from active context graph devices."""
    try:
        result = materialize_edge_node(
            station_id=body.station_id,
            device_id=body.device_id,
            node_id=body.node_id,
            name=body.name,
            protocols=body.protocols,
            gpu=body.gpu,
            actor=body.actor,
        )
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    return {
        "ok": True,
        "node": result["node"],
        "recipe": {
            "recipe_id": result["recipe"].get("recipe_id"),
            "recipe_version": result["recipe"].get("recipe_version"),
            "schema_version": result["recipe"].get("schema_version"),
            "station": result["recipe"].get("station"),
            "device_count": len(result["recipe"].get("devices") or []),
            "protocols": sorted(
                {d["protocol"] for d in (result["recipe"].get("devices") or [])}
            ),
            "metadata": result["recipe"].get("metadata"),
        },
        "audit_id": result["audit_id"],
    }


@router.get("/context-options")
def context_options():
    """Facility→Area→Line→Station→Device tree for New Edge Node UI."""
    site = next(iter(DB["sites"].values()), None)
    schema = DB.get("context_graphs", {}).get(DB.get("active_context_graph_id")) or DB.get(
        "graph_schema"
    )
    areas_out = []
    for area in DB["areas"].values():
        lines_out = []
        for line in DB["lines"].values():
            if line["area_id"] != area["id"]:
                continue
            stations_out = []
            for st in sorted(
                [s for s in DB["stations"].values() if s["line_id"] == line["id"]],
                key=lambda s: s.get("position", 0),
            ):
                devices = [
                    {
                        "id": d["id"],
                        "name": d.get("name"),
                        "kind": d.get("kind"),
                        "protocol": d.get("protocol"),
                        "tag_count": len(d.get("tags") or []),
                    }
                    for d in DB["devices"].values()
                    if d.get("station_id") == st["id"]
                ]
                stations_out.append(
                    {
                        "id": st["id"],
                        "name": st.get("name"),
                        "archetype": st.get("archetype"),
                        "state": st.get("state"),
                        "devices": devices,
                    }
                )
            lines_out.append(
                {"id": line["id"], "name": line.get("name"), "stations": stations_out}
            )
        areas_out.append(
            {"id": area["id"], "name": area.get("name"), "code": area.get("code"), "lines": lines_out}
        )
    return {
        "site": {"id": site["id"], "name": site.get("name"), "code": site.get("code")} if site else None,
        "areas": areas_out,
        "context_graph": {
            "id": (schema or {}).get("id"),
            "name": (schema or {}).get("name"),
            "status": (schema or {}).get("status"),
            "levels": (schema or {}).get("levels") or [],
        }
        if schema
        else None,
        "protocols": ["mqtt", "opcua", "vision", "livis_edge", "mes", "sap"],
    }


@router.post("/preview-recipe")
def preview_recipe(body: CreateEdgeNodeBody):
    """Dry-run: show the Edge+ recipe that would be materialized."""
    try:
        node_id = body.node_id or f"edge-preview-{body.station_id}"
        recipe = materialize_recipe(
            node_id=node_id,
            station_id=body.station_id,
            device_id=body.device_id,
            protocols=body.protocols,
            name=body.name,
        )
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    return {
        "recipe_id": recipe.get("recipe_id"),
        "recipe_version": recipe.get("recipe_version"),
        "schema_version": recipe.get("schema_version"),
        "station": recipe.get("station"),
        "devices": [
            {
                "id": d["id"],
                "name": d["name"],
                "device_type": d["device_type"],
                "protocol": d["protocol"],
                "tag_count": len(d.get("tags") or []),
                "placeholder": bool((d.get("metadata") or {}).get("placeholder")),
            }
            for d in recipe.get("devices") or []
        ],
        "uplink": recipe.get("uplink"),
        "metadata": recipe.get("metadata"),
    }


@router.get("/nodes/{node_id}")
def node_detail(node_id: str):
    n = DB["edge_nodes"].get(node_id)
    if not n:
        raise HTTPException(404, "node not found")
    connectors = [c for c in DB["connectors"].values() if c["node_id"] == node_id]
    recipe_meta = None
    stored = DB.get("edge_recipes", {}).get(node_id)
    if stored:
        recipe_meta = {
            "recipe_id": stored.get("recipe_id"),
            "recipe_version": stored.get("recipe_version"),
            "schema_version": stored.get("schema_version"),
            "flashed_at": stored.get("flashed_at"),
            "station": stored.get("station"),
            "device_count": len(stored.get("devices") or []),
            "context_graph_id": (stored.get("metadata") or {}).get("context_graph_id"),
        }
    return {**_enrich_node(n), "connectors": connectors, "recipe": recipe_meta}


@router.post("/nodes/{node_id}/sync")
def force_sync(node_id: str):
    """Trigger store-and-forward replay; returns a causal recovery report."""
    n = DB["edge_nodes"].get(node_id)
    if not n:
        raise HTTPException(404, "node not found")
    queued = n["queue_depth"]
    n["queue_depth"] = 0
    if n["health"] == "Offline":
        n["health"] = "Degraded"
        n["last_seen"] = now()
        n["mission_readiness"]["score"] = 71
        n["mission_readiness"]["limiting_factors"] = ["Recovering: replay in progress"]
    report = {
        "node_id": node_id,
        "replayed": queued,
        "late": max(0, int(queued * 0.02)),
        "duplicates_dropped": max(0, int(queued * 0.005)),
        "rejected": 0,
        "manually_reconciled": 0,
        "completed_at": now(),
        "narrative": f"Replayed {queued} queued events in source-timestamp order. "
                     "All committed critical production/quality records verified complete.",
    }
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": "edge.sync", "actor": "sync-agent",
        "detail": f"Recovery replay on {n['name']}: {queued} events, 0 lost",
        "at": now(), "source": node_id,
    }
    return report


@router.get("/connectors")
def connectors():
    return list(DB["connectors"].values())


@router.post("/connectors/{connector_id}/autodiscover")
def autodiscover(connector_id: str):
    """Integration Autopilot: propose canonical semantic mappings."""
    c = DB["connectors"].get(connector_id)
    if not c:
        raise HTTPException(404, "connector not found")
    proposals = [
        {"source_tag": "DB100.DBW24", "canonical": "pune1/ga/trim1/st01/press/cycle_count",
         "unit": "count", "confidence": 0.97},
        {"source_tag": "DB100.DBW26", "canonical": "pune1/ga/trim1/st01/press/cycle_time",
         "unit": "s", "confidence": 0.95},
        {"source_tag": "M12.4", "canonical": "pune1/ga/trim1/st01/state/fault",
         "unit": "bool", "confidence": 0.92},
        {"source_tag": "DB102.DBD8", "canonical": "pune1/fa/fueling/st01/roller/pressure",
         "unit": "bar", "confidence": 0.89},
    ]
    return {"connector": c, "proposed_mappings": proposals,
            "time_quality": {"source": "PLC clock", "trust": 0.94,
                             "note": "NTP-synced; PTP recommended for sub-cycle correlation"}}


# ---------------------------------------------------------------------------
# Edge+ agent contract (thin stubs — see livis-edge-plus docs/MES_CONTRACT.md)
# ---------------------------------------------------------------------------


class RecipeBody(BaseModel):
    recipe: dict
    actor: str = "entity-manager"


class FlashAckBody(BaseModel):
    actor: str = "edgeplus"
    recipe_id: str | None = None
    recipe_version: str | None = None
    status: str = "applied"
    applied_at: str | None = None
    # Cloud-initiated flash may also push the full recipe
    recipe: dict | None = None


class HeartbeatBody(BaseModel):
    health: str = "Healthy"
    queue_depth: int = 0
    data_lag_s: float = 0.0
    storage_used_pct: float = 0.0
    clock: dict = Field(default_factory=lambda: {"source": "NTP", "trust": 0.95})
    mission_readiness: dict = Field(
        default_factory=lambda: {"score": 90, "limiting_factors": []}
    )
    version: str = "livis-edge-plus 0.1.0"
    recipe_id: str | None = None
    recipe_version: str | None = None
    sim_mode: bool | None = None
    samples_in: int | None = None
    samples_out: int | None = None
    dropped: int | None = None


class EventsBody(BaseModel):
    node_id: str | None = None
    count: int | None = None
    events: list[dict] = Field(default_factory=list)


def _ensure_node(node_id: str) -> dict:
    n = DB["edge_nodes"].get(node_id)
    if not n:
        raise HTTPException(404, "node not found")
    return n


def _seed_default_recipe(node_id: str) -> dict:
    """Minimal recipe so Edge+ can fetch without a prior POST."""
    return {
        "schema_version": "1.0",
        "recipe_id": f"recipe-{node_id}-default",
        "recipe_version": "1.0.0",
        "edge_node_id": node_id,
        "name": f"Default recipe for {node_id}",
        "description": "Auto-seeded stub from LIVIS MES Edge API",
        "signed_by": "livis-central-ca",
        "station": {
            "facility_id": "site-york1",
            "area_id": "area-fa",
            "line_id": "line-fueling-assembly-line",
            "station_id": "st-fueling-assembly-line-01",
        },
        "uplink": {
            "mes_http_events": "/api/edge/nodes/{node_id}/events",
            "mes_http_heartbeat": "/api/edge/nodes/{node_id}/heartbeat",
            "mes_http_recipe": "/api/edge/nodes/{node_id}/recipe",
            "batch_size": 25,
            "flush_interval_ms": 500,
            "max_queue": 5000,
        },
        "devices": [
            {
                "id": "dev-temp-stub",
                "name": "Stub temp sensor",
                "device_type": "temp_sensor",
                "protocol": "mqtt",
                "endpoint": {"host": "broker-york.ot.local", "topic": "stub/temp"},
                "tags": [
                    {
                        "id": "temp_c",
                        "name": "Temperature",
                        "canonical_path": "york1/fa/fueling/st01/env/temp_c",
                        "data_type": "float",
                        "unit": "°C",
                        "sample_rate_hz": 0.5,
                    }
                ],
            }
        ],
        "flashed_at": now(),
    }


@router.get("/nodes/{node_id}/recipe")
def get_recipe(
    node_id: str,
    meta_only: bool = Query(False, description="Return version metadata only"),
):
    """Edge+ flasher: pull current recipe (Entity Manager / Engineer flash target)."""
    _ensure_node(node_id)
    recipes = DB.setdefault("edge_recipes", {})
    recipe = recipes.get(node_id)
    if not recipe:
        # Lazy-seed a minimal recipe for demo nodes
        recipe = _seed_default_recipe(node_id)
        recipes[node_id] = recipe
    if meta_only:
        return {
            "node_id": node_id,
            "recipe_id": recipe.get("recipe_id"),
            "recipe_version": recipe.get("recipe_version"),
            "version": recipe.get("recipe_version"),
            "flashed_at": recipe.get("flashed_at"),
        }
    return {
        "node_id": node_id,
        "recipe_id": recipe.get("recipe_id"),
        "recipe_version": recipe.get("recipe_version"),
        "version": recipe.get("recipe_version"),
        "flashed_at": recipe.get("flashed_at"),
        "recipe": recipe,
    }


@router.post("/nodes/{node_id}/recipe")
def put_recipe(node_id: str, body: RecipeBody):
    """Govern / Entity Manager: define or replace the recipe for an Edge+ node."""
    n = _ensure_node(node_id)
    recipe = dict(body.recipe)
    recipe["edge_node_id"] = node_id
    recipe["flashed_at"] = now()
    if "recipe_version" not in recipe:
        recipe["recipe_version"] = new_id("ver")
    DB.setdefault("edge_recipes", {})[node_id] = recipe
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid,
        "kind": "config.push",
        "actor": body.actor,
        "detail": (
            f"Pushed recipe {recipe.get('recipe_id')} "
            f"v{recipe.get('recipe_version')} to {n['name']}"
        ),
        "at": now(),
        "source": "entity-manager",
    }
    return {
        "ok": True,
        "node_id": node_id,
        "recipe_id": recipe.get("recipe_id"),
        "recipe_version": recipe.get("recipe_version"),
    }


@router.post("/nodes/{node_id}/flash")
def flash_node(node_id: str, body: FlashAckBody):
    """
    Cloud-initiated flash OR Edge+ apply acknowledgement.

    - If `recipe` is present: store as current recipe (config.push).
    - Always writes an audit row (config.push / edge.flash.ack).
    """
    n = _ensure_node(node_id)
    recipes = DB.setdefault("edge_recipes", {})
    if body.recipe:
        recipe = dict(body.recipe)
        recipe["edge_node_id"] = node_id
        recipe["flashed_at"] = body.applied_at or now()
        recipes[node_id] = recipe
        kind = "config.push"
        detail = (
            f"Flashed recipe {recipe.get('recipe_id')} "
            f"v{recipe.get('recipe_version')} onto {n['name']}"
        )
        version = recipe.get("recipe_version")
    else:
        kind = "edge.flash.ack"
        detail = (
            f"Edge+ applied recipe {body.recipe_id} "
            f"v{body.recipe_version} status={body.status}"
        )
        version = body.recipe_version
        if node_id in recipes and body.recipe_version:
            recipes[node_id]["recipe_version"] = body.recipe_version
            recipes[node_id]["flashed_at"] = body.applied_at or now()

    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid,
        "kind": kind,
        "actor": body.actor,
        "detail": detail,
        "at": now(),
        "source": node_id,
    }
    n["last_seen"] = now()
    return {
        "ok": True,
        "node_id": node_id,
        "recipe_version": version,
        "status": body.status,
        "audit_id": aid,
    }


@router.post("/nodes/{node_id}/heartbeat")
def heartbeat(node_id: str, body: HeartbeatBody):
    """Edge+ Mission Readiness / health pulse."""
    n = _ensure_node(node_id)
    n["health"] = body.health
    n["queue_depth"] = body.queue_depth
    n["data_lag_s"] = body.data_lag_s
    n["storage_used_pct"] = body.storage_used_pct
    n["clock"] = body.clock
    n["mission_readiness"] = body.mission_readiness
    n["version"] = body.version
    n["last_seen"] = now()
    return {"ok": True, "node_id": node_id, "last_seen": n["last_seen"]}


@router.post("/nodes/{node_id}/events")
def ingest_events(node_id: str, body: EventsBody):
    """Batch ingest of LiveEnvelope telemetry from Edge+ uplink."""
    n = _ensure_node(node_id)
    events = body.events or []
    ring = DB.setdefault("edge_telemetry", [])
    ring.append(
        {
            "node_id": node_id,
            "at": now(),
            "count": len(events),
            "events": events[:50],  # keep payload bounded in demo store
        }
    )
    # Cap ring buffer
    if len(ring) > 200:
        del ring[:-200]
    # Index samples into per-tag rolling buffers for Twin live charts
    accepted = ingest_edge_envelopes(node_id, events)
    n["last_seen"] = now()
    n["queue_depth"] = max(0, int(n.get("queue_depth", 0)) - len(events))
    return {
        "ok": True,
        "accepted": len(events),
        "indexed": accepted,
        "node_id": node_id,
    }


def _series_values(samples: list[dict]) -> list[float]:
    return [float(s["v"]) for s in samples if s.get("v") is not None]


@router.get("/nodes/{node_id}/live")
def node_live(
    node_id: str,
    tag: str | None = Query(None, description="canonical_path, source_address, or tag_id"),
    device_id: str | None = Query(None),
    limit: int = Query(60, ge=2, le=240),
):
    """Rolling Edge+ live samples for a node (optionally filtered to one tag)."""
    _ensure_node(node_id)
    by_node = (DB.get("edge_live") or {}).get(node_id) or {}
    if tag:
        lookup = tag
        if device_id and "/" not in tag and tag not in by_node:
            combo = f"{device_id}/{tag}"
            if combo in by_node:
                lookup = combo
        samples = get_edge_live_series(node_id, lookup, maxlen=limit)
        last = samples[-1] if samples else None
        return {
            "node_id": node_id,
            "tag": tag,
            "device_id": device_id or (last or {}).get("device_id"),
            "canonical": (last or {}).get("canonical"),
            "source_address": (last or {}).get("source_address"),
            "unit": (last or {}).get("unit") or "",
            "count": len(samples),
            "values": _series_values(samples),
            "samples": samples,
            "source": "edge+",
            "as_of": (last or {}).get("t") or now(),
            "waiting": len(samples) == 0,
        }

    # Summary of all tags with recent samples
    tags_out = []
    seen: set[str] = set()
    for key, series in by_node.items():
        if not series:
            continue
        last = series[-1]
        # Prefer source_address / canonical as identity; skip alias duplicates
        identity = last.get("source_address") or last.get("canonical") or last.get("tag_id") or key
        if identity in seen:
            continue
        seen.add(identity)
        tags_out.append(
            {
                "key": identity,
                "tag_id": last.get("tag_id"),
                "canonical": last.get("canonical"),
                "source_address": last.get("source_address"),
                "device_id": last.get("device_id"),
                "unit": last.get("unit") or "",
                "value": last.get("v"),
                "count": len(series),
                "as_of": last.get("t"),
            }
        )
    return {
        "node_id": node_id,
        "tags": tags_out,
        "source": "edge+",
        "as_of": now(),
        "waiting": len(tags_out) == 0,
    }


@router.get("/nodes/{node_id}/live/{tag:path}")
def node_live_tag(node_id: str, tag: str, limit: int = Query(60, ge=2, le=240)):
    """Convenience path form of GET …/live?tag=…"""
    return node_live(node_id, tag=tag, limit=limit)


@router.get("/devices/{device_id}/live")
def device_live(
    device_id: str,
    tag: str | None = Query(
        None,
        description="OPC-UA / MES tag key (e.g. ns=2;s=MainFrameWeldCell.Current)",
    ),
    limit: int = Query(60, ge=2, le=240),
):
    """Factory Twin: resolve Edge+ node for a device and return live trend series."""
    device = DB["devices"].get(device_id)
    if not device:
        raise HTTPException(404, "device not found")

    binding = resolve_edge_binding_for_device(device_id)
    configured = list(device.get("tags") or [])
    focus_tag = None
    if tag:
        focus_tag = next((t for t in configured if t.get("key") == tag), None)
        if not focus_tag:
            focus_tag = {"key": tag, "name": tag.split(".")[-1] if "." in tag else tag, "unit": ""}
    elif configured:
        focus_tag = configured[0]

    if not binding:
        return {
            "device_id": device_id,
            "node_id": None,
            "bound": False,
            "waiting": True,
            "message": "No Edge+ node bound to this station/device",
            "tag": (focus_tag or {}).get("key"),
            "values": [],
            "source": None,
            "as_of": now(),
        }

    node_id = binding["node_id"]
    recipe_dev = binding.get("device") or {}
    recipe_tags = list(recipe_dev.get("tags") or [])

    # Map MES OPC-UA key → recipe tag via source_address
    lookup_keys: list[str] = []
    matched_recipe_tag = None
    if focus_tag:
        key = focus_tag.get("key")
        if key:
            lookup_keys.append(key)
        matched_recipe_tag = next(
            (rt for rt in recipe_tags if rt.get("source_address") == key),
            None,
        )
        if not matched_recipe_tag and key:
            # Match by trailing metric name (Current, WireSpeed, …)
            metric = (focus_tag.get("name") or key.split(".")[-1] or "").lower()
            matched_recipe_tag = next(
                (
                    rt
                    for rt in recipe_tags
                    if metric
                    and (
                        metric in (rt.get("name") or "").lower()
                        or metric in (rt.get("id") or "").lower()
                        or metric in (rt.get("canonical_path") or "").lower()
                    )
                ),
                None,
            )
        if matched_recipe_tag:
            for k in (
                matched_recipe_tag.get("source_address"),
                matched_recipe_tag.get("canonical_path"),
                matched_recipe_tag.get("id"),
                f"{recipe_dev.get('id')}/{matched_recipe_tag.get('id')}",
            ):
                if k and k not in lookup_keys:
                    lookup_keys.append(k)

    samples: list[dict] = []
    used_key = None
    for k in lookup_keys:
        samples = get_edge_live_series(node_id, k, maxlen=limit)
        if samples:
            used_key = k
            break

    # If no specific tag requested / matched, return first series on the recipe device
    if not samples and recipe_dev.get("id"):
        by_node = (DB.get("edge_live") or {}).get(node_id) or {}
        for rt in recipe_tags:
            for k in (
                rt.get("source_address"),
                rt.get("canonical_path"),
                rt.get("id"),
                f"{recipe_dev.get('id')}/{rt.get('id')}",
            ):
                if k and by_node.get(k):
                    samples = get_edge_live_series(node_id, k, maxlen=limit)
                    used_key = k
                    matched_recipe_tag = rt
                    break
            if samples:
                break

    last = samples[-1] if samples else None
    tag_key = (focus_tag or {}).get("key") or (last or {}).get("source_address")
    tag_name = (focus_tag or {}).get("name") or (matched_recipe_tag or {}).get("name")
    unit = (
        (focus_tag or {}).get("unit")
        or (matched_recipe_tag or {}).get("unit")
        or (last or {}).get("unit")
        or ""
    )

    return {
        "device_id": device_id,
        "node_id": node_id,
        "bound": True,
        "recipe_id": binding.get("recipe_id"),
        "recipe_version": binding.get("recipe_version"),
        "station_id": binding.get("station_id"),
        "tag": tag_key,
        "tag_name": tag_name,
        "canonical": (last or {}).get("canonical") or (matched_recipe_tag or {}).get("canonical_path"),
        "source_address": (last or {}).get("source_address")
        or (matched_recipe_tag or {}).get("source_address")
        or tag_key,
        "lookup_key": used_key,
        "unit": unit,
        "count": len(samples),
        "values": _series_values(samples),
        "samples": samples,
        "value": (last or {}).get("v"),
        "source": "edge+",
        "as_of": (last or {}).get("t") or now(),
        "waiting": len(samples) == 0,
        "message": (
            None
            if samples
            else "Waiting for Edge+ stream — run `python -m edgeplus run --sim` or wait for MES edge simulator"
        ),
    }


# ---------------------------------------------------------------------------
# USB flash (QualityOps → Edge+ offline / Web Serial commissioning)
# ---------------------------------------------------------------------------


class UsbFlashBundleBody(BaseModel):
    """Materialize an Edge+ flash bundle for station + data types / protocols."""

    station_id: str
    device_id: str | None = None
    node_id: str | None = None
    name: str | None = None
    data_types: list[str] = Field(default_factory=list)
    protocols: list[str] = Field(
        default_factory=lambda: ["mqtt", "opcua", "vision", "livis_edge", "mes", "sap"]
    )
    create_node: bool = True
    mes_url: str | None = None
    actor: str = "entity-manager"


class UsbFlashCompleteBody(BaseModel):
    actor: str = "qualityops-usb"
    recipe_id: str | None = None
    recipe_version: str | None = None
    status: str = "applied"
    applied_at: str | None = None
    channel: str = "sim"  # sim | web-serial | cli | mount
    detail: str | None = None


def _filter_recipe_by_data_types(recipe: dict, data_types: list[str] | None) -> dict:
    """Optionally keep only devices whose device_type / kind matches data_types."""
    if not data_types:
        return recipe
    wanted = {t.strip().lower() for t in data_types if t and str(t).strip()}
    if not wanted:
        return recipe
    devices = list(recipe.get("devices") or [])
    filtered = []
    for d in devices:
        dtype = str(d.get("device_type") or "").lower()
        kind = str((d.get("metadata") or {}).get("mes_kind") or "").lower()
        proto = str(d.get("protocol") or "").lower()
        name = str(d.get("name") or "").lower()
        if dtype in wanted or kind in wanted or proto in wanted:
            filtered.append(d)
            continue
        # also match tag data_type labels when operator picks float/bool/etc.
        tags = d.get("tags") or []
        if any(str(t.get("data_type") or "").lower() in wanted for t in tags):
            filtered.append(d)
            continue
        if any(w in name for w in wanted):
            filtered.append(d)
    out = dict(recipe)
    if filtered:
        out["devices"] = filtered
    # if filter emptied everything, keep originals (avoid invalid recipe)
    return out


def _synthetic_passport(node_id: str, recipe: dict) -> dict:
    st = recipe.get("station") or {}
    ts = now()
    return {
        "passport_version": "1.0",
        "node_id": node_id,
        "display_name": recipe.get("name") or node_id,
        "facility_id": st.get("facility_id"),
        "station_id": st.get("station_id"),
        "subject": f"CN={node_id}",
        "san_dns": [],
        "san_uri": [f"edge://{node_id}"],
        "certificate_pem_path": "",
        "private_key_pem_path": None,
        "ca_pem_path": None,
        "fingerprint_sha256": None,
        "serial_number": None,
        "issuer": "qualityops-usb-demo",
        "issued_at": ts,
        "not_before": ts,
        "not_after": ts,
        "key_usage": ["digitalSignature", "keyEncipherment"],
        "revocation": {},
        "ot_zone": "Zone 2 · Cell / Area",
        "outbound_only": True,
        "store_and_forward": True,
        "write_deny_to_agents": True,
        "metadata": {
            "synthetic": True,
            "source": "qualityops-usb",
            "note": "Demo passport — replace with signed Node Passport on real hardware",
        },
    }


@router.post("/usb-flash-bundle")
def usb_flash_bundle(body: UsbFlashBundleBody):
    """
    Build a USB flash bundle for an Edge+ device.

    Reuses context-graph materialization (same as New Edge Node). Optionally
    creates/updates the edge node + stored recipe so HTTPS flash stays in sync.
    """
    protocols = body.protocols or ["mqtt", "opcua", "vision", "livis_edge", "mes", "sap"]
    node_id = body.node_id
    created = False
    node = None

    try:
        if body.create_node:
            # Prefer existing node for this station when node_id omitted
            if not node_id:
                for n in DB["edge_nodes"].values():
                    if n.get("station_id") == body.station_id:
                        node_id = n["id"]
                        node = n
                        break
            if node_id and node_id in DB["edge_nodes"]:
                node = DB["edge_nodes"][node_id]
                recipe = materialize_recipe(
                    node_id=node_id,
                    station_id=body.station_id,
                    device_id=body.device_id,
                    protocols=protocols,
                    name=body.name or node.get("name"),
                )
                recipe = _filter_recipe_by_data_types(recipe, body.data_types)
                DB.setdefault("edge_recipes", {})[node_id] = recipe
                node["recipe_id"] = recipe.get("recipe_id")
                node["recipe_version"] = recipe.get("recipe_version")
            else:
                result = materialize_edge_node(
                    station_id=body.station_id,
                    device_id=body.device_id,
                    node_id=node_id,
                    name=body.name,
                    protocols=protocols,
                    actor=body.actor,
                )
                node = result["node"]
                node_id = node["id"]
                recipe = _filter_recipe_by_data_types(result["recipe"], body.data_types)
                DB.setdefault("edge_recipes", {})[node_id] = recipe
                created = True
        else:
            node_id = node_id or f"edge-{body.station_id.replace('st-', '', 1)}"
            recipe = materialize_recipe(
                node_id=node_id,
                station_id=body.station_id,
                device_id=body.device_id,
                protocols=protocols,
                name=body.name,
            )
            recipe = _filter_recipe_by_data_types(recipe, body.data_types)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(409, str(e)) from e

    assert node_id
    flashed_at = now()
    recipe["flashed_at"] = flashed_at
    recipe.setdefault("metadata", {})
    recipe["metadata"]["usb_source"] = "qualityops-usb"
    recipe["metadata"]["data_types"] = list(body.data_types or [])

    mes_url = (body.mes_url or "http://127.0.0.1:8000").rstrip("/")
    passport = _synthetic_passport(node_id, recipe)
    bundle = {
        "bundle_version": "1.0",
        "node_id": node_id,
        "recipe": recipe,
        "passport": passport,
        "mes_url": mes_url,
        "flashed_at": flashed_at,
        "source": "qualityops-usb",
        "data_types": list(body.data_types or []),
        "protocols": sorted({d.get("protocol") for d in (recipe.get("devices") or [])}),
    }

    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid,
        "kind": "edge.usb.bundle",
        "actor": body.actor,
        "detail": (
            f"USB flash bundle for {node_id} · "
            f"{recipe.get('recipe_id')} v{recipe.get('recipe_version')} · "
            f"{len(recipe.get('devices') or [])} devices"
        ),
        "at": flashed_at,
        "source": "qualityops-usb",
    }

    return {
        "ok": True,
        "created": created,
        "node_id": node_id,
        "node": _enrich_node(node) if node else None,
        "bundle": bundle,
        "summary": {
            "recipe_id": recipe.get("recipe_id"),
            "recipe_version": recipe.get("recipe_version"),
            "station": recipe.get("station"),
            "device_count": len(recipe.get("devices") or []),
            "protocols": bundle["protocols"],
            "data_types": bundle["data_types"],
        },
        "audit_id": aid,
    }


@router.post("/nodes/{node_id}/usb-flash-complete")
def usb_flash_complete(node_id: str, body: UsbFlashCompleteBody):
    """Record that a USB flash was applied (sim / Web Serial / CLI)."""
    n = _ensure_node(node_id)
    recipes = DB.setdefault("edge_recipes", {})
    applied_at = body.applied_at or now()
    version = body.recipe_version
    if node_id in recipes:
        if body.recipe_version:
            recipes[node_id]["recipe_version"] = body.recipe_version
        recipes[node_id]["flashed_at"] = applied_at
        recipes[node_id].setdefault("metadata", {})["last_usb_flash"] = {
            "at": applied_at,
            "channel": body.channel,
            "actor": body.actor,
            "status": body.status,
        }
        version = version or recipes[node_id].get("recipe_version")
        recipe_id = body.recipe_id or recipes[node_id].get("recipe_id")
    else:
        recipe_id = body.recipe_id

    n["last_seen"] = applied_at
    n["last_usb_flash"] = {
        "at": applied_at,
        "channel": body.channel,
        "status": body.status,
        "recipe_version": version,
    }
    if version:
        n["recipe_version"] = version

    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid,
        "kind": "edge.usb.flash",
        "actor": body.actor,
        "detail": body.detail
        or (
            f"USB flash {body.status} via {body.channel} on {n.get('name') or node_id} "
            f"({recipe_id} v{version})"
        ),
        "at": applied_at,
        "source": node_id,
    }
    return {
        "ok": True,
        "node_id": node_id,
        "recipe_id": recipe_id,
        "recipe_version": version,
        "status": body.status,
        "channel": body.channel,
        "audit_id": aid,
    }
