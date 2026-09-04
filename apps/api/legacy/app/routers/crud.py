"""
Generic CRUD for core LIVIS MES entities.

Each entity has list / get / create / update / delete, with audit trail on
mutations. Fields are validated lightly for the in-memory store.
"""

from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..store import DB, STATION_STATES, new_id, now

router = APIRouter(prefix="/api/entities", tags=["entities"])


def _audit(kind: str, actor: str, detail: str):
    aid = new_id("audit")
    DB["audit"][aid] = {
        "id": aid, "kind": kind, "actor": actor,
        "detail": detail, "at": now(), "source": "entity-manager",
    }
    return aid


# ---------------------------------------------------------------------------
# Entity specs
# ---------------------------------------------------------------------------

class EntitySpec:
    def __init__(
        self,
        key: str,
        label: str,
        collection: str,
        id_field: str = "id",
        id_prefix: str = "ent",
        list_fields: list[str] | None = None,
        create_defaults: Callable[[dict], dict] | None = None,
        validate: Callable[[dict, str | None], None] | None = None,
        searchable: list[str] | None = None,
    ):
        self.key = key
        self.label = label
        self.collection = collection
        self.id_field = id_field
        self.id_prefix = id_prefix
        self.list_fields = list_fields
        self.create_defaults = create_defaults
        self.validate = validate
        self.searchable = searchable or []


def _validate_station(data: dict, existing_id: str | None):
    if data.get("state") and data["state"] not in STATION_STATES:
        raise HTTPException(400, f"state must be one of {STATION_STATES}")
    if data.get("line_id") and data["line_id"] not in DB["lines"]:
        raise HTTPException(400, "line_id not found")


def _defaults_station(data: dict) -> dict:
    line_id = data.get("line_id") or next(iter(DB["lines"]))
    line = DB["lines"][line_id]
    return {
        "id": data.get("id") or new_id("st"),
        "line_id": line_id,
        "area_id": line["area_id"],
        "site_id": line["site_id"],
        "name": data.get("name") or "New Station",
        "position": data.get("position") or 99,
        "archetype": data.get("archetype") or "presence",
        "state": data.get("state") or "Offline",
        "state_since": now(),
        "cycle_time_s": float(data.get("cycle_time_s") or 60),
        "takt_s": line["takt_seconds"],
        "current_vin": None,
        "operator": data.get("operator") or "Unassigned",
        "health": {
            "availability": 0.95, "quality": 0.98, "performance": 0.92,
            "ai_confidence": 0.95, "operator_efficiency": 0.9, "safety": 1.0,
        },
    }


def _defaults_order(data: dict) -> dict:
    source = data.get("source") or "Manual"
    prefixes = {"SAP": "SAP", "ERP": "ERP", "APS": "APS", "WMS": "WMS", "Manual": "MAN"}
    prefix = prefixes.get(source, "EXT")
    return {
        "id": data.get("id") or f"WO-{new_id('ord')[-6:].upper()}",
        "source": source,
        "erp_ref": data.get("erp_ref") or f"{prefix}-{new_id('erp')[-6:].upper()}",
        "product": data.get("product") or "Harley-Davidson Motorcycle",
        "variant": data.get("variant") or "Street Glide Special",
        "color": data.get("color") or "Vivid Black",
        "qty": int(data.get("qty") or 12),
        "completed": int(data.get("completed") or 0),
        "status": data.get("status") or "Planned",
        "due": data.get("due") or now(),
        "line_id": data.get("line_id") or "line-touring-assembly-line",
        "released_at": now(),
        "created_by": data.get("created_by") or ("Jordan Hale" if source == "Manual" else "System sync"),
    }


def _defaults_user(data: dict) -> dict:
    return {
        "id": data.get("id") or new_id("user"),
        "name": data.get("name") or "New User",
        "role": data.get("role") or "Operator",
        "role_id": data.get("role_id") or "operator",
        "site": data.get("site") or "York Vehicle Operations",
        "skills": data.get("skills") or [],
        "sso": data.get("sso") or "OIDC (Entra)",
        "active": data.get("active", True),
    }


