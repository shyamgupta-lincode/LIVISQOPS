"""Operational event ledger — append-only quality events, assignments, approvals, audit."""

from __future__ import annotations

from typing import Any

from ...store import DB, new_id, now


def summary() -> dict:
    ledger = DB.get("event_ledger") or []
    return {
        "id": "ledger",
        "name": "Operational event ledger",
        "responsibility": "Quality events, assignments, approvals, actions and audit history",
        "immutable": True,
        "volume": len(ledger),
        "last_write": ledger[-1]["at"] if ledger else None,
        "keys": ["event_ledger", "quality_events", "audit", "actions"],
    }


def append(kind: str, entity_id: str, detail: dict, *, actor: str = "system") -> dict:
    """Append-only write. Corrections create new versions rather than silently replacing history."""
    ledger = DB.setdefault("event_ledger", [])
    entry = {
        "id": new_id("led"),
        "kind": kind,
        "entity_id": entity_id,
        "detail": detail,
        "actor": actor,
        "at": now(),
        "version": len([e for e in ledger if e.get("entity_id") == entity_id]) + 1,
    }
    ledger.append(entry)
    if len(ledger) > 5000:
        DB["event_ledger"] = ledger[-5000:]
    return entry


def list_entries(*, kind: str | None = None, entity_id: str | None = None, limit: int = 100) -> list[dict]:
    rows = list(DB.get("event_ledger") or [])
    if kind:
        rows = [r for r in rows if r.get("kind") == kind]
    if entity_id:
        rows = [r for r in rows if r.get("entity_id") == entity_id]
    return rows[-limit:]


def sample_query() -> dict[str, Any]:
    return {"recent": list_entries(limit=8)}
