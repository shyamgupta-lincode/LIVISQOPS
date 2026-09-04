"""Auth API: login, logout, session, workspace catalog."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .. import auth, tenants
from ..store import DB, get_workspace_id

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str
    domain: str | None = Field(
        default=None,
        description="Optional domain override; normally taken from email",
    )


@router.get("/workspaces")
def list_workspaces():
    """Public catalog for the login screen (domains + demo emails)."""
    return {
        "workspaces": tenants.demo_catalog(),
        "demo_password": auth.DEMO_PASSWORD,
    }


@router.get("/resolve")
def resolve_domain(email: str = "", domain: str = ""):
    """Live hint: which workspace an email/domain maps to."""
    ws = None
    if domain:
        ws = tenants.workspace_for_domain(domain)
    if not ws and email:
        ws = tenants.workspace_for_email(email)
    if not ws:
        return {"workspace": None, "known": False}
    return {"workspace": tenants.public_workspace(ws), "known": True}


@router.post("/login")
def login(body: LoginBody):
    try:
        result = auth.login(body.email, body.password, domain=body.domain)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    return result


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = auth.parse_bearer(authorization)
    auth.logout(token)
    return {"ok": True}


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    token = auth.parse_bearer(authorization)
    session = auth.session_for(token)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    site = next(iter(DB["sites"].values()), None) if get_workspace_id() else None
    # Prefer session workspace; enrich with live site name when scoped
    workspace = dict(session["workspace"])
    if site:
        workspace["site_label"] = site.get("name") or workspace.get("site_label")
        workspace["shift"] = site.get("shift")
    return {
        "user": {
            "email": session["email"],
            "name": session["name"],
            "role": session["role"],
        },
        "workspace": workspace,
        "token": session["token"],
    }
