"""OT/IT connector adapters + local simulator contracts."""
from __future__ import annotations

import json
import os
import socket
import threading
import time
import urllib.request

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from factoryops_api.connectors.adapters import (
    CmmsRestAdapter,
    MesRestAdapter,
    OpcUaAdapter,
    QmsRestAdapter,
)
from factoryops_api.connectors.sim_targets import router as sim_router
from factoryops_domain.connectors import ConnectorKind

API = os.getenv("API_DIRECT", "http://127.0.0.1:18000")


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="module")
def sim_base_url():
    """Serve connector-sim on an ephemeral local port for real HTTP adapter calls."""
    import uvicorn

    port = _free_port()
    app = FastAPI()
    app.include_router(sim_router)
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    assert server.started, "connector-sim test server failed to start"
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True


def test_sim_health_contracts():
    app = FastAPI()
    app.include_router(sim_router)
    client = TestClient(app)
    assert client.get("/api/v1/connector-sim/opcua/health").json()["system"] == "opcua-http-bridge"
    assert client.get("/api/v1/connector-sim/mes/health").json()["system"] == "mes"
    assert client.get("/api/v1/connector-sim/qms/health").json()["system"] == "qms"
    assert client.get("/api/v1/connector-sim/cmms/health").json()["system"] == "cmms"


def test_adapters_against_local_sim(sim_base_url):
    base = sim_base_url
    opc = OpcUaAdapter().test_connection(
        endpoint_url=f"{base}/api/v1/connector-sim/opcua",
        secret="opcua-demo-token",
        config={"security_mode": "None", "node_ids": ["ns=2;s=Spindle.Vibration"]},
    )
    mes = MesRestAdapter().test_connection(
        endpoint_url=f"{base}/api/v1/connector-sim/mes",
        secret="mes-demo-token",
        config={},
    )
    qms = QmsRestAdapter().test_connection(
        endpoint_url=f"{base}/api/v1/connector-sim/qms",
        secret="qms-demo-token",
        config={},
    )
    cmms = CmmsRestAdapter().test_connection(
        endpoint_url=f"{base}/api/v1/connector-sim/cmms",
        secret="cmms-demo-token",
        config={},
    )
    assert opc.ok, opc.message
    assert mes.ok, mes.message
    assert qms.ok, qms.message
    assert cmms.ok, cmms.message
    assert ConnectorKind.OPC_UA.value == "opc_ua"


def test_bad_token_fails(sim_base_url):
    result = MesRestAdapter().test_connection(
        endpoint_url=f"{sim_base_url}/api/v1/connector-sim/mes",
        secret="wrong-token",
        config={},
    )
    assert not result.ok


def _api_ready() -> bool:
    try:
        with urllib.request.urlopen(f"{API}/ready", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


@pytest.mark.skipif(not _api_ready(), reason="API not running")
def test_live_admin_integrations_test_connection():
    def req(method: str, path: str, token: str | None = None, data=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        body = None if data is None else json.dumps(data).encode()
        request = urllib.request.Request(API + path, data=body, headers=headers, method=method)
        with urllib.request.urlopen(request, timeout=30) as resp:
            return json.load(resp)

    token = req("POST", "/api/v1/auth/login", data={"email": "admin@factoryops.local", "password": "demo"})["token"]
    listing = req("GET", "/api/v1/admin/integrations", token=token)
    assert len(listing["items"]) >= 4
    for item in listing["items"]:
        out = req("POST", f"/api/v1/admin/integrations/{item['id']}/test", token=token)
        assert out["result"]["ok"] is True, (item["kind"], out["result"]["message"])
        health = req("GET", f"/api/v1/admin/integrations/{item['id']}/health", token=token)
        assert health["status"] == "healthy"
