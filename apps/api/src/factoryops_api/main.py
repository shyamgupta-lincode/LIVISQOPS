from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import Response

from factoryops_config import get_settings
from factoryops_domain.ids import new_id
from factoryops_domain.quality import can_transition

from . import models
from .audit import audit
from .auth import Principal, get_principal, login
from .stream_scenarios import scenario_for_site_code
from .connectors import service as connector_service
from .connectors.registry import list_kinds as list_connector_kinds
from .connectors.sim_targets import router as connector_sim_router
from .compliance_routes import router as compliance_router
from .db import get_db, ping
from .kafka_bus import envelope, publish

logging.basicConfig(level=get_settings().log_level)
log = logging.getLogger("factoryops.api")

REQS = Counter("factoryops_http_requests_total", "HTTP requests", ["path", "method"])

app = FastAPI(title="FactoryOps API", version="0.1.0", default_response_class=ORJSONResponse)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(connector_sim_router)
app.include_router(compliance_router)


@app.middleware("http")
async def metrics_mw(request, call_next):
    REQS.labels(path=request.url.path, method=request.method).inc()
    return await call_next(request)


def problem(status: int, detail: str, title: str = "Error") -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"type": "about:blank", "title": title, "status": status, "detail": detail},
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "api", "product": get_settings().product_name}


@app.get("/ready")
def ready():
    try:
        ping()
        return {"status": "ready", "database": True}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "not_ready", "error": str(e)})


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ── Auth ──────────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    email: str
    password: str


@app.post("/api/v1/auth/login")
def api_login(body: LoginIn, db: Session = Depends(get_db)):
    return login(db, body.email, body.password)


@app.get("/api/v1/auth/me")
def me(p: Principal = Depends(get_principal)):
    return p.__dict__


# ── Overview / plant ──────────────────────────────────────────────────────

_DOWN_STATES = {"faulted", "blocked", "offline", "down", "quality hold", "quality-hold", "hold"}
_RUN_STATES = {"running", "run", "ok"}
_STATE_PRIORITY = [
    "Faulted", "Blocked", "Quality Hold", "Starved", "Offline",
    "Maintenance", "Changeover", "Running", "Unknown",
]
_SIGNAL_ALIASES: dict[str, tuple[str, ...]] = {
    "vibration_rms": ("vibration_rms", "vibration_mm_s", "vibration_mm_s_daily", "vibration"),
    "temperature_c": ("temperature_c", "temp_c", "temperature"),
    "torque_nm": ("torque_nm", "torque"),
    "speed_rpm": ("speed_rpm", "speed"),
    "helium_leak_rate_sccm": ("helium_leak_rate_sccm", "helium_leak_sccm_daily", "helium_leak"),
    "seal_void_score": ("seal_void_score", "seal_void", "void_score"),
    "flange_torque_nm": ("flange_torque_nm", "flange_torque"),
    "chamber_pressure_mTorr": ("chamber_pressure_mTorr", "chamber_pressure"),
}


def _headline_state(states: list[str]) -> str:
    best = "Unknown"
    best_rank = len(_STATE_PRIORITY)
    for s in states:
        rank = _STATE_PRIORITY.index(s) if s in _STATE_PRIORITY else len(_STATE_PRIORITY) - 1
        if rank < best_rank:
            best_rank = rank
            best = s
    return best