def _defaults_hold(data: dict) -> dict:
    return {
        "id": data.get("id") or new_id("hold"),
        "reason": data.get("reason") or "Manual hold",
        "defect_class": data.get("defect_class") or "Manual",
        "scope": data.get("scope") or "Manual scope",
        "units_estimated": int(data.get("units_estimated") or 1),
        "units_confirmed": int(data.get("units_confirmed") or 0),
        "applied_by": data.get("applied_by") or "Admin",
        "applied": now(),
        "status": data.get("status") or "Active",
        "integration": data.get("integration") or {
            "wms": "Pending", "erp": "Pending", "qms": "Pending",
        },
    }


def _defaults_edge(data: dict) -> dict:
    return {
        "id": data.get("id") or new_id("edge"),
        "name": data.get("name") or "New Edge Node",
        "area": data.get("area") or "General Assembly",
        "lines": data.get("lines") or [],
        "health": data.get("health") or "Healthy",
        "version": data.get("version") or "livis-edge 1.8.3",
        "k3s": "v1.31.2+k3s1",
        "gpu": data.get("gpu") or "None",
        "queue_depth": 0,
        "data_lag_s": 0.5,
        "storage_used_pct": 20,
        "clock": {"source": "NTP", "trust": 0.95},
        "secure_boot": True, "tpm": True,
        "cert_expiry_days": 180,
        "last_seen": now(),
        "mission_readiness": {"score": 90, "limiting_factors": []},
        "node_passport": {
            "signed": True, "issuer": "livis-central-ca",
            "capabilities": ["OPC UA client", "Workflow engine v2"],
            "semantic_mappings": 0,
            "fingerprint": new_id("fp")[-16:],
        },
    }


def _defaults_wi(data: dict) -> dict:
    steps_in = data.get("steps") or [
        {"title": "Scan VIN", "kind": "scan", "criteria": "Barcode must match"},
        {"title": "Confirm completion", "kind": "confirm", "criteria": "Operator acknowledgement"},
    ]
    steps = []
    for i, s in enumerate(steps_in):
        if isinstance(s, dict) and "seq" in s:
            steps.append(s)
        else:
            steps.append({
                "seq": i + 1,
                "title": s.get("title", f"Step {i+1}") if isinstance(s, dict) else str(s),
                "kind": s.get("kind", "manual") if isinstance(s, dict) else "manual",
                "criteria": s.get("criteria", "") if isinstance(s, dict) else "",
                "evidence_required": (s.get("kind") in ("scan", "vision", "tool")) if isinstance(s, dict) else False,
            })
    return {
        "id": data.get("id") or f"WI-{new_id('wi')[-8:].upper()}",
        "name": data.get("name") or "New Work Instruction",
        "station_id": data.get("station_id") or next(iter(DB["stations"])),
        "version": data.get("version") or "v1",
        "status": data.get("status") or "Draft",
        "effective": now(),
        "approved_by": data.get("approved_by") or "Pending",
        "steps": steps,
    }


def _defaults_model(data: dict) -> dict:
    slug = (data.get("slug") or data.get("name") or "new-model").lower().replace(" ", "-")
    return {
        "id": data.get("id") or f"model-{slug}",
        "name": data.get("name") or "New Vision Model",
        "slug": slug,
        "version": data.get("version") or "1.0",
        "station_id": data.get("station_id") or next(iter(DB["stations"])),
        "stage": data.get("stage") or "Bench",
        "architecture": data.get("architecture") or "YOLOv8-seg",
        "trained": now(),
        "fitness_passport": {
            "locked_test_metrics": {
                "critical_recall": 0.99, "false_reject_rate": 0.02, "f1": 0.96,
            },
            "segments": [],
            "cost_assumptions": {
                "escape_cost_usd": 1800, "false_reject_cost_usd": 42, "reinspect_cost_usd": 11,
            },
            "hardware_profile": "IPC-NVIDIA A2 · GigE 2×5MP",
            "approved_by": "Pending",
            "rollback_target": f"{slug}@0.9",
        },
        "drift": {
            "confidence_trend": [0.95] * 14,
            "input_shift_score": 0.05,
            "status": "Healthy",
        },
    }


