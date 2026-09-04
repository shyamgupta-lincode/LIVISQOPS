from factoryops_domain.quality import can_transition, QUALITY_TRANSITIONS


def test_happy_path_transitions():
    path = [
        "DETECTED", "VALIDATION", "CONTAINMENT", "INVESTIGATION",
        "DISPOSITION", "CORRECTIVE_ACTION", "EFFECTIVENESS_CHECK", "CLOSED",
    ]
    for a, b in zip(path, path[1:]):
        ok, _ = can_transition(a, b, "quality_manager")
        assert ok, f"{a}->{b}"


def test_illegal_jump_rejected():
    ok, reason = can_transition("DETECTED", "CLOSED", "quality_manager")
    assert not ok
    assert "illegal" in reason


def test_cancel_from_validation():
    ok, _ = can_transition("VALIDATION", "CANCELLED", "quality_manager")
    assert ok


def test_all_keys_have_sets():
    assert set(QUALITY_TRANSITIONS) >= {"DETECTED", "CLOSED", "CANCELLED", "REOPENED"}
