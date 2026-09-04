"""Local OT/IT connector simulators with production-shaped contracts.

Hosted on the API so one-shot works without external MES/QMS/CMMS/OPC stacks.
Adapters exercise real HTTP against these targets during test-connection.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/connector-sim", tags=["connector-sim"])

_SESSIONS: dict[str, dict[str, Any]] = {}

DEMO_NODES = {
    "ns=2;s=Spindle.Vibration": {"value": 3.42, "data_type": "Double", "unit": "mm/s", "status_code": "Good"},
    "ns=2;s=Spindle.Temperature": {"value": 61.5, "data_type": "Double", "unit": "C", "status_code": "Good"},
    "ns=2;s=Spindle.Torque": {"value": 122.1, "data_type": "Double", "unit": "Nm", "status_code": "Good"},
    "ns=2;s=Line.Mode": {"value": "Running", "data_type": "String", "unit": "", "status_code": "Good"},
}


def _require_token(authorization: Optional[str], expected: str) -> None:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1]
    if token != expected:
        raise HTTPException(403, detail="invalid connector token")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── OPC UA HTTP bridge ────────────────────────────────────────────────────


class OpcSessionIn(BaseModel):
    endpoint_url: str
    security_mode: str = "None"
    security_policy: str = "None"
    application_uri: str = "urn:factoryops:connector"


class OpcReadIn(BaseModel):
    node_ids: list[str] = Field(default_factory=list)
    session_id: Optional[str] = None


@router.get("/opcua/health")
def opcua_health():
    return {
        "status": "ok",
        "system": "opcua-http-bridge",
        "api_version": "1.0.0",
        "protocol_profile": "OPC UA 1.05 (HTTP bridge substitute)",
        "server_name": "FactoryOps OPC UA Sim",
    }


@router.post("/opcua/session")
def opcua_session(body: OpcSessionIn, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "opcua-demo-token")
    sid = secrets.token_urlsafe(12)
    _SESSIONS[sid] = {
        "endpoint_url": body.endpoint_url,
        "security_mode": body.security_mode,
        "security_policy": body.security_policy,
        "opened_at": _utcnow_iso(),
    }
    return {
        "session_id": sid,
        "security_mode": body.security_mode,
        "security_policy": body.security_policy,
        "max_age_s": 300,
        "namespaces": ["http://opcfoundation.org/UA/", "urn:factoryops:demo"],
    }


@router.get("/opcua/nodes")
def opcua_browse(node_id: str = "ns=0;i=85", authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "opcua-demo-token")
    children = [
        {"node_id": nid, "browse_name": nid.split(";")[-1], "node_class": "Variable"}
        for nid in DEMO_NODES
    ]
    return {"node_id": node_id, "children": children}


@router.post("/opcua/read")
def opcua_read(body: OpcReadIn, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "opcua-demo-token")
    if body.session_id and body.session_id not in _SESSIONS:
        raise HTTPException(400, detail="unknown or expired session_id")
    values = []
    for nid in body.node_ids or list(DEMO_NODES):
        sample = DEMO_NODES.get(nid, {"value": None, "data_type": "Null", "unit": "", "status_code": "BadNodeIdUnknown"})
        values.append({"node_id": nid, "source_timestamp": _utcnow_iso(), **sample})
    return {"values": values, "read_at": _utcnow_iso()}


# ── MES REST ──────────────────────────────────────────────────────────────


@router.get("/mes/health")
def mes_health():
    return {"status": "ok", "system": "mes", "api_version": "2024-06", "plant_code": "MHP1"}


@router.get("/mes/v1/orders")
def mes_orders(limit: int = 20, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "mes-demo-token")
    items = [
        {
            "order_id": "WO-BEARING-1001",
            "external_id": "WO-BEARING-1001",
            "product_revision": "Hybrid Gearbox Module / B",
            "qty": 240,
            "status": "Released",
            "line_code": "DAL",
            "scheduled_start": _utcnow_iso(),
        },
        {
            "order_id": "WO-BATCH-2208",
            "external_id": "WO-BATCH-2208",
            "product_revision": "Hybrid Gearbox Module / B",
            "qty": 80,
            "status": "InProcess",
            "line_code": "BPL",
            "scheduled_start": _utcnow_iso(),
        },
    ]
    return {"items": items[:limit], "next_cursor": None}


@router.get("/mes/v1/orders/{order_id}")
def mes_order(order_id: str, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "mes-demo-token")
    return {
        "order_id": order_id,
        "status": "Released",
        "lots": [{"lot_code": "LOT-BW-220", "qty": 40}],
        "route": ["OP10-Assemble", "OP20-Press", "OP30-Inspect"],
    }


@router.get("/mes/v1/lots/{lot_code}/genealogy")
def mes_genealogy(lot_code: str, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "mes-demo-token")
    return {
        "lot_code": lot_code,
        "upstream": [{"material": "Bearing-6205", "lot": "BRG-8891"}],
        "downstream": [{"serial": "UNIT-BW-00042", "status": "InProcess"}],
    }


# ── QMS REST ──────────────────────────────────────────────────────────────


@router.get("/qms/health")
def qms_health():
    return {"status": "ok", "system": "qms", "api_version": "3.2.1"}


@router.get("/qms/v1/ncrs")
def qms_ncrs(limit: int = 20, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "qms-demo-token")
    return {
        "items": [
            {
                "ncr_id": "NCR-2026-0142",
                "severity": "Dimensional",
                "severity_value": 18.4,
                "units": "um",
                "specification": "<= 18.0 um",
                "severity": "Open",
                "lot_code": "LOT-BW-220",
                "opened_at": _utcnow_iso(),
            }
        ][:limit]
    }


@router.get("/qms/v1/inspections")
def qms_inspections(limit: int = 20, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "qms-demo-token")
    return {
        "items": [
            {
                "inspection_id": "INSP-9001",
                "characteristic": "Outer diameter",
                "result": "Fail",
                "measured_value": 18.4,
                "unit_serial": "UNIT-BW-00042",
                "inspected_at": _utcnow_iso(),
            }
        ][:limit]
    }


class NcrCreate(BaseModel):
    characteristic: str
    measured_value: float
    units: str = ""
    lot_code: Optional[str] = None


@router.post("/qms/v1/ncrs")
def qms_create_ncr(body: NcrCreate, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "qms-demo-token")
    return {
        "ncr_id": f"NCR-SIM-{secrets.token_hex(3).upper()}",
        "status": "Open",
        "characteristic": body.characteristic,
        "measured_value": body.measured_value,
        "units": body.units,
        "lot_code": body.lot_code,
        "created_at": _utcnow_iso(),
    }


# ── CMMS REST ─────────────────────────────────────────────────────────────


@router.get("/cmms/health")
def cmms_health():
    return {"status": "ok", "system": "cmms", "api_version": "2.8.0"}


@router.get("/cmms/v1/workorders")
def cmms_workorders(limit: int = 20, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "cmms-demo-token")
    return {
        "items": [
            {
                "workorder_id": "WO-PM-4410",
                "asset_external_id": "SPINDLE-BEARING-01",
                "failure_mode": "bearing_wear",
                "priority": "High",
                "status": "Planned",
                "due_at": _utcnow_iso(),
            }
        ][:limit]
    }


@router.get("/cmms/v1/assets/{asset_id}/history")
def cmms_history(asset_id: str, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "cmms-demo-token")
    return {
        "asset_id": asset_id,
        "events": [
            {"type": "PM", "summary": "Lubrication top-up", "at": _utcnow_iso()},
            {"type": "Corrective", "summary": "Bearing inspection", "at": _utcnow_iso()},
        ],
    }


class WorkRequestIn(BaseModel):
    asset_external_id: str
    title: str
    priority: str = "Medium"
    failure_mode: Optional[str] = None


@router.post("/cmms/v1/workrequests")
def cmms_work_request(body: WorkRequestIn, authorization: Optional[str] = Header(default=None)):
    _require_token(authorization, "cmms-demo-token")
    return {
        "workrequest_id": f"WR-SIM-{secrets.token_hex(3).upper()}",
        "status": "Draft",
        "asset_external_id": body.asset_external_id,
        "title": body.title,
        "priority": body.priority,
        "failure_mode": body.failure_mode,
        "created_at": _utcnow_iso(),
    }