def _defaults_defect(data: dict) -> dict:
    return {
        "id": data.get("id") or new_id("def"),
        "inspection_id": data.get("inspection_id") or new_id("insp"),
        "vin": data.get("vin"),
        "station_id": data.get("station_id") or next(iter(DB["stations"])),
        "class": data.get("class") or "Manual defect",
        "kind": data.get("kind") or "surface",
        "severity": data.get("severity") or "Major",
        "confidence": float(data.get("confidence") or 0.9),
        "detected": now(),
        "status": data.get("status") or "Open",
        "disposition": data.get("disposition"),
        "defect_dna": {
            "fingerprint": new_id("dna")[-16:],
            "similar_events": 0,
            "cross_line_matches": 0,
        },
        "repeat_rate_shift": 0.0,
    }


def _defaults_action(data: dict) -> dict:
    return {
        "id": data.get("id") or new_id("action"),
        "title": data.get("title") or "New action",
        "owner": data.get("owner") or "Unassigned",
        "priority": data.get("priority") or "P3",
        "due": data.get("due") or now(),
        "status": data.get("status") or "Open",
        "context": data.get("context") or "",
        "created": now(),
        "completion_evidence": None,
    }


SPECS: dict[str, EntitySpec] = {
    "stations": EntitySpec(
        "stations", "Stations", "stations", id_prefix="st",
        list_fields=["id", "name", "line_id", "area_id", "state", "archetype", "operator", "cycle_time_s", "takt_s"],
        create_defaults=_defaults_station, validate=_validate_station,
        searchable=["name", "state", "archetype", "operator"],
    ),
    "orders": EntitySpec(
        "orders", "Production Orders", "orders", id_prefix="wo",
        list_fields=["id", "source", "erp_ref", "product", "variant", "color", "qty", "completed", "status", "line_id"],
        create_defaults=_defaults_order,
        searchable=["id", "source", "erp_ref", "product", "variant", "status", "color"],
    ),
    "users": EntitySpec(
        "users", "Users", "users", id_prefix="user",
        list_fields=["id", "name", "role", "role_id", "site", "skills", "active", "sso"],
        create_defaults=_defaults_user,
        searchable=["name", "role", "role_id", "site"],
    ),
    "holds": EntitySpec(
        "holds", "Quality Holds", "holds", id_prefix="hold",
        list_fields=["id", "reason", "defect_class", "scope", "units_estimated", "units_confirmed", "status", "applied_by"],
        create_defaults=_defaults_hold,
        searchable=["reason", "defect_class", "scope", "status"],
    ),
    "edge_nodes": EntitySpec(
        "edge_nodes", "Edge Nodes", "edge_nodes", id_prefix="edge",
        list_fields=[
            "id", "name", "area", "station_id", "health", "version",
            "recipe_version", "edgeplus_ready", "gpu", "queue_depth",
        ],
        create_defaults=_defaults_edge,
        searchable=["name", "area", "health", "version", "station_id", "recipe_id"],
    ),
    "work_instructions": EntitySpec(
        "work_instructions", "Work Instructions", "work_instructions", id_prefix="wi",
        list_fields=["id", "name", "station_id", "version", "status", "approved_by"],
        create_defaults=_defaults_wi,
        searchable=["id", "name", "status", "station_id"],
    ),
    "models": EntitySpec(
        "models", "Vision Models", "models", id_prefix="model",
        list_fields=["id", "name", "slug", "version", "station_id", "stage", "architecture"],
        create_defaults=_defaults_model,
        searchable=["name", "slug", "stage", "architecture"],
    ),
    "defects": EntitySpec(
        "defects", "Defects", "defects", id_prefix="def",
        list_fields=["id", "class", "kind", "severity", "station_id", "vin", "status", "confidence", "disposition"],
        create_defaults=_defaults_defect,
        searchable=["class", "kind", "severity", "status", "vin"],
    ),
    "actions": EntitySpec(
        "actions", "Actions", "actions", id_prefix="action",
        list_fields=["id", "title", "owner", "priority", "status", "due", "context"],
        create_defaults=_defaults_action,
        searchable=["title", "owner", "priority", "status"],
    ),
}


