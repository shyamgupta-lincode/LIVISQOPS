# Architecture (implemented)

FactoryOps runs as a Compose-orchestrated monorepo:

- **apps/web** — Next.js App Router shell (240px nav, plant context, primary IA routes).
- **apps/api** — FastAPI `/api/v1` with durable Postgres quality workflow, ingest, RCA/knowledge, reliability, work, admin.
- **apps/stream-worker** — Feature windows, EWMA/robust-z rules, anomaly + quality event creation, bearing health predictions (no LLM).
- **apps/workflow-worker** — Temporal connect when available + deterministic SLA/escalation poll loop.
- **apps/agent-worker** — Kafka `agent.requests` consumer; MockAgentProvider default, OpenAI gated by env.
- **apps/simulator** — Accelerated `bearing_wear` telemetry over HTTP (+ optional MQTT).

Data plane: Postgres 16 + pgvector, ClickHouse telemetry/features, Redpanda topics (+ DLQ names), MinIO buckets, Mosquitto, Temporal, Keycloak, Traefik, OTel → Prometheus/Grafana.

Ingress: Traefik on `18080` routes `/api/v1` → API and `/` → web.

### OT/IT connectors

`factoryops_domain.connectors` defines the shared adapter contract. Working adapters live in `apps/api/src/factoryops_api/connectors/` (OPC UA, MES REST, QMS REST, CMMS REST). Admin APIs under `/api/v1/admin/integrations` list/configure/test connectors; UI at `/admin/integrations`. Local substitutes: `/api/v1/connector-sim/{opcua,mes,qms,cmms}`.
