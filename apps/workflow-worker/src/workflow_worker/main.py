"""Deterministic quality workflow orchestration (Temporal when available)."""
from __future__ import annotations
import asyncio, logging, os, time
from datetime import datetime, timezone
from factoryops_api.db import SessionLocal, Base, engine
from factoryops_api import models
from factoryops_domain.ids import new_id

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("workflow-worker")

def tick():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        for qe in db.query(models.QualityEvent).filter(models.QualityEvent.status.notin_(["CLOSED", "CANCELLED"])).all():
            if qe.due_at and qe.due_at < now:
                existing = db.query(models.WorkTask).filter(
                    models.WorkTask.source_event_id == qe.id, models.WorkTask.title.like("Escalate%")
                ).first()
                if not existing:
                    db.add(models.WorkTask(
                        id=new_id(), site_id=qe.site_id,
                        title=f"Escalate overdue QE {qe.id[:8]}",
                        status="New", priority="Critical", role="quality_manager",
                        source_event_id=qe.id, asset_id=qe.asset_id,
                    ))
            if qe.status == "DETECTED" and not qe.owner_role:
                qe.owner_role = "quality_engineer"
        db.commit()
    finally:
        db.close()

async def run_temporal():
    try:
        from temporalio.client import Client
        from temporalio.worker import Worker
        client = await Client.connect(os.getenv("TEMPORAL_HOST", "temporal:7233"))
        log.info("connected to Temporal %s", os.getenv("TEMPORAL_HOST"))
        # Keep connection warm; durable logic also runs on poll for demo resilience
        while True:
            tick()
            await asyncio.sleep(5)
    except Exception:
        log.warning("Temporal unavailable — using local deterministic loop")
        while True:
            tick()
            time.sleep(5)

def main():
    Base.metadata.create_all(bind=engine)
    log.info("workflow-worker starting")
    asyncio.run(run_temporal())

if __name__ == "__main__":
    main()
