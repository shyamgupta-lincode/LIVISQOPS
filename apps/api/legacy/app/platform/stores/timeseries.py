"""Time-series / historian plane — high-frequency measurements, alarms, features."""

from __future__ import annotations

from typing import Any

from ...store import DB, new_id, now


def summary() -> dict:
    tag_series = DB.get("tag_series") or {}
    features = DB.get("feature_windows") or {}
    samples = sum(len(v) for d in tag_series.values() for v in d.values()) if tag_series else 0
    return {
        "id": "timeseries",
        "name": "Time-series / historian",
        "responsibility": "High-frequency measurements, alarms and derived features",
        "immutable": False,
        "volume": samples + len(features),
        "last_write": now(),
        "keys": ["tag_series", "feature_windows", "edge_live"],
    }


def list_features(limit: int = 50) -> list[dict]:
    fw = DB.get("feature_windows") or {}
    rows = list(fw.values())
    rows.sort(key=lambda r: r.get("captured_at") or "", reverse=True)
    return rows[:limit]


def put_feature_window(data: dict) -> dict:
    fw = DB.setdefault("feature_windows", {})
    fid = data.get("id") or new_id("fw")
    row = {**data, "id": fid, "captured_at": data.get("captured_at") or now()}
    fw[fid] = row
    return row


def sample_query() -> dict[str, Any]:
    features = list_features(5)
    return {"feature_windows_sample": features, "tag_device_count": len(DB.get("tag_series") or {})}
