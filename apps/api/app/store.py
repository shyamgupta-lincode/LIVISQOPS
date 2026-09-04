"""
In-memory operational data store for LIVIS MES.

Multi-workspace: each tenant (Harley OEM, Tier 1, Tier 2, Lam Research) gets its own
seeded dict. Request handlers resolve the active store via contextvars;
routers keep importing ``DB`` unchanged.
"""

from __future__ import annotations

import contextvars
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

random.seed(42)

_workspace_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "workspace_id", default="harley"
)
_STORES: dict[str, dict] = {}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ts_offset(**kwargs) -> str:
    return (datetime.now(timezone.utc) - timedelta(**kwargs)).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def empty_db() -> dict:
    return {
        "sites": {},
        "areas": {},
        "lines": {},
        "stations": {},
        "devices": {},
        "orders": {},
        "vins": {},
        "operations": {},
        "work_instructions": {},
        "workflows": {},
        "inspections": {},
        "defects": {},
        "holds": {},
        "models": {},
        "deployments": {},
        "drift_events": {},
        "agents": {},
        "agent_actions": {},
        "edge_nodes": {},
        "connectors": {},
        "edge_recipes": {},  # node_id → flashed Edge+ recipe document
        "edge_telemetry": [],  # recent Edge+ envelope batches (ring, demo)
        # Edge+ live samples: {node_id: {lookup_key: [{t, v, unit, …}]}}
        # lookup_key is canonical_path, source_address (OPC-UA), tag_id, or device_id/tag_id
        "edge_live": {},
        "events": {},
        "actions": {},
        "value_ledger": {},
        "audit": {},
        "users": {},
        "shift_briefs": {},
        "kpis": {},
        "history": [],
        "graph_schema": {},
        "context_graphs": {},
        "active_context_graph_id": None,
        # Per-device PLC tag ring buffers: {device_id: {tag_key: [floats]}}
        "tag_series": {},
        "workspace_meta": {},
        # Contextual platform planes
        "bus": {"envelopes": [], "seq": 0, "consumers": {}},
        "event_ledger": [],
        "lakehouse_raw": [],
        "lakehouse_datasets": {},
        "feature_windows": {},
        "candidate_events": {},
        "quality_events": {},
        "failure_modes": {},
        "pdm_assets": {},
        "pdm_predictions": {},
        "knowledge_cases": {},
        "lessons": {},
        "knowledge_proposals": {},
        "retrieval_chunks": {},
        "learning_metrics": {},
        "learning_versions": {},
        "rca_hypotheses": {},
    }


