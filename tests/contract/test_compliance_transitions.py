"""Compliance report transition policy."""

import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[2] / "packages/domain/src/factoryops_domain/compliance.py"
_spec = importlib.util.spec_from_file_location("factoryops_compliance", _path)
_mod = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(_mod)
can_report_transition = _mod.can_report_transition


def test_operator_cannot_approve():
    ok, reason = can_report_transition("VALIDATED", "APPROVED", "operator")
    assert ok is False
    assert "cannot" in reason


def test_quality_manager_can_submit():
    ok, reason = can_report_transition("APPROVED", "SUBMITTED", "quality_manager")
    assert ok is True
    assert reason == ""


def test_illegal_skip():
    ok, _ = can_report_transition("DRAFT", "SUBMITTED", "admin")
    assert ok is False


def test_regulatory_role_can_validate():
    ok, _ = can_report_transition("DRAFT", "VALIDATED", "regulatory")
    assert ok is True
