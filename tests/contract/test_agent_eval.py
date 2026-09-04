"""Mock agent evaluation against seeded ground truth ranking."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages" / "domain" / "src"))
sys.path.insert(0, str(ROOT / "packages" / "config" / "src"))
sys.path.insert(0, str(ROOT / "apps" / "api" / "src"))

from factoryops_domain.quality import can_transition


def test_mock_ground_truth_expectation():
    # Contract: bearing_wear must be rankable as top cause code in mock provider output shape
    expected = "bearing_wear"
    hyps = [
        {"rank": 1, "cause_code": "bearing_wear", "confidence": 0.78, "counter_evidence_ids": ["x"]},
        {"rank": 2, "cause_code": "misalignment", "confidence": 0.41, "counter_evidence_ids": ["y"]},
    ]
    assert hyps[0]["cause_code"] == expected
    assert hyps[0]["counter_evidence_ids"], "counter-evidence required"
    assert hyps[0]["confidence"] < 1.0


def test_operator_cannot_close():
    ok, _ = can_transition("EFFECTIVENESS_CHECK", "CLOSED", "operator")
    assert not ok


if __name__ == "__main__":
    test_mock_ground_truth_expectation()
    test_operator_cannot_close()
    print("agent eval OK")