class DBProxy:
    """Dict-like facade over the active workspace store."""

    def _raw(self) -> dict:
        wid = _workspace_id.get()
        if wid not in _STORES:
            # Boot / health before seed: empty fallback
            if not _STORES:
                _STORES["harley"] = empty_db()
            wid = next(iter(_STORES))
            _workspace_id.set(wid)
        return _STORES[wid]

    def __getitem__(self, key: str) -> Any:
        return self._raw()[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self._raw()[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self._raw().get(key, default)

    def setdefault(self, key: str, default: Any = None) -> Any:
        return self._raw().setdefault(key, default)

    def __contains__(self, key: object) -> bool:
        return key in self._raw()

    def keys(self):
        return self._raw().keys()

    def values(self):
        return self._raw().values()

    def items(self):
        return self._raw().items()

    def __iter__(self):
        return iter(self._raw())


DB = DBProxy()


def get_workspace_id() -> str:
    return _workspace_id.get()


def set_workspace(workspace_id: str):
    if workspace_id not in _STORES:
        raise KeyError(f"Unknown workspace: {workspace_id}")
    return _workspace_id.set(workspace_id)


def reset_workspace(token) -> None:
    _workspace_id.reset(token)


def all_workspace_ids() -> list[str]:
    return list(_STORES.keys())


def workspace_store(workspace_id: str) -> dict:
    return _STORES[workspace_id]


STATION_STATES = [
    "Running", "Starved", "Blocked", "Faulted", "Changeover",
    "Maintenance", "Quality Hold", "Offline",
]

OPERATORS = [
    "J. Miller", "T. Brennan", "A. Kowalski", "M. Sullivan",
    "R. Vargas", "K. O'Neill", "D. Hartman", "S. Petrov",
]


# --------------------------------------------------------------------------
# Seed helpers — Harley-Davidson York Vehicle Operations
# --------------------------------------------------------------------------

def _seed_topology():
    site = {
        "id": "site-york1",
        "name": "Harley-Davidson · York Vehicle Ops",
        "code": "HD-YVO",
        "timezone": "America/New_York",
        "shift": "Shift A (06:00-14:30)",
        "oem": "Harley-Davidson",
        "tier": "oem",
    }
    DB["sites"][site["id"]] = site

    area_specs = [
        ("Frame & Fabrication", "FRM", ["Frame Weld Line"]),
        ("Paint & Finishing", "PNT", ["Paint Line 1"]),
        ("Powertrain", "PWT", ["Milwaukee-Eight Dress Line"]),
        ("Final Assembly", "FA", ["Touring Assembly Line", "Softail Assembly Line"]),
        ("Vehicle Test", "EOL", ["Final Test Line"]),
    ]

    station_specs = {
        "Frame Weld Line": [
            ("Tube Cut & Notch", "presence"), ("Main Frame Weld Cell", "weld"),
            ("Swingarm Weld Cell", "weld"), ("Frame Geometry Check", "surface"),
        ],
        "Paint Line 1": [
            ("Powder Prep Booth", "process"), ("Base Coat Booth", "process"),
            ("Clear Coat Booth", "process"), ("Paint Surface Inspection", "surface"),
        ],
        "Milwaukee-Eight Dress Line": [
            ("Engine Dress Prep", "torque"), ("Harness & Sensor Fit", "sequence"),
            ("Cylinder Head Torque", "torque"), ("Oil System Leak Test", "leak"),
        ],
        "Touring Assembly Line": [
            ("Fuel Tank Install", "sequence"), ("Handlebar & Controls", "torque"),
            ("Fairing & Lighting", "presence"), ("Touring Trim Vision", "presence"),
        ],
        "Softail Assembly Line": [
            ("Powertrain Marriage", "torque"), ("Primary Drive Fasteners", "torque"),
            ("Wheel & Tire Mount", "torque"), ("Fluid Fill & Bleed", "process"),
        ],
        "Final Test Line": [
            ("Chassis Roll / Dyno", "eol"), ("ABS & Lighting Check", "eol"),
            ("Water Spray Leak Test", "leak"), ("Final Appearance Audit", "surface"),
        ],
    }

    # Motorcycle takt is typically longer than auto
    takt_by_line = {
        "Frame Weld Line": 240,
        "Paint Line 1": 280,
        "Milwaukee-Eight Dress Line": 220,
        "Touring Assembly Line": 300,
        "Softail Assembly Line": 270,
        "Final Test Line": 320,
    }

    line_x = 0
    for area_name, code, line_names in area_specs:
        area_id = f"area-{code.lower()}"
        DB["areas"][area_id] = {
            "id": area_id, "site_id": site["id"], "name": area_name,
            "code": code,
        }
        for ln in line_names:
            line_id = f"line-{ln.lower().replace(' ', '-').replace('&', 'and')}"
            takt = takt_by_line.get(ln, 280)
            DB["lines"][line_id] = {
                "id": line_id, "area_id": area_id, "site_id": site["id"],
                "name": ln, "takt_seconds": takt, "x": line_x,
            }
            stations = station_specs[ln]
            for idx, (st_name, archetype) in enumerate(stations):
                st_id = f"st-{line_id[5:]}-{idx + 1:02d}"
                DB["stations"][st_id] = {
                    "id": st_id, "line_id": line_id, "area_id": area_id,
                    "site_id": site["id"], "name": st_name, "position": idx + 1,
                    "archetype": archetype, "state": "Running",
                    "state_since": ts_offset(minutes=random.randint(1, 90)),
                    "cycle_time_s": round(random.uniform(takt * 0.82, takt * 1.08), 1),
                    "takt_s": takt,
                    "current_vin": None,
                    "operator": random.choice(OPERATORS),
                    "health": {
                        "availability": round(random.uniform(0.88, 0.99), 3),
                        "quality": round(random.uniform(0.95, 0.999), 3),
                        "performance": round(random.uniform(0.85, 0.98), 3),
                        "ai_confidence": round(random.uniform(0.9, 0.99), 3),
                        "operator_efficiency": round(random.uniform(0.85, 0.98), 3),
                        "safety": round(random.uniform(0.97, 1.0), 3),
                    },
                }
                for d_kind in ["PLC", "Camera"] + (["Torque Tool"] if archetype == "torque" else []):
                    dev_id = new_id("dev")
                    protocol = {
                        "PLC": "OPC UA",
                        "Camera": "GigE Vision",
                        "Torque Tool": "Open Protocol",
                    }[d_kind]
                    device = {
                        "id": dev_id, "station_id": st_id, "kind": d_kind,
                        "name": f"{st_name} {d_kind}",
                        "protocol": protocol,
                        "status": "Online",
                        "timestamp_trust": round(random.uniform(0.92, 1.0), 2),
                    }
                    if d_kind in ("PLC", "Torque Tool"):
                        device["tags"] = _seed_device_tags(st_name, archetype, d_kind)
                    DB["devices"][dev_id] = device
            line_x += 1

    # Interesting starting conditions for York plant
    _set_state("st-touring-assembly-line-01", "Faulted")       # Fuel Tank Install
    _set_state("st-paint-line-1-04", "Quality Hold")           # Paint Surface Inspection
    _set_state("st-softail-assembly-line-02", "Starved")       # Primary Drive Fasteners
    _set_state("st-frame-weld-line-02", "Changeover")          # Main Frame Weld Cell
    _set_state("st-final-test-line-02", "Maintenance")         # ABS & Lighting Check


def _set_state(station_id: str, state: str):
    st = DB["stations"].get(station_id)
    if st:
        st["state"] = state
        st["state_since"] = ts_offset(minutes=random.randint(4, 40))


def _plc_node_slug(st_name: str) -> str:
    """Stable OPC UA browse-name fragment from a station name."""
    cleaned = "".join(ch if ch.isalnum() else "" for ch in st_name)
    return cleaned[:28] or "Station"


def _seed_device_tags(st_name: str, archetype: str, kind: str) -> list[dict]:
    """Mapped PLC / Open Protocol tags configured on a device connector binding."""
    if kind == "Torque Tool":
        return [
            {
                "key": "MID0061.Torque",
                "source_tag": "MID 0061 Parameter 1",
                "name": "Final torque",
                "unit": "Nm",
                "data_type": "Float",
                "base": round(random.uniform(18.0, 42.0), 1),
                "jitter": 0.04,
            },
            {
                "key": "MID0061.Angle",
                "source_tag": "MID 0061 Parameter 2",
                "name": "Tightening angle",
                "unit": "deg",
                "data_type": "Float",
                "base": round(random.uniform(40.0, 120.0), 1),
                "jitter": 0.06,
            },
            {
                "key": "MID0061.Status",
                "source_tag": "MID 0061 Parameter 3",
                "name": "Tighten status",
                "unit": "",
                "data_type": "Integer",
                "base": 1.0,
                "jitter": 0.0,
            },
        ]

    slug = _plc_node_slug(st_name)
    # Archetype-tuned primary process tag first (drives Twin primary chart).
    if archetype in ("weld",):
        primary = ("Current", "A", "DB102.DBD4", 180.0, 0.05)
        secondary = ("WireSpeed", "m/min", "DB102.DBD8", 8.5, 0.06)
        tertiary = ("GasFlow", "L/min", "DB102.DBD12", 16.0, 0.04)
    elif archetype in ("presence", "vision"):
        primary = ("CycleTime", "s", "DB100.DBW26", round(random.uniform(2.2, 4.8), 2), 0.05)
        secondary = ("NotchDepth", "mm", "DB100.DBD8", round(random.uniform(4.0, 9.5), 2), 0.04)
        tertiary = ("PartPresent", "", "M12.4", 1.0, 0.0)
    elif archetype == "torque":
        primary = ("TargetTorque", "Nm", "DB110.DBD0", 28.0, 0.03)
        secondary = ("CycleTime", "s", "DB100.DBW26", 3.2, 0.05)
        tertiary = ("OkCount", "count", "DB100.DBW24", 120.0, 0.02)
    else:
        primary = ("CycleTime", "s", "DB100.DBW26", round(random.uniform(2.0, 6.0), 2), 0.05)
        secondary = ("CycleCount", "count", "DB100.DBW24", float(random.randint(80, 420)), 0.02)
        tertiary = ("Pressure", "bar", "DB102.DBD8", round(random.uniform(3.5, 8.0), 2), 0.05)

    specs = [
        (primary[0], primary[1], primary[2], primary[3], primary[4], "Float"),
        (secondary[0], secondary[1], secondary[2], secondary[3], secondary[4], "Float"),
        (tertiary[0], tertiary[1], tertiary[2], tertiary[3], tertiary[4],
         "Boolean" if tertiary[1] == "" and "Present" in tertiary[0] else "Float"),
        ("FaultCode", "", "DB100.DBW40", 0.0, 0.0, "Integer"),
    ]
    tags = []
    for name, unit, source, base, jitter, dtype in specs:
        tags.append({
            "key": f"ns=2;s={slug}.{name}",
            "source_tag": source,
            "name": name,
            "unit": unit,
            "data_type": dtype,
            "base": base,
            "jitter": jitter,
        })
    return tags


def next_tag_value(tag: dict, station: dict | None = None) -> float:
    """Sample a live engineering value for a configured PLC tag."""
    unit = (tag.get("unit") or "").lower()
    name = (tag.get("name") or tag.get("key") or "").lower()
    dtype = (tag.get("data_type") or "").lower()
    base = float(tag.get("base") or 1.0)
    jitter = float(tag.get("jitter") or 0.04)

    if dtype == "boolean" or unit == "bool" or "present" in name or "fault" in name and unit == "":
        if "fault" in name:
            return 1.0 if random.random() < 0.04 else 0.0
        return 1.0 if random.random() > 0.08 else 0.0

    if "cycle" in name and unit in ("s", "sec", "seconds"):
        # Prefer the PLC tag's configured engineering base (e.g. 2–5 s process
        # cycle). Only fall back to station cycle_time_s when the tag has no base.
        if tag.get("base") is not None:
            base = float(tag["base"])
        elif station and station.get("cycle_time_s"):
            base = float(station["cycle_time_s"])
        v = max(0.05, base * (1 + random.uniform(-max(jitter, 0.02), max(jitter, 0.02))))
        tag["base"] = round(v, 4)
        return round(v, 3)

    if unit in ("count",) or "count" in name:
        # Monotonic-ish counter with small steps
        step = random.choice([0, 0, 0, 1])
        tag["base"] = base + step
        return round(tag["base"], 0)

    if jitter <= 0:
        return round(base, 3)

    v = base * (1 + random.uniform(-jitter, jitter))
    tag["base"] = round(v, 4)  # mild drift so successive polls trend
    return round(v, 3)


def append_tag_sample(device_id: str, tag_key: str, value: float, maxlen: int = 60) -> list[float]:
    """Append a sample to the device/tag ring buffer; return the series."""
    by_dev = DB.setdefault("tag_series", {}).setdefault(device_id, {})
    series = by_dev.setdefault(tag_key, [])
    series.append(float(value))
    if len(series) > maxlen:
        del series[:-maxlen]
    return list(series)


def _edge_live_keys(
    *,
    canonical: str | None = None,
    tag_id: str | None = None,
    source_address: str | None = None,
    device_id: str | None = None,
) -> list[str]:
    """Stable lookup aliases for an Edge+ tag sample."""
    keys: list[str] = []
    for k in (canonical, tag_id, source_address):
        if k and k not in keys:
            keys.append(str(k))
    if device_id and tag_id:
        combo = f"{device_id}/{tag_id}"
        if combo not in keys:
            keys.append(combo)
    return keys


def append_edge_live_sample(
    node_id: str,
    value: float,
    *,
    canonical: str | None = None,
    tag_id: str | None = None,
    source_address: str | None = None,
    device_id: str | None = None,
    unit: str = "",
    quality: str = "good",
    at: str | None = None,
    maxlen: int = 60,
) -> list[dict]:
    """Append one Edge+ live sample under all alias keys; return primary series."""
    keys = _edge_live_keys(
        canonical=canonical,
        tag_id=tag_id,
        source_address=source_address,
        device_id=device_id,
    )
    if not keys:
        return []
    sample = {
        "t": at or now(),
        "v": float(value),
        "unit": unit or "",
        "quality": quality or "good",
        "canonical": canonical,
        "tag_id": tag_id,
        "source_address": source_address,
        "device_id": device_id,
    }
    by_node = DB.setdefault("edge_live", {}).setdefault(node_id, {})
    primary: list[dict] = []
    for key in keys:
        series = by_node.setdefault(key, [])
        series.append(sample)
        if len(series) > maxlen:
            del series[:-maxlen]
        if not primary:
            primary = list(series)
    return primary


def get_edge_live_series(node_id: str, tag: str, maxlen: int = 60) -> list[dict]:
    """Fetch rolling Edge+ samples for a node + tag/canonical/source_address key."""
    by_node = (DB.get("edge_live") or {}).get(node_id) or {}
    series = by_node.get(tag) or []
    if not series and tag:
        # Soft match: suffix / case-insensitive contains
        needle = tag.lower()
        for k, s in by_node.items():
            kl = str(k).lower()
            if kl == needle or kl.endswith(needle) or needle.endswith(kl) or needle in kl:
                series = s
                break
    return list(series[-maxlen:]) if series else []


def recipe_tag_index(node_id: str) -> dict[tuple[str, str], dict]:
    """(device_id, tag_id) → recipe tag dict (includes source_address / canonical_path)."""
    recipe = (DB.get("edge_recipes") or {}).get(node_id) or {}
    out: dict[tuple[str, str], dict] = {}
    for d in recipe.get("devices") or []:
        did = d.get("id")
        for t in d.get("tags") or []:
            tid = t.get("id")
            if did and tid:
                out[(did, tid)] = t
    return out


def resolve_edge_binding_for_device(device_id: str) -> dict | None:
    """Resolve Edge+ node + matching recipe tags for a MES topology device."""
    device = DB["devices"].get(device_id)
    if not device:
        return None
    station_id = device.get("station_id")
    recipes = DB.get("edge_recipes") or {}

    # Prefer recipe that lists this device_id
    for node_id, recipe in recipes.items():
        for d in recipe.get("devices") or []:
            if d.get("id") == device_id:
                return {
                    "node_id": node_id,
                    "station_id": (recipe.get("station") or {}).get("station_id") or station_id,
                    "device": d,
                    "recipe_id": recipe.get("recipe_id"),
                    "recipe_version": recipe.get("recipe_version"),
                }

    # Fall back: recipe bound to the same station
    for node_id, recipe in recipes.items():
        st = (recipe.get("station") or {}).get("station_id")
        if st and st == station_id:
            # Prefer PLC-like device in recipe matching kind
            candidates = [
                d for d in (recipe.get("devices") or [])
                if not (d.get("metadata") or {}).get("placeholder")
            ]
            pick = next(
                (d for d in candidates if d.get("id") == device_id),
                None,
            ) or next(
                (d for d in candidates if d.get("device_type") in ("plc", "torque_gun")),
                candidates[0] if candidates else None,
            )
            return {
                "node_id": node_id,
                "station_id": station_id,
                "device": pick,
                "recipe_id": recipe.get("recipe_id"),
                "recipe_version": recipe.get("recipe_version"),
            }

    # Last resort: edge_nodes.lines covering the device's line
    st = DB["stations"].get(station_id) if station_id else None
    line_id = (st or {}).get("line_id")
    if line_id:
        for node in (DB.get("edge_nodes") or {}).values():
            if line_id in (node.get("lines") or []):
                return {
                    "node_id": node["id"],
                    "station_id": station_id,
                    "device": None,
                    "recipe_id": node.get("recipe_id"),
                    "recipe_version": node.get("recipe_version"),
                }
    return None


def ingest_edge_envelopes(node_id: str, events: list[dict]) -> int:
    """Index LiveEnvelope batch into edge_live ring buffers. Returns sample count."""
    tag_idx = recipe_tag_index(node_id)
    accepted = 0
    for env in events or []:
        p = env.get("payload") if isinstance(env, dict) else None
        if not isinstance(p, dict):
            continue
        raw = p.get("value")
        try:
            val = float(raw)
        except (TypeError, ValueError):
            continue
        if not (val == val):  # NaN
            continue
        device_id = p.get("device_id")
        tag_id = p.get("tag_id")
        canonical = p.get("canonical") or p.get("canonical_path")
        source_address = p.get("source_address") or p.get("opcua_node") or p.get("tag_key")
        if (device_id, tag_id) in tag_idx:
            rt = tag_idx[(device_id, tag_id)]
            source_address = source_address or rt.get("source_address")
            canonical = canonical or rt.get("canonical_path")
        append_edge_live_sample(
            node_id,
            val,
            canonical=canonical,
            tag_id=tag_id,
            source_address=source_address,
            device_id=device_id,
            unit=p.get("unit") or "",
            quality=p.get("quality") or "good",
            at=env.get("source_timestamp") or p.get("source_timestamp") or now(),
        )
        accepted += 1
    return accepted


def ensure_tag_series(device_id: str, tags: list[dict], station: dict | None = None,
                      n: int = 12) -> None:
    """Warm empty tag series so charts have history on first open."""
    by_dev = DB.setdefault("tag_series", {}).setdefault(device_id, {})
    for tag in tags:
        key = tag["key"]
        if len(by_dev.get(key) or []) >= n:
            continue
        series = by_dev.setdefault(key, [])
        while len(series) < n:
            series.append(next_tag_value(tag, station))


# Harley model families / colors
PRODUCT = "Harley-Davidson Motorcycle"
VARIANTS = [
    "Street Glide Special", "Road Glide Limited", "Road King Special",
    "Fat Boy 114", "Softail Standard", "Sportster S", "Pan America 1250 Special",
]
COLORS = [
    "Vivid Black", "Billiard Gray", "Bright Billiard Blue",
    "Whiskey Fire", "White Onyx Pearl", "Midnight Crimson", "Reef Blue",
]


def _hd_vin(i: int, v: int) -> str:
    """Synthetic Harley-style VIN (1HD… York)."""
    return f"1HD1Y{random.randint(10000, 99999)}{i:02d}{v}"


ORDER_SOURCES = ["SAP", "ERP", "APS", "WMS", "Manual"]


def _seed_production():
    op_names = [
        "Frame release", "Frame weld complete", "Paint", "Powertrain dress",
        "Final assembly", "Powertrain marriage", "Vehicle test",
    ]
    assembly_lines = ["line-touring-assembly-line", "line-softail-assembly-line"]
    for i in range(14):
        order_id = f"WO-HD{7000 + i}"
        variant = random.choice(VARIANTS)
        qty = random.choice([8, 12, 16, 20, 24])  # motorcycle batch sizes
        completed = random.randint(2, qty - 2) if i < 10 else 0
        status = "Released" if i < 10 else "Planned"
        if i < 2:
            status = "Completed"
            completed = qty
        source = ORDER_SOURCES[i % len(ORDER_SOURCES)]
        ref_prefix = {"SAP": "SAP-HD", "ERP": "ERP-HD", "APS": "APS-HD", "WMS": "WMS-HD", "Manual": "MAN-HD"}[source]
        DB["orders"][order_id] = {
            "id": order_id,
            "source": source,
            "erp_ref": f"{ref_prefix}-{920000 + i}",
            "product": PRODUCT,
            "variant": variant,
            "color": random.choice(COLORS),
            "qty": qty,
            "completed": completed,
            "status": status,
            "due": ts_offset(hours=-random.randint(4, 72)),
            "line_id": random.choice(assembly_lines),
            "released_at": ts_offset(hours=random.randint(2, 30)),
            "created_by": "System sync" if source != "Manual" else "Planner",
        }
        if status != "Planned":
            for v in range(min(qty, 8)):
                vin = _hd_vin(i, v)
                station_ids = list(DB["stations"].keys())
                progress = random.randint(2, 7)
                ops = []
                for op_i, op_name in enumerate(op_names[:progress]):
                    ops.append({
                        "id": new_id("op"),
                        "name": op_name,
                        "station_id": random.choice(station_ids),
                        "status": "Completed" if op_i < progress - 1 else "In Progress",
                        "completed_at": ts_offset(hours=progress - op_i),
                        "operator": random.choice(OPERATORS),
                        "evidence": [
                            {"type": "barcode_scan", "ref": f"SCAN-{random.randint(10000, 99999)}"},
                            {"type": "vision", "ref": f"IMG-{random.randint(10000, 99999)}",
                             "confidence": round(random.uniform(0.9, 0.999), 3)},
                        ] + ([{"type": "torque", "ref": f"TQ-{random.randint(10000, 99999)}",
                               "value_nm": round(random.uniform(28, 45), 1), "target_nm": 35.0}]
                             if random.random() > 0.5 else []),
                        "instruction_version": f"WI-HD-{random.randint(10, 40)}.v{random.randint(1, 5)}",
                        "model_version": f"vision-{random.choice(['presence', 'surface', 'weld'])}@{random.randint(1, 6)}.{random.randint(0, 9)}",
                    })
                # ABS serials share ABS-MD-* prefix with Meridian (Tier 1) seed
                abs_serial = f"ABS-MD-{7000 + i:04d}{v}"
                DB["vins"][vin] = {
                    "vin": vin,
                    "order_id": order_id,
                    "variant": variant,
                    "color": DB["orders"][order_id]["color"],
                    "status": "In Process" if progress < 7 else "Complete",
                    "current_station": ops[-1]["station_id"] if ops else None,
                    "operations": ops,
                    "components": [
                        {"part": "Milwaukee-Eight Engine", "serial": f"M8-{random.randint(100000, 999999)}", "lot": f"L-{random.randint(100, 999)}"},
                        {"part": "Transmission", "serial": f"TX-{random.randint(100000, 999999)}", "lot": f"L-{random.randint(100, 999)}"},
                        {"part": "Fuel Tank", "serial": f"TK-{random.randint(100000, 999999)}", "lot": f"L-{random.randint(100, 999)}"},
                        {"part": "ABS Module", "serial": abs_serial, "lot": f"L-MD-{random.randint(100, 999)}",
                         "supplier": "Meridian Dynamics", "tier": "tier1"},
                    ],
                }

    vins = list(DB["vins"].keys())
    for st in DB["stations"].values():
        if st["state"] in ("Running", "Blocked", "Faulted") and vins:
            st["current_vin"] = random.choice(vins)


def _seed_work_instructions():
    specs = [
        ("WI-HD-TANK-14", "Fuel Tank Install & Seal", "st-touring-assembly-line-01", [
            ("Scan VIN and verify Touring variant", "scan", "Barcode must match dispatched VIN / BOM"),
            ("Load painted tank for colorway", "pick", "Vision confirms tank color and part number"),
            ("Seat tank on frame mounts", "manual", "Align petcock / sender clearances"),
            ("Torque tank mounts to recipe", "tool", "Torque 28±2 Nm, sequence per WI overlay"),
            ("Vision tank seal & badge check", "vision", "Model tank-seal@4.2 threshold 0.93"),
            ("Confirm and release to next station", "confirm", "PLC permit handshake required"),
        ]),
        ("WI-HD-M8-TQ-07", "Cylinder Head Torque Sequence", "st-milwaukee-eight-dress-line-03", [
            ("Scan Milwaukee-Eight engine serial", "scan", "Serial must match order BOM"),
            ("Select head torque recipe", "tool", "Recipe auto-selected from engine family"),
            ("Torque head bolts in star pattern", "tool", "Torque 35±2 Nm, angle 90±5°"),
            ("Vision fastener presence check", "vision", "All fasteners present and seated"),
            ("Commit operation", "confirm", "Genealogy updated with tool curve"),
        ]),
        ("WI-HD-PAINT-18", "Paint Surface Inspection", "st-paint-line-1-04", [
            ("Carrier / frame scan on entry", "scan", "Frame bound to VIN genealogy"),
            ("Multi-light capture set", "vision", "12 captures across 4 lighting recipes"),
            ("Review flagged zones", "review", "Confidence < 0.97 requires human review"),
            ("Disposition", "confirm", "Accept / polish / re-spray with reason code"),
        ]),
        ("WI-HD-EOL-ABS-03", "ABS & Lighting Functional Check", "st-final-test-line-02", [
            ("Position motorcycle on roll fixture", "manual", "Wheel sensors seated; kickstand clear"),
            ("Scan VIN, load ABS calibration set", "scan", "Variant-specific ABS / lighting map"),
            ("Run ABS & lighting sequence", "tool", "All ECUs report pass"),
            ("Commit results to birth record", "confirm", "Test trace stored as evidence"),
        ]),
    ]
    for wi_id, name, station_id, steps in specs:
        DB["work_instructions"][wi_id] = {
            "id": wi_id, "name": name, "station_id": station_id,
            "version": f"v{random.randint(2, 6)}",
            "status": "Deployed",
            "effective": ts_offset(days=random.randint(5, 60)),
            "approved_by": "M. Sullivan (ME Lead)",
            "steps": [
                {"seq": i + 1, "title": t, "kind": k, "criteria": c,
                 "evidence_required": k in ("scan", "vision", "tool")}
                for i, (t, k, c) in enumerate(steps)
            ],
        }

    for wf_name, target, status in [
        ("Tank install Rev C - add torque check", "WI-HD-TANK-14", "In Review"),
        ("Paint booth recipe 4 lighting update", "WI-HD-PAINT-18", "Draft"),
        ("M8 head torque angle window widening", "WI-HD-M8-TQ-07", "Approved"),
    ]:
        wf_id = new_id("wf")
        DB["workflows"][wf_id] = {
            "id": wf_id, "name": wf_name, "target_instruction": target,
            "status": status, "author": "K. O'Neill",
            "created": ts_offset(days=random.randint(1, 9)),
            "compiled_outputs": [
                "Operator guidance package", "Edge state machine v2",
                "Evidence schema", "PLC handshake test set (14 cases)",
                "Simulation scenario",
            ],
        }


DEFECT_CLASSES = [
    ("Tank seal discontinuity", "sequence"), ("Paint orange peel", "surface"),
    ("Missing fastener", "presence"), ("Frame weld porosity", "weld"),
    ("Paint run / sag", "surface"), ("Tank dent", "surface"),
    ("Connector unseated", "presence"), ("Badge misalignment", "presence"),
]


def _seed_quality_and_vision():
    model_specs = [
        ("tank-seal-continuity", "Fuel tank seal continuity", "st-touring-assembly-line-01", "4.2", "Production"),
        ("paint-surface-defect", "Paint surface defect", "st-paint-line-1-04", "6.1", "Production"),
        ("fastener-presence", "Fastener presence", "st-milwaukee-eight-dress-line-03", "3.4", "Production"),
        ("frame-weld-quality", "Frame weld bead quality", "st-frame-weld-line-02", "2.7", "Shadow"),
        ("frame-geometry", "Frame geometry / tube presence", "st-frame-weld-line-04", "1.9", "Assisted"),
        ("touring-trim-mixup", "Touring trim mix-up", "st-touring-assembly-line-04", "5.0", "Production"),
    ]
    for slug, name, station, ver, stage in model_specs:
        mid = f"model-{slug}"
        DB["models"][mid] = {
            "id": mid, "name": name, "slug": slug, "version": ver,
            "station_id": station, "stage": stage,
            "architecture": random.choice(["YOLOv8-seg", "EfficientNet-B4", "AnomalyDINO", "SegFormer-B2"]),
            "trained": ts_offset(days=random.randint(10, 90)),
            "fitness_passport": {
                "locked_test_metrics": {
                    "critical_recall": round(random.uniform(0.985, 0.998), 4),
                    "false_reject_rate": round(random.uniform(0.004, 0.03), 4),
                    "f1": round(random.uniform(0.95, 0.99), 4),
                },
                "segments": [
                    {"segment": v, "recall": round(random.uniform(0.94, 0.999), 3),
                     "false_reject": round(random.uniform(0.002, 0.05), 3),
                     "fit": random.random() > 0.15}
                    for v in random.sample(VARIANTS, 3)
                ],
                "cost_assumptions": {
                    "escape_cost_usd": 4200, "false_reject_cost_usd": 95,
                    "reinspect_cost_usd": 28,
                },
                "hardware_profile": "IPC-NVIDIA A2 · GigE 2×5MP",
                "approved_by": "A. Kowalski (Quality Lead)",
                "rollback_target": f"{slug}@{float(ver) - 0.1:.1f}",
            },
            "drift": {
                "confidence_trend": [round(random.uniform(0.92, 0.99), 3) for _ in range(14)],
                "input_shift_score": round(random.uniform(0.01, 0.2), 3),
                "status": random.choice(["Healthy", "Healthy", "Watch", "Healthy"]),
            },
        }
        dep_id = new_id("dep")
        DB["deployments"][dep_id] = {
            "id": dep_id, "model_id": mid, "station_id": station,
            "ring": stage, "version": ver,
            "deployed": ts_offset(days=random.randint(1, 30)),
            "signed_by": "PKI: livis-central-ca", "health": "OK",
        }

    for i in range(3):
        did = new_id("drift")
        DB["drift_events"][did] = {
            "id": did,
            "model_id": random.choice(list(DB["models"].keys())),
            "kind": random.choice(["Lighting drift", "Camera focus drift", "Colorway mix shift"]),
            "detected": ts_offset(hours=random.randint(2, 40)),
            "owner": random.choice(["Vision team", "Maintenance", "Process engineering"]),
            "status": random.choice(["Open", "Triaged"]),
            "detail": "Confidence shifted on night shift Vivid Black / Billiard Gray tanks; lighting recipe 3 suspected.",
        }

    vins = list(DB["vins"].keys())
    stations_surface = [s["id"] for s in DB["stations"].values() if s["archetype"] in ("surface", "presence", "weld", "sequence")]
    for i in range(60):
        iid = new_id("insp")
        vin = random.choice(vins) if vins else None
        station = random.choice(stations_surface)
        verdict = random.choices(["Pass", "Fail", "Review"], weights=[78, 12, 10])[0]
        conf = round(random.uniform(0.55, 0.98), 3) if verdict == "Review" else round(random.uniform(0.9, 0.999), 3)
        model_id = random.choice(list(DB["models"].keys()))
        evidence_ref = f"IMG-{random.randint(100000, 999999)}"
        insp = {
            "id": iid, "vin": vin, "station_id": station,
            "model_id": model_id,
            "model_version": DB["models"][model_id]["version"],
            "verdict": verdict, "confidence": conf,
            "captured": ts_offset(minutes=random.randint(2, 480)),
            "camera": f"CAM-{random.randint(1, 4)}",
            "lighting_recipe": f"LR-{random.randint(1, 4)}",
            "evidence_ref": evidence_ref,
            # Deterministic photo seed; API also serves an industrial SVG thumbnail.
            "image_seed": abs(hash(iid)) % 10_000,
            "disposition": None,
        }
        DB["inspections"][iid] = insp
        if verdict in ("Fail", "Review"):
            defect_name, kind = random.choice(DEFECT_CLASSES)
            defect_id = new_id("def")
            DB["defects"][defect_id] = {
                "id": defect_id, "inspection_id": iid, "vin": vin,
                "station_id": station, "class": defect_name, "kind": kind,
                "severity": random.choice(["Critical", "Major", "Minor"]),
                "confidence": conf,
                "detected": insp["captured"],
                "status": random.choice(["Open", "Open", "Dispositioned", "Contained"]),
                "disposition": random.choice([None, None, "Repair", "Reject", "Accept-with-deviation"]),
                "defect_dna": {
                    "fingerprint": uuid.uuid4().hex[:16],
                    "similar_events": random.randint(0, 9),
                    "cross_line_matches": random.randint(0, 3),
                },
                "repeat_rate_shift": round(random.uniform(0.0, 0.09), 3),
            }

    hold_id = new_id("hold")
    DB["holds"][hold_id] = {
        "id": hold_id,
        "reason": "Tank seal discontinuity cluster - Fuel Tank Install",
        "defect_class": "Tank seal discontinuity",
        "scope": "Carriers T-118..T-131 (Fuel Tank Install, 06:40-08:10)",
        "units_estimated": 11,
        "units_confirmed": 7,
        "applied_by": "A. Kowalski",
        "applied": ts_offset(hours=3),
        "status": "Active",
        "integration": {"wms": "Notified", "erp": "Blocked-for-ship", "qms": "NCR-HD-2481 created"},
    }
    DB["defect_classes"] = list(DEFECT_CLASSES)


def _seed_agents():
    # data_source_topics reference context-graph object_binding ids (see _seed_graph_schema).
    agent_specs = [
        (
            "Constraint Radar", "L1 · Recommend",
            "Detects cycle-time creep, starvation chains and defect clusters; ranks by delivery impact.",
            "Watch station/line status and process time series for cycle creep and starvation chains. "
            "Correlate with production orders and defect clusters; rank by delivery impact. "
            "Recommend only — never rebalance staffing without human approval.",
            ["bind-status", "bind-timeseries", "bind-order", "bind-defect"],
        ),
        (
            "Containment Assistant", "L3 · Execute with approval",
            "Computes potentially affected VIN ranges from genealogy/time/lot/carrier and drafts holds.",
            "Given a defect cluster, walk VIN/component genealogy and inspection evidence to compute "
            "potentially affected unit ranges by time, lot, and carrier. Draft a quality hold and NCR; "
            "execute only after named human approval.",
            ["bind-defect", "bind-vin", "bind-inspection", "bind-order"],
        ),
        (
            "RCA Investigator", "L2 · Draft",
            "Assembles process signals, maintenance history and similar Defect DNA events into a cause hypothesis.",
            "Assemble defect events, process time series, station status, and inspection frames into a "
            "grounded root-cause hypothesis with evidence links. Draft CMMS/work-order artifacts; "
            "do not apply holds or change production state.",
            ["bind-defect", "bind-timeseries", "bind-status", "bind-inspection"],
        ),
        (
            "Shift Brief Writer", "L0 · Retrieve",
            "Generates the morning production brief with grounded citations to events and KPIs.",
            "Retrieve overnight production orders, station status, and quality events. "
            "Write a morning shift brief with citations to orders, defects, and genealogy — retrieve only.",
            ["bind-order", "bind-status", "bind-defect", "bind-vin"],
        ),
        (
            "Reinspection Trigger", "L4 · Bounded automation",
            "Automatically triggers a second capture when confidence is borderline; reversible, low-risk.",
            "When an inspection confidence is borderline, trigger a reversible second capture with an "
            "alternate lighting recipe. Bound to inspection objects only; never release holds or change "
            "disposition without authority.",
            ["bind-inspection"],
        ),
    ]
    for name, level, desc, prompt, topics in agent_specs:
        aid = f"agent-{name.lower().replace(' ', '-')}"
        DB["agents"][aid] = {
            "id": aid, "name": name, "autonomy": level, "description": desc,
            "version": f"{random.randint(1, 3)}.{random.randint(0, 9)}",
            "eval_score": round(random.uniform(0.88, 0.98), 3),
            "evidence_link_coverage": round(random.uniform(0.93, 1.0), 3),
            "status": "Active",
            "permitted_tools": {
                "L0 · Retrieve": ["search_events", "read_genealogy"],
                "L1 · Recommend": ["search_events", "read_genealogy", "rank_losses"],
                "L2 · Draft": ["search_events", "read_genealogy", "draft_artifact"],
                "L3 · Execute with approval": ["draft_hold", "apply_hold(approved)", "create_ncr(approved)"],
                "L4 · Bounded automation": ["trigger_recapture", "open_review_task"],
            }[level],
            "prompt": prompt,
            "data_source_topics": topics,
        }

    proposals = [
        ("agent-containment-assistant", "Apply quality hold to tank carriers T-118..T-131",
         "Tank seal discontinuity cluster detected across 7 VINs at Fuel Tank Install between 06:40-08:10. "
         "Genealogy shows shared tank lot L-4471 (Whiskey Fire / Street Glide Special).",
         {"products_affected": 11, "reversible": True, "downstream": ["WMS ship-block", "ERP status", "QMS NCR"]},
         "Approved", "T. Brennan (Area Mgr)"),
        ("agent-rca-investigator", "Root cause hypothesis: Fixture #3 wear at Fuel Tank Install",
         "Mount torque assist pressure degraded 14% over 6 shifts; seal events correlate 0.91 with fixture #3 cycles. "
         "Similar Defect DNA matched from Tomahawk paint (resolved by fixture replacement).",
         {"products_affected": 0, "reversible": True, "downstream": ["CMMS work order draft"]},
         "Pending Approval", None),
        ("agent-reinspection-trigger", "Second capture triggered for VIN 1HD1Y-borderline (conf 0.61)",
         "Confidence below assisted-mode threshold at Paint Surface Inspection; recapture with lighting recipe LR-2.",
         {"products_affected": 1, "reversible": True, "downstream": []},
         "Auto-executed", "policy: bounded-automation"),
        ("agent-constraint-radar", "Rebalance: move 1 operator to Softail Assembly station 02",
         "Starvation chain from Powertrain Marriage upstream; predicted 9 bikes delivery risk by 14:00 without action.",
         {"products_affected": 9, "reversible": True, "downstream": ["Staffing change"]},
         "Pending Approval", None),
    ]
    for agent_id, title, evidence, blast, status, approver in proposals:
        pid = new_id("act")
        DB["agent_actions"][pid] = {
            "id": pid, "agent_id": agent_id, "title": title,
            "evidence_summary": evidence,
            "evidence_links": [f"EV-{random.randint(10000, 99999)}" for _ in range(random.randint(2, 5))],
            "blast_radius": blast,
            "confidence": round(random.uniform(0.72, 0.97), 2),
            "status": status,
            "approver": approver,
            "created": ts_offset(hours=random.randint(1, 9)),
            "outcome": ("Containment verified; 7 motorcycles repaired, 0 escapes."
                        if status == "Approved" else None),
        }


def _seed_edge():
    node_specs = [
        ("edge-fa-01", "Touring Assembly Edge", "Final Assembly", ["line-touring-assembly-line"], "Healthy"),
        ("edge-fa-02", "Softail Assembly Edge", "Final Assembly", ["line-softail-assembly-line"], "Healthy"),
        ("edge-pnt-01", "Paint Edge Node", "Paint & Finishing", ["line-paint-line-1"], "Degraded"),
        ("edge-frm-01", "Frame Weld Edge", "Frame & Fabrication", ["line-frame-weld-line"], "Healthy"),
        ("edge-pwt-01", "Powertrain Edge", "Powertrain", ["line-milwaukee-eight-dress-line"], "Healthy"),
        ("edge-eol-01", "Vehicle Test Edge", "Vehicle Test", ["line-final-test-line"], "Offline"),
    ]
    for nid, name, area, lines, health in node_specs:
        DB["edge_nodes"][nid] = {
            "id": nid, "name": name, "area": area, "lines": lines,
            "health": health,
            "version": "livis-edge 1.8.3",
            "k3s": "v1.31.2+k3s1",
            "gpu": random.choice(["NVIDIA A2", "NVIDIA A2", "None"]),
            "queue_depth": random.randint(0, 40) if health != "Offline" else 1240,
            "data_lag_s": round(random.uniform(0.2, 3.0), 1) if health != "Offline" else 5400.0,
            "storage_used_pct": random.randint(22, 78),
            "clock": {"source": random.choice(["PTP", "NTP"]), "trust": round(random.uniform(0.9, 1.0), 2)},
            "secure_boot": True, "tpm": True,
            "cert_expiry_days": random.randint(40, 320),
            "last_seen": now() if health != "Offline" else ts_offset(minutes=94),
            "mission_readiness": {
                "score": {"Healthy": random.randint(92, 99), "Degraded": 71, "Offline": 18}[health],
                "limiting_factors": {
                    "Healthy": [],
                    "Degraded": ["Camera CAM-3 intermittent", "Disk 78% used"],
                    "Offline": ["WAN link down since 11:29", "Store-and-forward active: 1,240 events queued"],
                }[health],
            },
            "node_passport": {
                "signed": True, "issuer": "livis-central-ca",
                "capabilities": ["OPC UA client", "MQTT Sparkplug B", "GigE Vision",
                                 "Workflow engine v2", "Vision runtime (TensorRT)"],
                "semantic_mappings": random.randint(40, 220),
                "fingerprint": uuid.uuid4().hex[:20],
                "ot_zone": "Zone 2 · Cell / Area",
                "outbound_only": True,
                "store_and_forward": True,
                "write_deny_to_agents": True,
            },
        }

    conn_specs = [
        ("OPC UA", "opc.tcp://plc-touring:4840", "edge-fa-01", "Connected", 182),
        ("MQTT Sparkplug B", "mqtt://broker-york:1883", "edge-fa-01", "Connected", 96),
        ("GigE Vision", "cam-tank-01/02", "edge-fa-01", "Connected", 2),
        ("Open Protocol", "torque-controller-m8:4545", "edge-pwt-01", "Connected", 12),
        ("OPC UA", "opc.tcp://plc-paint:4840", "edge-pnt-01", "Degraded", 214),
        ("REST/ERP", "sap-hd-york-interface", "central", "Connected", 8),
        ("QMS Webhook", "qms.york.hd.local/ncr", "central", "Connected", 3),
    ]
    for proto, endpoint, node, status, tags in conn_specs:
        cid = new_id("conn")
        DB["connectors"][cid] = {
            "id": cid, "protocol": proto, "endpoint": endpoint,
            "node_id": node, "status": status, "mapped_tags": tags,
            "quality": round(random.uniform(0.95, 1.0), 3) if status == "Connected" else 0.71,
            "last_sample": now(),
        }

    # Demo coherence: bind Frame Weld Edge → Main Frame Weld Cell with Edge+ recipe
    # so Twin can subscribe to ns=2;s=MainFrameWeldCell.Current via Edge+ live buffer.
    try:
        from .edge_recipe import materialize_recipe
        weld_station = "st-frame-weld-line-02"
        recipe = materialize_recipe(
            node_id="edge-frm-01",
            station_id=weld_station,
            name="Main Frame Weld Cell · Edge+",
            description=(
                "Harley seed Edge+ recipe for Main Frame Weld Cell — "
                "OPC-UA Current (A) maps via source_address to Twin primary chart."
            ),
        )
        DB.setdefault("edge_recipes", {})["edge-frm-01"] = recipe
        n = DB["edge_nodes"]["edge-frm-01"]
        n["station_id"] = weld_station
        n["recipe_id"] = recipe.get("recipe_id")
        n["recipe_version"] = recipe.get("recipe_version")
        n["version"] = "livis-edge-plus 0.1.0"
        # OPC UA connector for the weld cell PLC
        cid = new_id("conn")
        DB["connectors"][cid] = {
            "id": cid, "protocol": "OPC UA",
            "endpoint": "opc.tcp://plc-main-frame-weld:4840",
            "node_id": "edge-frm-01", "status": "Connected", "mapped_tags": 4,
            "quality": 0.98, "last_sample": now(),
        }
    except Exception:
        pass


def _seed_events_actions():
    ev_specs = [
        ("P1", "Faulted", "Fuel Tank Install faulted - mount assist pressure out of range",
         "st-touring-assembly-line-01", "Touring line stop risk in 3 cycles", "T. Brennan", False),
        ("P1", "Quality", "Tank seal discontinuity cluster - 7 VINs, containment active",
         "st-touring-assembly-line-01", "Customer escape risk (Touring)", "A. Kowalski", True),
        ("P2", "Quality Hold", "Paint Surface Inspection hold - orange peel on Whiskey Fire tanks",
         "st-paint-line-1-04", "9 frames awaiting disposition", "A. Kowalski", True),
        ("P2", "Starved", "Softail Primary Drive starved - upstream powertrain marriage slow",
         "st-softail-assembly-line-02", "Takt loss 12 min accumulated", "K. O'Neill", True),
        ("P2", "Edge", "Vehicle Test edge offline - store-and-forward active (1,240 events queued)",
         None, "No data loss; sync on reconnect", "OT team", True),
        ("P3", "Drift", "Vision confidence drift on night shift - Vivid Black tanks",
         "st-paint-line-1-04", "Review before next shift", "Vision team", True),
        ("P3", "Changeover", "Main Frame Weld Cell changeover 8 min over standard (Softail → Touring)",
         "st-frame-weld-line-02", "Schedule impact minor", "D. Hartman", True),
        ("P4", "Info", "Work instruction WI-HD-TANK-14 Rev C awaiting approval",
         None, "Change board Thursday", "M. Sullivan", True),
    ]
    for pri, kind, title, station, impact, owner, acked in ev_specs:
        eid = new_id("ev")
        DB["events"][eid] = {
            "id": eid, "priority": pri, "kind": kind, "title": title,
            "station_id": station, "impact": impact, "owner": owner,
            "acknowledged": acked, "created": ts_offset(minutes=random.randint(5, 200)),
            "status": "Open",
        }

    action_specs = [
        ("Replace Fixture #3 at Fuel Tank Install", "T. Brennan", "P1",
         ts_offset(hours=-2), "In Progress",
         "RCA agent: mount assist pressure + Defect DNA match from Tomahawk"),
        ("Disposition 9 held Whiskey Fire paint frames", "A. Kowalski", "P2",
         ts_offset(hours=-4), "Open", "Vision review queue filtered to hold scope"),
        ("Rebalance operator to Softail Primary Drive", "K. O'Neill", "P2",
         ts_offset(hours=-1), "Open", "Constraint Radar starvation-chain forecast"),
        ("Approve WI-HD-TANK-14 Rev C", "M. Sullivan", "P3",
         ts_offset(hours=-24), "Open", "Adds torque check from RCA outcome"),
        ("Restore Vehicle Test edge WAN link", "OT team", "P2",
         ts_offset(hours=-3), "In Progress", "ISP ticket 88231; failover LTE evaluated"),
    ]
    for title, owner, pri, due, status, context in action_specs:
        aid = new_id("action")
        DB["actions"][aid] = {
            "id": aid, "title": title, "owner": owner, "priority": pri,
            "due": due, "status": status, "context": context,
            "created": ts_offset(hours=random.randint(1, 26)),
            "completion_evidence": None,
        }


def _seed_value_ledger():
    categories = [
        ("Scrap prevented", 18, 890), ("Escapes prevented", 1, 4200),
        ("Rework prevented", 14, 320), ("Labor hours saved", 28, 52),
        ("Inspection time saved", 64, 18), ("Downtime avoided (min)", 140, 48),
        ("Energy savings (kWh)", 520, 0.12), ("Engineering hours saved", 16, 85),
    ]
    for day in range(21):
        for name, base_qty, unit_value in categories:
            qty = max(0, int(random.gauss(base_qty, base_qty * 0.25)))
            vid = new_id("val")
            DB["value_ledger"][vid] = {
                "id": vid, "category": name, "quantity": qty,
                "unit_value_usd": unit_value,
                "value_usd": round(qty * unit_value, 2),
                "date": (datetime.now(timezone.utc) - timedelta(days=day)).date().isoformat(),
                "source": random.choice([
                    "Part Inspection ROI", "Process Monitoring ROI", "Work Instruction ROI",
                    "Predictive Maintenance ROI", "RCA ROI", "OT Integration ROI",
                ]),
                "evidence_refs": [f"EV-{random.randint(10000, 99999)}"],
            }


def _seed_admin():
    users = [
        ("Jordan Hale", "Plant Manager", "plant-manager"),
        ("T. Brennan", "Area Manager", "area-manager"),
        ("K. O'Neill", "Supervisor", "supervisor"),
        ("J. Miller", "Operator", "operator"),
        ("A. Kowalski", "Quality Engineer", "quality"),
        ("M. Sullivan", "Manufacturing Engineer", "mfg-engineer"),
        ("R. Vargas", "Maintenance Lead", "maintenance"),
        ("S. Petrov", "Vision/ML Engineer", "ml-engineer"),
        ("D. Hartman", "OT/Controls Engineer", "ot-engineer"),
        ("L. Chen", "IT/Security Admin", "it-admin"),
    ]
    for name, role, role_id in users:
        uid = new_id("user")
        DB["users"][uid] = {
            "id": uid, "name": name, "role": role, "role_id": role_id,
            "site": "Harley-Davidson · York Vehicle Ops",
            "skills": random.sample(
                ["Torque L2", "Vision Review", "Changeover", "Dyno Test", "Weld Insp", "PLC Safety"],
                k=random.randint(1, 3)),
            "sso": "OIDC (Entra)", "active": True,
        }

    audit_specs = [
        ("model.deploy", "S. Petrov", "Deployed tank-seal-continuity@4.2 to production ring (signed)"),
        ("hold.apply", "A. Kowalski", "Applied quality hold: tank carriers T-118..T-131 (NCR-HD-2481)"),
        ("workflow.approve", "M. Sullivan", "Approved M8 head torque angle window widening v3"),
        ("agent.action.approve", "T. Brennan", "Approved containment hold proposal (blast radius: 11 bikes)"),
        ("config.push", "D. Hartman", "Pushed signed connector profile to edge-pnt-01"),
        ("user.role.change", "L. Chen", "Granted vision-review role to K. O'Neill (shift coverage)"),
        ("interlock.test", "D. Hartman", "PLC handshake test set passed 14/14 (WI-HD-TANK-14 Rev C)"),
    ]
    for kind, actor, detail in audit_specs:
        aid = new_id("audit")
        DB["audit"][aid] = {
            "id": aid, "kind": kind, "actor": actor, "detail": detail,
            "at": ts_offset(hours=random.randint(1, 70)),
            "source": "central",
        }


def _seed_kpis():
    # Motorcycle volumes are lower than auto — plan ~90/shift class
    DB["kpis"] = {
        "plan_units": 96, "actual_units": 84,
        "oee": 0.744, "fpy": 0.962,
        "open_stops": 2, "escapes_mtd": 1,
        "takt_adherence": 0.91,
        "money_saved_today_usd": 22480.0,
        "hours_saved_today": 28.5,
        "scrap_prevented_today": 6,
        "co2_saved_kg": 88.0,
        "payback_months": 7.2,
        "projected_annual_value_usd": 1860000,
        "oee_trend": [round(random.uniform(0.68, 0.82), 3) for _ in range(24)],
        "fpy_trend": [round(random.uniform(0.93, 0.985), 3) for _ in range(24)],
        "output_by_hour": [random.randint(6, 14) for _ in range(12)],
        "plan_by_hour": [10] * 12,
    }

    DB["shift_briefs"]["today"] = {
        "id": "today",
        "generated": now(),
        "agent": "Shift Brief Writer v2.1",
        "headline": "Yesterday lost 12 bikes vs plan. Biggest cause: Fuel Tank Install (fixture #3 wear, 62% probability).",
        "sections": [
            {"title": "Production loss", "body": "12 motorcycles behind plan; 8 attributable to Touring Assembly stoppages.",
             "evidence": ["EV-88123", "EV-88171"]},
            {"title": "Biggest cause", "body": "Fuel Tank Install mount assist degradation. RCA agent confidence 0.62 on fixture #3 wear.",
             "evidence": ["EV-88190"]},
            {"title": "Suggested fix", "body": "Replace Fixture #3 (spare in York stores, 40 min swap). Expected recovery: 5 bikes/shift.",
             "evidence": ["EV-88190", "CMMS-DRAFT-1044"]},
            {"title": "Quality", "body": "Tank seal containment active: 11 estimated units, 7 confirmed, 0 escapes.",
             "evidence": ["NCR-HD-2481"]},
            {"title": "Edge fleet", "body": "Vehicle Test edge offline 94 min; store-and-forward active, no committed events lost.",
             "evidence": ["node.health.v1"]},
        ],
        "actions_proposed": 3,
    }


def _seed_graph_schema():
    """Composition schema: hierarchy levels + which data objects report where.

    Also registers the schema in ``context_graphs`` so multiple models can be
    managed via CRUD while ``graph_schema`` remains the active alias.
    """
    schema = {
        "id": "schema-york1",
        "name": "Harley-Davidson York Vehicle Ops context model",
        "version": "1.0",
        "status": "Draft",
        "updated_at": now(),
        "updated_by": "M. Sullivan",
        "description": "Default plant context model for Harley-Davidson York Vehicle Ops.",
        "levels": [
            {"id": "facility", "label": "Facility", "entity": "site", "required": True},
            {"id": "area", "label": "Area", "entity": "area", "required": True},
            {"id": "line", "label": "Line", "entity": "line", "required": True},
            {"id": "station", "label": "Station", "entity": "station", "required": True},
            {"id": "device", "label": "Device / component", "entity": "device", "required": False},
        ],
        "object_bindings": [
            {
                "id": "bind-inspection",
                "object_type": "inspection",
                "label": "Inspection / evidence objects",
                "report_at": "station",
                "rollup_to": ["line", "area", "facility"],
                "lenses": ["quality"],
                "enabled": True,
                "description": "Vision captures and dispositions roll up the hierarchy for quality reporting.",
                "protocol": "GigE Vision",
                "properties": [
                    {"id": "prop-image_ref", "key": "image_ref", "label": "Image / payload",
                     "data_type": "Image", "format": "Mono8", "unit": "", "required": True},
                    {"id": "prop-verdict", "key": "verdict", "label": "Verdict",
                     "data_type": "Enumeration", "format": "", "unit": "", "required": True},
                    {"id": "prop-confidence", "key": "confidence", "label": "Confidence",
                     "data_type": "Float", "format": "", "unit": "%", "required": False},
                    {"id": "prop-captured_at", "key": "captured_at", "label": "Captured at",
                     "data_type": "String", "format": "", "unit": "", "required": True},
                ],
            },
            {
                "id": "bind-status",
                "object_type": "status",
                "label": "Station / line status objects",
                "report_at": "station",
                "rollup_to": ["line", "area"],
                "lenses": ["production", "maintenance"],
                "enabled": True,
                "description": "Live state, cycle, takt and health metrics for operations reporting.",
                "protocol": "OPC UA",
                "properties": [
                    {"id": "prop-state", "key": "state", "label": "State",
                     "data_type": "String", "format": "", "unit": "", "required": True},
                    {"id": "prop-cycle_time_s", "key": "cycle_time_s", "label": "Cycle time",
                     "data_type": "Float", "format": "EngineeringUnits", "unit": "s", "required": True},
                    {"id": "prop-availability", "key": "availability", "label": "Availability",
                     "data_type": "Float", "format": "", "unit": "%", "required": False},
                    {"id": "prop-ts", "key": "ts", "label": "Timestamp",
                     "data_type": "DateTime", "format": "", "unit": "", "required": True},
                ],
            },
            {
                "id": "bind-defect",
                "object_type": "defect",
                "label": "Defect / NCR objects",
                "report_at": "station",
                "rollup_to": ["line", "area", "facility"],
                "lenses": ["quality"],
                "enabled": True,
                "description": "Quality events and holds organized by station context.",
                "protocol": "MQTT Sparkplug B",
                "properties": [
                    {"id": "prop-class", "key": "class", "label": "Defect class",
                     "data_type": "String", "format": "Metric", "unit": "", "required": True},
                    {"id": "prop-severity", "key": "severity", "label": "Severity",
                     "data_type": "String", "format": "", "unit": "", "required": True},
                    {"id": "prop-status", "key": "status", "label": "Status",
                     "data_type": "String", "format": "", "unit": "", "required": True},
                    {"id": "prop-detected_at", "key": "detected_at", "label": "Detected at",
                     "data_type": "DateTime", "format": "", "unit": "", "required": True},
                ],
            },
            {
                "id": "bind-order",
                "object_type": "order",
                "label": "Production order objects",
                "report_at": "line",
                "rollup_to": ["area", "facility"],
                "lenses": ["production", "supply_chain"],
                "enabled": True,
                "description": "ERP/SAP work orders dispatched to lines.",
                "protocol": "REST/JSON",
                "properties": [
                    {"id": "prop-order_id", "key": "order_id", "label": "Order id",
                     "data_type": "string", "format": "uuid", "unit": "", "required": True},
                    {"id": "prop-qty", "key": "qty", "label": "Quantity",
                     "data_type": "integer", "format": "", "unit": "", "required": True},
                    {"id": "prop-completed", "key": "completed", "label": "Completed",
                     "data_type": "integer", "format": "", "unit": "", "required": False},
                    {"id": "prop-status", "key": "status", "label": "Status",
                     "data_type": "string", "format": "", "unit": "", "required": True},
                ],
            },
            {
                "id": "bind-vin",
                "object_type": "genealogy",
                "label": "VIN / component genealogy",
                "report_at": "station",
                "rollup_to": ["line", "facility"],
                "lenses": ["production", "supply_chain", "quality"],
                "enabled": True,
                "description": "Product identity and component serials through the process path.",
                "protocol": "MES Context",
                "properties": [
                    {"id": "prop-vin", "key": "vin", "label": "VIN / serial",
                     "data_type": "string", "format": "id", "unit": "", "required": True},
                    {"id": "prop-variant", "key": "variant", "label": "Variant",
                     "data_type": "string", "format": "", "unit": "", "required": False},
                    {"id": "prop-status", "key": "status", "label": "Status",
                     "data_type": "enum", "format": "code", "unit": "", "required": True},
                    {"id": "prop-ops_count", "key": "ops_count", "label": "Operations",
                     "data_type": "integer", "format": "", "unit": "", "required": False},
                ],
            },
            {
                "id": "bind-timeseries",
                "object_type": "timeseries",
                "label": "Process time series",
                "report_at": "device",
                "rollup_to": ["station", "line"],
                "lenses": ["production", "maintenance"],
                "enabled": True,
                "description": "Historian tags and cycle series attached to instruments.",
                "protocol": "OPC UA",
                "properties": [
                    {"id": "prop-value", "key": "value", "label": "Value",
                     "data_type": "Double", "format": "EngineeringUnits", "unit": "", "required": True},
                    {"id": "prop-quality", "key": "quality", "label": "Quality / status",
                     "data_type": "StatusCode", "format": "", "unit": "", "required": False},
                    {"id": "prop-source_timestamp", "key": "source_timestamp", "label": "Source timestamp",
                     "data_type": "DateTime", "format": "", "unit": "", "required": True},
                    {"id": "prop-eng_unit", "key": "eng_unit", "label": "Engineering unit",
                     "data_type": "String", "format": "EngineeringUnits", "unit": "", "required": False},
                ],
            },
            {
                "id": "bind-wi",
                "object_type": "work_instruction",
                "label": "Work instruction objects",
                "report_at": "station",
                "rollup_to": ["line"],
                "lenses": ["production", "quality"],
                "enabled": True,
                "description": "Standard work governing station execution.",
                "protocol": "MES Context",
                "properties": [
                    {"id": "prop-wi_id", "key": "wi_id", "label": "Instruction id",
                     "data_type": "string", "format": "id", "unit": "", "required": True},
                    {"id": "prop-version", "key": "version", "label": "Version",
                     "data_type": "string", "format": "", "unit": "", "required": True},
                    {"id": "prop-step_count", "key": "step_count", "label": "Steps",
                     "data_type": "integer", "format": "", "unit": "", "required": False},
                    {"id": "prop-status", "key": "status", "label": "Status",
                     "data_type": "enum", "format": "code", "unit": "", "required": True},
                ],
            },
        ],
    }
    DB["context_graphs"][schema["id"]] = schema
    DB["active_context_graph_id"] = schema["id"]
    DB["graph_schema"] = schema


def seed_harley():
    """Seed the Harley-Davidson OEM workspace into the active DB proxy."""
    _seed_topology()
    _seed_production()
    _seed_work_instructions()
    _seed_quality_and_vision()
    _seed_agents()
    _seed_edge()
    _seed_events_actions()
    _seed_value_ledger()
    _seed_admin()
    _seed_kpis()
    _seed_graph_schema()
    snapshot_history()


def seed():
    """Bootstrap all demo workspaces (Harley, Tier 1, Tier 2, Lam, Hemlock)."""
    from . import tenants
    from .seed import hemlock, lam, platform_seed, tier1, tier2

    for wid in ("harley", "tier1", "tier2", "lam", "hemlock"):
        _STORES[wid] = empty_db()

    packs = [
        ("harley", seed_harley),
        ("tier1", tier1.seed),
        ("tier2", tier2.seed),
        ("lam", lam.seed),
        ("hemlock", hemlock.seed),
    ]
    for wid, seeder in packs:
        token = _workspace_id.set(wid)
        try:
            seeder()
            platform_seed.seed_platform_for_workspace(rich=(wid == "harley"))
            DB["workspace_meta"] = tenants.public_workspace(tenants.WORKSPACES[wid])
        finally:
            _workspace_id.reset(token)

    # Default active workspace for background sim until a request sets one
    _workspace_id.set("harley")


def snapshot_history():
    DB["history"].append({
        "at": now(),
        "stations": {
            sid: {"state": s["state"], "vin": s["current_vin"], "cycle": s["cycle_time_s"]}
            for sid, s in DB["stations"].items()
        },
        "kpis": {"oee": DB["kpis"].get("oee"), "actual_units": DB["kpis"].get("actual_units")},
    })
    if len(DB["history"]) > 500:
        DB["history"] = DB["history"][-500:]
