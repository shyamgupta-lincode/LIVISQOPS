# Decisions

## D1 — Evolve LIVIS MES in place
Chose convergence over a sibling greenfield repo so Harley/LIVIS storylines and domain modules remain available while FactoryOps becomes the runtime product name.

## D2 — Demo auth fallback
Keycloak realm is imported for OIDC compatibility. API `AUTH_MODE=oidc_with_demo_fallback` accepts seeded bearer sessions with password `demo` so `make one-shot` and Playwright work before Keycloak is fully trusted as the only IdP.

## D3 — Temporal resilience
Workflow-worker connects to Temporal when available and always runs a deterministic poll loop for SLA escalations so quality orchestration remains correct if Temporal is slow to bootstrap on constrained hosts.

## D4 — Create_all + seed idempotency
Initial schema uses SQLAlchemy `create_all` via `factoryops_api.migrate` with stable UUIDv7-like seed IDs. Alembic revisions can version subsequent deltas under `db/migrations`.

## D5 — Web-legacy retention
Previous Vite SPA lives under `apps/web-legacy` during cutover; FactoryOps IA is `apps/web` (Next.js).

## D6 — Published ports
Host ports remapped (`18080`, `18000`, `13001`, …) so one-shot coexists with other local stacks binding 8080/8000/9090.

## D7 — ClickHouse init on existing volumes
Compose init scripts run only on empty volumes. After first boot, apply `infra/compose/init-clickhouse.sql` via `clickhouse-client` if tables are missing.

## D8 — Playwright soft-fail in verify
`make verify` always runs contract/security tests. Playwright is attempted when the stack is up; offline CI without browsers logs WARN rather than failing the whole verify gate. Use `SKIP_PLAYWRIGHT=1` for fast local gates. The 8-step path is covered by `tests/contract/test_golden_api_live.py` against a live API.

## D9 — Temporal healthcheck
Temporal `auto-setup` can take >40s on first boot; healthcheck uses `tctl cluster health` with a long `start_period`. Workflow-worker keeps its deterministic poll loop if Temporal is slow.

## D10 — Context graph seed from legacy LIVIS MES
Published `entity_node` / `entity_edge` rows are seeded idempotently by `factoryops_api.context_graph_seed` on every `make seed` / `demo-reset`. Topology follows the canonical Midwest Hybrid plant (enterprise → site → area → line → cell → asset) plus production genealogy and bearing_wear signals. Object bindings and Harley York area/line/station richness are carried forward from legacy `store._seed_graph_schema` / York topology as graph-only enrichment under the existing Harley site — not as a second competing Midwest layout. Domain entity UUIDs are reused as graph node IDs where 1:1; orphan sparse-seed rows are removed on reconcile.

## D10c — Context graph flow-tree backplane
`/graph` renders a hierarchical flow tree (plant → area → line → station → device) from a seeded backplane schema (`published_backplane`) plus `contains` edges. Cell maps to station and asset to device for Engineer-facing columns; signals/failure modes stay as dataplane attachments, not spine columns. Parent→child edges carry `provenance.link` (`protocol`, `transport`, `direction`, `topic`/`endpoint`, `connector_kind`) from OT/IT connector profiles (OPC UA, MQTT Sparkplug, MES REST, Kafka/Redpanda, simulated). Backplane form edits persist in `localStorage` (`fo_graph_backplane_v1`); API remains source of the default. Twin keeps its operate spine (line → cell → station(asset) → device(signal)).

## D10b — OT/IT connector local substitutes
OPC UA, MES REST, QMS REST, and CMMS REST adapters use production-shaped contracts and real HTTP test-connection calls. One-shot hosts local substitutes at `/api/v1/connector-sim/*` on the API (base from `CONNECTOR_SIM_BASE_URL`, default `http://api:8000` in Compose). OPC UA uses an HTTP bridge substitute rather than raw `opc.tcp` so demo/CI needs no PLC stack; config still carries security mode/policy and node IDs. Credentials are secret references (`secret:` / `env:`), never returned as values.

## D11 — Automotive compliance reporting app
Added a fifth launcher app **Compliance** (`/compliance`) for audience-scoped automotive quality reporting (internal / customer / regulatory / public). Report templates are OEM- or regulation-keyed (Ford/GM/Stellantis, FMVSS/EWR stubs, EU CoP/R155, IMDS/battery) rather than one universal IATF form. Regulatory instances use `filing_channel=stub` and cannot be marked `ACCEPTED` — FactoryOps never claims NHTSA/EPA/EU authority filing.

