"""Event backbone — durable-style in-memory bus with publish, stream, replay, lag."""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

from ..store import DB, get_workspace_id, now
from .semantic import SCHEMA_VERSION, ObservationContext

TOPIC_CATALOG = [
    {"id": "ot.telemetry.sample", "plane": "OT", "description": "Edge / PLC telemetry samples"},
    {"id": "ot.connection.state", "plane": "OT", "description": "Sparkplug-style connection state"},
    {"id": "it.mes.sync", "plane": "IT", "description": "MES order / genealogy sync"},
    {"id": "it.qms.sync", "plane": "IT", "description": "QMS NCR / disposition sync"},
    {"id": "it.cmms.sync", "plane": "IT", "description": "CMMS work order sync"},
    {"id": "it.erp.sync", "plane": "IT", "description": "ERP / ASN sync"},
    {"id": "analytics.feature.window", "plane": "Analytics", "description": "Cycle / window feature vectors"},
    {"id": "analytics.candidate.event", "plane": "Analytics", "description": "Detection candidates for agents"},
    {"id": "quality.event.lifecycle", "plane": "Quality", "description": "Quality event state transitions"},
    {"id": "agent.proposal.action", "plane": "Agents", "description": "Agent proposals / ledger"},
    {"id": "knowledge.proposal.lesson", "plane": "Knowledge", "description": "Knowledge curation proposals"},
    {"id": "governance.approval", "plane": "Governance", "description": "Named-authority approvals"},
    {"id": "production.event.state", "plane": "Production", "description": "Station state changes"},
    {"id": "quality.vision.inference", "plane": "Vision", "description": "Vision inference results"},
    {"id": "quality.vision.defect", "plane": "Vision", "description": "Vision defect detections"},
    {"id": "analytics.kpi.tick", "plane": "Analytics", "description": "KPI tick"},
]

# Cap per workspace for demo memory
_MAX_BUS = 2500


def _ensure_bus() -> dict:
    bus = DB.get("bus")
    if not isinstance(bus, dict):
        bus = {"envelopes": [], "seq": 0, "consumers": {}}
        DB["bus"] = bus
    bus.setdefault("envelopes", [])
    bus.setdefault("seq", 0)
    bus.setdefault("consumers", {})
    return bus


def topics() -> list[dict]:
    return list(TOPIC_CATALOG)


def publish(
    topic: str,
    payload: dict,
    *,
    context: ObservationContext | dict | None = None,
    source_system: str | None = None,
    workspace_id: str | None = None,
) -> dict:
    """Append an envelope to the workspace bus and lakehouse raw zone."""
    from .stores import lakehouse

    wid = workspace_id or get_workspace_id()
    bus = _ensure_bus()
    bus["seq"] = int(bus.get("seq") or 0) + 1
    t = now()
    ctx_data: dict[str, Any] | None = None
    if context is not None:
        ctx_data = context.to_dict() if isinstance(context, ObservationContext) else dict(context)

    envelope = {
        "envelope_version": "2.0",
        "event_id": uuid.uuid4().hex,
        "seq": bus["seq"],
        "topic": topic,
        "workspace_id": wid,
        "schema_version": SCHEMA_VERSION,
        "context": ctx_data,
        "payload": payload,
        "produced_at": (ctx_data or {}).get("event_time") or t,
        "ingested_at": t,
        "source_system": source_system or f"bus://{wid}",
        "source": source_system or f"bus://{wid}",
        "source_timestamp": t,
        "timestamp_trust": 0.98,
    }
    bus["envelopes"].append(envelope)
    if len(bus["envelopes"]) > _MAX_BUS:
        bus["envelopes"] = bus["envelopes"][-_MAX_BUS:]

    # Immutable raw copy in lakehouse
    try:
        lakehouse.append_raw(envelope)
    except Exception:
        pass

    return envelope


def stream(
    *,
    topic: str | None = None,
    after_seq: int = 0,
    limit: int = 100,
) -> list[dict]:
    bus = _ensure_bus()
    rows = bus["envelopes"]
    out = [e for e in rows if int(e.get("seq") or 0) > after_seq]
    if topic:
        if topic.endswith(".*"):
            prefix = topic[:-2]
            out = [e for e in out if str(e.get("topic", "")).startswith(prefix)]
        else:
            out = [e for e in out if e.get("topic") == topic]
    return out[-limit:]


def replay(*, from_seq: int = 0, topic: str | None = None, limit: int = 200) -> list[dict]:
    bus = _ensure_bus()
    rows = [e for e in bus["envelopes"] if int(e.get("seq") or 0) >= from_seq]
    if topic:
        rows = [e for e in rows if e.get("topic") == topic]
    return rows[:limit]


def lag() -> dict:
    bus = _ensure_bus()
    envelopes = bus["envelopes"]
    by_topic: dict[str, int] = defaultdict(int)
    for e in envelopes[-500:]:
        by_topic[e.get("topic", "unknown")] += 1
    consumers = bus.get("consumers") or {}
    head = int(bus.get("seq") or 0)
    consumer_lag = {
        name: max(0, head - int(c.get("last_seq") or 0))
        for name, c in consumers.items()
    }
    return {
        "head_seq": head,
        "buffered": len(envelopes),
        "by_topic_recent": dict(by_topic),
        "consumer_lag": consumer_lag,
        "healthy": True,
    }


def ack_consumer(name: str, last_seq: int) -> dict:
    bus = _ensure_bus()
    bus["consumers"][name] = {"last_seq": last_seq, "acked_at": now()}
    return bus["consumers"][name]
