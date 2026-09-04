from factoryops_domain.detection import compute_features, detect_anomaly


def test_features_and_anomaly_on_drift():
    samples = [2.0 + i * 0.2 for i in range(24)]
    feats = compute_features(samples)
    assert feats["n"] == 24
    assert feats["slope"] > 0
    anom = detect_anomaly(feats, z_thresh=2.5, slope_thresh=0.05)
    assert anom is not None
    assert "robust_z" in anom["contributing_features"]


def test_clean_signal_no_anomaly():
    samples = [2.0 + ((-1) ** i) * 0.01 for i in range(24)]
    feats = compute_features(samples)
    anom = detect_anomaly(feats, z_thresh=3.5, slope_thresh=0.2)
    assert anom is None
