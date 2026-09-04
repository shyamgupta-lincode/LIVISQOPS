"""Deterministic plant simulator — multi-site scenario streams (Midwest + Lam)."""
from __future__ import annotations

import logging
import os
import random
import time

import httpx

from factoryops_api.lam_seed import LAM_STABLE
from factoryops_api.seed import STABLE
from factoryops_api.stream_scenarios import ACTIVE_SIM_SCENARIOS, LAM_GAS_SEAL, MIDWEST_BEARING

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("simulator")

API = os.getenv("API_BASE", "http://api:8000")
SEED = int(os.getenv("SIM_SEED", "42"))
ACCEL = float(os.getenv("SIM_ACCEL", "30"))
rng = random.Random(SEED)

MIDWEST_EXTRA = [f"tag_{i}" for i in range(1, 25)]
LAM_EXTRA = [f"chm_tag_{i}" for i in range(1, 12)]


def post_telemetry(asset_id: str, signal: str, value: float, unit: str = "", quality: str = "good") -> None:
    try:
        httpx.post(
            f"{API}/api/v1/ingest/telemetry",
            json={
                "asset_id": asset_id,
                "signal": signal,
                "value": value,
                "unit": unit,
                "quality": quality,
            },
            timeout=5.0,
        )
    except Exception as e:
        log.debug("ingest failed: %s", e)


def publish_mqtt(topic: str, payload: str) -> None:
    try:
        import paho.mqtt.client as mqtt

        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        c.connect(os.getenv("MQTT_HOST", "mosquitto"), int(os.getenv("MQTT_PORT", "1883")), 60)
        c.publish(topic, payload)
        c.disconnect()
    except Exception:
        pass


def tick_midwest(t: int) -> list[tuple[str, str, float, str, str]]:
    scale = ACCEL / 30
    asset = STABLE["asset_bearing"]
    vib = 2.2 + t * 0.015 * scale + rng.uniform(-0.05, 0.05)
    temp = 58 + t * 0.02 * scale + rng.uniform(-0.2, 0.2)
    torque = 120 + t * 0.01 * scale + rng.uniform(-0.5, 0.5)
    dim = 12 + t * 0.008 * scale
    points: list[tuple[str, str, float, str, str]] = [
        (asset, "vibration_mm_s", vib, "mm/s", "good"),
        (asset, "temperature_c", temp, "C", "good"),
        (asset, "torque_nm", torque, "Nm", "good"),
        (asset, "quality_dim_um", dim, "um", "good" if dim < 17 else "degraded"),
        (asset, "speed_rpm", 1800 + rng.uniform(-5, 5), "rpm", "good"),
        (asset, "cycle_time_s", 55 + rng.uniform(-0.1, 0.1), "s", "good"),
        (asset, "pressure_bar", 6.1 + rng.uniform(-0.05, 0.05), "bar", "good"),
        (asset, "energy_kwh", 1.2 + rng.uniform(-0.02, 0.02), "kWh", "good"),
    ]
    for name in MIDWEST_EXTRA[:10]:
        points.append((asset, name, rng.uniform(0, 1), "", "good"))
    return points


def tick_lam(t: int) -> list[tuple[str, str, float, str, str]]:
    """Gas-box seal void / helium leak drift on Etch Module Line."""
    scale = ACCEL / 30
    asset = LAM_STABLE["asset_gas_seal"]
    leak = 1.2e-8 + t * 2.8e-9 * scale + rng.uniform(-2e-10, 2e-10)
    void_score = min(0.99, 0.06 + t * 0.011 * scale + rng.uniform(-0.01, 0.01))
    pressure = 125.0 + rng.uniform(-1.5, 1.5)
    torque = max(22.0, 28.0 - t * 0.04 * scale + rng.uniform(-0.3, 0.3))
    points: list[tuple[str, str, float, str, str]] = [
        (asset, "helium_leak_rate_sccm", leak, "sccm", "degraded" if leak > 5e-8 else "good"),
        (asset, "seal_void_score", void_score, "score", "degraded" if void_score > 0.15 else "good"),
        (asset, "chamber_pressure_mTorr", pressure, "mTorr", "good"),
        (asset, "flange_torque_nm", torque, "N·m", "degraded" if torque < 26 else "good"),
        (asset, "rf_power_w", 420 + rng.uniform(-3, 3), "W", "good"),
    ]
    for name in LAM_EXTRA[:6]:
        points.append((asset, name, rng.uniform(0, 1), "", "good"))
    return points


def main() -> None:
    enabled = os.getenv("SIM_SCENARIOS", "midwest,lam").lower().split(",")
    run_midwest = "midwest" in enabled or "bearing" in enabled
    run_lam = "lam" in enabled or "gas_box" in enabled
    log.info(
        "simulator starting seed=%s accel=%s scenarios=%s",
        SEED,
        ACCEL,
        ",".join(s for s, on in (("midwest", run_midwest), ("lam", run_lam)) if on),
    )
    for _ in range(60):
        try:
            if httpx.get(f"{API}/ready", timeout=3.0).status_code == 200:
                break
        except Exception:
            pass
        time.sleep(2)

    t = 0
    while True:
        t += 1
        batch: list[tuple[str, str, float, str, str]] = []
        if run_midwest:
            batch.extend(tick_midwest(t))
        if run_lam:
            batch.extend(tick_lam(t))
        for asset_id, signal, value, unit, quality in batch:
            post_telemetry(asset_id, signal, value, unit, quality)

        if run_midwest:
            vib = next(v for a, s, v, _u, _q in batch if a == STABLE["asset_bearing"] and s == "vibration_mm_s")
            publish_mqtt(MIDWEST_BEARING.mqtt_topic, f"{vib:.4f}")
        if run_lam:
            leak = next(
                v for a, s, v, _u, _q in batch if a == LAM_STABLE["asset_gas_seal"] and s == "helium_leak_rate_sccm"
            )
            publish_mqtt(LAM_GAS_SEAL.mqtt_topic, f"{leak:.3e}")

        time.sleep(max(0.5, 2.0 / (ACCEL / 10)))


if __name__ == "__main__":
    main()
