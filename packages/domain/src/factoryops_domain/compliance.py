"""Automotive compliance report lifecycle — draft through amendment."""

from __future__ import annotations

from enum import Enum


class ReportStatus(str, Enum):
    DRAFT = "DRAFT"
    VALIDATED = "VALIDATED"
    APPROVED = "APPROVED"
    SUBMITTED = "SUBMITTED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    AMENDED = "AMENDED"


class AudienceCategory(str, Enum):
    INTERNAL = "internal"
    CUSTOMER = "customer"
    REGULATORY = "regulatory"
    PUBLIC = "public"


REPORT_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"VALIDATED", "AMENDED"},
    "VALIDATED": {"APPROVED", "DRAFT"},
    "APPROVED": {"SUBMITTED", "DRAFT"},
    "SUBMITTED": {"ACCEPTED", "REJECTED"},
    "ACCEPTED": {"AMENDED"},
    "REJECTED": {"AMENDED", "DRAFT"},
    "AMENDED": {"VALIDATED", "DRAFT"},
}

# Roles that may approve / submit customer or regulatory packs.
APPROVER_ROLES = {
    "quality_manager",
    "admin",
    "compliance",
    "customer_quality",
    "regulatory",
    "Plant Manager",
}

# Roles that may validate drafts (QE + approvers).
VALIDATOR_ROLES = APPROVER_ROLES | {
    "quality_engineer",
    "Quality Lead",
}

# Operator may attach evidence / edit drafts only — no approve/submit.
EDITOR_ROLES = VALIDATOR_ROLES | {
    "operator",
    "production_supervisor",
    "process_engineer",
    "maintenance_technician",
}


def can_report_transition(current: str, target: str, role: str) -> tuple[bool, str]:
    allowed = REPORT_TRANSITIONS.get(current, set())
    if target not in allowed:
        return False, f"illegal report transition {current} -> {target}"
    role_norm = role.lower().replace(" ", "_")
    if target in ("APPROVED", "SUBMITTED", "ACCEPTED"):
        if role not in APPROVER_ROLES and role_norm not in {r.lower().replace(" ", "_") for r in APPROVER_ROLES}:
            return False, f"role {role} cannot {target.lower()} reports"
    elif target == "VALIDATED":
        if role not in VALIDATOR_ROLES and role_norm not in {r.lower().replace(" ", "_") for r in VALIDATOR_ROLES}:
            return False, f"role {role} cannot validate reports"
    elif target in ("DRAFT", "AMENDED", "REJECTED"):
        if role not in EDITOR_ROLES and role_norm not in {r.lower().replace(" ", "_") for r in EDITOR_ROLES}:
            return False, f"role {role} cannot move report to {target}"
    return True, ""
