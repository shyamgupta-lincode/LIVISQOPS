"""Lakehouse / object store — immutable raw envelopes and versioned analytical datasets."""

from __future__ import annotations

from typing import Any

from ...store import DB, new_id, now


def summary() -> dict:
    raw = DB.get("lakehouse_raw") or []
    datasets = DB.get("lakehouse_datasets") or {}
    return {
        "id": "lakehouse",
        "name": "Lakehouse / object store",
        "responsibility": "Immutable raw data and versioned analytical datasets",
        "immutable": True,
        "volume": len(raw) + len(datasets),
        "last_write": raw[-1]["ingested_at"] if raw else None,
        "keys": ["lakehouse_raw", "lakehouse_datasets"],
    }


def append_raw(envelope: dict) -> dict:
    """Append-only raw zone — never mutate prior envelopes."""
    raw = DB.setdefault("lakehouse_raw", [])
    row = {
        "id": new_id("lh"),
        "event_id": envelope.get("event_id"),
        "topic": envelope.get("topic"),
        "ingested_at": envelope.get("ingested_at") or now(),
        "envelope": envelope,
    }
    raw.append(row)
    if len(raw) > 3000:
        DB["lakehouse_raw"] = raw[-3000:]
    return row


def put_dataset_version(name: str, schema: dict, rows_meta: dict, *, actor: str = "system") -> dict:
    """Versioned analytical dataset — new version, never overwrite in place."""
    datasets = DB.setdefault("lakehouse_datasets", {})
    versions = datasets.setdefault(name, [])
    ver = len(versions) + 1
    entry = {
        "id": new_id("ds"),
        "name": name,
        "version": ver,
        "schema": schema,
        "meta": rows_meta,
        "created_at": now(),
        "created_by": actor,
        "immutable": True,
    }
    versions.append(entry)
    return entry


def list_raw(limit: int = 20) -> list[dict]:
    return list(DB.get("lakehouse_raw") or [])[-limit:]


def list_datasets() -> list[dict]:
    out = []
    for name, versions in (DB.get("lakehouse_datasets") or {}).items():
        if versions:
            latest = versions[-1]
            out.append({"name": name, "latest_version": latest["version"], "latest": latest})
    return out


def sample_query() -> dict[str, Any]:
    return {"raw_tail": list_raw(5), "datasets": list_datasets()}
