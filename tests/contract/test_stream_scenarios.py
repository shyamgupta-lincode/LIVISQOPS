"""Contract tests for multi-site stream scenario profiles."""
from factoryops_api.lam_seed import LAM_STABLE
from factoryops_api.seed import STABLE
from factoryops_api.stream_scenarios import LAM_GAS_SEAL, MIDWEST_BEARING, scenario_for_site_code


def test_midwest_profile():
    s = scenario_for_site_code("MHP1")
    assert s.scenario_id == "bearing_wear"
    assert s.asset_id == STABLE["asset_bearing"]
    assert "vibration_mm_s" in s.health_signals


def test_lam_profile():
    s = scenario_for_site_code("LR-FCO")
    assert s.scenario_id == "gas_box_seal_void"
    assert s.asset_id == LAM_STABLE["asset_gas_seal"]
    assert "helium_leak_rate_sccm" in s.health_signals
    assert "seal_void_score" in s.anomaly_signals


def test_active_sim_includes_both():
    from factoryops_api.stream_scenarios import ACTIVE_SIM_SCENARIOS

    ids = {s.scenario_id for s in ACTIVE_SIM_SCENARIOS}
    assert "bearing_wear" in ids
    assert "gas_box_seal_void" in ids
