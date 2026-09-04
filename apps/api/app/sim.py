"""
Live plant simulator.

Mutates station states, cycle times, inspections and KPIs on a short tick
for every seeded workspace and pushes envelope-wrapped events to WebSocket
clients subscribed to that workspace.
"""

from __future__ import annotations

import asyncio
import json
import random
import uuid
from datetime import datetime, timezone

from .store import (
    DB,
    DEFECT_CLASSES,
    all_workspace_ids,
    append_tag_sample,
    ingest_edge_envelopes,
    next_tag_value,
    new_id,
    now,
    reset_workspace,
    set_workspace,
    snapshot_history,
)


class Broadcaster:
    def __init__(self):
        # ws → workspace_id
        self.clients: dict = {}

    async def register(self, ws, workspace_id: str = "harley"):
        self.clients[ws] = workspace_id

    def unregister(self, ws):
        self.clients.pop(ws, None)

    async def publish(self, topic: str, payload: dict, workspace_id: str | None = None):
        """Wrap in the canonical event envelope, persist on backbone, fan out to WS clients."""
        from .store import get_workspace_id
        from .platform import bus as event_bus

        wid = workspace_id or get_workspace_id()
        # Persist on event backbone (also lakehouse append)
        try:
            envelope = event_bus.publish(
                topic,
                payload,
                source_system=f"sim://{wid}",
                workspace_id=wid,
            )
        except Exception:
            envelope = {
                "envelope_version": "1.0",
                "event_id": uuid.uuid4().hex,
                "topic": topic,
                "source": f"sim://{wid}",
                "workspace_id": wid,
                "source_timestamp": now(),
                "timestamp_trust": 0.98,
                "payload": payload,
            }
        # WS clients still receive the envelope
        dead = []
        text = json.dumps(envelope)
        for ws, client_ws in list(self.clients.items()):
            if client_ws != wid:
                continue
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unregister(ws)


broadcaster = Broadcaster()

_TRANSITIONS = {
    "Running": [("Running", 0.86), ("Blocked", 0.04), ("Starved", 0.04), ("Faulted", 0.03), ("Changeover", 0.03)],
    "Blocked": [("Running", 0.55), ("Blocked", 0.45)],
    "Starved": [("Running", 0.5), ("Starved", 0.5)],
    "Faulted": [("Faulted", 0.6), ("Running", 0.35), ("Maintenance", 0.05)],
    "Changeover": [("Changeover", 0.55), ("Running", 0.45)],
    "Maintenance": [("Maintenance", 0.8), ("Running", 0.2)],
    "Quality Hold": [("Quality Hold", 0.9), ("Running", 0.1)],
    "Offline": [("Offline", 0.92), ("Running", 0.08)],
}


def _pick(transitions):
    r = random.random()
    acc = 0.0
    for state, p in transitions:
        acc += p
        if r <= acc:
            return state
    return transitions[0][0]


async def run_simulator():
    tick = 0
    while True:
        await asyncio.sleep(4)
        tick += 1
        try:
            for wid in all_workspace_ids():
                token = set_workspace(wid)
                try:
                    await _tick(tick, wid)
                finally:
                    reset_workspace(token)
        except Exception:
            # simulator must never take the API down
            pass


