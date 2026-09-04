"""Workspace / tenant registry for LIVIS MES multi-party demo.

Domain on the login email selects which seeded world loads.
"""

from __future__ import annotations

WORKSPACES: dict[str, dict] = {
    "harley": {
        "id": "harley",
        "name": "Harley-Davidson",
        "short_name": "Harley OEM",
        "role": "OEM · Vehicle plant",
        "site_label": "York Vehicle Ops",
        "product_line": "Motorcycle final assembly",
        "accent": "#FF6600",
        "story": "OEM vehicle plant receiving ABS modules from Meridian (Tier 1).",
        "domains": [
            "harleydavidson.com",
            "harley.livis.local",
            "hd.livis.local",
        ],
    },
    "tier1": {
        "id": "tier1",
        "name": "Meridian Dynamics",
        "short_name": "Tier 1",
        "role": "Tier 1 · Module / system supplier",
        "site_label": "Columbus Module Plant",
        "product_line": "ABS & brake control modules",
        "accent": "#1F6FEB",
        "story": "Builds ABS modules for Harley; consumes Apex (Tier 2) valve bodies & sensors.",
        "domains": [
            "meridiandynamics.com",
            "meridian.livis.local",
            "tier1.example",
            "tier1.livis.local",
        ],
    },
    "tier2": {
        "id": "tier2",
        "name": "Apex Precision",
        "short_name": "Tier 2",
        "role": "Tier 2 · Component supplier",
        "site_label": "Dayton Components",
        "product_line": "Hydraulic valves & wheel-speed sensors",
        "accent": "#1F9D5C",
        "story": "Feeds Meridian with precision valve bodies and sensor assemblies.",
        "domains": [
            "apexpercision.com",
            "apex.livis.local",
            "tier2.example",
            "tier2.livis.local",
        ],
    },
    "lam": {
        "id": "lam",
        "name": "Lam Research",
        "short_name": "Lam Research",
        "role": "OEM · Semiconductor equipment",
        "site_label": "Fremont Chamber Ops",
        "product_line": "Etch & deposition chamber modules",
        "accent": "#0077C8",
        "story": "Builds dielectric etch / deposition chamber modules for leading wafer fabs.",
        "domains": [
            "lamresearch.com",
            "lam.livis.local",
            "lam.example",
        ],
    },
    "hemlock": {
        "id": "hemlock",
        "name": "Hemlock Semiconductor",
        "short_name": "Hemlock",
        "role": "Materials · Hyperpure silicon",
        "site_label": "Michigan Hyperpure Ops",
        "product_line": "Electronics-grade polysilicon",
        "accent": "#0B6E4F",
        "story": "Produces EG / hyperpure polysilicon via TCS and Siemens CVD for wafer and foundry customers.",
        "domains": [
            "hemlocksemi.com",
            "hemlock.livis.local",
            "hemlock.example",
        ],
    },
}

# Linked serial prefixes shared across the multi-party genealogy storyline
LINKED = {
    "abs_serial_prefix": "ABS-MD-",
    "valve_serial_prefix": "VLV-AP-",
    "sensor_serial_prefix": "WSS-AP-",
    "harley_vin_sample": "1HD1YLINK01",  # appears in Harley seed for demo trail
}


def domain_of(email: str) -> str:
    email = (email or "").strip().lower()
    if "@" not in email:
        return ""
    return email.rsplit("@", 1)[-1].strip()


def workspace_for_domain(domain: str) -> dict | None:
    d = (domain or "").strip().lower()
    if not d:
        return None
    for ws in WORKSPACES.values():
        if d in ws["domains"]:
            return ws
    return None


def workspace_for_email(email: str) -> dict | None:
    return workspace_for_domain(domain_of(email))


def resolve_workspace_id(email: str | None = None, domain: str | None = None) -> str | None:
    if domain:
        ws = workspace_for_domain(domain)
        if ws:
            return ws["id"]
    if email:
        ws = workspace_for_email(email)
        if ws:
            return ws["id"]
    return None


def public_workspace(ws: dict) -> dict:
    return {
        "id": ws["id"],
        "name": ws["name"],
        "short_name": ws["short_name"],
        "role": ws["role"],
        "site_label": ws["site_label"],
        "product_line": ws["product_line"],
        "accent": ws["accent"],
        "story": ws["story"],
        "domains": list(ws["domains"]),
    }


def demo_catalog() -> list[dict]:
    """Login-screen strip: one row per workspace with example emails."""
    return [
        {
            **public_workspace(WORKSPACES["harley"]),
            "example_email": "jordan.hale@harleydavidson.com",
        },
        {
            **public_workspace(WORKSPACES["tier1"]),
            "example_email": "alex.reyes@meridiandynamics.com",
        },
        {
            **public_workspace(WORKSPACES["tier2"]),
            "example_email": "priya.shah@apexpercision.com",
        },
        {
            **public_workspace(WORKSPACES["lam"]),
            "example_email": "ops.lead@lamresearch.com",
        },
        {
            **public_workspace(WORKSPACES["hemlock"]),
            "example_email": "claire.hale@hemlocksemi.com",
        },
    ]
