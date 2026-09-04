"""Knowledge graph / document store — failure modes, RCA cases, corrective actions.

Three layers kept separate:
  1. Immutable case records
  2. Approved lessons
  3. Derived retrieval / vector index (see retrieval.py)
"""

from __future__ import annotations

from typing import Any

from ...store import DB, new_id, now
from . import event_ledger


def summary() -> dict:
    cases = DB.get("knowledge_cases") or {}
    lessons = DB.get("lessons") or {}
    fms = DB.get("failure_modes") or {}
    return {
        "id": "knowledge",
        "name": "Knowledge graph / document store",
        "responsibility": "Equipment relationships, failure modes, RCA cases and corrective actions",
        "immutable": False,
        "volume": len(cases) + len(lessons) + len(fms),
        "last_write": now(),
        "keys": ["knowledge_cases", "lessons", "failure_modes", "knowledge_proposals"],
        "layers": ["case_records", "approved_lessons", "retrieval_index"],
    }


def put_case(data: dict) -> dict:
    """Immutable case record — once written, only superseding cases may amend narrative."""
    cases = DB.setdefault("knowledge_cases", {})
    cid = data.get("id") or new_id("case")
    if cid in cases:
        # Do not mutate — create versioned supersession
        new = {**data, "id": new_id("case"), "supersedes": cid, "created_at": now(), "immutable": True}
        cases[new["id"]] = new
        event_ledger.append("knowledge.case.supersede", new["id"], {"supersedes": cid})
        return new
    row = {**data, "id": cid, "created_at": data.get("created_at") or now(), "immutable": True}
    cases[cid] = row
    event_ledger.append("knowledge.case.create", cid, {"title": row.get("title")})
    return row


def list_cases(limit: int = 50) -> list[dict]:
    rows = list((DB.get("knowledge_cases") or {}).values())
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows[:limit]


def propose_lesson(data: dict) -> dict:
    props = DB.setdefault("knowledge_proposals", {})
    pid = data.get("id") or new_id("kprop")
    row = {
        **data,
        "id": pid,
        "status": data.get("status") or "Pending Approval",
        "created_at": now(),
        "layer": "approved_lessons_candidate",
    }
    props[pid] = row
    event_ledger.append("knowledge.proposal.create", pid, {"title": row.get("title")})
    return row


def approve_lesson(proposal_id: str, *, actor: str) -> dict:
    props = DB.get("knowledge_proposals") or {}
    prop = props.get(proposal_id)
    if not prop:
        raise KeyError(proposal_id)
    prop["status"] = "Approved"
    prop["approved_by"] = actor
    prop["approved_at"] = now()
    lessons = DB.setdefault("lessons", {})
    lid = new_id("lesson")
    lesson = {
        "id": lid,
        "title": prop.get("title"),
        "taxonomy": prop.get("taxonomy"),
        "chain": prop.get("chain"),  # symptom → condition → cause → correction → effectiveness
        "source_case_id": prop.get("source_case_id"),
        "proposal_id": proposal_id,
        "approved_by": actor,
        "approved_at": now(),
        "layer": "approved_lessons",
    }
    lessons[lid] = lesson
    event_ledger.append("knowledge.lesson.approve", lid, {"proposal_id": proposal_id}, actor=actor)
    # Refresh retrieval index entry
    from . import retrieval
    retrieval.index_lesson(lesson)
    return lesson


def list_lessons() -> list[dict]:
    return list((DB.get("lessons") or {}).values())


def list_proposals(*, status: str | None = None) -> list[dict]:
    rows = list((DB.get("knowledge_proposals") or {}).values())
    if status:
        rows = [r for r in rows if r.get("status") == status]
    return rows


def sample_query() -> dict[str, Any]:
    return {
        "cases": list_cases(3),
        "lessons": list_lessons()[:3],
        "proposals": list_proposals()[:3],
        "failure_modes": list((DB.get("failure_modes") or {}).values())[:5],
    }