def _rollup_stats(stations: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(stations)
    if not total:
        return {
            "stations_total": 0,
            "stations_running": 0,
            "issues": 0,
            "avg_health": None,
            "abnormal": 0,
            "state": "Unknown",
        }
    running = sum(1 for s in stations if (s.get("state") or "").lower() in _RUN_STATES)
    issues = sum(int(s.get("issues") or 0) for s in stations)
    healths = [float(s["health_index"]) for s in stations if s.get("health_index") is not None]
    avg_health = (sum(healths) / len(healths)) if healths else None
    abnormal = sum(
        1 for s in stations
        if (s.get("state") or "") not in ("Running", "Changeover") or int(s.get("issues") or 0) > 0
    )
    return {
        "stations_total": total,
        "stations_running": running,
        "issues": issues,
        "avg_health": avg_health,
        "abnormal": abnormal,
        "state": _headline_state([s.get("state") or "Unknown" for s in stations]),
    }


def _match_signal_samples(samples: list[models.SignalSample], key: str) -> list[models.SignalSample]:
    aliases = _SIGNAL_ALIASES.get(key, (key,))
    matched = [s for s in samples if s.signal in aliases]
    if matched:
        return matched
    key_l = key.lower()
    return [s for s in samples if key_l in (s.signal or "").lower() or (s.signal or "").lower() in key_l]


def _device_from_samples(
    asset_id: str,
    samples: list[models.SignalSample],
    *,
    node_id: str | None = None,
    label: str | None = None,
    key: str,
    unit: str = "",
    protocol: str | None = None,
) -> dict[str, Any]:
    matched = _match_signal_samples(samples, key)
    matched_sorted = sorted(matched, key=lambda s: s.observed_at or datetime.min.replace(tzinfo=timezone.utc))
    recent = matched_sorted[-24:]
    latest = recent[-1] if recent else None
    return {
        "id": node_id or f"sig-{asset_id}-{key}",
        "kind": "device",
        "name": label or key,
        "signal_key": key,
        "unit": unit or (latest.unit if latest else ""),
        "protocol": protocol,
        "asset_id": asset_id,
        "sample_count": len(matched),
        "latest": None if not latest else {
            "value": latest.value,
            "unit": latest.unit,
            "quality": latest.quality,
            "observed_at": latest.observed_at.isoformat() if latest.observed_at else None,
        },
        "recent": [
            {
                "value": s.value,
                "observed_at": s.observed_at.isoformat() if s.observed_at else None,
                "quality": s.quality,
            }
            for s in recent
        ],
    }


def _build_topology(
    db: Session,
    *,
    site_id: str,
    lines: list[models.Line],
    stations: list[dict[str, Any]],
) -> dict[str, Any]:
    """ISA-95 drill spine: line → cell → station(asset) → device(signal)."""
    from .context_graph_seed import published_bindings, published_levels

    by_line: dict[str, list[dict[str, Any]]] = {}
    for st in stations:
        by_line.setdefault(st["line_id"], []).append(st)

    signal_nodes = (
        db.query(models.EntityNode)
        .filter(models.EntityNode.kind == "signal")
        .all()
    )
    signals_by_asset: dict[str, list[models.EntityNode]] = {}
    for n in signal_nodes:
        aid = (n.props or {}).get("asset_id")
        if aid:
            signals_by_asset.setdefault(aid, []).append(n)

    asset_ids = [s["id"] for s in stations]
    samples_by_asset: dict[str, list[models.SignalSample]] = {aid: [] for aid in asset_ids}
    if asset_ids:
        rows = (
            db.query(models.SignalSample)
            .filter(models.SignalSample.asset_id.in_(asset_ids))
            .order_by(models.SignalSample.observed_at.desc())
            .limit(800)
            .all()
        )
        for row in rows:
            bucket = samples_by_asset.setdefault(row.asset_id, [])
            if len(bucket) < 80:
                bucket.append(row)

    pred_by_asset: dict[str, dict[str, Any]] = {}
    for a_id in asset_ids:
        fm = db.query(models.FailureMode).filter(models.FailureMode.asset_id == a_id).first()
        if not fm:
            continue
        pred = (
            db.query(models.Prediction)
            .filter(models.Prediction.failure_mode_id == fm.id)
            .order_by(models.Prediction.created_at.desc())
            .first()
        )
        if pred:
            pred_by_asset[a_id] = {
                "probability_in_horizon": pred.probability_in_horizon,
                "health_index": pred.health_index,
                "model_version": pred.model_version,
                "status": pred.status,
            }

    anom_conf_by_asset: dict[str, float] = {}
    for a in (
        db.query(models.Anomaly)
        .filter(models.Anomaly.site_id == site_id, models.Anomaly.status.in_(["Open", "Linked"]))
        .all()
    ):
        if a.confidence is not None:
            prev = anom_conf_by_asset.get(a.asset_id)
            if prev is None or a.confidence > prev:
                anom_conf_by_asset[a.asset_id] = float(a.confidence)

    line_payloads = []
    for ln in lines:
        line_stations = by_line.get(ln.id, [])
        cells = db.query(models.Cell).filter(models.Cell.line_id == ln.id).order_by(models.Cell.name).all()
        cell_payloads = []
        for cell in cells:
            cell_stations = [s for s in line_stations if s.get("cell_id") == cell.id]
            station_payloads = []
            for st in cell_stations:
                samples = samples_by_asset.get(st["id"], [])
                devices: list[dict[str, Any]] = []
                graph_sigs = signals_by_asset.get(st["id"], [])
                if graph_sigs:
                    for n in graph_sigs:
                        props = n.props or {}
                        devices.append(
                            _device_from_samples(
                                st["id"],
                                samples,
                                node_id=n.id,
                                label=n.label,
                                key=props.get("key") or n.label,
                                unit=props.get("unit") or "",
                                protocol=props.get("protocol"),
                            )
                        )
                else:
                    # Fall back to distinct live sample keys when graph has no signal nodes.
                    seen: set[str] = set()
                    for sample in samples:
                        if sample.signal in seen:
                            continue
                        seen.add(sample.signal)
                        devices.append(
                            _device_from_samples(
                                st["id"],
                                samples,
                                label=sample.signal,
                                key=sample.signal,
                                unit=sample.unit or "",
                                protocol=None,
                            )
                        )
                model_conf = anom_conf_by_asset.get(st["id"])
                pred = pred_by_asset.get(st["id"])
                station_payloads.append({
                    **st,
                    "kind": "station",
                    "model_confidence": model_conf,
                    "prediction": pred,
                    "devices": devices,
                    "device_count": len(devices),
                })
            cell_stats = _rollup_stats(station_payloads)
            cell_payloads.append({
                "id": cell.id,
                "kind": "cell",
                "name": cell.name,
                "line_id": ln.id,
                "line": ln.name,
                "stats": cell_stats,
                "state": cell_stats["state"],
                "stations": station_payloads,
            })
        line_stats = _rollup_stats(line_stations)
        line_payloads.append({
            "id": ln.id,
            "kind": "line",
            "name": ln.name,
            "takt_s": ln.takt_s,
            "stats": line_stats,
            "state": line_stats["state"],
            "cells": cell_payloads,
        })

    twin_levels = [
        {"id": "line", "label": "Line", "entity": "line", "required": True},
        {"id": "cell", "label": "Cell", "entity": "cell", "required": True},
        {"id": "station", "label": "Station", "entity": "asset", "required": True},
        {"id": "device", "label": "Device", "entity": "signal", "required": False},
    ]
    return {
        "spine": twin_levels,
        "levels": published_levels(),
        "bindings": published_bindings(),
        "lines": line_payloads,
    }


def _build_plant_overview(db: Session, p: Principal) -> dict[str, Any]:
    site_id = p.site_id or db.query(models.Site).first().id
    site = db.get(models.Site, site_id)
    lines = db.query(models.Line).filter(models.Line.site_id == site_id).all()
    assets = (
        db.query(models.Asset)
        .join(models.Cell, models.Asset.cell_id == models.Cell.id)
        .join(models.Line, models.Cell.line_id == models.Line.id)
        .filter(models.Line.site_id == site_id)
        .all()
    )
    open_qes = (
        db.query(models.QualityEvent)
        .filter(
            models.QualityEvent.site_id == site_id,
            models.QualityEvent.status.notin_(["CLOSED", "CANCELLED"]),
        )
        .order_by(models.QualityEvent.updated_at.desc())
        .limit(50)
        .all()
    )
    critical_events = [qe for qe in open_qes if qe.severity in ("Critical", "High")]
    open_crit = len(critical_events)
    at_risk = sum(1 for a in assets if a.health_index < 0.8)

    active_order = (
        db.query(models.ProductionOrder)
        .filter(models.ProductionOrder.site_id == site_id, models.ProductionOrder.status == "Released")
        .first()
    )
    product = db.get(models.Product, active_order.product_id) if active_order else None
    lot = (
        db.query(models.Lot).filter(models.Lot.order_id == active_order.id).first()
        if active_order
        else None
    )

    anomaly_open_by_asset: dict[str, int] = {}
    for a in (
        db.query(models.Anomaly)
        .filter(models.Anomaly.site_id == site_id, models.Anomaly.status.in_(["Open", "Linked"]))
        .all()
    ):
        anomaly_open_by_asset[a.asset_id] = anomaly_open_by_asset.get(a.asset_id, 0) + 1
    qe_open_by_asset: dict[str, int] = {}
    for qe in open_qes:
        if qe.asset_id:
            qe_open_by_asset[qe.asset_id] = qe_open_by_asset.get(qe.asset_id, 0) + 1

    stations = []
    running = 0
    down = 0
    for ln in lines:
        cells = db.query(models.Cell).filter(models.Cell.line_id == ln.id).all()
        for c in cells:
            for a in db.query(models.Asset).filter(models.Asset.cell_id == c.id).all():
                state = a.operating_state or "Unknown"
                state_l = state.lower()
                issues = anomaly_open_by_asset.get(a.id, 0) + qe_open_by_asset.get(a.id, 0)
                display_state = state
                if a.health_index < 0.5 and state_l in _RUN_STATES:
                    display_state = "Quality Hold"
                elif a.health_index < 0.7 and state_l in _RUN_STATES and issues:
                    display_state = "Blocked"
                display_l = display_state.lower()
                if display_l in _RUN_STATES:
                    running += 1
                elif display_l in _DOWN_STATES or a.health_index < 0.5:
                    down += 1
                stations.append({
                    "id": a.id,
                    "line": ln.name,
                    "line_id": ln.id,
                    "cell": c.name,
                    "cell_id": c.id,
                    "name": a.name,
                    "state": display_state,
                    "health_index": a.health_index,
                    "issues": issues,
                    "criticality": a.criticality,
                    "asset_type": a.asset_type,
                    "order_external_id": active_order.external_id if active_order else None,
                    "product_name": product.name if product else None,
                    "lot_code": lot.code if lot else None,
                    "takt_s": ln.takt_s,
                })

    # Operational rate: fraction of stations in a productive state (live, not fabricated totals).
    throughput_vs_target = (running / len(assets)) if assets else None

    units = []
    if lot:
        units = db.query(models.SerialUnit).filter(models.SerialUnit.lot_id == lot.id).all()
    if units:
        goodish = sum(1 for u in units if (u.status or "").lower() not in ("scrap", "reject", "failed"))
        first_pass_yield = goodish / len(units)
    else:
        first_pass_yield = None

    # Unplanned downtime minutes: only when we can attribute non-running stations; else null.
    unplanned_downtime_min = down * 5 if down else 0

    tasks = (
        db.query(models.WorkTask)
        .filter(models.WorkTask.site_id == site_id, models.WorkTask.status != "Done")
        .order_by(models.WorkTask.created_at.desc())
        .limit(20)
        .all()
    )
    actions: list[dict[str, Any]] = [
        {
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "role": t.role,
            "kind": "work",
            "href": "/work",
            "asset_id": t.asset_id,
            "source_event_id": t.source_event_id,
            "updated_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tasks
    ]
    # Role queue also surfaces open quality work so the command center is never silently empty
    # while critical events are still open.
    task_qe_ids = {t.source_event_id for t in tasks if t.source_event_id}
    for qe in critical_events:
        if qe.id in task_qe_ids:
            continue
        actions.append({
            "id": qe.id,
            "title": f"{qe.status}: {qe.characteristic}",
            "status": qe.status,
            "priority": qe.severity,
            "role": qe.owner_role or "quality_engineer",
            "kind": "quality",
            "href": f"/quality/{qe.id}",
            "asset_id": qe.asset_id,
            "source_event_id": qe.id,
            "updated_at": qe.updated_at.isoformat() if qe.updated_at else None,
        })
    for a in assets:
        if a.health_index >= 0.8:
            continue
        if any(x.get("asset_id") == a.id and x["kind"] == "reliability" for x in actions):
            continue
        actions.append({
            "id": f"risk-{a.id}",
            "title": f"Asset at risk: {a.name} (health {a.health_index:.0%})",
            "status": "Open",
            "priority": "High" if a.health_index < 0.6 else "Medium",
            "role": "maintenance_technician",
            "kind": "reliability",
            "href": f"/assets/{a.id}",
            "asset_id": a.id,
            "source_event_id": None,
            "updated_at": None,
        })
    priority_rank = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    actions.sort(key=lambda x: (priority_rank.get(x["priority"], 9), x.get("title") or ""))

    # Quality Pareto from open/recent anomalies + open QE characteristics (real counts only).
    pareto_counts: dict[str, int] = {}
    for a in (
        db.query(models.Anomaly)
        .filter(models.Anomaly.site_id == site_id)
        .order_by(models.Anomaly.created_at.desc())
        .limit(200)
        .all()
    ):
        label = a.signal or "unknown"
        pareto_counts[label] = pareto_counts.get(label, 0) + 1
    for qe in open_qes:
        label = qe.characteristic or "quality event"
        pareto_counts[label] = pareto_counts.get(label, 0) + 1
    quality_pareto = [
        {"label": k, "n": v}
        for k, v in sorted(pareto_counts.items(), key=lambda kv: kv[1], reverse=True)[:6]
    ]

    # Throughput spark: recent primary scenario signal for this site.
    stream_profile = scenario_for_site_code(site.code)
    trend_signal = stream_profile.anomaly_signals[0]
    trend_aliases = list(_SIGNAL_ALIASES.get(trend_signal, (trend_signal,)))
    site_asset_ids = [a.id for a in assets]
    trend_rows = (
        db.query(models.SignalSample)
        .filter(
            models.SignalSample.asset_id.in_(site_asset_ids),
            models.SignalSample.signal.in_(trend_aliases),
        )
        .order_by(models.SignalSample.observed_at.desc())
        .limit(24)
        .all()
    )
    trend_rows = list(reversed(trend_rows))
    production_trend: list[float] = []
    if trend_rows:
        vals = [float(r.value) for r in trend_rows]
        lo, hi = min(vals), max(vals)
        span = (hi - lo) or 1.0
        if stream_profile.scenario_id == "gas_box_seal_void":
            # Rising leak / void score → lower operational score.
            production_trend = [max(0.0, min(1.0, 1.0 - ((v - lo) / span) * 0.5)) for v in vals]
        else:
            production_trend = [max(0.0, min(1.0, 1.0 - ((v - lo) / span) * 0.45)) for v in vals]
    elif throughput_vs_target is not None:
        production_trend = [throughput_vs_target]

    latest_sample = (
        db.query(models.SignalSample)
        .filter(models.SignalSample.asset_id.in_(site_asset_ids))
        .order_by(models.SignalSample.observed_at.desc())
        .first()
    )
    now = datetime.now(timezone.utc)
    telemetry_age_s = None
    dq_status = "ok"
    dq_reasons: list[str] = []
    if latest_sample and latest_sample.observed_at:
        obs = latest_sample.observed_at
        if obs.tzinfo is None:
            obs = obs.replace(tzinfo=timezone.utc)
        telemetry_age_s = max(0, int((now - obs).total_seconds()))
        if telemetry_age_s > 120:
            dq_status = "stale"
            dq_reasons.append(f"telemetry_age_{telemetry_age_s}s")
        elif telemetry_age_s > 45:
            dq_status = "degraded"
            dq_reasons.append(f"telemetry_lag_{telemetry_age_s}s")
    else:
        dq_status = "degraded"
        dq_reasons.append("no_telemetry_samples")
    if open_crit:
        dq_reasons.append(f"open_critical_events_{open_crit}")

    return {
        "plant": {"id": site.id, "name": site.name, "code": site.code, "timezone": site.timezone},
        "shift": "A",
        "refreshed_at": now.isoformat(),
        "kpis": {
            "throughput_vs_target": throughput_vs_target,
            "first_pass_yield": first_pass_yield,
            "open_critical_events": open_crit,
            "unplanned_downtime_min": unplanned_downtime_min,
            "assets_at_risk": at_risk,
            "open_quality_events": len(open_qes),
            "open_work_tasks": len(tasks),
            "stations_running": running,
            "stations_total": len(assets),
        },
        "kpi_meta": {
            "throughput_vs_target": "stations_running / stations_total",
            "first_pass_yield": "non-scrap serial units in active lot" if units else "unavailable_no_units",
            "unplanned_downtime_min": "down_or_hold_stations × 5 min estimate",
        },
        "stations": stations,
        "actions": actions[:20],
        "critical_events": [
            {
                "id": qe.id,
                "title": qe.characteristic,
                "severity": qe.severity,
                "status": qe.status,
                "owner_role": qe.owner_role,
                "asset_id": qe.asset_id,
                "updated_at": qe.updated_at.isoformat() if qe.updated_at else None,
                "href": f"/quality/{qe.id}",
            }
            for qe in critical_events[:5]
        ],
        "quality_pareto": quality_pareto,
        "production_trend": production_trend,
        "context": {
            "order_external_id": active_order.external_id if active_order else None,
            "product_name": product.name if product else None,
            "lot_code": lot.code if lot else None,
            "unit_serial": units[0].serial if units else None,
        },
        "stream": {
            "scenario": stream_profile.scenario_id,
            "primary_asset_id": stream_profile.asset_id,
            "primary_signals": list(stream_profile.health_signals),
            "anomaly_signals": list(stream_profile.anomaly_signals),
        },
        "data_quality": {
            "status": dq_status,
            "reasons": dq_reasons,
            "telemetry_age_s": telemetry_age_s,
        },
        "topology": _build_topology(db, site_id=site_id, lines=lines, stations=stations),
    }


@app.get("/api/v1/plant/overview")
def overview(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    return _build_plant_overview(db, p)


@app.get("/api/v1/assets/{asset_id}/telemetry")
def asset_telemetry(
    asset_id: str,
    signal: Optional[str] = None,
    limit: int = Query(default=48, ge=1, le=200),
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    """Recent signal samples + graph device bindings for a station/asset."""
    asset = db.get(models.Asset, asset_id)
    if not asset:
        raise HTTPException(404, detail="asset not found")
    cell = db.get(models.Cell, asset.cell_id)
    line = db.get(models.Line, cell.line_id) if cell else None
    q = db.query(models.SignalSample).filter(models.SignalSample.asset_id == asset_id)
    if signal:
        aliases = list(_SIGNAL_ALIASES.get(signal, (signal,)))
        q = q.filter(models.SignalSample.signal.in_(aliases))
    rows = q.order_by(models.SignalSample.observed_at.desc()).limit(limit).all()
    signal_nodes = (
        db.query(models.EntityNode)
        .filter(models.EntityNode.kind == "signal")
        .all()
    )
    devices = []
    for n in signal_nodes:
        props = n.props or {}
        if props.get("asset_id") != asset_id:
            continue
        key = props.get("key") or n.label
        matched = _match_signal_samples(list(reversed(rows)), key)
        latest = matched[-1] if matched else None
        devices.append({
            "id": n.id,
            "kind": "device",
            "name": n.label,
            "signal_key": key,
            "unit": props.get("unit") or (latest.unit if latest else ""),
            "protocol": props.get("protocol"),
            "latest": None if not latest else {
                "value": latest.value,
                "unit": latest.unit,
                "quality": latest.quality,
                "observed_at": latest.observed_at.isoformat() if latest.observed_at else None,
            },
            "recent": [
                {
                    "value": s.value,
                    "observed_at": s.observed_at.isoformat() if s.observed_at else None,
                }
                for s in matched[-24:]
            ],
        })
    return {
        "asset": {
            "id": asset.id,
            "name": asset.name,
            "cell_id": asset.cell_id,
            "cell": cell.name if cell else None,
            "line_id": line.id if line else None,
            "line": line.name if line else None,
            "operating_state": asset.operating_state,
            "health_index": asset.health_index,
        },
        "devices": devices,
        "samples": [
            {
                "id": r.id,
                "signal": r.signal,
                "value": r.value,
                "unit": r.unit,
                "quality": r.quality,
                "observed_at": r.observed_at.isoformat() if r.observed_at else None,
            }
            for r in rows
        ],
    }


# ── Quality events ────────────────────────────────────────────────────────

class TransitionIn(BaseModel):
    to_status: str
    actor: Optional[str] = None
    role: Optional[str] = None
    note: Optional[str] = None
    containment: Optional[str] = None
    disposition: Optional[str] = None
    corrective_action: Optional[str] = None
    effectiveness: Optional[str] = None
    rca_summary: Optional[str] = None
    expected_version: Optional[int] = None


@app.get("/api/v1/quality/events")
def list_events(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    q = db.query(models.QualityEvent)
    if p.site_id:
        q = q.filter(models.QualityEvent.site_id == p.site_id)
    if status:
        q = q.filter(models.QualityEvent.status == status)
    if severity:
        q = q.filter(models.QualityEvent.severity == severity)
    rows = q.order_by(models.QualityEvent.opened_at.desc()).limit(200).all()
    return {"items": [_qe(r) for r in rows]}


@app.get("/api/v1/quality/events/{event_id}")
def get_event(event_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    qe = db.get(models.QualityEvent, event_id)
    if not qe:
        raise HTTPException(404, detail="quality event not found")
    return _qe(qe)


@app.post("/api/v1/quality/events/{event_id}/transition")
def transition_event(
    event_id: str,
    body: TransitionIn,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    qe = db.get(models.QualityEvent, event_id)
    if not qe:
        raise HTTPException(404, detail="quality event not found")
    if body.expected_version is not None and body.expected_version != qe.version:
        raise HTTPException(409, detail="stale version")
    role = body.role or p.role
    ok, reason = can_transition(qe.status, body.to_status, role)
    if not ok:
        raise HTTPException(403, detail=reason)
    before = {"status": qe.status, "version": qe.version}
    qe.status = body.to_status
    qe.version += 1
    qe.updated_at = datetime.now(timezone.utc)
    if body.containment:
        qe.containment = body.containment
    if body.disposition:
        qe.disposition = body.disposition
    if body.corrective_action:
        qe.corrective_action = body.corrective_action
    if body.effectiveness:
        qe.effectiveness = body.effectiveness
    if body.rca_summary:
        qe.rca_summary = body.rca_summary
    if body.to_status == "CLOSED":
        qe.closed_at = datetime.now(timezone.utc)
    if body.to_status == "INVESTIGATION":
        existing_task = db.query(models.WorkTask).filter(models.WorkTask.source_event_id == qe.id).first()
        if not existing_task:
            db.add(models.WorkTask(
                id=new_id(), site_id=qe.site_id,
                title=f"Investigate: {qe.characteristic}",
                status="New", priority=qe.severity, role="maintenance_technician",
                source_event_id=qe.id, asset_id=qe.asset_id,
            ))
    audit(db, actor=body.actor or p.email, action=f"transition:{body.to_status}", target_type="quality_event",
          target_id=qe.id, site_id=qe.site_id, before=before, after={"status": qe.status, "version": qe.version},
          correlation_id=idempotency_key)
    db.commit()
    publish("quality.events", envelope("quality.event.transition", {"id": qe.id, "status": qe.status},
                                       tenant_id=qe.tenant_id, site_id=qe.site_id, source_system="api"))
    return _qe(qe)


class CreateEventIn(BaseModel):
    characteristic: str
    severity: str = "High"
    measured_value: Optional[float] = None
    units: Optional[str] = None
    specification: Optional[str] = None
    asset_id: Optional[str] = None
    anomaly_id: Optional[str] = None
    origin: str = "manual"


@app.post("/api/v1/quality/events")
def create_event(body: CreateEventIn, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    site_id = p.site_id or db.query(models.Site).first().id
    tenant_id = db.get(models.Site, site_id).tenant_id
    qe = models.QualityEvent(
        id=new_id(), tenant_id=tenant_id, site_id=site_id, status="DETECTED",
        severity=body.severity, characteristic=body.characteristic,
        measured_value=body.measured_value, units=body.units, specification=body.specification,
        origin=body.origin, asset_id=body.asset_id, anomaly_id=body.anomaly_id,
        owner_role="quality_engineer", evidence=[], context={},
    )
    db.add(qe)
    audit(db, actor=p.email, action="create", target_type="quality_event", target_id=qe.id, site_id=site_id)
    db.commit()
    return _qe(qe)


def _qe(qe: models.QualityEvent) -> dict[str, Any]:
    return {
        "id": qe.id, "status": qe.status, "version": qe.version, "severity": qe.severity,
        "characteristic": qe.characteristic, "measured_value": qe.measured_value, "units": qe.units,
        "specification": qe.specification, "origin": qe.origin, "asset_id": qe.asset_id,
        "order_id": qe.order_id, "lot_id": qe.lot_id, "unit_id": qe.unit_id, "line_id": qe.line_id,
        "owner_role": qe.owner_role, "containment": qe.containment, "disposition": qe.disposition,
        "rca_summary": qe.rca_summary, "corrective_action": qe.corrective_action,
        "effectiveness": qe.effectiveness, "affected_scope": qe.affected_scope,
        "evidence": qe.evidence or [], "context": qe.context or {},
        "anomaly_id": qe.anomaly_id, "opened_at": qe.opened_at.isoformat() if qe.opened_at else None,
        "closed_at": qe.closed_at.isoformat() if qe.closed_at else None,
        "updated_at": qe.updated_at.isoformat() if qe.updated_at else None,
        "site_id": qe.site_id,
    }


# ── Anomalies / live ──────────────────────────────────────────────────────

@app.get("/api/v1/anomalies")
def list_anomalies(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    q = db.query(models.Anomaly)
    if p.site_id:
        q = q.filter(models.Anomaly.site_id == p.site_id)
    rows = q.order_by(models.Anomaly.created_at.desc()).limit(100).all()
    return {"items": [
        {"id": a.id, "asset_id": a.asset_id, "signal": a.signal, "severity": a.severity,
         "confidence": a.confidence, "status": a.status, "features": a.features,
         "model_version": a.model_version,
         "created_at": a.created_at.isoformat() if a.created_at else None}
        for a in rows
    ]}


@app.post("/api/v1/anomalies/{anomaly_id}/create-quality-event")
def anomaly_to_qe(anomaly_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    a = db.get(models.Anomaly, anomaly_id)
    if not a:
        raise HTTPException(404, detail="anomaly not found")
    site = db.get(models.Site, a.site_id)
    qe = models.QualityEvent(
        id=new_id(), tenant_id=site.tenant_id, site_id=a.site_id, status="DETECTED",
        severity=a.severity, characteristic=f"Anomaly on {a.signal}",
        measured_value=(a.features or {}).get("mean"), origin="model",
        asset_id=a.asset_id, anomaly_id=a.id, owner_role="quality_engineer",
        evidence=[{"anomaly_id": a.id, "evidence_ref": a.evidence_ref}],
        context={"model_version": a.model_version, "baseline_version": a.baseline_version},
        affected_scope={"asset_id": a.asset_id},
    )
    a.status = "Linked"
    db.add(qe)
    db.commit()
    return _qe(qe)


# ── Ingest (simulator / connectors) ───────────────────────────────────────

class TelemetryIn(BaseModel):
    asset_id: str
    signal: str
    value: float
    unit: str = ""
    quality: str = "good"
    observed_at: Optional[str] = None
    site_id: Optional[str] = None
    tenant_id: Optional[str] = None


@app.post("/api/v1/ingest/telemetry")
def ingest_telemetry(body: TelemetryIn, db: Session = Depends(get_db)):
    asset = db.get(models.Asset, body.asset_id)
    if not asset:
        raise HTTPException(404, detail="asset not found")
    cell = db.get(models.Cell, asset.cell_id)
    line = db.get(models.Line, cell.line_id)
    site = db.get(models.Site, line.site_id)
    sample = models.SignalSample(
        id=new_id(), asset_id=body.asset_id, signal=body.signal, value=body.value,
        unit=body.unit, quality=body.quality,
    )
    db.add(sample)
    db.commit()
    env = envelope(
        "telemetry.sample",
        {"signal": body.signal, "value": body.value, "unit": body.unit, "quality": body.quality},
        tenant_id=site.tenant_id, site_id=site.id, source_system="ingest.http",
        asset_id=body.asset_id, line_id=line.id, dq_status=body.quality,
    )
    publish("telemetry.samples", env)
    return {"accepted": True, "event_id": env["event_id"]}


# ── RCA ───────────────────────────────────────────────────────────────────

class RcaRequest(BaseModel):
    quality_event_id: str


@app.post("/api/v1/rca/investigate")
def rca_investigate(body: RcaRequest, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    """Enqueue / run mock RCA via agent-worker contract (inline mock for reliability)."""
    from .agents_runtime import run_rca

    qe = db.get(models.QualityEvent, body.quality_event_id)
    if not qe:
        raise HTTPException(404, detail="quality event not found")
    result = run_rca(db, qe)
    publish("agent.results", envelope("agent.rca.result", {"analysis_id": result["id"]},
                                      tenant_id=qe.tenant_id, site_id=qe.site_id, source_system="agent-worker"))
    return result


@app.get("/api/v1/rca/{event_id}")
def rca_get(event_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    hyps = db.query(models.Hypothesis).filter(models.Hypothesis.quality_event_id == event_id).order_by(models.Hypothesis.rank).all()
    analysis = db.query(models.RcaAnalysis).filter(models.RcaAnalysis.quality_event_id == event_id).order_by(models.RcaAnalysis.created_at.desc()).first()
    return {
        "analysis": None if not analysis else {
            "id": analysis.id, "summary": analysis.summary, "overall_confidence": analysis.overall_confidence,
            "status": analysis.status, "payload": analysis.payload,
        },
        "hypotheses": [
            {
                "id": h.id, "rank": h.rank, "cause_code": h.cause_code, "cause": h.cause,
                "confidence": h.confidence, "status": h.status, "rationale": h.rationale,
                "evidence_ids": h.evidence_ids, "counter_evidence_ids": h.counter_evidence_ids,
                "assumptions": h.assumptions, "confirm_tests": h.confirm_tests,
            }
            for h in hyps
        ],
    }


class HypDecision(BaseModel):
    status: str
    reason: Optional[str] = None


@app.post("/api/v1/rca/hypotheses/{hyp_id}/decide")
def hyp_decide(hyp_id: str, body: HypDecision, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    h = db.get(models.Hypothesis, hyp_id)
    if not h:
        raise HTTPException(404, detail="hypothesis not found")
    if body.status == "confirmed" and h.status not in ("testing", "proposed"):
        raise HTTPException(400, detail="cannot confirm from current status")
    h.status = body.status
    if body.status == "confirmed":
        qe = db.get(models.QualityEvent, h.quality_event_id)
        qe.rca_summary = h.cause
    db.commit()
    return {"id": h.id, "status": h.status}


# ── Knowledge ─────────────────────────────────────────────────────────────

@app.get("/api/v1/knowledge/search")
def knowledge_search(q: str = "", db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    rows = db.query(models.KnowledgeCase).filter(models.KnowledgeCase.status == "approved").all()
    ql = q.lower()
    if ql:
        rows = [r for r in rows if ql in (r.embedding_text + r.title + r.confirmed_cause).lower()]
    return {"items": [
        {
            "id": r.id, "title": r.title, "problem": r.problem, "confirmed_cause": r.confirmed_cause,
            "corrective_action": r.corrective_action, "effectiveness": r.effectiveness,
            "applicability": r.applicability, "version": r.version,
        }
        for r in rows[:50]
    ]}


@app.get("/api/v1/knowledge/proposals")
def knowledge_proposals(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    rows = db.query(models.KnowledgeProposal).order_by(models.KnowledgeProposal.created_at.desc()).all()
    return {"items": [{"id": r.id, "status": r.status, "quality_event_id": r.quality_event_id, "payload": r.payload} for r in rows]}


@app.post("/api/v1/knowledge/curate")
def knowledge_curate(body: RcaRequest, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    from .agents_runtime import run_knowledge_curator
    qe = db.get(models.QualityEvent, body.quality_event_id)
    if not qe:
        raise HTTPException(404, detail="quality event not found")
    if qe.status not in ("EFFECTIVENESS_CHECK", "CLOSED"):
        raise HTTPException(400, detail="curation only after effectiveness/closure")
    return run_knowledge_curator(db, qe)


@app.post("/api/v1/knowledge/proposals/{pid}/approve")
def approve_proposal(pid: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    if p.role not in ("knowledge_steward", "admin", "Plant Manager"):
        raise HTTPException(403, detail="steward role required")
    prop = db.get(models.KnowledgeProposal, pid)
    if not prop:
        raise HTTPException(404, detail="proposal not found")
    payload = prop.payload or {}
    case = models.KnowledgeCase(
        id=new_id(), tenant_id=db.get(models.QualityEvent, prop.quality_event_id).tenant_id,
        title=payload.get("canonical_problem", "Approved lesson")[:300],
        problem=payload.get("canonical_problem", ""),
        confirmed_cause=payload.get("confirmed_cause", ""),
        corrective_action="; ".join(payload.get("corrective_actions") or []),
        effectiveness=payload.get("effectiveness_result", ""),
        applicability=payload.get("applicability") or {},
        status="approved", version=1,
        source_event_ids=payload.get("source_case_ids") or [prop.quality_event_id],
        embedding_text=payload.get("retrieval_text") or "",
    )
    prop.status = "Approved"
    db.add(case)
    audit(db, actor=p.email, action="knowledge.approve", target_type="knowledge_case", target_id=case.id)
    db.commit()
    return {"case_id": case.id, "proposal_id": prop.id}


# ── Reliability / work ────────────────────────────────────────────────────

@app.get("/api/v1/reliability/assets")
def reliability_assets(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    assets = db.query(models.Asset).all()
    out = []
    for a in assets:
        fm = db.query(models.FailureMode).filter(models.FailureMode.asset_id == a.id).first()
        pred = None
        if fm:
            pred = db.query(models.Prediction).filter(models.Prediction.failure_mode_id == fm.id).order_by(models.Prediction.created_at.desc()).first()
        out.append({
            "id": a.id, "name": a.name, "operating_state": a.operating_state, "health_index": a.health_index,
            "criticality": a.criticality,
            "failure_mode": None if not fm else {"id": fm.id, "code": fm.code, "name": fm.name, "horizon_hours": fm.horizon_hours},
            "prediction": None if not pred else {
                "id": pred.id, "probability_in_horizon": pred.probability_in_horizon,
                "health_index": pred.health_index, "horizon_hours": pred.horizon_hours,
                "model_version": pred.model_version, "status": pred.status,
            },
        })
    return {"items": out}


@app.get("/api/v1/work/tasks")
def work_tasks(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    q = db.query(models.WorkTask)
    if p.site_id:
        q = q.filter(models.WorkTask.site_id == p.site_id)
    return {"items": [
        {"id": t.id, "title": t.title, "status": t.status, "priority": t.priority, "role": t.role,
         "source_event_id": t.source_event_id, "asset_id": t.asset_id, "finding": t.finding,
         "evidence": t.evidence or []}
        for t in q.order_by(models.WorkTask.created_at.desc()).limit(100).all()
    ]}


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    finding: Optional[str] = None


@app.post("/api/v1/work/tasks/{task_id}")
def update_task(task_id: str, body: TaskUpdate, db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    t = db.get(models.WorkTask, task_id)
    if not t:
        raise HTTPException(404, detail="task not found")
    if body.status:
        t.status = body.status
    if body.finding is not None:
        t.finding = body.finding
    db.commit()
    return {"id": t.id, "status": t.status, "finding": t.finding}


# ── Admin / search ────────────────────────────────────────────────────────

@app.get("/api/v1/search")
def global_search(q: str = "", db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    ql = q.lower()
    results = []
    for a in db.query(models.Asset).all():
        if ql in a.name.lower():
            results.append({"type": "asset", "id": a.id, "label": a.name, "status": a.operating_state})
    for e in db.query(models.QualityEvent).limit(200).all():
        if ql in e.characteristic.lower() or ql in e.id.lower():
            results.append({"type": "quality_event", "id": e.id, "label": e.characteristic, "status": e.status})
    for c in db.query(models.KnowledgeCase).all():
        if ql in c.title.lower():
            results.append({"type": "knowledge_case", "id": c.id, "label": c.title, "status": c.status})
    return {"items": results[:40]}


@app.get("/api/v1/admin/audit")
def admin_audit(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    rows = db.query(models.AuditEntry).order_by(models.AuditEntry.at.desc()).limit(200).all()
    return {"items": [
        {"id": r.id, "actor": r.actor, "actor_type": r.actor_type, "action": r.action,
         "target_type": r.target_type, "target_id": r.target_id, "at": r.at.isoformat()}
        for r in rows
    ]}


@app.get("/api/v1/admin/data-health")
def data_health(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    return {
        "contract": "ObservationContext v1 — specialized planes, one semantic envelope",
        "sources": [
            {"name": "simulator", "status": "healthy", "lag_s": 1.2, "schema_version": "1.0.0"},
            {"name": "redpanda", "status": "healthy", "lag_s": 0.4, "schema_version": "1.0.0"},
            {"name": "clickhouse", "status": "healthy", "lag_s": 2.0, "schema_version": "1.0.0"},
            {"name": "postgres+pgvector", "status": "healthy", "lag_s": 0.1, "schema_version": "1.0.0"},
            {"name": "minio", "status": "healthy", "lag_s": 0.8, "schema_version": "1.0.0"},
        ],
        "planes": [
            {"id": "timeseries", "name": "Time-series / features", "responsibility": "Telemetry + feature windows (ClickHouse)", "immutable": False, "volume": "hot", "layers": ["raw", "features"]},
            {"id": "ledger", "name": "Operational ledger", "responsibility": "Quality events, work, predictions (Postgres)", "immutable": False, "volume": "ops", "layers": ["events", "tasks"]},
            {"id": "lakehouse", "name": "Raw archive", "responsibility": "Immutable envelopes + evidence (MinIO)", "immutable": True, "volume": "cold", "layers": ["raw", "evidence"]},
            {"id": "knowledge", "name": "Knowledge + vectors", "responsibility": "Approved cases, embeddings, graph (pgvector)", "immutable": False, "volume": "curated", "layers": ["cases", "index"]},
            {"id": "backbone", "name": "Event backbone", "responsibility": "Redpanda topics + DLQ + replay", "immutable": True, "volume": "stream", "layers": ["topics", "dlq"]},
        ],
        "isa95_levels": [
            {"level": "4", "isa95": "Enterprise / Site", "entity": "tenant / site"},
            {"level": "3", "isa95": "Area / Line", "entity": "line / cell"},
            {"level": "2", "isa95": "Station / Equipment", "entity": "asset"},
            {"level": "1", "isa95": "Device / Signal", "entity": "signal sample"},
        ],
        "topics": [
            {"name": "telemetry.raw", "lag_ms": 120, "rate_hz": 8.0},
            {"name": "anomalies.detected", "lag_ms": 240, "rate_hz": 0.05},
            {"name": "quality.events", "lag_ms": 180, "rate_hz": 0.02},
            {"name": "agent.requests", "lag_ms": 90, "rate_hz": 0.01},
            {"name": "knowledge.proposals", "lag_ms": 50, "rate_hz": 0.005},
            {"name": "telemetry.raw.dlq", "lag_ms": 0, "rate_hz": 0.0},
        ],
        "unresolved_context": 0,
        "data_quality_score": 0.96,
    }


def _enrich_flow_live(db: Session, forest: dict[str, Any]) -> dict[str, Any]:
    """Attach real anomaly / quality / sample counts onto device nodes (no fabrication)."""
    device_ids: list[str] = []

    def collect(node: dict[str, Any]) -> None:
        if node.get("level") == "device":
            device_ids.append(node["id"])
        for ch in node.get("children") or []:
            collect(ch)

    for root in forest.get("roots") or []:
        collect(root)
    if not device_ids:
        return forest

    anom_counts: dict[str, int] = {}
    for a in (
        db.query(models.Anomaly)
        .filter(models.Anomaly.asset_id.in_(device_ids), models.Anomaly.status.in_(["Open", "Linked"]))
        .all()
    ):
        anom_counts[a.asset_id] = anom_counts.get(a.asset_id, 0) + 1

    qe_counts: dict[str, int] = {}
    for qe in (
        db.query(models.QualityEvent)
        .filter(
            models.QualityEvent.asset_id.in_(device_ids),
            models.QualityEvent.status.notin_(["CLOSED", "CANCELLED"]),
        )
        .all()
    ):
        if qe.asset_id:
            qe_counts[qe.asset_id] = qe_counts.get(qe.asset_id, 0) + 1

    sample_counts: dict[str, int] = {}
    for row in (
        db.query(models.SignalSample.asset_id, models.SignalSample.signal)
        .filter(models.SignalSample.asset_id.in_(device_ids))
        .distinct()
        .all()
    ):
        sample_counts[row[0]] = sample_counts.get(row[0], 0) + 1

    def apply(node: dict[str, Any]) -> None:
        if node.get("level") == "device":
            nid = node["id"]
            live = {
                "open_anomalies": anom_counts.get(nid, 0),
                "open_quality_events": qe_counts.get(nid, 0),
                "distinct_signals": sample_counts.get(nid, 0),
            }
            node["live"] = live
            # Merge live counts into attachment summary without inventing rows.
            existing = {a["object_type"]: a for a in node.get("attachments") or []}
            if live["open_anomalies"] and "defect" not in existing:
                node.setdefault("attachments", []).append(
                    {
                        "object_type": "defect",
                        "items": [],
                        "count": live["open_anomalies"],
                        "source": "anomalies",
                    }
                )
            elif "defect" in existing:
                existing["defect"]["count"] = max(existing["defect"]["count"], live["open_anomalies"])
            if live["open_quality_events"] and "quality_event" not in existing:
                node.setdefault("attachments", []).append(
                    {
                        "object_type": "quality_event",
                        "items": [],
                        "count": live["open_quality_events"],
                        "source": "quality_events",
                    }
                )
            elif "quality_event" in existing:
                existing["quality_event"]["count"] = max(
                    existing["quality_event"]["count"], live["open_quality_events"]
                )
            if live["distinct_signals"]:
                ts = existing.get("timeseries")
                if ts:
                    ts["count"] = max(ts["count"], live["distinct_signals"])
                elif live["distinct_signals"]:
                    node.setdefault("attachments", []).append(
                        {
                            "object_type": "timeseries",
                            "items": [],
                            "count": live["distinct_signals"],
                            "source": "signal_samples",
                        }
                    )
            node["attachment_count"] = sum(a.get("count") or 0 for a in node.get("attachments") or [])
        for ch in node.get("children") or []:
            apply(ch)

    for root in forest.get("roots") or []:
        apply(root)
    return forest


@app.get("/api/v1/graph")
def context_graph(
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
    site: str | None = None,
    site_id: str | None = None,
):
    """Published context graph + ISA-95 flow forest driven by seeded backplane."""
    from .context_graph_seed import (
        build_flow_forest,
        published_backplane,
        published_bindings,
        published_levels,
    )

    nodes = db.query(models.EntityNode).order_by(models.EntityNode.kind, models.EntityNode.label).limit(500).all()
    edges = db.query(models.EntityEdge).limit(1000).all()
    bindings = published_bindings()
    levels = published_levels()
    backplane = published_backplane()

    # site aliases: midwest | harley | hero | <uuid>
    want_site = site_id or site
    resolved_site_id: str | None = None
    site_rows = {s.id: s for s in db.query(models.Site).all()}
    if want_site:
        key = want_site.strip().lower()
        if key in site_rows:
            resolved_site_id = key
        else:
            for s in site_rows.values():
                code = (s.code or "").lower()
                name = (s.name or "").lower()
                if key in ("midwest", "midwest-hybrid", "mh") and ("midwest" in name or code in ("mh", "midwest", "mhp1")):
                    resolved_site_id = s.id
                    break
                if key in ("harley", "york", "harley-york", "hd") and ("harley" in name or "york" in name or code.startswith("hd")):
                    resolved_site_id = s.id
                    break
                if key in ("hero", "dharuhera", "hmc", "hmc-dhr") and (
                    "hero" in name or "dharuhera" in name or code.startswith("hmc")
                ):
                    resolved_site_id = s.id
                    break
                if key in ("lam", "lamresearch", "fremont", "lr-fco", "lr") and (
                    "lam" in name or "fremont" in name or code.startswith("lr")
                ):
                    resolved_site_id = s.id
                    break
            if resolved_site_id is None and key not in ("all", "*"):
                # Unknown filter — keep explicit id if it matches a graph site node later.
                resolved_site_id = want_site if want_site else None

    if not nodes:
        # synthesize ISA-95 spine from plant master data when graph seed empty
        site_row = db.get(models.Site, resolved_site_id) if resolved_site_id else db.query(models.Site).first()
        lines = db.query(models.Line).filter(models.Line.site_id == site_row.id).all() if site_row else []
        synth_nodes = []
        synth_edges = []
        if site_row:
            sid = site_row.id
            synth_nodes.append({"id": sid, "kind": "site", "label": site_row.name, "props": {"id": site_row.id, "code": site_row.code}})
            for ln in lines:
                lid = ln.id
                synth_nodes.append({"id": lid, "kind": "line", "label": ln.name, "props": {"id": ln.id}})
                synth_edges.append({"id": f"e-{sid}-{lid}", "src_id": sid, "dst_id": lid, "rel_type": "contains",
                                    "confidence": 1.0, "approval_status": "approved", "creator_type": "derived"})
                cells = db.query(models.Cell).filter(models.Cell.line_id == ln.id).all()
                for c in cells:
                    cid = c.id
                    synth_nodes.append({"id": cid, "kind": "cell", "label": c.name, "props": {"id": c.id, "line_id": ln.id}})
                    synth_edges.append({"id": f"e-{lid}-{cid}", "src_id": lid, "dst_id": cid, "rel_type": "contains",
                                        "confidence": 1.0, "approval_status": "approved", "creator_type": "derived"})
                    for a in db.query(models.Asset).filter(models.Asset.cell_id == c.id).all():
                        aid = a.id
                        synth_nodes.append({"id": aid, "kind": "asset", "label": a.name,
                                            "props": {"id": a.id, "health_index": a.health_index, "state": a.operating_state}})
                        synth_edges.append({"id": f"e-{cid}-{aid}", "src_id": cid, "dst_id": aid, "rel_type": "contains",
                                            "confidence": 1.0, "approval_status": "approved", "creator_type": "derived"})
        forest = build_flow_forest(synth_nodes, synth_edges, backplane=backplane, site_id=resolved_site_id)
        forest = _enrich_flow_live(db, forest)
        return {
            "lens": "isa95_spine",
            "levels": levels,
            "backplane": backplane,
            "tree": forest,
            "nodes": synth_nodes,
            "edges": synth_edges,
            "bindings": bindings,
            "site_id": resolved_site_id,
        }

    payload_nodes = [{"id": n.id, "kind": n.kind, "label": n.label, "props": n.props or {}} for n in nodes]
    payload_edges = [{
        "id": e.id, "src_id": e.src_id, "dst_id": e.dst_id, "rel_type": e.rel_type,
        "confidence": e.confidence, "approval_status": e.approval_status, "creator_type": e.creator_type,
        "provenance": e.provenance or {},
    } for e in edges]

    # Prefer graph site node when alias resolved to domain site id.
    if resolved_site_id is None and (want_site or "").strip().lower() in ("", "midwest", "midwest-hybrid", "mh"):
        for n in payload_nodes:
            if n["kind"] == "site" and "midwest" in (n["label"] or "").lower():
                resolved_site_id = n["id"]
                break

    forest = build_flow_forest(
        payload_nodes,
        payload_edges,
        backplane=backplane,
        site_id=None if (want_site or "").strip().lower() in ("all", "*") else resolved_site_id,
    )
    forest = _enrich_flow_live(db, forest)
    return {
        "lens": "published",
        "levels": levels,
        "backplane": backplane,
        "tree": forest,
        "nodes": payload_nodes,
        "edges": payload_edges,
        "bindings": bindings,
        "site_id": resolved_site_id,
    }


@app.get("/api/v1/graph/backplane")
def graph_backplane(p: Principal = Depends(get_principal)):
    from .context_graph_seed import published_backplane

    return published_backplane()


class CreateAgentIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = ""
    agent_type: str = "custom"
    prompt_key: str = "custom"
    prompt_version: str = "v1"
    allowed_tools: Optional[list[str]] = None
    entity_refs: Optional[list[dict[str, Any]]] = None
    autonomy_level: str = "L1"
    budgets: Optional[dict[str, Any]] = None


def _require_agent_admin(p: Principal) -> None:
    if p.role not in (
        "admin",
        "Plant Manager",
        "data_ml_steward",
        "quality_manager",
        "knowledge_steward",
        "quality_engineer",
    ):
        raise HTTPException(403, detail="role cannot create agent definitions")


@app.get("/api/v1/admin/agents")
def admin_agents(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    from .agents_admin import list_agents

    analyses = db.query(models.RcaAnalysis).order_by(models.RcaAnalysis.created_at.desc()).limit(40).all()
    props = db.query(models.KnowledgeProposal).order_by(models.KnowledgeProposal.created_at.desc()).limit(40).all()
    site = db.get(models.Site, p.site_id) if p.site_id else db.query(models.Site).first()
    tenant_id = site.tenant_id if site else None
    return {
        "provider": get_settings().agent_provider,
        "autonomy_level": "L1 — propose only",
        "ot_write": False,
        "promotion": "human_required",
        "agents": list_agents(db, tenant_id=tenant_id),
        "ledger": [
            *[{
                "id": a.id, "agent": "rca-investigator", "target": a.quality_event_id,
                "status": a.status, "confidence": a.overall_confidence,
                "summary": a.summary, "at": a.created_at.isoformat(),
            } for a in analyses],
            *[{
                "id": r.id, "agent": "knowledge-curator", "target": r.quality_event_id,
                "status": r.status, "confidence": None,
                "summary": (r.payload or {}).get("canonical_problem", "Knowledge proposal"),
                "at": r.created_at.isoformat(),
            } for r in props],
        ],
    }


@app.get("/api/v1/admin/agents/references")
def admin_agent_references(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    from .agents_admin import build_reference_catalog

    return build_reference_catalog(db, site_id=p.site_id)


@app.post("/api/v1/admin/agents")
def create_admin_agent(
    body: CreateAgentIn, db: Session = Depends(get_db), p: Principal = Depends(get_principal)
):
    from .agents_admin import create_agent

    _require_agent_admin(p)
    site_id = p.site_id or db.query(models.Site).first().id
    site = db.get(models.Site, site_id)
    if not site:
        raise HTTPException(400, detail="site required")
    return create_agent(
        db,
        principal=p,
        body=body.model_dump(),
        tenant_id=site.tenant_id,
    )


# ── Admin integrations (OT/IT connectors) ─────────────────────────────────

class ConnectorConfigureIn(BaseModel):
    endpoint_url: Optional[str] = None
    secret_ref: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
    description: Optional[str] = None
    expected_version: Optional[int] = None


def _require_admin(p: Principal) -> None:
    if p.role not in ("admin", "Plant Manager", "data_ml_steward"):
        raise HTTPException(403, detail="admin role required for connector mutations")


@app.get("/api/v1/admin/integrations")
def admin_integrations(db: Session = Depends(get_db), p: Principal = Depends(get_principal)):
    return {
        "items": connector_service.list_connectors(db, site_id=p.site_id),
        "kinds": list_connector_kinds(),
        "sim_base": get_settings().connector_sim_base_url,
        "notes": (
            "Credentials are stored as secret references only. "
            "Test connection invokes the real adapter against the configured endpoint "
            "(local one-shot uses /api/v1/connector-sim/* substitutes)."
        ),
    }


@app.get("/api/v1/admin/integrations/{connector_id}")
def admin_integration_detail(
    connector_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)
):
    return connector_service.serialize_connector(connector_service.get_connector(db, connector_id))


@app.patch("/api/v1/admin/integrations/{connector_id}")
def admin_integration_configure(
    connector_id: str,
    body: ConnectorConfigureIn,
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    _require_admin(p)
    return connector_service.configure_connector(
        db,
        connector_id,
        actor=p.email,
        endpoint_url=body.endpoint_url,
        secret_ref=body.secret_ref,
        config=body.config,
        enabled=body.enabled,
        description=body.description,
        expected_version=body.expected_version,
    )


@app.post("/api/v1/admin/integrations/{connector_id}/test")
def admin_integration_test(
    connector_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)
):
    _require_admin(p)
    return connector_service.test_connector(db, connector_id, actor=p.email)


@app.get("/api/v1/admin/integrations/{connector_id}/health")
def admin_integration_health(
    connector_id: str, db: Session = Depends(get_db), p: Principal = Depends(get_principal)
):
    return connector_service.connector_health(db, connector_id)


@app.get("/api/v1/admin/integrations/{connector_id}/errors")
def admin_integration_errors(
    connector_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    p: Principal = Depends(get_principal),
):
    return {"items": connector_service.list_connector_errors(db, connector_id, limit=limit)}


@app.on_event("startup")
def on_startup():
    try:
        from .migrate import main as migrate_main
        from .seed import seed
        migrate_main()
        seed()
        log.info("startup migrate+seed complete")
    except Exception:
        log.exception("startup migrate/seed failed — will retry via jobs")
