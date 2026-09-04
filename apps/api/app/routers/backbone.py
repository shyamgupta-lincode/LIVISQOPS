"""Event backbone HTTP API."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..platform import bus
from ..platform.semantic import ObservationContext

router = APIRouter(prefix="/api/backbone", tags=["backbone"])


class PublishBody(BaseModel):
    topic: str
    payload: dict = Field(default_factory=dict)
    context: dict | None = None
    source_system: str | None = None


@router.get("/topics")
def get_topics():
    return {"topics": bus.topics()}


@router.post("/publish")
def post_publish(body: PublishBody):
    ctx = ObservationContext(**body.context) if body.context else None
    env = bus.publish(
        body.topic,
        body.payload,
        context=ctx,
        source_system=body.source_system,
    )
    return env


@router.get("/stream")
def get_stream(topic: str | None = None, after_seq: int = 0, limit: int = 100):
    return {"events": bus.stream(topic=topic, after_seq=after_seq, limit=limit)}


@router.get("/replay")
def get_replay(from_seq: int = 0, topic: str | None = None, limit: int = 200):
    return {"events": bus.replay(from_seq=from_seq, topic=topic, limit=limit)}


@router.get("/lag")
def get_lag():
    return bus.lag()


class AckBody(BaseModel):
    consumer: str
    last_seq: int


@router.post("/ack")
def post_ack(body: AckBody):
    if not body.consumer:
        raise HTTPException(400, "consumer required")
    return bus.ack_consumer(body.consumer, body.last_seq)
