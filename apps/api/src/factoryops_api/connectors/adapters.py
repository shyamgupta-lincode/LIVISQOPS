"""Working OT/IT adapters with production-shaped contracts."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from factoryops_domain.connectors import (
    ConnectionTestResult,
    ConnectorKind,
    DataConnector,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _auth_headers(secret: Optional[str], config: dict[str, Any]) -> dict[str, str]:
    headers = {"Accept": "application/json", "User-Agent": "FactoryOps-Connector/1.0"}
    auth_kind = (config.get("auth_kind") or "bearer").lower()
    if not secret:
        return headers
    if auth_kind == "basic":
        headers["Authorization"] = f"Basic {secret}"
    else:
        headers["Authorization"] = f"Bearer {secret}"
    return headers


class OpcUaAdapter(DataConnector):
    """
    OPC UA client adapter.

    Local one-shot targets an OPC UA HTTP bridge (`/connector-sim/opcua`) with the same
    session/browse/read contract a gateway would expose. Endpoint config still carries
    security_mode, security_policy, and node_ids shaped like a real OPC UA client.
    """

    kind = ConnectorKind.OPC_UA

    def test_connection(
        self,
        *,
        endpoint_url: str,
        secret: Optional[str],
        config: dict[str, Any],
        timeout_s: float = 5.0,
    ) -> ConnectionTestResult:
        started = _utcnow()
        base = endpoint_url.rstrip("/")
        if base.startswith("opc.tcp://"):
            # Documented local substitute: rewrite opc.tcp to HTTP bridge when allowed.
            if not config.get("allow_local_substitute", False):
                return ConnectionTestResult(
                    ok=False,
                    latency_ms=0.0,
                    message="opc.tcp endpoints require an OPC UA stack; enable allow_local_substitute or use the HTTP bridge URL",
                    details={"endpoint": base, "security_mode": config.get("security_mode")},
                    tested_at=_utcnow(),
                    target=base,
                )
            bridge = config.get("http_bridge_url")
            if not bridge:
                return ConnectionTestResult(
                    ok=False,
                    latency_ms=0.0,
                    message="opc.tcp local substitute requires config.http_bridge_url",
                    details={"endpoint": base},
                    tested_at=_utcnow(),
                    target=base,
                )
            base = bridge.rstrip("/")

        headers = _auth_headers(secret, config)
        try:
            with httpx.Client(timeout=timeout_s) as client:
                health = client.get(f"{base}/health", headers=headers)
                health.raise_for_status()
                session = client.post(
                    f"{base}/session",
                    headers=headers,
                    json={
                        "endpoint_url": endpoint_url,
                        "security_mode": config.get("security_mode", "None"),
                        "security_policy": config.get("security_policy", "None"),
                        "application_uri": config.get("application_uri", "urn:factoryops:connector"),
                    },
                )
                session.raise_for_status()
                node_ids = config.get("node_ids") or ["ns=2;s=Spindle.Vibration"]
                read = client.post(
                    f"{base}/read",
                    headers=headers,
                    json={"node_ids": node_ids, "session_id": session.json().get("session_id")},
                )
                read.raise_for_status()
                body = read.json()
            latency = (_utcnow() - started).total_seconds() * 1000
            return ConnectionTestResult(
                ok=True,
                latency_ms=round(latency, 2),
                message="OPC UA session established; sample nodes readable",
                details={
                    "nodes_read": len(body.get("values") or []),
                    "security_mode": config.get("security_mode", "None"),
                    "server": health.json(),
                    "sample": body.get("values", [])[:3],
                },
                tested_at=_utcnow(),
                target=base,
            )
        except Exception as exc:
            latency = (_utcnow() - started).total_seconds() * 1000
            return ConnectionTestResult(
                ok=False,
                latency_ms=round(latency, 2),
                message=f"OPC UA connection failed: {exc}",
                details={"error_type": type(exc).__name__},
                tested_at=_utcnow(),
                target=base,
            )


class MesRestAdapter(DataConnector):
    """MES REST adapter — orders, lots, genealogy."""

    kind = ConnectorKind.MES_REST

    def test_connection(
        self,
        *,
        endpoint_url: str,
        secret: Optional[str],
        config: dict[str, Any],
        timeout_s: float = 5.0,
    ) -> ConnectionTestResult:
        started = _utcnow()
        base = endpoint_url.rstrip("/")
        headers = _auth_headers(secret, config)
        try:
            with httpx.Client(timeout=timeout_s) as client:
                health = client.get(f"{base}/health", headers=headers)
                health.raise_for_status()
                orders = client.get(f"{base}/v1/orders", headers=headers, params={"limit": 5})
                orders.raise_for_status()
                payload = orders.json()
            latency = (_utcnow() - started).total_seconds() * 1000
            items = payload.get("items") or payload.get("orders") or []
            return ConnectionTestResult(
                ok=True,
                latency_ms=round(latency, 2),
                message="MES REST reachable; orders list returned",
                details={"order_count": len(items), "api_version": health.json().get("api_version"), "sample": items[:2]},
                tested_at=_utcnow(),
                target=base,
            )
        except Exception as exc:
            latency = (_utcnow() - started).total_seconds() * 1000
            return ConnectionTestResult(
                ok=False,
                latency_ms=round(latency, 2),
                message=f"MES REST connection failed: {exc}",
                details={"error_type": type(exc).__name__},
                tested_at=_utcnow(),
                target=base,
            )


class QmsRestAdapter(DataConnector):
    """QMS REST adapter — NCRs / inspections / dispositions."""

    kind = ConnectorKind.QMS_REST

    def test_connection(
        self,
        *,
        endpoint_url: str,
        secret: Optional[str],
        config: dict[str, Any],
        timeout_s: float = 5.0,
    ) -> ConnectionTestResult:
        started = _utcnow()
        base = endpoint_url.rstrip("/")
        headers = _auth_headers(secret, config)
        try:
            with httpx.Client(timeout=timeout_s) as client:
                health = client.get(f"{base}/health", headers=headers)
                health.raise_for_status()
                ncrs = client.get(f"{base}/v1/ncrs", headers=headers, params={"limit": 5})
                ncrs.raise_for_status()
                inspections = client.get(f"{base}/v1/inspections", headers=headers, params={"limit": 5})
                inspections.raise_for_status()
            latency = (_utcnow() - started).total_seconds() * 1000
            return ConnectionTestResult(
                ok=True,
                latency_ms=round(latency, 2),
                message="QMS REST reachable; NCR and inspection endpoints OK",
                details={
                    "ncr_count": len(ncrs.json().get("items") or []),
                    "inspection_count": len(inspections.json().get("items") or []),
                    "api_version": health.json().get("api_version"),
                },
                tested_at=_utcnow(),
                target=base,
            )
        except Exception as exc:
            latency = (_utcnow() - started).total_seconds() * 1000
            return ConnectionTestResult(
                ok=False,
                latency_ms=round(latency, 2),
                message=f"QMS REST connection failed: {exc}",
                details={"error_type": type(exc).__name__},
                tested_at=_utcnow(),
                target=base,
            )


class CmmsRestAdapter(DataConnector):
    """CMMS REST adapter — work orders, asset history, work requests."""

    kind = ConnectorKind.CMMS_REST

    def test_connection(
        self,
        *,
        endpoint_url: str,
        secret: Optional[str],
        config: dict[str, Any],
        timeout_s: float = 5.0,
    ) -> ConnectionTestResult:
        started = _utcnow()
        base = endpoint_url.rstrip("/")
        headers = _auth_headers(secret, config)
        try:
            with httpx.Client(timeout=timeout_s) as client:
                health = client.get(f"{base}/health", headers=headers)
                health.raise_for_status()
                wos = client.get(f"{base}/v1/workorders", headers=headers, params={"limit": 5})
                wos.raise_for_status()
            latency = (_utcnow() - started).total_seconds() * 1000
            items = wos.json().get("items") or []
            return ConnectionTestResult(
                ok=True,
                latency_ms=round(latency, 2),
                message="CMMS REST reachable; work orders list returned",
                details={"workorder_count": len(items), "api_version": health.json().get("api_version"), "sample": items[:2]},
                tested_at=_utcnow(),
                target=base,
            )
        except Exception as exc:
            latency = (_utcnow() - started).total_seconds() * 1000
            return ConnectionTestResult(
                ok=False,
                latency_ms=round(latency, 2),
                message=f"CMMS REST connection failed: {exc}",
                details={"error_type": type(exc).__name__},
                tested_at=_utcnow(),
                target=base,
            )
