"""Relational master data facade — assets, products, specs, users, roles, routing."""

from __future__ import annotations

from typing import Any

from ...store import DB, now


def summary() -> dict:
    n = (
        len(DB.get("sites") or {})
        + len(DB.get("stations") or {})
        + len(DB.get("orders") or {})
        + len(DB.get("users") or {})
        + len(DB.get("work_instructions") or {})
    )
    return {
        "id": "master",
        "name": "Relational master data",
        "responsibility": "Assets, products, specifications, users, roles and routing",
        "immutable": False,
        "volume": n,
        "last_write": now(),
        "keys": ["sites", "areas", "lines", "stations", "devices", "orders", "users", "work_instructions"],
    }


def overview() -> dict[str, Any]:
    return {
        "sites": len(DB.get("sites") or {}),
        "areas": len(DB.get("areas") or {}),
        "lines": len(DB.get("lines") or {}),
        "stations": len(DB.get("stations") or {}),
        "devices": len(DB.get("devices") or {}),
        "orders": len(DB.get("orders") or {}),
        "vins": len(DB.get("vins") or {}),
        "users": len(DB.get("users") or {}),
        "work_instructions": len(DB.get("work_instructions") or {}),
    }


def sample_query() -> dict[str, Any]:
    site = next(iter((DB.get("sites") or {}).values()), None)
    return {"counts": overview(), "site": site}
