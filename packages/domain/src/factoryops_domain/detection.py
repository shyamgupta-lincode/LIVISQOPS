from __future__ import annotations
import math
from statistics import mean, pstdev

def compute_features(samples: list[float], *, takt_s: float = 60.0, recipe_target: float | None = None) -> dict:
    if not samples:
        return {"n": 0, "mean": None, "std": None, "min": None, "max": None, "slope": None, "ewma": None, "robust_z": None, "spec_distance": None}
    m = mean(samples)
    sd = pstdev(samples) if len(samples) > 1 else 0.0
    # slope via simple least squares on index
    n = len(samples)
    xbar = (n - 1) / 2
    num = sum((i - xbar) * (v - m) for i, v in enumerate(samples))
    den = sum((i - xbar) ** 2 for i in range(n)) or 1.0
    slope = num / den
    ewma = samples[0]
    a = 0.3
    for v in samples[1:]:
        ewma = a * v + (1 - a) * ewma
    # robust z using median/MAD approx
    med = sorted(samples)[n // 2]
    mad = mean(abs(v - med) for v in samples) or 1e-6
    robust_z = (samples[-1] - med) / (1.4826 * mad)
    spec_distance = None if recipe_target is None else (m - recipe_target)
    return {
        "n": n,
        "mean": m,
        "std": sd,
        "min": min(samples),
        "max": max(samples),
        "slope": slope,
        "ewma": ewma,
        "robust_z": robust_z,
        "cycle_time_s": takt_s,
        "spec_distance": spec_distance,
    }

def detect_anomaly(features: dict, *, z_thresh: float = 3.0, slope_thresh: float = 0.05) -> dict | None:
    if not features or features.get("n", 0) < 8:
        return None
    rz = abs(features.get("robust_z") or 0)
    slope = abs(features.get("slope") or 0)
    if rz >= z_thresh or slope >= slope_thresh:
        severity = "Critical" if rz >= 4 or slope >= 0.12 else "High" if rz >= 3.5 else "Medium"
        return {
            "kind": "statistical",
            "severity": severity,
            "confidence": min(0.99, 0.55 + 0.1 * rz + 2 * slope),
            "contributing_features": ["robust_z", "slope", "ewma"],
            "feature_window": features,
        }
    return None