async def _tick(tick: int, workspace_id: str):
    # 1. Randomly evolve a few station states
    stations = list(DB["stations"].values())
    if not stations:
        return
    for st in random.sample(stations, k=min(4, len(stations))):
        old = st["state"]
        new = _pick(_TRANSITIONS.get(old, [("Running", 1.0)]))
        if new != old:
            st["state"] = new
            st["state_since"] = now()
            await broadcaster.publish("production.event.state", {
                "station_id": st["id"], "station": st["name"],
                "from": old, "to": new,
            }, workspace_id=workspace_id)
        st["cycle_time_s"] = round(
            max(30.0, min(95.0, st["cycle_time_s"] + random.uniform(-1.5, 1.5))), 1)

    # 2. Occasionally emit an inspection result
    if tick % 2 == 0 and DB["models"]:
        model = random.choice(list(DB["models"].values()))
        vins = list(DB["vins"].keys())
        verdict = random.choices(["Pass", "Fail", "Review"], weights=[88, 6, 6])[0]
        conf = round(random.uniform(0.55, 0.95), 3) if verdict == "Review" else round(random.uniform(0.9, 0.999), 3)
        iid = new_id("insp")
        evidence_ref = f"IMG-{random.randint(100000, 999999)}"
        insp = {
            "id": iid, "vin": random.choice(vins) if vins else None,
            "station_id": model["station_id"], "model_id": model["id"],
            "model_version": model["version"], "verdict": verdict,
            "confidence": conf, "captured": now(),
            "camera": f"CAM-{random.randint(1, 4)}",
            "lighting_recipe": f"LR-{random.randint(1, 4)}",
            "evidence_ref": evidence_ref,
            "image_seed": abs(hash(iid)) % 10_000,
            "disposition": None,
        }
        DB["inspections"][iid] = insp
        await broadcaster.publish("quality.vision.inference", insp, workspace_id=workspace_id)

        if verdict in ("Fail", "Review"):
            classes = DB.get("defect_classes") or DEFECT_CLASSES
            defect_name, kind = random.choice(classes)
            did = new_id("def")
            DB["defects"][did] = {
                "id": did, "inspection_id": iid, "vin": insp["vin"],
                "station_id": insp["station_id"], "class": defect_name,
                "kind": kind,
                "severity": random.choice(["Critical", "Major", "Minor"]),
                "confidence": conf, "detected": now(), "status": "Open",
                "disposition": None,
                "defect_dna": {"fingerprint": uuid.uuid4().hex[:16],
                               "similar_events": random.randint(0, 9),
                               "cross_line_matches": random.randint(0, 3)},
                "repeat_rate_shift": round(random.uniform(0.0, 0.09), 3),
            }
            await broadcaster.publish("quality.vision.defect", DB["defects"][did], workspace_id=workspace_id)

    # 3. KPI drift
    k = DB["kpis"]
    if k:
        k["actual_units"] = k.get("actual_units", 371) + (1 if random.random() > 0.4 else 0)
        k["oee"] = round(max(0.55, min(0.92, k["oee"] + random.uniform(-0.004, 0.004))), 3)
        k["fpy"] = round(max(0.9, min(0.995, k["fpy"] + random.uniform(-0.002, 0.002))), 3)
        k["money_saved_today_usd"] = round(k["money_saved_today_usd"] + random.uniform(4, 60), 2)
        k["hours_saved_today"] = round(k["hours_saved_today"] + random.uniform(0.01, 0.12), 2)
        if tick % 5 == 0:
            await broadcaster.publish("analytics.kpi.tick", {
                "oee": k["oee"], "fpy": k["fpy"], "actual_units": k["actual_units"],
                "money_saved_today_usd": k["money_saved_today_usd"],
            }, workspace_id=workspace_id)

    # 4. Edge queue evolution
    for node in DB["edge_nodes"].values():
        if node["health"] == "Offline":
            node["queue_depth"] += random.randint(2, 9)
        elif node["queue_depth"] > 0:
            node["queue_depth"] = max(0, node["queue_depth"] - random.randint(0, 5))

    # 5. History snapshot for causal time travel (~ every 20 s)
    if tick % 5 == 0:
        snapshot_history()

    # 6. Advance configured PLC / Open Protocol tag series (Twin live trends)
    tagged = [d for d in DB["devices"].values() if d.get("tags")]
    for d in tagged:
        st = DB["stations"].get(d.get("station_id"))
        for tag in d["tags"]:
            val = next_tag_value(tag, st)
            append_tag_sample(d["id"], tag["key"], val, maxlen=60)

    # 7. Edge+ live uplink sim — inject LiveEnvelope samples when recipes exist
    #    so Factory Twin charts work without a real Edge+ agent. Real agents
    #    POST the same shape to /api/edge/nodes/{id}/events.
    await _tick_edge_live(tick, workspace_id)

    # 8. Detection plane — features + candidate events (not LLM on raw HF feeds)
    if tick % 3 == 0:
        await _tick_detection(workspace_id)


