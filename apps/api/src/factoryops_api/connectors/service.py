"""Persistence + orchestration for admin integrations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from factoryops_domain.connectors import ConnectorStatus
from factoryops_domain.ids import new_id

from .. import models
from ..audit import audit
from .registry import get_adapter
from .secrets import resolve_secret


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def serialize_connector(row: models.IntegrationConnector) -> dict[str, Any]:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "site_id": row.site_id,
        "name": row.name,
        "kind": row.kind,
        "status": row.status,
        "endpoint_url": row.endpoint_url,
        "secret_ref": row.secret_ref,
        "config": row.config or {},
        "enabled": row.enabled,
        "version": row.version,
        "last_success_at": row.last_success_at.isoformat() if row.last_success_at else None,
        "last_error_at": row.last_error_at.isoformat() if row.last_error_at else None,
        "throughput_per_min": row.throughput_per_min,
        "success_count": row.success_count,
        "error_count": row.error_count,
        "description": row.description,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_connectors(db: Session, *, site_id: Optional[str] = None) -> list[dict[str, Any]]:
    q = db.query(models.IntegrationConnector).order_by(models.IntegrationConnector.name.asc())
    if site_id:
        q = q.filter(
            (models.IntegrationConnector.site_id == site_id)
            | (models.IntegrationConnector.site_id.is_(None))
        )
    return [serialize_connector(r) for r in q.all()]


def get_connector(db: Session, connector_id: str) -> models.IntegrationConnector:
    row = db.get(models.IntegrationConnector, connector_id)
    if not row:
        raise HTTPException(404, detail="connector not found")
    return row


def configure_connector(
    db: Session,
    connector_id: str,
    *,
    actor: str,
    endpoint_url: Optional[str] = None,
    secret_ref: Optional[str] = None,
    config: Optional[dict[str, Any]] = None,
    enabled: Optional[bool] = None,
    description: Optional[str] = None,
    expected_version: Optional[int] = None,
) -> dict[str, Any]:
    row = get_connector(db, connector_id)
    if expected_version is not None and row.version != expected_version:
        raise HTTPException(409, detail="stale connector version")
    before = serialize_connector(row)
    if endpoint_url is not None:
        row.endpoint_url = endpoint_url
    if secret_ref is not None:
        row.secret_ref = secret_ref
    if config is not None:
        merged = dict(row.config or {})
        merged.update(config)
        row.config = merged
    if enabled is not None:
        row.enabled = enabled
        if not enabled:
            row.status = ConnectorStatus.DISABLED.value
        elif row.status == ConnectorStatus.DISABLED.value:
            row.status = ConnectorStatus.UNKNOWN.value
    if description is not None:
        row.description = description
    row.version += 1
    row.updated_at = _utcnow()
    audit(
        db,
        actor=actor,
        action="connector.configure",
        target_type="integration_connector",
        target_id=row.id,
        site_id=row.site_id,
        before=before,
        after=serialize_connector(row),
    )
    db.commit()
    db.refresh(row)
    return serialize_connector(row)


def list_connector_errors(db: Session, connector_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
    get_connector(db, connector_id)
    rows = (
        db.query(models.IntegrationConnectorError)
        .filter(models.IntegrationConnectorError.connector_id == connector_id)
        .order_by(models.IntegrationConnectorError.at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "connector_id": r.connector_id,
            "at": r.at.isoformat(),
            "message": r.message,
            "detail": r.detail or {},
            "http_status": r.http_status,
        }
        for r in rows
    ]


def test_connector(db: Session, connector_id: str, *, actor: str) -> dict[str, Any]:
    row = get_connector(db, connector_id)
    if not row.enabled:
        raise HTTPException(400, detail="connector is disabled")
    adapter = get_adapter(row.kind)
    secret = resolve_secret(row.secret_ref)
    result = adapter.test_connection(
        endpoint_url=row.endpoint_url,
        secret=secret,
        config=row.config or {},
    )
    now = _utcnow()
    if result.ok:
        row.status = ConnectorStatus.HEALTHY.value
        row.last_success_at = now
        row.success_count = int(row.success_count or 0) + 1
        # Rough demo throughput: successful polls contribute to a rolling counter.
        row.throughput_per_min = max(float(row.throughput_per_min or 0.0), 1.0)
    else:
        row.status = ConnectorStatus.ERROR.value
        row.last_error_at = now
        row.error_count = int(row.error_count or 0) + 1
        db.add(
            models.IntegrationConnectorError(
                id=new_id(),
                connector_id=row.id,
                message=result.message,
                detail=result.details,
                http_status=None,
                at=now,
            )
        )
    row.updated_at = now
    audit(
        db,
        actor=actor,
        action="connector.test",
        target_type="integration_connector",
        target_id=row.id,
        site_id=row.site_id,
        after={"ok": result.ok, "latency_ms": result.latency_ms, "message": result.message},
    )
    db.commit()
    db.refresh(row)
    return {
        "connector": serialize_connector(row),
        "result": result.model_dump(mode="json"),
    }


def connector_health(db: Session, connector_id: str) -> dict[str, Any]:
    row = get_connector(db, connector_id)
    recent = (
        db.query(models.IntegrationConnectorError)
        .filter(models.IntegrationConnectorError.connector_id == connector_id)
        .count()
    )
    return {
        "connector_id": row.id,
        "status": row.status,
        "last_success_at": row.last_success_at.isoformat() if row.last_success_at else None,
        "last_error_at": row.last_error_at.isoformat() if row.last_error_at else None,
        "throughput_per_min": row.throughput_per_min,
        "success_count": row.success_count,
        "error_count": row.error_count,
        "recent_errors": recent,
        "enabled": row.enabled,
        "kind": row.kind,
        "endpoint_url": row.endpoint_url,
    }
