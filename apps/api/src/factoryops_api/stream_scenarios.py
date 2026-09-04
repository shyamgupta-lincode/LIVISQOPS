"""Live telemetry stream profiles for deterministic demo scenarios."""
from __future__ import annotations

from dataclasses import dataclass

from .hero_seed import HERO_STABLE
from .lam_seed import LAM_STABLE
from .seed import STABLE


@dataclass(frozen=True)
class StreamScenario:
    scenario_id: str
    asset_id: str
    site_code: str
    failure_mode: str
    health_signals: tuple[str, ...]
    anomaly_signals: tuple[str, ...]
    qe_characteristic: str
    qe_specification: str
    qe_units: str
    product_name: str
    order_id: str
    lot_id: str
    unit_id: str
    work_task_title: str
    baseline_version: str
    model_version: str
    mqtt_topic: str


MIDWEST_BEARING = StreamScenario(
    scenario_id="bearing_wear",
    asset_id=STABLE["asset_bearing"],
    site_code="MHP1",
    failure_mode="bearing_wear",
    health_signals=("vibration_mm_s", "temperature_c", "torque_nm"),
    anomaly_signals=("vibration_mm_s",),
    qe_characteristic="Spindle vibration / bearing degradation",
    qe_specification="<= 4.5 mm/s RMS",
    qe_units="mm/s",
    product_name="Hybrid Gearbox Module",
    order_id=STABLE["order"],
    lot_id=STABLE["lot"],
    unit_id=STABLE["unit"],
    work_task_title="Inspect spindle bearing / lubrication",
    baseline_version="bearing-baseline-v1",
    model_version="ewma+robustz-v1",
    mqtt_topic="factoryops/telemetry/vibration",
)

LAM_GAS_SEAL = StreamScenario(
    scenario_id="gas_box_seal_void",
    asset_id=LAM_STABLE["asset_gas_seal"],
    site_code="LR-FCO",
    failure_mode="gas_box_seal_void",
    health_signals=("helium_leak_rate_sccm", "seal_void_score", "flange_torque_nm"),
    anomaly_signals=("helium_leak_rate_sccm", "seal_void_score"),
    qe_characteristic="Helium leak rate high vs Sense.i Gen3 pass band",
    qe_specification="<= 1.0e-8 sccm equiv",
    qe_units="sccm",
    product_name="Dielectric Etch Chamber Module",
    order_id=LAM_STABLE["order"],
    lot_id=LAM_STABLE["lot"],
    unit_id=LAM_STABLE["unit"],
    work_task_title="Re-seal gas box & re-run helium spot check",
    baseline_version="lam-fco-v1",
    model_version="gas-box-seal-void@2.6",
    mqtt_topic="factoryops/telemetry/lam/helium_leak",
)

HERO_CRANK = StreamScenario(
    scenario_id="crankshaft_bearing_wear",
    asset_id=HERO_STABLE["asset_bearing"],
    site_code="HMC-DHR",
    failure_mode="crankshaft_bearing_wear",
    health_signals=("vibration_mm_s", "temperature_c", "torque_nm"),
    anomaly_signals=("vibration_mm_s",),
    qe_characteristic="Crankshaft main bearing vibration vs specification",
    qe_specification="<= 4.2 mm/s RMS",
    qe_units="mm/s",
    product_name="Splendor+ 110 (Demo)",
    order_id=HERO_STABLE["order"],
    lot_id=HERO_STABLE["lot"],
    unit_id=HERO_STABLE["unit"],
    work_task_title="Inspect crankshaft main bearings",
    baseline_version="hero-v1",
    model_version="iforest-crank-bearing-v1",
    mqtt_topic="factoryops/telemetry/hero/vibration",
)

SCENARIOS_BY_ASSET: dict[str, StreamScenario] = {
    s.asset_id: s for s in (MIDWEST_BEARING, LAM_GAS_SEAL, HERO_CRANK)
}

ACTIVE_SIM_SCENARIOS: tuple[StreamScenario, ...] = (MIDWEST_BEARING, LAM_GAS_SEAL)


def scenario_for_asset(asset_id: str) -> StreamScenario | None:
    return SCENARIOS_BY_ASSET.get(asset_id)


def scenario_for_site_code(code: str | None) -> StreamScenario:
    if code == "LR-FCO":
        return LAM_GAS_SEAL
    if code == "HMC-DHR":
        return HERO_CRANK
    return MIDWEST_BEARING
