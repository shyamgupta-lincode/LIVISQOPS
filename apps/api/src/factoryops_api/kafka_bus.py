from __future__ import annotations
import json
import logging
from datetime import datetime, timezone
from factoryops_config import get_settings
from factoryops_domain.ids import new_id

log = logging.getLogger("factoryops.kafka")

def envelope(event_type: str, payload: dict, *, tenant_id: str, site_id: str, source_system: str, **ctx) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "event_id": new_id(),
        "event_type": event_type,
        "schema_version": "1.0.0",
        "occurred_at": ctx.get("occurred_at", now),
        "observed_at": ctx.get("observed_at", now),
        "ingested_at": now,
        "tenant_id": tenant_id,
        "site_id": site_id,
        "source": {"system": source_system, "external_id": ctx.get("external_id")},
        "correlation_id": ctx.get("correlation_id") or new_id(),
        "causation_id": ctx.get("causation_id"),
        "data_quality": {"status": ctx.get("dq_status", "good"), "reasons": ctx.get("dq_reasons", [])},
        "payload": payload,
        "line_id": ctx.get("line_id"),
        "asset_id": ctx.get("asset_id"),
        "order_id": ctx.get("order_id"),
        "run_id": ctx.get("run_id"),
        "lot_id": ctx.get("lot_id"),
        "unit_id": ctx.get("unit_id"),
        "operation_id": ctx.get("operation_id"),
        "recipe_id": ctx.get("recipe_id"),
    }

def publish(topic: str, env: dict) -> None:
    """Best-effort sync publish; workers also consume. Falls back to log if Kafka down."""
    settings = get_settings()
    try:
        from aiokafka import AIOKafkaProducer
        import asyncio
        async def _send():
            p = AIOKafkaProducer(bootstrap_servers=settings.kafka_bootstrap_servers)
            await p.start()
            try:
                await p.send_and_wait(topic, json.dumps(env).encode())
            finally:
                await p.stop()
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(_send())
            else:
                loop.run_until_complete(_send())
        except RuntimeError:
            asyncio.run(_send())
    except Exception as e:
        log.warning("kafka publish deferred topic=%s err=%s payload_keys=%s", topic, e, list(env.keys()))