Standards cadence recorded for operators:
- ISO 9001:2015+Amd1:2024 remains the QMS baseline; a 2026 edition is expected and should be adopted when published and reflected in customer CSRs.
- IATF 16949 plus OEM CSR versions independently; keep customer-specific templates.
- EU Certificate of Conformity electronic data obligations apply from July 2026 for in-scope type-approved products (tracked as readiness only).
- EU battery passport obligations phase in from February 2027 (material family stub tracks readiness; not a live passport issuer).

AI assistant entry creates **DRAFT** reports only (`ai_draft=true`); quality_manager / compliance / customer_quality / regulatory / admin must validate and approve before submit.

## D12 — Exclusive app route ownership
Every primary workspace href belongs to exactly one launcher app so `appForPath` and the Apps nav never mark two apps active.

| Prefix | Owner |
|---|---|
| `/operate`, `/twin`, `/live`, `/work` | Operate |
| `/quality`, `/rca`, `/knowledge`, `/admin/agents` | Quality & AI |
| `/graph`, `/reliability`, `/assets`, `/admin/data`, `/admin/backbone`, `/admin/integrations` | Engineer |
| `/admin/learning`, `/admin/agent-governance`, `/admin/audit` | Govern |
| `/compliance/*` | Compliance |

`/admin/agents` (Quality ledger) and `/admin/agent-governance` (Govern autonomy view) share the same page component via re-export; Factory Twin stays only under Operate. AdminSubnav lists sibling workspaces from the owning app only.

## D13 — Hero MotoCorp as a second full demo tenant
Hero MotoCorp is seeded as a **separate tenant** (`Hero MotoCorp (Demo)`) with a complete Dharuhera-style 2W plant, not a graph-only stub under Midwest. Stable IDs live in `factoryops_api.hero_seed.HERO_STABLE`. Domain rows (lines/cells/assets, products, orders/lots/units, users, anomalies, predictions, work tasks, quality history, connectors) plus an ISA-95 context graph (`seed_hero_context_graph`) and compliance rows (`seed_compliance` with `id_offset=1000`) are created on every `make seed` / `demo-reset`. Data is synthetic and labeled as such — not proprietary OEM data. Live simulator/`bearing_wear` stream remains Midwest-only; Hero’s open scenario is `crankshaft_bearing_wear` with seeded telemetry history. Select Hero via Graph site chip **Hero Dharuhera**, API `?site=hero`, or by signing in as `*.hero@heromotocorp.demo` (password `demo`) so plant overview scopes to HMC-DHR.

## D14 — Custom AI agent drafts (admin ledger)
`POST /api/v1/admin/agents` persists `agent_definitions` rows as **Draft** only. Entity references (context-graph nodes, data planes/topics, assets, quality events, signals) are stored with `scope: read`. OT/safety/disposition tools are denied at create time. System MockAgentProvider skills (RCA Investigator, Knowledge Curator) remain virtual ledger entries; custom agents appear alongside them. Promotion to Active / production is a separate human governance step — create never auto-promotes.

## D15 — Lam Research as a third full demo tenant
Lam Research is seeded as a **separate tenant** (`Lam Research (Demo)`) with Fremont Chamber Ops — semiconductor cap-equipment module assembly, not a graph-only stub. Stable IDs live in `factoryops_api.lam_seed.LAM_STABLE`. Domain rows (4 lines × 4 station-named assets, products/orders/lots/units with `TOOL-LR-` / `CHM-LR-` serials, users, anomalies, predictions, work tasks, quality/containment events, connectors) plus an ISA-95 context graph (`seed_lam_context_graph`) and compliance rows (`seed_compliance` with `id_offset=2000`) are created on every `make seed` / `demo-reset`. Data is synthetic and labeled as such. Select Lam via Graph site chip **Lam Fremont**, API `?site=lam`, or sign in as `*.lamresearch.com` (password `demo`) so plant overview scopes to LR-FCO.

## D16 — Multi-scenario live telemetry (Midwest + Lam)
The `simulator` streams **both** Midwest `bearing_wear` and Lam `gas_box_seal_void` when `SIM_SCENARIOS=midwest,lam` (Compose default). Profiles are in `factoryops_api.stream_scenarios`; `stream-worker` applies scenario-specific degradation and anomaly refresh. Lam seeded quality events are not duplicated by the worker. Plant overview returns site-scoped `stream.primary_asset_id` / `primary_signals`; mock RCA ranks `gas_box_seal_void` for Lam quality events. Hero remains history-only until a third stream profile is enabled.
