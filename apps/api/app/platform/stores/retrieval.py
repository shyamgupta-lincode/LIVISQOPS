"""Retrieval index — approved procedures, cases and evidence chunks for agents."""

from __future__ import annotations

from typing import Any

from ...store import DB, new_id, now


def summary() -> dict:
    chunks = DB.get("retrieval_chunks") or {}
    return {
        "id": "retrieval",
        "name": "Retrieval index",
        "responsibility": "Approved procedures, cases and evidence chunks for agents",
        "immutable": False,
        "volume": len(chunks),
        "last_write": now(),
        "keys": ["retrieval_chunks"],
        "layer": "derived_search_vector_index",
    }


def index_chunk(text: str, *, kind: str, ref_id: str, meta: dict | None = None) -> dict:
    chunks = DB.setdefault("retrieval_chunks", {})
    cid = new_id("chunk")
    row = {
        "id": cid,
        "kind": kind,
        "ref_id": ref_id,
        "text": text,
        "meta": meta or {},
        "indexed_at": now(),
    }
    chunks[cid] = row
    return row


def index_lesson(lesson: dict) -> dict:
    chain = lesson.get("chain") or {}
    text = (
        f"{lesson.get('title', '')}. "
        f"Symptom: {chain.get('symptom', '')}. "
        f"Cause: {chain.get('cause', '')}. "
        f"Correction: {chain.get('correction', '')}. "
        f"Effectiveness: {chain.get('effectiveness', '')}."
    )
    return index_chunk(text, kind="lesson", ref_id=lesson["id"], meta={"taxonomy": lesson.get("taxonomy")})


def search(q: str, limit: int = 8) -> list[dict]:
    """Naive token overlap search — demo stand-in for a vector index."""
    q_tokens = {t.lower() for t in (q or "").split() if len(t) > 2}
    scored = []
    for c in (DB.get("retrieval_chunks") or {}).values():
        text = (c.get("text") or "").lower()
        score = sum(1 for t in q_tokens if t in text)
        if score or not q_tokens:
            scored.append({**c, "score": score + 0.01})
    scored.sort(key=lambda r: -r["score"])
    return scored[:limit]


def sample_query() -> dict[str, Any]:
    chunks = list((DB.get("retrieval_chunks") or {}).values())[:5]
    return {"chunks": chunks, "search_demo": search("tank seal discontinuity", 3)}