class MutationBody(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)
    actor: str = "Admin"


def _coll(spec: EntitySpec) -> dict:
    return DB[spec.collection]


def _project(item: dict, fields: list[str] | None) -> dict:
    if not fields:
        return item
    return {k: item.get(k) for k in fields if k in item or k == "id"}


@router.get("")
def catalog():
    """Entity catalog for the Entity Manager UI."""
    return [
        {
            "key": s.key,
            "label": s.label,
            "count": len(_coll(s)),
            "fields": s.list_fields or [],
            "searchable": s.searchable,
            "id_field": s.id_field,
        }
        for s in SPECS.values()
    ]


def _enrich_edge_list_item(item: dict) -> dict:
    """Surface Edge+ recipe / context binding on Entity Manager rows."""
    out = dict(item)
    stored = (DB.get("edge_recipes") or {}).get(item.get("id"))
    if stored:
        out["recipe_id"] = stored.get("recipe_id") or out.get("recipe_id")
        out["recipe_version"] = stored.get("recipe_version") or out.get("recipe_version")
        out["edgeplus_ready"] = True
        st = stored.get("station") or {}
        out.setdefault("station_id", st.get("station_id") or out.get("station_id"))
    else:
        out.setdefault("edgeplus_ready", False)
        out.setdefault("recipe_version", None)
    return out


@router.get("/{entity}")
def list_entities(entity: str, q: str | None = None):
    spec = SPECS.get(entity)
    if not spec:
        raise HTTPException(404, f"unknown entity '{entity}'")
    items = list(_coll(spec).values())
    if entity == "edge_nodes":
        items = [_enrich_edge_list_item(it) for it in items]
    if q:
        ql = q.lower()
        items = [
            it for it in items
            if any(ql in str(it.get(f, "")).lower() for f in (spec.searchable or list(it.keys())))
        ]
    return {
        "entity": entity,
        "label": spec.label,
        "count": len(items),
        "fields": spec.list_fields,
        "items": [_project(it, spec.list_fields) for it in items],
    }


