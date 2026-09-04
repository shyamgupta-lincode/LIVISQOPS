"""Detection plane — streaming analytics produces candidate events; agents do not read HF feeds."""

from __future__ import annotations

import math
import random
from typing import Any

from ..store import DB, new_id, now
from . import bus
from .semantic import ObservationContext, attach_context
from .stores import event_ledger, timeseries


def compute_features(samples: list[float], *, takt_s: float = 60.0, recipe_target: float | None = None) -> dict:
    """Window-level features — not an LLM read of raw streams."""
    if not samples:
        samples = [0.0]
    n = len(samples)
    mean = sum(samples) / n
    var = sum((x - mean) ** 2 for x in samples) / max(1, n - 1)
    slope = (samples[-1] - samples[0]) / max(1, n - 1)
    # Vibration bands (demo): low / mid energy proxy
    low = sum(abs(x) for x in samples[: n // 3]) / max(1, n // 3)
    mid = sum(abs(x) for x in samples[n // 3 : 2 * n // 3]) / max(1, n // 3)
    temp_rise = samples[-1] - samples[0]
    cycle_time = abs(samples[-1]) * 0.1 + takt_s * random.uniform(0.9, 1.15)
    ucl = (recipe_target or mean) + 3 * math.sqrt(max(var, 1e-6))
    lcl = (recipe_target or mean) - 3 * math.sqrt(max(var, 1e-6))
    cl_violation = samples[-1] > ucl or samples[-1] < lcl
    recipe_dev = abs(mean - recipe_target) if recipe_target is not None else abs(slope)
    # Multivariate anomaly (simplified z-score stack)
    anomaly = min(1.0, abs(slope) * 2 + (math.sqrt(var) / (abs(mean) + 1e-3)) + (0.3 if cl_violation else 0))
    change_point = abs(slope) > (math.sqrt(var) + 0.5)
    sensor_quality = 1.0 if all(math.isfinite(x) for x in samples) else 0.4
    return {
        "mean": round(mean, 4),
        "variance": round(var, 4),
        "slope": round(slope, 4),
        "vibration_low": round(low, 4),
        "vibration_mid": round(mid, 4),
        "temperature_rise": round(temp_rise, 4),
        "cycle_time_s": round(cycle_time, 2),
        "phase_duration_s": round(cycle_time * 0.35, 2),
        "control_limit_violation": cl_violation,
        "recipe_relative_deviation": round(recipe_dev, 4),
        "multivariate_anomaly_score": round(anomaly, 4),
        "change_point": change_point,
        "sensor_quality": round(sensor_quality, 3),
    }


def emit_candidate(
    *,
    station: dict,
    context: ObservationContext | dict,
    features: dict,
    reason: str,
    severity: str = "Major",
    freeze_seconds: int = 120,
) -> dict:
    """Rules / stats / ML produce a candidate — agents retrieve evidence later."""
    fw = timeseries.put_feature_window({
        "station_id": station.get("id"),
        "features": features,
        "context": context.to_dict() if isinstance(context, ObservationContext) else context,
    })
    cid = new_id("cand")
    candidate = {
        "id": cid,
        "status": "Open",
        "severity": severity,
        "reason": reason,
        "station_id": station.get("id"),
        "feature_window_id": fw["id"],
        "freeze_window_s": freeze_seconds,
        "retrieval_permissions": [
            "timeseries.window",
            "genealogy.comparable_runs",
            "knowledge.similar_rca",
            "quality.history",
            "maintenance.history",
        ],
        "detected_at": now(),
        "source": "detection_plane",
        "not_llm_on_raw_feeds": True,
    }
    attach_context(candidate, context)
    DB.setdefault("candidate_events", {})[cid] = candidate
    event_ledger.append("analytics.candidate.create", cid, {"reason": reason, "severity": severity})
    bus.publish(
        "analytics.candidate.event",
        {"candidate_id": cid, "reason": reason, "features": features},
        context=context,
        source_system="analytics://detection",
    )
    bus.publish(
        "analytics.feature.window",
        {"feature_window_id": fw["id"], "station_id": station.get("id"), "features": features},
        context=context,
        source_system="analytics://detection",
    )
    return candidate


def tick_station(station: dict, context: ObservationContext | dict, samples: list[float] | None = None) -> dict | None:
    """On simulator tick: maybe emit a candidate when anomaly crosses threshold."""
    samples = samples or [random.uniform(0.5, 1.5) for _ in range(24)]
    features = compute_features(samples, takt_s=float(station.get("takt_s") or 60))
    score = features["multivariate_anomaly_score"]
    if station.get("state") in ("Faulted", "Quality Hold") or score > 0.72 or features["control_limit_violation"]:
        reason = (
            f"{station.get('name')}: anomaly={score:.2f}"
            + (" · CL violation" if features["control_limit_violation"] else "")
            + (f" · state={station.get('state')}" if station.get("state") not in ("Running",) else "")
        )
        return emit_candidate(
            station=station,
            context=context,
            features=features,
            reason=reason,
            severity="Critical" if station.get("state") == "Faulted" or score > 0.9 else "Major",
        )
    return None


def list_candidates(*, status: str | None = None) -> list[dict]:
    rows = list((DB.get("candidate_events") or {}).values())
    if status:
        rows = [r for r in rows if r.get("status") == status]
    rows.sort(key=lambda r: r.get("detected_at") or "", reverse=True)
    return rows
