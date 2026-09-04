"""Demo auth: email domain → workspace, opaque session tokens."""

from __future__ import annotations

import secrets
import time
from typing import Any

from . import tenants

# Shared demo password for all seeded users
DEMO_PASSWORD = "demo"

DEMO_USERS: list[dict[str, Any]] = [
    {
        "email": "jordan.hale@harleydavidson.com",
        "password": DEMO_PASSWORD,
        "name": "Jordan Hale",
        "role": "Plant Manager",
        "workspace_id": "harley",
    },
    {
        "email": "t.brennan@harleydavidson.com",
        "password": DEMO_PASSWORD,
        "name": "T. Brennan",
        "role": "Area Manager",
        "workspace_id": "harley",
    },
    {
        "email": "alex.reyes@meridiandynamics.com",
        "password": DEMO_PASSWORD,
        "name": "Alex Reyes",
        "role": "Plant Manager",
        "workspace_id": "tier1",
    },
    {
        "email": "sam.okonkwo@meridiandynamics.com",
        "password": DEMO_PASSWORD,
        "name": "Sam Okonkwo",
        "role": "Quality Lead",
        "workspace_id": "tier1",
    },
    {
        "email": "priya.shah@apexpercision.com",
        "password": DEMO_PASSWORD,
        "name": "Priya Shah",
        "role": "Plant Manager",
        "workspace_id": "tier2",
    },
    {
        "email": "marcus.lee@apexpercision.com",
        "password": DEMO_PASSWORD,
        "name": "Marcus Lee",
        "role": "Process Engineer",
        "workspace_id": "tier2",
    },
    {
        "email": "ops.lead@lamresearch.com",
        "password": DEMO_PASSWORD,
        "name": "Maya Chen",
        "role": "Ops Lead",
        "workspace_id": "lam",
    },
    {
        "email": "raj.patel@lamresearch.com",
        "password": DEMO_PASSWORD,
        "name": "Raj Patel",
        "role": "Quality Lead",
        "workspace_id": "lam",
    },
    {
        "email": "claire.hale@hemlocksemi.com",
        "password": DEMO_PASSWORD,
        "name": "Claire Hale",
        "role": "Plant Manager",
        "workspace_id": "hemlock",
    },
    {
        "email": "nora.brooks@hemlocksemi.com",
        "password": DEMO_PASSWORD,
        "name": "Nora Brooks",
        "role": "Quality Lead",
        "workspace_id": "hemlock",
    },
]

# token → session
_SESSIONS: dict[str, dict[str, Any]] = {}


def _user_by_email(email: str) -> dict | None:
    e = (email or "").strip().lower()
    for u in DEMO_USERS:
        if u["email"].lower() == e:
            return u
    return None


def login(email: str, password: str, domain: str | None = None) -> dict:
    """Authenticate and create a session. Domain may override email domain for demos."""
    email = (email or "").strip().lower()
    password = password or ""

    user = _user_by_email(email)
    if user and password == user["password"]:
        workspace_id = user["workspace_id"]
        # Optional explicit domain must agree with the user's workspace
        if domain:
            resolved = tenants.resolve_workspace_id(domain=domain)
            if resolved and resolved != workspace_id:
                raise ValueError("Email domain does not match selected workspace")
        return _issue_session(user, workspace_id)

    # Unknown email: allow domain-based guest login with shared password
    if password != DEMO_PASSWORD:
        raise ValueError("Invalid email or password")

    workspace_id = tenants.resolve_workspace_id(email=email, domain=domain)
    if not workspace_id:
        raise ValueError(
            "Unknown domain. Use @harleydavidson.com, @meridiandynamics.com, "
            "@apexpercision.com, @lamresearch.com, or @hemlocksemi.com"
        )

    ws = tenants.WORKSPACES[workspace_id]
    guest = {
        "email": email,
        "name": email.split("@")[0].replace(".", " ").title() or "Demo User",
        "role": "Demo Operator",
        "workspace_id": workspace_id,
    }
    return _issue_session(guest, workspace_id, workspace=ws)


def _issue_session(user: dict, workspace_id: str, workspace: dict | None = None) -> dict:
    ws = workspace or tenants.WORKSPACES[workspace_id]
    token = secrets.token_urlsafe(32)
    session = {
        "token": token,
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "workspace_id": workspace_id,
        "workspace": tenants.public_workspace(ws),
        "issued_at": time.time(),
    }
    _SESSIONS[token] = session
    return {
        "token": token,
        "user": {
            "email": session["email"],
            "name": session["name"],
            "role": session["role"],
        },
        "workspace": session["workspace"],
    }


def logout(token: str | None) -> None:
    if token:
        _SESSIONS.pop(token, None)


def session_for(token: str | None) -> dict | None:
    if not token:
        return None
    return _SESSIONS.get(token)


def parse_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None
