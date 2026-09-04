"""Agent worker: listen for RCA/knowledge requests; MockProvider by default."""
from __future__ import annotations
import json, logging, os, time, threading, asyncio
from factoryops_api.db import SessionLocal, Base, engine
from factoryops_api import models
from factoryops_api.agents_runtime import run_rca, run_knowledge_curator

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("agent-worker")

def handle(env: dict):
    et = env.get("event_type")
    payload = env.get("payload") or {}
    db = SessionLocal()
    try:
        if et == "agent.rca.request":
            qe = db.get(models.QualityEvent, payload.get("quality_event_id"))
            if qe:
                run_rca(db, qe)
                log.info("RCA completed for %s", qe.id)
        elif et == "agent.knowledge.request":
            qe = db.get(models.QualityEvent, payload.get("quality_event_id"))
            if qe:
                run_knowledge_curator(db, qe)
    finally:
        db.close()

def main():
    Base.metadata.create_all(bind=engine)
    log.info("agent-worker starting provider=%s", os.getenv("AGENT_PROVIDER", "mock"))
    try:
        from aiokafka import AIOKafkaConsumer
        async def consume():
            c = AIOKafkaConsumer(
                "agent.requests",
                bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "redpanda:9092"),
                group_id="agent-worker", auto_offset_reset="latest",
            )
            await c.start()
            try:
                async for msg in c:
                    handle(json.loads(msg.value.decode()))
            finally:
                await c.stop()
        threading.Thread(target=lambda: asyncio.run(consume()), daemon=True).start()
    except Exception:
        log.warning("kafka not available for agent-worker")
    while True:
        time.sleep(30)

if __name__ == "__main__":
    main()
