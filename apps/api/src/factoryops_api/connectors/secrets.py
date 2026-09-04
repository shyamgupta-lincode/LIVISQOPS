"""Resolve secret references without exposing values in API responses."""
from __future__ import annotations

import os
from typing import Optional

# Local demo substitutes — never returned by the API.
_DEMO_SECRETS: dict[str, str] = {
    "demo-opcua-token": "opcua-demo-token",
    "demo-mes-token": "mes-demo-token",
    "demo-qms-token": "qms-demo-token",
    "demo-cmms-token": "cmms-demo-token",
}


def resolve_secret(secret_ref: Optional[str]) -> Optional[str]:
    if not secret_ref:
        return None
    ref = secret_ref.strip()
    if ref.startswith("env:"):
        return os.getenv(ref[4:]) or None
    if ref.startswith("secret:"):
        key = ref[7:]
        return os.getenv(f"FACTORYOPS_SECRET_{key.upper().replace('-', '_')}") or _DEMO_SECRETS.get(key)
    return _DEMO_SECRETS.get(ref)
