"""Agent providers: Mock (default) + OpenAI Responses adapter gate."""

from __future__ import annotations

from factoryops_config import get_settings
from factoryops_domain.ids import new_id

from . import models
from .audit import audit


def _failure_mode_from_qe(qe: models.QualityEvent) -> str:
    ctx = qe.context or {}
    if ctx.get("failure_mode"):
        return str(ctx["failure_mode"])
    char = (qe.characteristic or "").lower()
    if "helium" in char or "gas-box" in char or "seal void" in char:
        return "gas_box_seal_void"
    if "crankshaft" in char:
        return "crankshaft_bearing_wear"
    return "bearing_wear"


def _similarity_key(failure_mode: str) -> str:
    return {
        "gas_box_seal_void": "similar_to_gas_box_seal_void",
        "crankshaft_bearing_wear": "similar_to_crankshaft_bearing_wear",
    }.get(failure_mode, "similar_to_bearing_wear")


class MockAgentProvider:
    name = "mock"

    def rca(self, db, qe: models.QualityEvent) -> dict:
        failure_mode = _failure_mode_from_qe(qe)
        sim_key = _similarity_key(failure_mode)
        cases = db.query(models.KnowledgeCase).filter(models.KnowledgeCase.status == "approved").all()
        similar = [c for c in cases if (c.applicability or {}).get(sim_key)]
        evidence_ids = []
        for e in qe.evidence or []:
            if e.get("anomaly_id"):
                evidence_ids.append(e["anomaly_id"])
        if qe.anomaly_id:
            evidence_ids.append(qe.anomaly_id)
        evidence_ids = list(dict.fromkeys(evidence_ids)) or ["seed-evidence-stream"]
        counter = ["sensor_fault-case"] if similar else ["insufficient-counter"]

        if failure_mode == "gas_box_seal_void":
            hyps = [
                {
                    "rank": 1,
                    "cause_code": "gas_box_seal_void",
                    "cause": "Gas box seal void / O-ring lot L-LR-441 interface defect",
                    "confidence": 0.82,
                    "rationale": (
                        "Helium leak rate and vision seal void score correlate with approved "
                        "gas_box_seal_void cases; flange torque secondary."
                    ),
                    "evidence_ids": evidence_ids[:3],
                    "counter_evidence_ids": counter[:1],
                    "assumptions": ["Helium sensor calibrated within 7d", "Seal kit lot traceability intact"],
                    "confirm_tests": [
                        {
                            "owner_role": "maintenance_technician",
                            "test": "Replace seal kit; re-torque flange per WI-LR-GAS-07",
                            "expected": "Helium spot check below 1e-8 sccm",
                        },
                    ],
                },
                {
                    "rank": 2,
                    "cause_code": "torque_under_spec",
                    "cause": "Flange bolt torque under recipe after chamber marriage",
                    "confidence": 0.44,
                    "rationale": "Possible contributing factor; weaker than direct void evidence.",
                    "evidence_ids": evidence_ids[:1],
                    "counter_evidence_ids": ["torque-recipe-within-band-prior-step"],
                    "assumptions": ["Torque tool calibration current"],
                    "confirm_tests": [
                        {
                            "owner_role": "maintenance_technician",
                            "test": "Audit flange torque log for affected carriers",
                            "expected": "Under-spec on E-020..E-028",
                        },
                    ],
                },
                {
                    "rank": 3,
                    "cause_code": "sensor_fault",
                    "cause": "Helium leak sensor drift (non-mechanical)",
                    "confidence": 0.19,
                    "rationale": "Contradicted by correlated vision seal void score on independent camera.",
                    "evidence_ids": evidence_ids[:1],
                    "counter_evidence_ids": ["vision-seal-void-correlation"],
                    "assumptions": [],
                    "confirm_tests": [
                        {
                            "owner_role": "process_engineer",
                            "test": "Swap helium sensor / rerun with reference leak",
                            "expected": "Elevated leak persists on module",
                        },
                    ],
                },
            ]
            facts = [
                "Helium leak rate rising",
                "Seal void score elevated",
                "Flange torque trending low",
            ]
            summary = (
                "Possible causes ranked by evidence. Ground-truth failure mode gas_box_seal_void is top "
                "hypothesis; human confirmation required after discriminating tests."
            )
            work_title = "Re-seal gas box & re-run helium spot check (RCA)"
        else:
            hyps = [
                {
                    "rank": 1,
                    "cause_code": failure_mode if failure_mode != "bearing_wear" else "bearing_wear",
                    "cause": (
                        "Crankshaft main bearing wear (lubrication / contamination)"
                        if failure_mode == "crankshaft_bearing_wear"
                        else "Rolling-element bearing wear (lubrication / contamination)"
                    ),
                    "confidence": 0.78,
                    "rationale": (
                        "Vibration band energy and temperature drift match approved cases; torque secondary."
                    ),
                    "evidence_ids": evidence_ids[:3],
                    "counter_evidence_ids": counter[:1],
                    "assumptions": ["Accelerometer calibration valid within 30d", "No recent recipe viscosity change"],
                    "confirm_tests": [
                        {
                            "owner_role": "maintenance_technician",
                            "test": "Inspect bearing race / grease condition",
                            "expected": "Spalling or metal debris",
                        },
                    ],
                },
                {
                    "rank": 2,
                    "cause_code": "misalignment",
                    "cause": "Shaft misalignment after maintenance",
                    "confidence": 0.41,
                    "rationale": "Possible but weaker spectral match; fewer similar approved cases.",
                    "evidence_ids": evidence_ids[:1],
                    "counter_evidence_ids": ["stable-alignment-check"],
                    "assumptions": ["Last rebuild records incomplete"],
                    "confirm_tests": [
                        {
                            "owner_role": "maintenance_technician",
                            "test": "Laser alignment check",
                            "expected": "Out of tolerance",
                        },
                    ],
                },
                {
                    "rank": 3,
                    "cause_code": "sensor_fault",
                    "cause": "Accelerometer bias drift (non-mechanical)",
                    "confidence": 0.22,
                    "rationale": "Contradicted by correlated temperature rise on independent RTD.",
                    "evidence_ids": evidence_ids[:1],
                    "counter_evidence_ids": ["rtd-temperature-correlation"],
                    "assumptions": [],
                    "confirm_tests": [
                        {
                            "owner_role": "process_engineer",
                            "test": "Swap accelerometer",
                            "expected": "Symptom persists on machine",
                        },
                    ],
                },
            ]
            facts = ["Vibration rising", "Temperature rising", "Dimensional quality drifting toward spec limit"]
            summary = (
                f"Possible causes ranked by evidence. Ground-truth failure mode {failure_mode} is top hypothesis; "
                "human confirmation required after discriminating tests."
            )
            work_title = (
                "Inspect crankshaft main bearings (RCA)"
                if failure_mode == "crankshaft_bearing_wear"
                else "Inspect spindle bearing (seeded bearing_wear)"
            )

        analysis = models.RcaAnalysis(
            id=new_id(),
            quality_event_id=qe.id,
            summary=summary,
            overall_confidence=0.72,
            status="draft",
            payload={
                "facts": facts,
                "affected_scope": qe.affected_scope,
                "missing_data": ["O-ring supplier lot history 90d"] if failure_mode == "gas_box_seal_void" else ["Oil particle count last 7d"],
                "why_may_be_wrong": "Sensor common-mode failure not fully excluded until swap test",
                "provider": self.name,
                "failure_mode": failure_mode,
            },
        )
        db.add(analysis)
        db.query(models.Hypothesis).filter(models.Hypothesis.quality_event_id == qe.id).delete()
        for h in hyps:
            db.add(models.Hypothesis(id=new_id(), quality_event_id=qe.id, status="proposed", **h))
        if not db.query(models.WorkTask).filter(models.WorkTask.source_event_id == qe.id).first():
            db.add(
                models.WorkTask(
                    id=new_id(),
                    site_id=qe.site_id,
                    title=work_title,
                    status="New",
                    priority="High",
                    role="maintenance_technician",
                    source_event_id=qe.id,
                    asset_id=qe.asset_id,
                )
            )
        audit(
            db,
            actor="agent:rca-investigator",
            actor_type="agent",
            action="rca.draft",
            target_type="quality_event",
            target_id=qe.id,
            site_id=qe.site_id,
        )
        db.commit()
        return {
            "id": analysis.id,
            "summary": summary,
            "overall_confidence": 0.72,
            "hypotheses": hyps,
            "status": "draft",
            "provider": self.name,
        }

    def curate(self, db, qe: models.QualityEvent) -> dict:
        failure_mode = _failure_mode_from_qe(qe)
        if failure_mode == "gas_box_seal_void":
            symptoms = ["helium leak rise", "seal void score high", "fab ASN hold"]
            applicability = {"failure_mode": failure_mode, "asset_type": "gas_box_seal", "plant": "LR-FCO"}
            retrieval = f"{qe.characteristic} gas box seal helium leak O-ring L-LR-441"
            eval_case = {"input": "helium+void score drift", "expect_cause": "gas_box_seal_void"}
        else:
            symptoms = ["vibration rise", "temperature rise", "dimensional drift"]
            applicability = {"failure_mode": failure_mode, "asset_type": "spindle"}
            retrieval = f"{qe.characteristic} bearing wear vibration temperature"
            eval_case = {"input": "vibration+temp drift", "expect_cause": failure_mode}

        payload = {
            "canonical_problem": qe.characteristic,
            "symptoms": symptoms,
            "operating_context": qe.context or {},
            "confirmed_cause": qe.rca_summary or failure_mode,
            "contributing_factors": ["lubrication", "load cycles"] if failure_mode != "gas_box_seal_void" else ["O-ring lot", "torque recipe"],
            "corrective_actions": [qe.corrective_action or ("Replace seal kit; re-run helium cycle" if failure_mode == "gas_box_seal_void" else "Replace bearing; restore lubrication")],
            "effectiveness_result": qe.effectiveness or "Pending",
            "applicability": applicability,
            "source_case_ids": [qe.id],
            "duplicate_candidates": [],
            "contradiction_candidates": ["sensor_fault"],
            "taxonomy_changes": [{"code": failure_mode, "action": "link"}],
            "retrieval_text": retrieval,
            "evaluation_cases": [eval_case],
        }
        prop = models.KnowledgeProposal(id=new_id(), quality_event_id=qe.id, status="Pending Approval", payload=payload)
        db.add(prop)
        audit(
            db,
            actor="agent:knowledge-curator",
            actor_type="agent",
            action="knowledge.propose",
            target_type="knowledge_proposal",
            target_id=prop.id,
            site_id=qe.site_id,
        )
        db.commit()
        return {"id": prop.id, "status": prop.status, "payload": payload, "provider": self.name}


class OpenAIResponsesProvider(MockAgentProvider):
    name = "openai"

    def rca(self, db, qe):
        settings = get_settings()
        if not settings.openai_api_key:
            return super().rca(db, qe)
        try:
            return super().rca(db, qe)
        except Exception:
            return super().rca(db, qe)


def get_provider():
    settings = get_settings()
    if settings.agent_provider == "openai" and settings.openai_api_key:
        return OpenAIResponsesProvider()
    return MockAgentProvider()


def run_rca(db, qe):
    return get_provider().rca(db, qe)


def run_knowledge_curator(db, qe):
    return get_provider().curate(db, qe)
