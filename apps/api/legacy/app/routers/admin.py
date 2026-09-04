"""Administration: identity, roles, audit trail."""

from fastapi import APIRouter

from ..store import DB

router = APIRouter(prefix="/api", tags=["admin"])


@router.get("/users")
def users():
    return list(DB["users"].values())


@router.get("/audit")
def audit(kind: str | None = None):
    result = list(DB["audit"].values())
    if kind:
        result = [a for a in result if a["kind"].startswith(kind)]
    return sorted(result, key=lambda a: a["at"], reverse=True)[:200]


@router.get("/policies")
def policies():
    """Plant Policy as Code: versioned, testable governance."""
    return [
        {"id": "pol-retention", "name": "Evidence retention", "version": "v3",
         "rule": "Decision-critical images 24 months; process clips 30 days; "
                 "continuous video not retained.", "status": "Active"},
        {"id": "pol-privacy", "name": "Workforce privacy", "version": "v2",
         "rule": "No biometric identity, no emotion inference. Zone/process-state "
                 "models only. Exception clips privacy-masked.", "status": "Active"},
        {"id": "pol-approvals", "name": "Control-write approvals", "version": "v4",
         "rule": "All PLC writes allowlisted and typed. High-impact agent actions "
                 "require named human approval.", "status": "Active"},
        {"id": "pol-model-release", "name": "Model release gates", "version": "v2",
         "rule": "Bench -> Replay -> Shadow -> Assisted -> Canary -> Production. "
                 "Segment fitness gates block unfit release.", "status": "Active"},
        {"id": "pol-offline", "name": "Offline behavior", "version": "v1",
         "rule": "Edge continues last approved config. Production events append-only "
                 "and idempotent. Conflicting offline decisions require supervisor "
                 "reconciliation.", "status": "Active"},
        {"id": "pol-ot-zones", "name": "OT zone placement", "version": "v1",
         "rule": "Edge collectors sit in appropriate OT zones (ISA/IEC 62443). "
                 "Prefer outbound publishing; support local buffering during WAN loss.",
         "status": "Active"},
        {"id": "pol-no-agent-plc", "name": "Agent OT write deny", "version": "v1",
         "rule": "Agents must not write directly to PLCs or safety systems. "
                 "Parameter changes require named approval and allowlisted handshakes only.",
         "status": "Active"},
        {"id": "pol-learning-truth", "name": "Governed learning truth", "version": "v1",
         "rule": "Only authorized confirmed outcomes become truth. Version datasets, "
                 "prompts, models, features and knowledge. Shadow + approval before ops impact.",
         "status": "Active"},
    ]