@router.get("/{entity}/schema")
def entity_schema(entity: str):
    """Field schema hints for the Entity Manager form builder."""
    spec = SPECS.get(entity)
    if not spec:
        raise HTTPException(404, f"unknown entity '{entity}'")
    schemas = {
        "stations": [
            {"name": "name", "label": "Name", "type": "text", "required": True},
            {"name": "line_id", "label": "Line", "type": "select", "options": list(DB["lines"].keys()), "required": True},
            {"name": "archetype", "label": "Archetype", "type": "select",
             "options": ["presence", "press", "surface", "weld", "process", "torque", "sequence", "leak", "eol"]},
            {"name": "state", "label": "State", "type": "select", "options": STATION_STATES},
            {"name": "operator", "label": "Operator", "type": "text"},
            {"name": "cycle_time_s", "label": "Cycle time (s)", "type": "number"},
            {"name": "position", "label": "Position", "type": "number"},
        ],
        "orders": [
            {"name": "id", "label": "Order ID", "type": "text"},
            {"name": "source", "label": "Source system", "type": "select",
             "options": ["SAP", "ERP", "APS", "WMS", "Manual"], "required": True},
            {"name": "erp_ref", "label": "External ref", "type": "text"},
            {"name": "product", "label": "Product", "type": "text", "required": True},
            {"name": "variant", "label": "Variant", "type": "text", "required": True},
            {"name": "color", "label": "Color", "type": "text"},
            {"name": "qty", "label": "Quantity", "type": "number", "required": True},
            {"name": "completed", "label": "Completed", "type": "number"},
            {"name": "status", "label": "Status", "type": "select",
             "options": ["Planned", "Released", "Completed", "On Hold"]},
            {"name": "line_id", "label": "Line", "type": "select", "options": list(DB["lines"].keys())},
        ],
        "users": [
            {"name": "name", "label": "Name", "type": "text", "required": True},
            {"name": "role", "label": "Role", "type": "text", "required": True},
            {"name": "role_id", "label": "Role ID", "type": "select",
             "options": ["plant-manager", "area-manager", "supervisor", "operator", "quality",
                         "mfg-engineer", "maintenance", "ml-engineer", "ot-engineer", "it-admin"]},
            {"name": "site", "label": "Site", "type": "text"},
            {"name": "active", "label": "Active", "type": "boolean"},
        ],
        "holds": [
            {"name": "reason", "label": "Reason", "type": "text", "required": True},
            {"name": "defect_class", "label": "Defect class", "type": "text"},
            {"name": "scope", "label": "Scope", "type": "text", "required": True},
            {"name": "units_estimated", "label": "Units estimated", "type": "number"},
            {"name": "status", "label": "Status", "type": "select",
             "options": ["Active", "Released", "Closed"]},
            {"name": "applied_by", "label": "Applied by", "type": "text"},
        ],
        "edge_nodes": [
            {"name": "name", "label": "Name", "type": "text", "required": True},
            {"name": "area", "label": "Area", "type": "text"},
            {"name": "health", "label": "Health", "type": "select",
             "options": ["Healthy", "Degraded", "Offline"]},
            {"name": "gpu", "label": "GPU", "type": "select", "options": ["NVIDIA A2", "None"]},
            {"name": "version", "label": "Version", "type": "text"},
        ],
        "work_instructions": [
            {"name": "id", "label": "Instruction ID", "type": "text"},
            {"name": "name", "label": "Name", "type": "text", "required": True},
            {"name": "station_id", "label": "Station", "type": "select", "options": list(DB["stations"].keys())},
            {"name": "version", "label": "Version", "type": "text"},
            {"name": "status", "label": "Status", "type": "select",
             "options": ["Draft", "In Review", "Approved", "Deployed", "Retired"]},
            {"name": "approved_by", "label": "Approved by", "type": "text"},
        ],
        "models": [
            {"name": "name", "label": "Name", "type": "text", "required": True},
            {"name": "slug", "label": "Slug", "type": "text"},
            {"name": "version", "label": "Version", "type": "text"},
            {"name": "station_id", "label": "Station", "type": "select", "options": list(DB["stations"].keys())},
            {"name": "stage", "label": "Deployment ring", "type": "select",
             "options": ["Bench", "Replay", "Shadow", "Assisted", "Canary", "Production"]},
            {"name": "architecture", "label": "Architecture", "type": "text"},
        ],
        "defects": [
            {"name": "class", "label": "Defect class", "type": "text", "required": True},
            {"name": "kind", "label": "Kind", "type": "select",
             "options": ["surface", "sequence", "presence", "weld", "process"]},
            {"name": "severity", "label": "Severity", "type": "select",
             "options": ["Critical", "Major", "Minor"]},
            {"name": "station_id", "label": "Station", "type": "select", "options": list(DB["stations"].keys())},
            {"name": "vin", "label": "VIN", "type": "text"},
            {"name": "status", "label": "Status", "type": "select",
             "options": ["Open", "Dispositioned", "Contained"]},
            {"name": "confidence", "label": "Confidence", "type": "number"},
            {"name": "disposition", "label": "Disposition", "type": "select",
             "options": ["", "Accept", "Repair", "Reject", "Re-inspect", "Escalate"]},
        ],
        "actions": [
            {"name": "title", "label": "Title", "type": "text", "required": True},
            {"name": "owner", "label": "Owner", "type": "text", "required": True},
            {"name": "priority", "label": "Priority", "type": "select",
             "options": ["P1", "P2", "P3", "P4"]},
            {"name": "status", "label": "Status", "type": "select",
             "options": ["Open", "In Progress", "Completed"]},
            {"name": "context", "label": "Context", "type": "textarea"},
        ],
    }
    return {
        "entity": entity,
        "label": spec.label,
        "fields": schemas.get(entity, [
            {"name": f, "label": f.replace("_", " ").title(), "type": "text"}
            for f in (spec.list_fields or []) if f != "id"
        ]),
    }


