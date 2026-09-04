"""Consume telemetry, compute features, emit anomalies + PdM predictions. No LLM."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
from collections import defaultdict, deque

from factoryops_api import models
from factoryops_api.db import Base, SessionLocal, engine
from factoryops_api.kafka_bus import envelope, publish
from factoryops_api.lam_seed import LAM_STABLE
from factoryops_api.stream_scenarios import SCENARIOS_BY_ASSET, StreamScenario
from factoryops_domain.detection import compute_features, detect_anomaly
from factoryops_domain.ids import new_id

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("stream-worker")
BUFFERS: dict[tuple[str, str], deque] = defaultdict(lambda: deque(maxlen=64))


def ensure_schema() -> None:
    Base.metadata.create_all(bind=engine)


def _degrade_asset(asset: models.Asset, scenario: StreamScenario, signal: str) -> None:
    asset.health_index = max(0.35, float(asset.health_index) - 0.002)
    if scenario.scenario_id == "gas_box_seal_void":
        if asset.health_index < 0.62:
            asset.operating_state = "Faulted"
        elif asset.health_index < 0.75:
            asset.operating_state = "Blocked"
        else:
            asset.operating_state = "Running"
    else:
        if asset.health_index < 0.5:
            asset.operating_state = "Quality Hold"
        elif asset.health_index < 0.7:
            asset.operating_state = "Blocked"
        else:
            asset.operating_state = "Running"


def _upsert_prediction(db, asset_id: str, fm: models.FailureMode, health: float, model_version: str) -> None:
    if health >= 0.85:
        return
    db.add(
        models.Prediction(
            id=new_id(),
            asset_id=asset_id,
            failure_mode_id=fm.id,
            health_index=health,
            probability_in_horizon=min(0.95, 0.2 + (0.85 - health) * 2),
            horizon_hours=fm.horizon_hours,
            model_version=model_version,
            status="Open",
        )
    )


def _refresh_seeded_anomaly(db, asset_id: str, signal: str, feats: dict, anom: dict, scenario: StreamScenario) -> models.Anomaly:
    stable_id = LAM_STABLE["anomaly"] if scenario.scenario_id == "gas_box_seal_void" else None
    a = db.get(models.Anomaly, stable_id) if stable_id else None
    if not a:
        a = (
            db.query(models.Anomaly)
            .filter(models.Anomaly.asset_id == asset_id, models.Anomaly.signal == signal, models.Anomaly.status == "Open")
            .first()
        )
    if not a:
        asset = db.get(models.Asset, asset_id)
        cell = db.get(models.Cell, asset.cell_id)
        line = db.get(models.Line, cell.line_id)
        a = models.Anomaly(
            id=new_id(),
            site_id=line.site_id,
            asset_id=asset_id,
            signal=signal,
            severity=anom["severity"],
            confidence=anom["confidence"],
            status="Open",
            features=feats,
            baseline_version=scenario.baseline_version,
            model_version=scenario.model_version,
            evidence_ref=f"ch://features/{asset_id}/{signal}",
        )
        db.add(a)
        db.flush()
    else:
        a.severity = anom["severity"]
        a.confidence = max(float(a.confidence or 0), float(anom["confidence"]))
        merged = dict(a.features or {})
        merged.update(feats)
        merged["demo_scenario"] = scenario.scenario_id
        merged["stream_live"] = True
        a.features = merged
    return a


def process_sample(asset_id: str, signal: str, value: float, quality: str = "good") -> None:
    if quality not in ("good", "ok", "degraded"):
        return
    scenario = SCENARIOS_BY_ASSET.get(asset_id)
    if not scenario:
        return

    key = (asset_id, signal)
    BUFFERS[key].append(value)
    samples = list(BUFFERS[key])
    feats = compute_features(samples)
    anom = detect_anomaly(feats, z_thresh=2.8, slope_thresh=0.04)
    db = SessionLocal()
    try:
        asset = db.get(models.Asset, asset_id)
        if not asset:
            return
        cell = db.get(models.Cell, asset.cell_id)
        line = db.get(models.Line, cell.line_id)
        site = db.get(models.Site, line.site_id)

        if signal in scenario.health_signals:
            _degrade_asset(asset, scenario, signal)
            fm = db.query(models.FailureMode).filter(models.FailureMode.asset_id == asset_id).first()
            if fm:
                model_ver = (
                    "helium-leak-degrade-lam-v1"
                    if scenario.scenario_id == "gas_box_seal_void"
                    else "bearing-degradation-v1"
                )
                _upsert_prediction(db, asset_id, fm, asset.health_index, model_ver)

        if anom and signal in scenario.anomaly_signals:
            a = _refresh_seeded_anomaly(db, asset_id, signal, feats, anom, scenario)
            open_qe = (
                db.query(models.QualityEvent)
                .filter(
                    models.QualityEvent.asset_id == asset_id,
                    models.QualityEvent.status.notin_(["CLOSED", "CANCELLED"]),
                )
                .first()
            )
            if not open_qe and scenario.scenario_id == "bearing_wear":
                qe = models.QualityEvent(
                    id=new_id(),
                    tenant_id=site.tenant_id,
                    site_id=site.id,
                    status="DETECTED",
                    severity=anom["severity"],
                    characteristic=scenario.qe_characteristic,
                    measured_value=feats.get("mean"),
                    units=scenario.qe_units,
                    specification=scenario.qe_specification,
                    origin="model",
                    asset_id=asset_id,
                    anomaly_id=a.id,
                    line_id=line.id,
                    order_id=scenario.order_id,
                    lot_id=scenario.lot_id,
                    unit_id=scenario.unit_id,
                    owner_role="quality_engineer",
                    evidence=[{"anomaly_id": a.id, "features": feats}],
                    context={"failure_mode": scenario.failure_mode, "product": scenario.product_name},
                    affected_scope={"lot_id": scenario.lot_id, "unit_id": scenario.unit_id},
                )
                db.add(qe)
                db.add(
                    models.WorkTask(
                        id=new_id(),
                        site_id=site.id,
                        title=scenario.work_task_title,
                        status="New",
                        priority=anom["severity"],
                        role="maintenance_technician",
                        source_event_id=qe.id,
                        asset_id=asset_id,
                    )
                )
                publish(
                    "quality.events",
                    envelope(
                        "quality.event.detected",
                        {"id": qe.id},
                        tenant_id=site.tenant_id,
                        site_id=site.id,
                        source_system="stream-worker",
                        asset_id=asset_id,
                    ),
                )
            elif open_qe and signal in scenario.anomaly_signals:
                ctx = dict(open_qe.context or {})
                ctx["stream_live"] = True
                ctx["latest_features"] = feats
                open_qe.context = ctx
                if open_qe.measured_value is None or signal == scenario.anomaly_signals[0]:
                    open_qe.measured_value = feats.get("mean") or value

        db.commit()
    finally:
        db.close()


def poll_db_loop() -> None:
    seen: set[str] = set()
    while True:
        db = SessionLocal()
        try:
            asset_ids = tuple(SCENARIOS_BY_ASSET.keys())
            rows = (
                db.query(models.SignalSample)
                .filter(models.SignalSample.asset_id.in_(asset_ids))
                .order_by(models.SignalSample.observed_at.desc())
                .limit(120)
                .all()
            )
            for r in reversed(rows):
                if r.id in seen:
                    continue
                seen.add(r.id)
                process_sample(r.asset_id, r.signal, r.value, r.quality)
            if len(seen) > 5000:
                seen = set(list(seen)[-2000:])
        except Exception:
            log.exception("poll cycle failed")
        finally:
            db.close()
        time.sleep(2)


def main() -> None:
    ensure_schema()
    log.info("stream-worker starting (scenarios: %s)", ", ".join(SCENARIOS_BY_ASSET.keys()))
    try:
        from aiokafka import AIOKafkaConsumer

        async def consume() -> None:
            consumer = AIOKafkaConsumer(
                "telemetry.samples",
                bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "redpanda:9092"),
                group_id="stream-worker",
                auto_offset_reset="latest",
            )
            await consumer.start()
            try:
                async for msg in consumer:
                    env = json.loads(msg.value.decode())
                    payload = env.get("payload") or {}
                    asset_id = env.get("asset_id")
                    if asset_id and "value" in payload:
                        process_sample(
                            asset_id,
                            payload.get("signal", "unknown"),
                            float(payload["value"]),
                            payload.get("quality", "good"),
                        )
            finally:
                await consumer.stop()

        threading.Thread(target=lambda: asyncio.run(consume()), daemon=True).start()
    except Exception:
        log.warning("kafka consumer not started; using DB poll only")
    poll_db_loop()


if __name__ == "__main__":
    main()
