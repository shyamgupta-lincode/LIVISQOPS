"""Shared manufacturing ObservationContext (ISA-95 aligned identifiers)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


SCHEMA_VERSION = "ctx-1.0"


class ObservationContext(BaseModel):
    """Every observation carries enough identifiers to reconstruct what was happening."""

    # ISA-95 hierarchy
    enterprise: str | None = None
    plant_id: str | None = None
    plant_name: str | None = None
    area_id: str | None = None
    area_name: str | None = None
    line_id: str | None = None
    line_name: str | None = None
    cell_id: str | None = None  # work cell / station
    cell_name: str | None = None
    equipment_id: str | None = None
    equipment_name: str | None = None
    component_id: str | None = None

    # Product / process
    product: str | None = None
    product_revision: str | None = None
    recipe: str | None = None
    routing_operation: str | None = None

    # Identity
    production_order_id: str | None = None
    lot: str | None = None
    batch: str | None = None
    serial: str | None = None  # VIN / serial / unit id

    # Machine state
    machine_mode: str | None = None
    cycle_id: str | None = None
    process_phase: str | None = None

    # Time triad
    event_time: str | None = None
    source_time: str | None = None
    ingestion_time: str | None = None

    # Genealogy / tooling
    material_genealogy: list[dict[str, Any]] = Field(default_factory=list)
    tooling_id: str | None = None
    tooling_state: str | None = None
    calibration_state: str | None = None

    # Workforce (role, not unnecessary PII)
    shift: str | None = None
    crew: str | None = None
    authorized_role: str | None = None

    # Provenance
    schema_version: str = SCHEMA_VERSION
    source_system_ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(exclude_none=False)


ISA95_LEVEL_ALIASES = [
    {"id": "enterprise", "label": "Enterprise", "isa95": "Level 4", "entity": "enterprise", "required": False},
    {"id": "facility", "label": "Site / Facility", "isa95": "Level 3–4", "entity": "site", "required": True},
    {"id": "area", "label": "Area", "isa95": "Level 3", "entity": "area", "required": True},
    {"id": "line", "label": "Line / Process segment", "isa95": "Level 3", "entity": "line", "required": True},
    {"id": "station", "label": "Work cell / Station", "isa95": "Level 2", "entity": "station", "required": True},
    {"id": "device", "label": "Equipment / Device", "isa95": "Level 1–2", "entity": "device", "required": False},
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_context_from_station(
    station: dict,
    *,
    site: dict | None = None,
    area: dict | None = None,
    line: dict | None = None,
    device: dict | None = None,
    order: dict | None = None,
    vin: dict | None = None,
    role: str | None = None,
    source_system_ref: str | None = None,
    process_phase: str | None = None,
    recipe: str | None = None,
) -> ObservationContext:
    """Assemble an ObservationContext from seeded topology + production entities."""
    t = utc_now()
    genealogy = []
    if vin and vin.get("components"):
        genealogy = [
            {"part": c.get("part"), "serial": c.get("serial"), "lot": c.get("lot")}
            for c in vin["components"][:8]
        ]
    return ObservationContext(
        enterprise=(site or {}).get("oem") or "Harley-Davidson",
        plant_id=(site or {}).get("id"),
        plant_name=(site or {}).get("name"),
        area_id=(area or {}).get("id") or station.get("area_id"),
        area_name=(area or {}).get("name"),
        line_id=(line or {}).get("id") or station.get("line_id"),
        line_name=(line or {}).get("name"),
        cell_id=station.get("id"),
        cell_name=station.get("name"),
        equipment_id=(device or {}).get("id"),
        equipment_name=(device or {}).get("name"),
        product=(order or {}).get("product") or (vin or {}).get("variant"),
        product_revision=(order or {}).get("variant") or (vin or {}).get("variant"),
        recipe=recipe or (order or {}).get("variant"),
        routing_operation=station.get("name"),
        production_order_id=(order or {}).get("id") or (vin or {}).get("order_id"),
        lot=(genealogy[0].get("lot") if genealogy else None),
        serial=(vin or {}).get("vin"),
        machine_mode=station.get("state"),
        cycle_id=f"cyc-{station.get('id', 'x')[-6:]}",
        process_phase=process_phase or "produce",
        event_time=t,
        source_time=t,
        ingestion_time=t,
        material_genealogy=genealogy,
        tooling_id=station.get("archetype"),
        tooling_state="in_spec",
        calibration_state="current",
        shift=(site or {}).get("shift") or "Shift A",
        crew="Crew A",
        authorized_role=role or "operator",
        source_system_ref=source_system_ref or "mes://livis-central",
    )


def attach_context(entity: dict, ctx: ObservationContext | dict) -> dict:
    """Stamp an entity with context (mutates and returns entity)."""
    data = ctx.to_dict() if isinstance(ctx, ObservationContext) else dict(ctx)
    entity["context"] = data
    entity["schema_version"] = data.get("schema_version", SCHEMA_VERSION)
    return entity
