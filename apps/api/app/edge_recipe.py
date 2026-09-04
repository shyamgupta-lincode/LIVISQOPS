"""Materialize Edge+ recipes from MES context-graph / topology device definitions.

Aligns field names with livis-edge-plus ``edgeplus.recipe.schema.EdgeRecipe``.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from .store import DB, new_id, now

# MES device.kind → (Edge+ device_type, default protocol)
_KIND_MAP: dict[str, tuple[str, str]] = {
    "PLC": ("plc", "opcua"),
    "Camera": ("vision_system", "vision"),
    "Torque Tool": ("torque_gun", "opcua"),
    "Scanner": ("scanner", "mqtt"),
    "Pressure": ("pressure_sensor", "opcua"),
    "Temp": ("temp_sensor", "mqtt"),
    "CMM": ("cmm", "opcua"),
}

# MES protocol label → Edge+ ProtocolKind
_PROTOCOL_MAP: dict[str, str] = {
    "OPC UA": "opcua",
    "opcua": "opcua",
    "GigE Vision": "vision",
    "vision": "vision",
    "Open Protocol": "opcua",
    "MQTT Sparkplug B": "mqtt",
    "MQTT": "mqtt",
    "mqtt": "mqtt",
    "REST/ERP": "sap",
    "sap": "sap",
    "MES Context": "mes",
    "mes": "mes",
    "livis_edge": "livis_edge",
    "LIVIS Edge+": "livis_edge",
}

_EDGEPLUS_PROTOCOLS = ("mqtt", "opcua", "vision", "livis_edge", "mes", "sap")

_CAPABILITY_BY_PROTOCOL = {
    "mqtt": "MQTT Sparkplug B",
    "opcua": "OPC UA client",
    "vision": "GigE Vision",
    "livis_edge": "LIVIS Edge+ peer bus",
    "mes": "MES context client",
    "sap": "SAP / ERP goods movement",
}


def _slug(text: str, maxlen: int = 24) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return (s or "x")[:maxlen]


def _active_context_graph() -> dict | None:
    graphs = DB.get("context_graphs") or {}
    aid = DB.get("active_context_graph_id")
    if aid and aid in graphs:
        return graphs[aid]
    return DB.get("graph_schema")


def _site_code(site: dict) -> str:
    code = (site.get("code") or site.get("id") or "site").lower()
    # HD-YVO → york1-style short path when site id is site-york1
    sid = site.get("id") or ""
    if sid.startswith("site-"):
        return sid[5:]
    return _slug(code, 12)


def _dtype(mes: str | None) -> str:
    t = (mes or "float").lower()
    if t in ("bool", "boolean"):
        return "bool"
    if t in ("int", "integer"):
        return "int"
    if t in ("string", "str", "enumeration", "enum"):
        return "string"
    if t in ("json",):
        return "json"
    return "float"


def _canonical(
    site_code: str,
    area: dict,
    line: dict,
    station: dict,
    asset: str,
    metric: str,
) -> str:
    return "/".join(
        [
            site_code,
            _slug(area.get("code") or area.get("name") or "area", 8),
            _slug(line.get("name") or line.get("id") or "line", 16),
            _slug(station.get("name") or station.get("id") or "st", 12),
            _slug(asset, 12),
            _slug(metric, 24).replace("-", "_"),
        ]
    )


def _map_protocol(mes_protocol: str | None, fallback: str) -> str:
    if not mes_protocol:
        return fallback
    return _PROTOCOL_MAP.get(mes_protocol, _PROTOCOL_MAP.get(mes_protocol.lower(), fallback))


def _endpoint_for(device_type: str, protocol: str, station: dict, device: dict | None) -> dict:
    st_slug = _slug(station.get("name") or station["id"], 20)
    host_base = f"{st_slug}.ot.local"
    if protocol == "opcua":
        return {"url": f"opc.tcp://{device_type.replace('_', '-')}-{st_slug}:4840"}
    if protocol == "mqtt":
        return {
            "host": "broker-york.ot.local",
            "port": 1883,
            "topic": f"york1/{st_slug}/{device_type}/#",
        }
    if protocol == "vision":
        cam = (device or {}).get("name") or "cam-1"
        return {
            "url": f"http://{host_base}/api/v1/results",
            "path": f"gige://{_slug(cam, 16)}",
        }
    if protocol == "livis_edge":
        return {
            "host": "edge-peer.ot.local",
            "port": 7443,
            "node_id": "edge-peer",
            "url": "wss://edge-peer.ot.local:7443/bus",
        }
    if protocol == "mes":
        return {"url": "http://127.0.0.1:8000"}
    if protocol == "sap":
        return {"url": "https://sap-po.example.local/sap/opu/odata"}
    return {"host": host_base}


def _tags_from_device(
    device: dict,
    *,
    site_code: str,
    area: dict,
    line: dict,
    station: dict,
    asset: str,
) -> list[dict]:
    out: list[dict] = []
    for tag in device.get("tags") or []:
        key = tag.get("key") or tag.get("name") or new_id("tag")
        metric = tag.get("name") or key.split(".")[-1]
        tag_id = _slug(metric, 32).replace("-", "_")
        out.append(
            {
                "id": tag_id,
                "name": tag.get("name") or metric,
                "canonical_path": _canonical(
                    site_code, area, line, station, asset, metric
                ),
                "data_type": _dtype(tag.get("data_type")),
                "unit": tag.get("unit") or "",
                "sample_rate_hz": 1.0,
                "source_address": tag.get("key") or tag.get("source_tag"),
                "quality_default": "good",
            }
        )
    return out


def _device_spec_from_mes(
    device: dict,
    *,
    site_code: str,
    area: dict,
    line: dict,
    station: dict,
) -> dict:
    kind = device.get("kind") or "PLC"
    device_type, default_proto = _KIND_MAP.get(kind, ("generic_ethernet", "opcua"))
    # Heuristic: name/archetype hints
    name_l = (device.get("name") or "").lower()
    if "scan" in name_l or "barcode" in name_l:
        device_type, default_proto = "scanner", "mqtt"
    elif "press" in name_l:
        device_type, default_proto = "pressure_sensor", "opcua"
    elif "temp" in name_l:
        device_type, default_proto = "temp_sensor", "mqtt"
    elif "cmm" in name_l:
        device_type, default_proto = "cmm", "opcua"

    protocol = _map_protocol(device.get("protocol"), default_proto)
    asset = {
        "plc": "plc",
        "vision_system": "vision",
        "torque_gun": "torque",
        "scanner": "scanner",
        "pressure_sensor": "press",
        "temp_sensor": "temp",
        "cmm": "cmm",
        "generic_ethernet": "eth",
    }.get(device_type, "asset")

    tags = _tags_from_device(
        device,
        site_code=site_code,
        area=area,
        line=line,
        station=station,
        asset=asset,
    )
    # Ensure at least one tag so Edge+ schema validation passes for sparse devices
    if not tags:
        tags = [
            {
                "id": "heartbeat",
                "name": "Device heartbeat",
                "canonical_path": _canonical(
                    site_code, area, line, station, asset, "heartbeat"
                ),
                "data_type": "bool",
                "unit": "",
                "sample_rate_hz": 0.5,
                "quality_default": "good",
            }
        ]

    options: dict[str, Any] = {}
    if protocol == "opcua":
        options = {"security_mode": "None", "sampling_interval_ms": 200}
    elif protocol == "mqtt":
        options = {"qos": 1, "sparkplug": "Sparkplug" in (device.get("protocol") or "")}
    elif protocol == "vision":
        options = {"transport": "http_results", "gige_fallback": True}

    return {
        "id": device["id"],
        "name": device.get("name") or device["id"],
        "device_type": device_type,
        "protocol": protocol,
        "endpoint": _endpoint_for(device_type, protocol, station, device),
        "enabled": True,
        "options": options,
        "sim": {},
        "tags": tags,
        "metadata": {
            "mes_kind": kind,
            "mes_protocol": device.get("protocol"),
            "station_id": station["id"],
        },
    }


def _placeholder_device(
    protocol: str,
    *,
    site_code: str,
    area: dict,
    line: dict,
    station: dict,
    node_id: str,
) -> dict:
    """Edge+ adapter stub when context graph has no matching OT device."""
    specs = {
        "mqtt": ("dev-mqtt-stub", "MQTT collector stub", "scanner", "scanner"),
        "opcua": ("dev-opcua-stub", "OPC-UA collector stub", "plc", "plc"),
        "vision": ("dev-vision-stub", "Vision results stub", "vision_system", "vision"),
        "livis_edge": ("dev-edge-peer-stub", "Peer Edge+ stub", "edge_peer", "peer"),
        "mes": ("dev-mes-stub", "MES context client", "mes", "mes"),
        "sap": ("dev-sap-stub", "SAP goods movement stub", "sap", "sap"),
    }
    did, name, dtype, asset = specs[protocol]
    opts: dict[str, Any] = {}
    if protocol == "mes":
        opts = {"pull": ["orders", "vins"]}
    elif protocol == "sap":
        opts = {"mode": "idoc", "idoc_type": "WMMBID02", "secret_ref": "env:SAP_ODATA_TOKEN"}
    elif protocol == "livis_edge":
        opts = {"auth": "node_passport"}
    return {
        "id": f"{did}-{_slug(station['id'], 12)}",
        "name": name,
        "device_type": dtype,
        "protocol": protocol,
        "endpoint": _endpoint_for(dtype, protocol, station, None),
        "enabled": True,
        "options": opts,
        "sim": {},
        "tags": [
            {
                "id": "status",
                "name": f"{protocol} status",
                "canonical_path": _canonical(
                    site_code, area, line, station, asset, "status"
                ),
                "data_type": "string",
                "unit": "",
                "sample_rate_hz": 0.2,
                "quality_default": "good",
            }
        ],
        "metadata": {"placeholder": True, "for_protocol": protocol, "edge_node_id": node_id},
    }


def resolve_station_context(station_id: str) -> tuple[dict, dict, dict, dict, list[dict]]:
    station = DB["stations"].get(station_id)
    if not station:
        raise KeyError(f"station not found: {station_id}")
    line = DB["lines"].get(station["line_id"]) or {}
    area = DB["areas"].get(station["area_id"]) or {}
    site = DB["sites"].get(station.get("site_id") or line.get("site_id")) or next(
        iter(DB["sites"].values())
    )
    devices = [d for d in DB["devices"].values() if d.get("station_id") == station_id]
    return site, area, line, station, devices


def materialize_recipe(
    *,
    node_id: str,
    station_id: str,
    device_id: str | None = None,
    protocols: Iterable[str] | None = None,
    name: str | None = None,
    description: str | None = None,
) -> dict:
    """Build an Edge+ recipe dict from context-graph topology devices."""
    site, area, line, station, devices = resolve_station_context(station_id)
    site_code = _site_code(site)
    schema = _active_context_graph() or {}

    if device_id:
        devices = [d for d in devices if d["id"] == device_id]
        if not devices:
            raise KeyError(f"device not found on station: {device_id}")

    recipe_devices = [
        _device_spec_from_mes(
            d, site_code=site_code, area=area, line=line, station=station
        )
        for d in devices
    ]

    wanted = list(protocols) if protocols else list(_EDGEPLUS_PROTOCOLS)
    wanted = [p for p in wanted if p in _EDGEPLUS_PROTOCOLS]
    if not wanted:
        wanted = list(_EDGEPLUS_PROTOCOLS)

    present = {d["protocol"] for d in recipe_devices}
    for proto in wanted:
        if proto not in present:
            recipe_devices.append(
                _placeholder_device(
                    proto,
                    site_code=site_code,
                    area=area,
                    line=line,
                    station=station,
                    node_id=node_id,
                )
            )
            present.add(proto)

    if not recipe_devices:
        recipe_devices.append(
            _placeholder_device(
                "mes",
                site_code=site_code,
                area=area,
                line=line,
                station=station,
                node_id=node_id,
            )
        )

    binding_ids = [
        b.get("id")
        for b in (schema.get("object_bindings") or [])
        if b.get("enabled", True)
    ]

    recipe_name = name or f"{station.get('name')} · Edge+"
    recipe = {
        "schema_version": "1.0",
        "recipe_id": f"recipe-{node_id}",
        "recipe_version": f"2026.07.26.{new_id('ver')[-4:]}",
        "edge_node_id": node_id,
        "name": recipe_name,
        "description": description
        or (
            f"Materialized from context graph device definition for "
            f"{station.get('name')} ({station_id})"
            + (f" · focus device {device_id}" if device_id else "")
        ),
        "signed_by": "livis-central-ca",
        "station": {
            "facility_id": site.get("id"),
            "area_id": area.get("id"),
            "line_id": line.get("id"),
            "station_id": station["id"],
            "facility_label": site.get("name"),
            "area_label": area.get("name"),
            "line_label": line.get("name"),
            "station_label": station.get("name"),
        },
        "uplink": {
            "mes_http_events": "/api/edge/nodes/{node_id}/events",
            "mes_http_heartbeat": "/api/edge/nodes/{node_id}/heartbeat",
            "mes_http_recipe": "/api/edge/nodes/{node_id}/recipe",
            "mes_ws_live": "/ws/live",
            "mqtt_broker": None,
            "mqtt_topic_prefix": "livis/edge",
            "batch_size": 25,
            "flush_interval_ms": 500,
            "max_queue": 5000,
        },
        "devices": recipe_devices,
        "flashed_at": now(),
        "metadata": {
            "plant_storyline": site.get("name"),
            "context_graph_id": schema.get("id"),
            "context_graph_name": schema.get("name"),
            "object_bindings": binding_ids,
            "source": "context_manager",
            "source_station_id": station_id,
            "source_device_id": device_id,
            "notes": "Created via Govern → Entity Manager → New Edge Node",
        },
    }
    return recipe


def materialize_edge_node(
    *,
    station_id: str,
    device_id: str | None = None,
    node_id: str | None = None,
    name: str | None = None,
    protocols: list[str] | None = None,
    gpu: str | None = None,
    actor: str = "entity-manager",
) -> dict:
    """Create edge_nodes + edge_recipes entries from context graph definition."""
    site, area, line, station, devices = resolve_station_context(station_id)

    if device_id and not any(d["id"] == device_id for d in devices):
        raise KeyError(f"device not found on station: {device_id}")

    nid = node_id or f"edge-{_slug(station['id'].removeprefix('st-'), 28)}"
    if nid in DB["edge_nodes"]:
        raise ValueError(f"edge node already exists: {nid}")

    proto_list = protocols or list(_EDGEPLUS_PROTOCOLS)
    recipe = materialize_recipe(
        node_id=nid,
        station_id=station_id,
        device_id=device_id,
        protocols=proto_list,
        name=name,
    )

    caps = ["Workflow engine v2", "Vision runtime (TensorRT)"]
    for p in proto_list:
        cap = _CAPABILITY_BY_PROTOCOL.get(p)
        if cap and cap not in caps:
            caps.append(cap)

    node = {
        "id": nid,
        "name": name or recipe["name"],
        "area": area.get("name") or "Unknown",
        "lines": [line.get("id")] if line.get("id") else [],
        "health": "Healthy",
        "version": "livis-edge-plus 0.1.0",
        "k3s": "v1.31.2+k3s1",
        "gpu": gpu or "NVIDIA A2",
        "queue_depth": 0,
        "data_lag_s": 0.3,
        "storage_used_pct": 18,
        "clock": {"source": "NTP", "trust": 0.95},
        "secure_boot": True,
        "tpm": True,
        "cert_expiry_days": 180,
        "last_seen": now(),
        "mission_readiness": {"score": 94, "limiting_factors": ["awaiting_first_flash"]},
        "node_passport": {
            "signed": True,
            "issuer": "livis-central-ca",
            "capabilities": caps,
            "semantic_mappings": sum(len(d.get("tags") or []) for d in recipe["devices"]),
            "fingerprint": new_id("fp")[-16:],
        },
        # Context / Edge+ binding (Entity Manager table + Edge fleet)
        "edgeplus_ready": True,
        "station_id": station_id,
        "device_id": device_id,
        "facility_id": site.get("id"),
        "area_id": area.get("id"),
        "line_id": line.get("id"),
        "context_path": (
            f"{site.get('id')}/{area.get('id')}/{line.get('id')}/{station_id}"
            + (f"/{device_id}" if device_id else "")
        ),
        "context_graph_id": recipe["metadata"].get("context_graph_id"),
        "recipe_id": recipe["recipe_id"],
        "recipe_version": recipe["recipe_version"],
        "protocols": sorted({d["protocol"] for d in recipe["devices"]}),
    }

    DB["edge_nodes"][nid] = node
    DB.setdefault("edge_recipes", {})[nid] = recipe

    # Seed connectors from recipe devices (non-placeholder OT adapters)
    for d in recipe["devices"]:
        if (d.get("metadata") or {}).get("placeholder") and d["protocol"] in (
            "mes",
            "sap",
            "livis_edge",
        ):
            continue
        ep = d.get("endpoint") or {}
        endpoint = (
            ep.get("url")
            or ep.get("topic")
            or (f"{ep.get('host')}:{ep.get('port')}" if ep.get("host") else d["id"])
        )
        cid = new_id("conn")
        DB["connectors"][cid] = {
            "id": cid,
            "protocol": {
                "opcua": "OPC UA",
                "mqtt": "MQTT Sparkplug B",
                "vision": "GigE Vision",
                "livis_edge": "LIVIS Edge+",
                "mes": "MES Context",
                "sap": "REST/ERP",
            }.get(d["protocol"], d["protocol"]),
            "endpoint": endpoint,
            "node_id": nid,
            "status": "Connected",
            "mapped_tags": len(d.get("tags") or []),
            "quality": 0.98,
            "last_sample": now(),
        }

    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid,
        "kind": "edge.create",
        "actor": actor,
        "detail": (
            f"Created Edge+ node {nid} from context device definition "
            f"@ {station_id}"
            + (f"/{device_id}" if device_id else "")
            + f" · recipe {recipe['recipe_id']} v{recipe['recipe_version']}"
        ),
        "at": now(),
        "source": "entity-manager",
    }

    return {"node": node, "recipe": recipe, "audit_id": aid}
