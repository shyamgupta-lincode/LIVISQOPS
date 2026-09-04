"""LIVIS MES central control plane API."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import auth as auth_mod
from . import sim, store
from .routers import (
    admin, agents, auth, backbone, crud, data_planes, edge, events, graph,
    learning, pdm, production, quality, quality_events, topology, value, vision,
    warranty,
)

PUBLIC_PREFIXES = (
    "/api/health",
    "/api/auth/login",
    "/api/auth/workspaces",
    "/api/auth/resolve",
    "/docs",
    "/openapi.json",
    "/redoc",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    store.seed()
    task = asyncio.create_task(sim.run_simulator())
    yield
    task.cancel()


app = FastAPI(
    title="LIVIS MES",
    description="Vision-Native Manufacturing Operations System - central control plane",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def workspace_session_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith(PUBLIC_PREFIXES) or request.method == "OPTIONS":
        return await call_next(request)

    if not path.startswith("/api/") and not path.startswith("/ws/"):
        return await call_next(request)

    # /api/auth/logout and /api/auth/me still need a token
    token = auth_mod.parse_bearer(request.headers.get("authorization"))
    if not token:
        token = request.query_params.get("token")
    session = auth_mod.session_for(token)
    if not session:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)

    ws_token = store.set_workspace(session["workspace_id"])
    request.state.session = session
    try:
        return await call_next(request)
    finally:
        store.reset_workspace(ws_token)


for r in (
    auth, topology, production, quality, quality_events, vision, agents, edge, events,
    value, admin, graph, crud, warranty, backbone, data_planes, pdm, learning,
):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "livis-central",
        "version": "1.1.0",
        "workspaces": store.all_workspace_ids(),
    }


@app.websocket("/ws/live")
async def live_events(ws: WebSocket):
    await ws.accept()
    # Token via query ?token=… (browsers cannot set WS Authorization easily)
    token = ws.query_params.get("token")
    session = auth_mod.session_for(token)
    if not session:
        await ws.close(code=4401)
        return
    workspace_id = session["workspace_id"]
    await sim.broadcaster.register(ws, workspace_id)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        sim.broadcaster.unregister(ws)
    except Exception:
        sim.broadcaster.unregister(ws)
