"""OT/IT connector contracts — production-shaped, provider-agnostic."""
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConnectorKind(str, Enum):
    OPC_UA = "opc_ua"
    MES_REST = "mes_rest"
    QMS_REST = "qms_rest"
    CMMS_REST = "cmms_rest"


class ConnectorStatus(str, Enum):
    UNKNOWN = "unknown"
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    ERROR = "error"
    DISABLED = "disabled"


class SecretRef(BaseModel):
    """Credentials are referenced, never stored inline in API responses."""

    ref: str = Field(..., description="e.g. env:MES_API_TOKEN or secret:demo-mes-token")
    kind: str = Field(default="bearer", description="bearer | basic | certificate | none")


class ConnectorConfigView(BaseModel):
    id: str
    tenant_id: str
    site_id: Optional[str] = None
    name: str
    kind: ConnectorKind
    status: ConnectorStatus = ConnectorStatus.UNKNOWN
    endpoint_url: str
    secret_ref: Optional[str] = None
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    version: int = 1
    last_success_at: Optional[datetime] = None
    last_error_at: Optional[datetime] = None
    throughput_per_min: float = 0.0
    success_count: int = 0
    error_count: int = 0
    description: Optional[str] = None


class ConnectionTestResult(BaseModel):
    ok: bool
    latency_ms: float
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    tested_at: datetime
    target: str


class ConnectorHealth(BaseModel):
    connector_id: str
    status: ConnectorStatus
    last_success_at: Optional[datetime] = None
    last_error_at: Optional[datetime] = None
    throughput_per_min: float = 0.0
    success_count: int = 0
    error_count: int = 0
    recent_errors: int = 0


class ConnectorErrorView(BaseModel):
    id: str
    connector_id: str
    at: datetime
    message: str
    detail: dict[str, Any] = Field(default_factory=dict)
    http_status: Optional[int] = None


class DataConnector(ABC):
    """Shared interface for OT/IT adapters."""

    kind: ConnectorKind

    @abstractmethod
    def test_connection(
        self,
        *,
        endpoint_url: str,
        secret: Optional[str],
        config: dict[str, Any],
        timeout_s: float = 5.0,
    ) -> ConnectionTestResult:
        raise NotImplementedError

    def fetch_sample(
        self,
        *,
        endpoint_url: str,
        secret: Optional[str],
        config: dict[str, Any],
        timeout_s: float = 5.0,
    ) -> dict[str, Any]:
        """Optional read sample used after a successful test."""
        return {}