@router.get("/{entity}/{item_id}")
def get_entity(entity: str, item_id: str):
    spec = SPECS.get(entity)
    if not spec:
        raise HTTPException(404, f"unknown entity '{entity}'")
    item = _coll(spec).get(item_id)
    if not item:
        raise HTTPException(404, "not found")
    if entity == "edge_nodes":
        return _enrich_edge_list_item(item)
    return item


@router.post("/{entity}")
def create_entity(entity: str, body: MutationBody):
    spec = SPECS.get(entity)
    if not spec:
        raise HTTPException(404, f"unknown entity '{entity}'")
    data = dict(body.data)

    # Edge Nodes: when station_id is present, materialize from context-graph devices
    # (same path as POST /api/edge/nodes — preferred by Entity Manager UI).
    if entity == "edge_nodes" and data.get("station_id"):
        from ..edge_recipe import materialize_edge_node

        try:
            result = materialize_edge_node(
                station_id=data["station_id"],
                device_id=data.get("device_id") or None,
                node_id=data.get("id") or data.get("node_id") or None,
                name=data.get("name") or None,
                protocols=data.get("protocols") or None,
                gpu=data.get("gpu") or None,
                actor=body.actor,
            )
        except KeyError as e:
            raise HTTPException(404, str(e)) from e
        except ValueError as e:
            raise HTTPException(409, str(e)) from e
        return result["node"]

    if spec.create_defaults:
        item = spec.create_defaults(data)
        for k, v in data.items():
            if v is None or v == "":
                continue
            item[k] = v
    else:
        item = {**data, spec.id_field: data.get(spec.id_field) or new_id(spec.id_prefix)}
    if spec.validate:
        spec.validate(item, None)
    eid = item[spec.id_field]
    if eid in _coll(spec):
        raise HTTPException(409, f"{eid} already exists")
    _coll(spec)[eid] = item
    _audit(f"{entity}.create", body.actor, f"Created {spec.label} record {eid}")
    return item


@router.put("/{entity}/{item_id}")
def update_entity(entity: str, item_id: str, body: MutationBody):
    spec = SPECS.get(entity)
    if not spec:
        raise HTTPException(404, f"unknown entity '{entity}'")
    item = _coll(spec).get(item_id)
    if not item:
        raise HTTPException(404, "not found")
    updated = {**item, **body.data, spec.id_field: item_id}
    if entity == "stations" and "state" in body.data:
        updated["state_since"] = now()
    if spec.validate:
        spec.validate(updated, item_id)
    _coll(spec)[item_id] = updated
    _audit(f"{entity}.update", body.actor, f"Updated {entity} {item_id}: {', '.join(body.data.keys())}")
    return updated


@router.delete("/{entity}/{item_id}")
def delete_entity(entity: str, item_id: str, actor: str = "Admin"):
    spec = SPECS.get(entity)
    if not spec:
        raise HTTPException(404, f"unknown entity '{entity}'")
    if item_id not in _coll(spec):
        raise HTTPException(404, "not found")
    del _coll(spec)[item_id]
    _audit(f"{entity}.delete", actor, f"Deleted {entity} {item_id}")
    return {"ok": True, "deleted": item_id}