async def _tick_detection(workspace_id: str):
    from .platform import detection
    from .platform.semantic import build_context_from_station

    stations = list(DB["stations"].values())
    if not stations:
        return
    site = next(iter(DB["sites"].values()), None)
    st = random.choice(stations)
    area = DB["areas"].get(st.get("area_id") or "")
    line = DB["lines"].get(st.get("line_id") or "")
    vins = list(DB["vins"].values())
    vin = random.choice(vins) if vins else None
    order = DB["orders"].get((vin or {}).get("order_id") or "") if vin else None
    ctx = build_context_from_station(
        st, site=site, area=area, line=line, order=order, vin=vin,
        source_system_ref=f"sim://{workspace_id}/detection",
    )
    samples = None
    # Prefer real tag series when available
    for d in DB["devices"].values():
        if d.get("station_id") == st["id"] and d.get("id") in (DB.get("tag_series") or {}):
            series = DB["tag_series"][d["id"]]
            if series:
                key = next(iter(series))
                samples = list(series[key][-24:])
                break
    detection.tick_station(st, ctx, samples)


async def _tick_edge_live(tick: int, workspace_id: str):
    """Simulate Edge+ LiveEnvelope uplink into edge_live buffers + /ws/live."""
    recipes = DB.get("edge_recipes") or {}
    if not recipes:
        return
    # Don't flood every tick for every recipe tag — sample a subset
    for node_id, recipe in list(recipes.items()):
        node = DB["edge_nodes"].get(node_id)
        if not node or node.get("health") == "Offline":
            continue
        station = recipe.get("station") or {}
        envelopes: list[dict] = []
        for d in recipe.get("devices") or []:
            if (d.get("metadata") or {}).get("placeholder"):
                continue
            mes_dev = DB["devices"].get(d.get("id"))
            st = DB["stations"].get(
                (mes_dev or {}).get("station_id") or station.get("station_id")
            )
            mes_tags_by_key = {
                t.get("key"): t for t in (mes_dev or {}).get("tags") or [] if t.get("key")
            }
            for rt in d.get("tags") or []:
                # Prefer MES engineering base/jitter when source_address matches
                src = rt.get("source_address")
                mes_tag = mes_tags_by_key.get(src) if src else None
                if mes_tag:
                    val = next_tag_value(mes_tag, st)
                else:
                    # Mild synthetic drift around a unit-aware default
                    unit = (rt.get("unit") or "").lower()
                    base = 180.0 if unit in ("a",) else 1.0
                    if "current" in (rt.get("name") or "").lower() or "current" in (rt.get("id") or ""):
                        base = 180.0
                    val = round(base * (1 + random.uniform(-0.05, 0.05)), 3)
                envelopes.append(
                    {
                        "envelope_version": "1.0",
                        "event_id": uuid.uuid4().hex,
                        "topic": "edge.telemetry.tag",
                        "source": f"edge://{node_id}",
                        "source_timestamp": now(),
                        "timestamp_trust": 0.95,
                        "payload": {
                            "node_id": node_id,
                            "recipe_id": recipe.get("recipe_id"),
                            "recipe_version": recipe.get("recipe_version"),
                            "facility_id": station.get("facility_id"),
                            "area_id": station.get("area_id"),
                            "line_id": station.get("line_id"),
                            "station_id": station.get("station_id"),
                            "device_id": d.get("id"),
                            "tag_id": rt.get("id"),
                            "canonical": rt.get("canonical_path"),
                            "source_address": src,
                            "value": val,
                            "unit": rt.get("unit") or "",
                            "data_type": rt.get("data_type") or "float",
                            "quality": "good",
                        },
                    }
                )
        if not envelopes:
            continue
        # Cap per tick for demo (prefer PLC process tags first)
        batch = envelopes[:8]
        ingest_edge_envelopes(node_id, batch)
        ring = DB.setdefault("edge_telemetry", [])
        ring.append({"node_id": node_id, "at": now(), "count": len(batch), "events": batch[:20]})
        if len(ring) > 200:
            del ring[:-200]
        node["last_seen"] = now()
        # Fan out primary sample to WS clients (Twin also polls REST live buffer)
        if batch:
            await broadcaster.publish(
                "edge.telemetry.tag",
                batch[0]["payload"],
                workspace_id=workspace_id,
            )
