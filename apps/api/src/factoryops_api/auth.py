from __future__ import annotations
import secrets
from dataclasses import dataclass
from typing import Optional
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from factoryops_config import get_settings
from .db import get_db
from . import models

_SESSIONS: dict[str, dict] = {}

@dataclass
class Principal:
    user_id: str
    email: str
    name: str
    role: str
    site_id: Optional[str]
    token: str

def login(db: Session, email: str, password: str) -> dict:
    settings = get_settings()
    user = db.query(models.User).filter(models.User.email == email).one_or_none()
    if not user or password != settings.demo_password:
        raise HTTPException(401, detail={"type": "about:blank", "title": "Unauthorized", "status": 401, "detail": "invalid credentials"})
    token = secrets.token_urlsafe(32)
    site_name = None
    if user.site_id:
        site = db.get(models.Site, user.site_id)
        site_name = site.name if site else None
    _SESSIONS[token] = {
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "site_id": user.site_id,
        "site_name": site_name,
    }
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "site_id": user.site_id,
            "site_name": site_name,
        },
    }

def get_principal(authorization: Optional[str] = Header(default=None), db: Session = Depends(get_db)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, detail={"type": "about:blank", "title": "Unauthorized", "status": 401})
    token = authorization.split(" ", 1)[1]
    sess = _SESSIONS.get(token)
    if not sess:
        # demo fallback: token may be email for smoke tests
        user = db.query(models.User).filter(models.User.email == token).one_or_none()
        if not user:
            raise HTTPException(401, detail={"type": "about:blank", "title": "Unauthorized", "status": 401})
        site_name = None
        if user.site_id:
            site = db.get(models.Site, user.site_id)
            site_name = site.name if site else None
        sess = {
            "user_id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "site_id": user.site_id,
            "site_name": site_name,
        }
    return Principal(
        token=token,
        user_id=sess["user_id"],
        email=sess["email"],
        name=sess["name"],
        role=sess["role"],
        site_id=sess.get("site_id"),
    )
