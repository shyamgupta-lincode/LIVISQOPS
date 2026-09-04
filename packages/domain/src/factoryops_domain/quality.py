from enum import Enum

class QualityStatus(str, Enum):
    DETECTED = "DETECTED"
    VALIDATION = "VALIDATION"
    CONTAINMENT = "CONTAINMENT"
    INVESTIGATION = "INVESTIGATION"
    DISPOSITION = "DISPOSITION"
    CORRECTIVE_ACTION = "CORRECTIVE_ACTION"
    EFFECTIVENESS_CHECK = "EFFECTIVENESS_CHECK"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    REOPENED = "REOPENED"

QUALITY_TRANSITIONS: dict[str, set[str]] = {
    "DETECTED": {"VALIDATION", "CANCELLED"},
    "VALIDATION": {"CONTAINMENT", "CANCELLED"},
    "CONTAINMENT": {"INVESTIGATION"},
    "INVESTIGATION": {"DISPOSITION"},
    "DISPOSITION": {"CORRECTIVE_ACTION"},
    "CORRECTIVE_ACTION": {"EFFECTIVENESS_CHECK"},
    "EFFECTIVENESS_CHECK": {"CLOSED"},
    "CLOSED": {"REOPENED"},
    "REOPENED": {"VALIDATION", "INVESTIGATION"},
    "CANCELLED": set(),
}

ROLE_TRANSITIONS: dict[str, set[str]] = {
    "operator": {"CONTAINMENT"},
    "production_supervisor": {"CONTAINMENT", "VALIDATION"},
    "quality_engineer": {"VALIDATION", "CONTAINMENT", "INVESTIGATION", "DISPOSITION", "CORRECTIVE_ACTION"},
    "quality_manager": {"DISPOSITION", "CORRECTIVE_ACTION", "EFFECTIVENESS_CHECK", "CLOSED", "CANCELLED", "REOPENED"},
    "maintenance_technician": {"INVESTIGATION"},
    "process_engineer": {"INVESTIGATION", "CORRECTIVE_ACTION"},
    "knowledge_steward": set(),
    "admin": set(QUALITY_TRANSITIONS) | {"CANCELLED", "REOPENED"},
    "Plant Manager": set(sum((list(v) for v in QUALITY_TRANSITIONS.values()), [])),
    "Quality Lead": {"VALIDATION", "CONTAINMENT", "INVESTIGATION", "DISPOSITION", "CORRECTIVE_ACTION", "EFFECTIVENESS_CHECK", "CLOSED"},
}

def can_transition(current: str, target: str, role: str) -> tuple[bool, str]:
    allowed = QUALITY_TRANSITIONS.get(current, set())
    if target not in allowed:
        return False, f"illegal transition {current} -> {target}"
    role_ok = ROLE_TRANSITIONS.get(role) or ROLE_TRANSITIONS.get(role.lower().replace(" ", "_"))
    if role_ok is not None and target not in role_ok and role not in ("admin", "Plant Manager", "quality_manager"):
        # soft allow quality_manager aliases
        if role.lower() in ("quality manager", "quality_manager", "admin", "plant manager"):
            return True, ""
        if target not in (role_ok or set()):
            return False, f"role {role} cannot move to {target}"
    return True, ""
