"""Live golden path against a running API (skipped if API not up)."""
from __future__ import annotations
import json
import os
import urllib.error
import urllib.request

import pytest

API = os.getenv("API_DIRECT", "http://127.0.0.1:18000")


def _ready() -> bool:
    try:
        with urllib.request.urlopen(f"{API}/ready", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _ready(), reason="API not running")


def req(method: str, path: str, token: str | None = None, data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(API + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as resp:
        return json.load(resp)


def login(email: str) -> str:
    return req("POST", "/api/v1/auth/login", data={"email": email, "password": "demo"})["token"]


def test_eight_step_bearing_wear_path():
    qe = login("qe@factoryops.local")
    events = req("GET", "/api/v1/quality/events", token=qe)["items"]
    ev = next((e for e in events if e["status"] != "CLOSED"), None)
    if not ev:
        anoms = req("GET", "/api/v1/anomalies", token=qe)["items"]
        assert anoms, "need anomaly or open QE"
        ev = req("POST", f"/api/v1/anomalies/{anoms[0]['id']}/create-quality-event", token=qe)
    eid = ev["id"]

    def transition(email: str, to: str, **extra):
        t = login(email)
        cur = req("GET", f"/api/v1/quality/events/{eid}", token=t)
        if cur["status"] in (to, "CLOSED"):
            return cur
        return req(
            "POST",
            f"/api/v1/quality/events/{eid}/transition",
            token=t,
            data={"to_status": to, "expected_version": cur["version"], **extra},
        )

    transition("qe@factoryops.local", "VALIDATION")
    transition("qe@factoryops.local", "CONTAINMENT", containment="Hold lot")
    transition("qe@factoryops.local", "INVESTIGATION")
    req("POST", "/api/v1/rca/investigate", token=login("qe@factoryops.local"), data={"quality_event_id": eid})
    mt = login("mt@factoryops.local")
    tasks = req("GET", "/api/v1/work/tasks", token=mt)["items"]
    task = next((t for t in tasks if t.get("source_event_id") == eid), tasks[0] if tasks else None)
    if task:
        req("POST", f"/api/v1/work/tasks/{task['id']}", token=mt, data={"finding": "Outer race spalling", "status": "Done"})
    transition("qe@factoryops.local", "DISPOSITION", disposition="Rework")
    transition("qe@factoryops.local", "CORRECTIVE_ACTION", corrective_action="Replace bearing")
    transition("qm@factoryops.local", "EFFECTIVENESS_CHECK", effectiveness="No recurrence 14d")
    closed = transition("qm@factoryops.local", "CLOSED", effectiveness="No recurrence 14d")
    assert closed["status"] == "CLOSED"
    ks = login("ks@factoryops.local")
    req("POST", "/api/v1/knowledge/curate", token=ks, data={"quality_event_id": eid})
    props = req("GET", "/api/v1/knowledge/proposals", token=ks)["items"]
    pending = next((p for p in props if p["status"] == "Pending Approval"), None)
    if pending:
        req("POST", f"/api/v1/knowledge/proposals/{pending['id']}/approve", token=ks)
    assert req("GET", "/api/v1/knowledge/search?q=bearing", token=ks)["items"]
