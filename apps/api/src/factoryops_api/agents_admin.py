"""Admin agent definitions: create/list, read-scoped entity refs, OT deny."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from factoryops_domain.ids import new_id

from . import models
from .audit import audit

# System ledger entries (MockAgentProvider / agent-worker skills) — not DB rows.
SYSTEM_AGENTS: list[dict[str, Any]] = [
    {
        "id": "rca-investigator",
        "name": "RCA Investigator",
        "description": "Evidence-backed RCA hypotheses; drafts only.",
        "agent_type": "rca_investigator",
        "mode": "read + draft",
        "ot_write": False,
        "status": "Active",
        "source": "system",
        "prompt_key": "rca-investigator",
        "prompt_version": "v1",
        "allowed_tools": [
            "read_event_context",
            "read_timeseries",
            "read_baselines",
            "search_similar_anomalies",
            "read_genealogy",
            "read_inspections",
            "read_maintenance",
            "read_approved_cases",
            "run_approved_stats",
        ],
        "entity_refs": [],
        "autonomy_level": "L1",
        "budgets": {"max_tokens": 12000, "max_tool_calls": 24, "timeout_s": 90},
    },
    {
        "id": "knowledge-curator",
        "name": "Knowledge Curator",
        "description": "Draft knowledge proposals after human-confirmed RCA.",
        "agent_type": "knowledge_curator",
        "mode": "propose promotion",
        "ot_write": False,
        "status": "Active",
        "source": "system",
        "prompt_key": "knowledge-curator",
        "prompt_version": "v1",
        "allowed_tools": [
            "read_confirmed_case",
            "search_approved_knowledge",
            "draft_knowledge_proposal",
        ],
        "entity_refs": [],
        "autonomy_level": "L1",
        "budgets": {"max_tokens": 8000, "max_tool_calls": 16, "timeout_s": 60},
    },
]

PROMPT_SKILLS = [
    {"key": "rca-investigator", "version": "v1", "label": "RCA Investigator v1"},
    {"key": "knowledge-curator", "version": "v1", "label": "Knowledge Curator v1"},
    {"key": "custom", "version": "v1", "label": "Custom (inline description)"},
]

AGENT_TYPES = (
    ("rca_investigator", "RCA Investigator"),
    ("knowledge_curator", "Knowledge Curator"),
    ("custom", "Custom"),
)

AUTONOMY_LEVELS = ("L0", "L1", "L2")  # retrieve / recommend / draft — never auto-promote

# Read-scoped tools agents may bind. OT / safety / disposition writes are denied.
ALLOWED_TOOL_CATALOG = [
    "read_event_context",
    "read_timeseries",
    "read_baselines",
    "search_similar_anomalies",
    "read_genealogy",
    "read_inspections",
    "read_maintenance",
    "read_approved_cases",
    "read_graph_entities",
    "read_data_plane",
    "run_approved_stats",
    "draft_rca_analysis",
    "draft_knowledge_proposal",
    "search_events",
]

DENIED_TOOLS = frozenset({
    "write_plc",
    "set_recipe",
    "release_unit",
    "close_event",
    "write_controller",
    "disposition_product",
    "scrap_unit",
    "approve_capa",
    "promote_knowledge",
    "promote_prompt",
    "promote_model",
    "dispatch_maintenance",
    "change_permissions",
})

REF_KINDS = frozenset({
    "graph_node",
    "data_plane",
    "topic",
    "asset",
    "quality_event",
    "signal",
    "binding",
})


def serialize_definition(row: models.AgentDefinition) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description or "",
        "agent_type": row.agent_type,
        "mode": row.mode,
        "ot_write": False,
        "status": row.status,
        "source": row.source or "custom",
        "prompt_key": row.prompt_key,
        "prompt_version": row.prompt_version,
        "allowed_tools": list(row.allowed_tools or []),
        "entity_refs": list(row.entity_refs or []),
        "autonomy_level": row.autonomy_level,
        "budgets": dict(row.budgets or {}),
        "created_by": row.created_by,
        "version": row.version,
        "tenant_id": row.tenant_id,
        "site_id": row.site_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _sanitize_tools(tools: Optional[list[str]]) -> list[str]:
    raw = [t.strip() for t in (tools or []) if t and str(t).strip()]
    cleaned: list[str] = []
    seen: set[str] = set()
    for t in raw:
        if t in DENIED_TOOLS:
            raise HTTPException(400, detail=f"tool '{t}' is denied (OT/safety/write)")
        if t not in ALLOWED_TOOL_CATALOG:
            raise HTTPException(400, detail=f"tool '{t}' is not on the allowlist")
        if t not in seen:
            seen.add(t)
            cleaned.append(t)
    if not cleaned:
        cleaned = ["read_event_context", "read_graph_entities", "read_data_plane"]
    return cleaned


def _sanitize_entity_refs(refs: Optional[list[dict[str, Any]]], catalog_ids: set[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in refs or []:
        if not isinstance(r, dict):
            continue
        rid = str(r.get("id") or "").strip()
        kind = str(r.get("kind") or "").strip()
        label = str(r.get("label") or rid).strip()
        if not rid or kind not in REF_KINDS:
            continue
        if catalog_ids and rid not in catalog_ids:
            raise HTTPException(400, detail=f"unknown entity reference '{rid}'")
        if rid in seen:
            continue
        seen.add(rid)
        out.append({"id": rid, "kind": kind, "label": label, "scope": "read"})
    return out


def build_reference_catalog(db: Session, site_id: Optional[str] = None) -> dict[str, Any]:
    """Named entities agents may reference (read scope): graph, data planes, domain."""
    items: list[dict[str, Any]] = []

    q = db.query(models.EntityNode).order_by(models.EntityNode.kind, models.EntityNode.label).limit(400)
    for n in q.all():
        items.append({
            "id": n.id,
            "kind": "graph_node",
            "label": f"{n.label} ({n.kind})",
            "meta": {"node_kind": n.kind},
        })

    # Graph bindings (protocol / topic style) from edge provenance when present
    for e in db.query(models.EntityEdge).limit(200).all():
        link = (e.provenance or {}).get("link") or {}
        if not link:
            continue
        bid = f"binding:{e.id}"
        label = link.get("topic") or link.get("endpoint") or e.rel_type
        items.append({
            "id": bid,
            "kind": "binding",
            "label": f"{label} ({link.get('protocol') or e.rel_type})",
            "meta": link,
        })

    planes = [
        {"id": "plane:timeseries", "kind": "data_plane", "label": "Time-series / features (ClickHouse)"},
        {"id": "plane:ledger", "kind": "data_plane", "label": "Operational ledger (Postgres)"},
        {"id": "plane:lakehouse", "kind": "data_plane", "label": "Raw archive (MinIO)"},
        {"id": "plane:knowledge", "kind": "data_plane", "label": "Knowledge + vectors (pgvector)"},
        {"id": "plane:backbone", "kind": "data_plane", "label": "Event backbone (Redpanda)"},
    ]
    items.extend(planes)

    topics = [
        "telemetry.raw",
        "anomalies.detected",
        "quality.events",
        "agent.requests",
        "knowledge.proposals",
        "telemetry.raw.dlq",
    ]
    for t in topics:
        items.append({"id": f"topic:{t}", "kind": "topic", "label": t, "meta": {"topic": t}})

    aq = db.query(models.Asset).limit(80)
    for a in aq.all():
        items.append({
            "id": a.id,
            "kind": "asset",
            "label": a.name,
            "meta": {"asset_type": a.asset_type},
        })

    qeq = db.query(models.QualityEvent).order_by(models.QualityEvent.opened_at.desc())
    if site_id:
        qeq = qeq.filter(models.QualityEvent.site_id == site_id)
    for qe in qeq.limit(40).all():
        items.append({
            "id": qe.id,
            "kind": "quality_event",
            "label": f"{qe.characteristic[:60]} [{qe.status}]",
            "meta": {"status": qe.status, "severity": qe.severity},
        })

    sigs = (
        db.query(models.SignalSample.signal, models.SignalSample.asset_id)
        .distinct()
        .limit(80)
        .all()
    )
    for signal, asset_id in sigs:
        sid = f"signal:{asset_id}:{signal}"
        items.append({
            "id": sid,
            "kind": "signal",
            "label": f"{signal} @ {asset_id[:8]}…",
            "meta": {"signal": signal, "asset_id": asset_id},
        })

    return {
        "items": items,
        "prompt_skills": PROMPT_SKILLS,
        "agent_types": [{"id": i, "label": l} for i, l in AGENT_TYPES],
        "autonomy_levels": list(AUTONOMY_LEVELS),
        "allowed_tools": list(ALLOWED_TOOL_CATALOG),
        "denied_tools": sorted(DENIED_TOOLS),
        "notes": (
            "Entity references are read-scoped. Agents cannot write PLC/controller/safety/"
            "recipe values or auto-promote. Status starts as Draft; humans promote."
        ),
    }


def list_agents(db: Session, tenant_id: Optional[str] = None) -> list[dict[str, Any]]:
    custom_q = db.query(models.AgentDefinition).order_by(models.AgentDefinition.created_at.desc())
    if tenant_id:
        custom_q = custom_q.filter(models.AgentDefinition.tenant_id == tenant_id)
    custom = [serialize_definition(r) for r in custom_q.all()]
    return [*SYSTEM_AGENTS, *custom]


def create_agent(
    db: Session,
    *,
    principal,
    body: dict[str, Any],
    tenant_id: str,
) -> dict[str, Any]:
    name = (body.get("name") or "").strip()
    if len(name) < 2:
        raise HTTPException(400, detail="name is required (min 2 chars)")
    description = (body.get("description") or "").strip()
    agent_type = (body.get("agent_type") or "custom").strip()
    if agent_type not in {t[0] for t in AGENT_TYPES}:
        raise HTTPException(400, detail="invalid agent_type")

    autonomy = (body.get("autonomy_level") or "L1").strip()
    if autonomy not in AUTONOMY_LEVELS:
        raise HTTPException(400, detail="autonomy_level must be L0, L1, or L2 (propose only)")

    prompt_key = (body.get("prompt_key") or "custom").strip()
    prompt_version = (body.get("prompt_version") or "v1").strip().lstrip("v")
    if prompt_version and not prompt_version.startswith("v"):
        prompt_version = f"v{prompt_version}"
    known_prompts = {p["key"] for p in PROMPT_SKILLS}
    if prompt_key not in known_prompts:
        raise HTTPException(400, detail="unknown prompt_key")

    catalog = build_reference_catalog(db, site_id=getattr(principal, "site_id", None))
    catalog_ids = {i["id"] for i in catalog["items"]}
    tools = _sanitize_tools(body.get("allowed_tools"))
    entity_refs = _sanitize_entity_refs(body.get("entity_refs"), catalog_ids)

    budgets_in = body.get("budgets") or {}
    budgets = {
        "max_tokens": int(budgets_in.get("max_tokens") or 8000),
        "max_tool_calls": int(budgets_in.get("max_tool_calls") or 20),
        "timeout_s": int(budgets_in.get("timeout_s") or 60),
    }
    budgets["max_tokens"] = max(500, min(budgets["max_tokens"], 32000))
    budgets["max_tool_calls"] = max(1, min(budgets["max_tool_calls"], 50))
    budgets["timeout_s"] = max(5, min(budgets["timeout_s"], 300))

    # Status always Draft on create — never claim production promotion.
    row = models.AgentDefinition(
        id=new_id(),
        tenant_id=tenant_id,
        site_id=getattr(principal, "site_id", None),
        name=name,
        description=description,
        agent_type=agent_type,
        prompt_key=prompt_key,
        prompt_version=prompt_version,
        allowed_tools=tools,
        entity_refs=entity_refs,
        autonomy_level=autonomy,
        budgets=budgets,
        status="Draft",
        ot_write=False,
        mode="read + draft",
        source="custom",
        created_by=getattr(principal, "email", None) or getattr(principal, "name", None),
        version=1,
    )
    db.add(row)
    audit(
        db,
        actor=row.created_by or "unknown",
        action="agent.create",
        target_type="agent_definition",
        target_id=row.id,
        site_id=row.site_id,
        after=serialize_definition(row),
    )
    db.commit()
    db.refresh(row)
    return serialize_definition(row)


def seed_example_agent(db: Session, *, tenant_id: str, site_id: str, asset_id: str) -> Optional[str]:
    """Idempotent draft custom agent with graph + plane refs for the demo plant."""
    stable_id = "bbbbbbb1-bbbb-7bbb-8bbb-bbbbbbbbbb01"
    existing = db.get(models.AgentDefinition, stable_id)
    if existing:
        return existing.id

    # Prefer a real graph node for the bearing asset when present
    node = db.get(models.EntityNode, asset_id)
    refs = [
        {
            "id": asset_id if node else asset_id,
            "kind": "graph_node" if node else "asset",
            "label": (node.label if node else "Spindle Bearing Station"),
            "scope": "read",
        },
        {"id": "plane:timeseries", "kind": "data_plane", "label": "Time-series / features (ClickHouse)", "scope": "read"},
        {"id": "topic:anomalies.detected", "kind": "topic", "label": "anomalies.detected", "scope": "read"},
    ]
    row = models.AgentDefinition(
        id=stable_id,
        tenant_id=tenant_id,
        site_id=site_id,
        name="Bearing Wear Scout",
        description=(
            "Draft custom agent scoped to the spindle bearing asset, anomaly topic, "
            "and timeseries plane. Propose-only; humans promote."
        ),
        agent_type="rca_investigator",
        prompt_key="rca-investigator",
        prompt_version="v1",
        allowed_tools=[
            "read_event_context",
            "read_timeseries",
            "read_graph_entities",
            "read_data_plane",
            "search_similar_anomalies",
            "draft_rca_analysis",
        ],
        entity_refs=refs,
        autonomy_level="L1",
        budgets={"max_tokens": 8000, "max_tool_calls": 20, "timeout_s": 60},
        status="Draft",
        ot_write=False,
        mode="read + draft",
        source="custom",
        created_by="seed",
        version=1,
    )
    db.add(row)
    return row.id
