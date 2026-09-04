# FactoryOps Intelligence Platform — One-Shot Build Contract

## Purpose

Build and deploy a complete, production-oriented manufacturing intelligence and action platform in one uninterrupted implementation pass. The finished system must connect production and quality context, detect process and equipment anomalies, generate quality events, support predictive maintenance, produce evidence-backed RCA hypotheses, route actions by role, and turn approved human conclusions into governed reusable knowledge.

This file is the executable product, engineering, UX, test, and deployment contract. Do not return only a plan, architecture document, scaffold, mockup, partial feature, or phased roadmap. Implement the whole vertical slice, run it, test it, and leave it deployable with one command.

Use `FactoryOps` as the default product name, but keep the name, logo text, and theme tokens centralized so they can be changed without editing feature code.

## Completion behavior

- Work autonomously from inspection through deployment verification; use these defaults without asking routine product/design/stack questions.
- Deliver all capabilities and tests together. Do not stop at a plan, scaffold, migration, API/UI, or container startup.
- Leave no TODOs, dead navigation, placeholder actions, fake success, static feature responses, or hard-coded dashboard totals.
- Preserve unrelated work and extend compatible code. Record nonblocking assumptions in `docs/decisions.md`.
- Missing external credentials invoke the documented local substitute. Missing Kubernetes access invokes verified local deployment plus Helm lint/render. Never claim an external deployment that did not run.
- Prefer the smallest reliable full implementation; avoid speculative services and layers.

## Definition of one-shot

The repository must expose these commands:

```bash
make one-shot
make one-shot PROFILE=local
make one-shot PROFILE=k8s KUBE_CONTEXT=<context> DOMAIN=<domain>
make verify
make down
```

`make one-shot` defaults to `PROFILE=local` and must:

1. Check Docker, Compose, available ports, disk space, and required tool versions.
2. Create `.env` from `.env.example` when missing and generate development secrets without overwriting existing values.
3. Build every application image from pinned dependencies.
4. Start infrastructure and application services.
5. Wait on real health and readiness endpoints, not fixed sleeps.
6. Apply database migrations and create object-storage buckets.
7. Seed roles, policies, manufacturing master data, historical cases, model metadata, and a complete demo plant.
8. Start the deterministic production-line simulator.
9. Run API contract, smoke, agent-evaluation, and browser end-to-end tests against the running deployment.
10. Print the application URL, demo users, observability URLs, health summary, and exact cleanup command.

The command must be idempotent. A second run must converge without duplicating master data, corrupting history, or changing stable identifiers.

## Required architecture

Implement a modular monorepo with independently runnable `web`, `api`, `stream-worker`, `workflow-worker`, `agent-worker`, and `simulator` processes. The web app is responsive and role-based; the API includes WebSocket/SSE; workers respectively detect anomalies, run durable workflows, and execute agents through a provider abstraction; the simulator publishes reproducible context, telemetry, quality, and failure events.

Use PostgreSQL 16 + pgvector for transactions, graph/vector data, audit, and row security; ClickHouse for telemetry/features; Redpanda/Kafka for events; MinIO for immutable raw data, documents, models, and evidence; Temporal for workflows; Mosquitto for local MQTT/Sparkplug; Keycloak behind an enterprise-OIDC-compatible adapter; OpenTelemetry, Prometheus, Grafana, and JSON logs for observability; and Traefik or equivalent ingress.

Do not place an LLM in the raw telemetry loop. Statistical/ML services detect and quantify; agents retrieve evidence, reason over it, and propose actions.

## Technology defaults

Frontend: TypeScript, React, current stable Next.js, pinned pnpm workspace, TanStack Query, Zod, React Hook Form, ECharts, React Flow, accessible Radix-style primitives, Playwright, Vitest, and Testing Library.

Backend: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, uv, maintained Kafka and Temporal clients, Polars, NumPy, SciPy, scikit-learn, maintained OpenAI SDK, Pytest, Ruff, and mypy.

Pin direct dependencies. Commit lockfiles. Do not introduce a production dependency unless it serves a requirement in this file.

## Repository layout

Create or converge on this layout:

- Root: `AGENTS.md`, `Makefile`, `README.md`, `.env.example`, lockfiles, and Compose entrypoint.
- `apps/{web,api,stream-worker,workflow-worker,agent-worker,simulator}`.
- `packages/{ui,contracts,domain,config}`.
- `prompts/{rca-investigator,knowledge-curator}` with versioned prompts, tools, and eval cases.
- `models/{features,training,evaluations}`, `db/{migrations,seeds}`, and `schemas/{events,openapi}`.
- `infra/{compose,helm/factoryops,keycloak,grafana,observability}`.
- `scripts/{one-shot.sh,preflight.sh,seed.sh,smoke.sh,wait-ready.sh}`.
- `tests/{contract,e2e,load,security}` and `docs/{architecture,decisions,data-model,operations,security,agent-safety}.md`.

## Manufacturing domain contract

Base the semantic model on ISA-95 and ISA-88 concepts while allowing versioned manufacturer-specific extensions. Use UUIDv7 identifiers, UTC timestamps, explicit units, stable external IDs, optimistic concurrency, and soft deletion where audit retention applies.

Implement these entities and relationships:

- Organization: tenant, enterprise, site, area, line, cell, station, shift.
- Asset: equipment, component, tool/cavity, sensor/signal, calibration, state.
- Product/process: material, product/revision, route/operation, recipe/phase, specification, telemetry, feature window, alarm, parameter change.
- Production: order, run, batch/lot, serial unit, consumption, genealogy.
- Quality/reliability: characteristic, inspection/result, defect, quality event/scope/disposition/containment/CAPA, failure mode, anomaly, health/prediction, maintenance/work order/finding.
- Investigation/knowledge: hypothesis, evidence/counter-evidence, test, RCA/cause/action/effectiveness, approved case, taxonomy/applicability, document/embedding, contradiction/supersession.
- Governance: user/role, assignment/approval, agent/tool run, prompt/model/dataset version, audit entry.

Represent graph data with `entity_node` and typed `entity_edge` tables plus domain tables for integrity. Every edge must have provenance, valid-time, transaction-time, confidence, creator type, and approval status. Expose graph traversal through a domain service; UI code must not construct recursive SQL.

### Canonical event envelope

Every Redpanda event must validate against a versioned JSON Schema. The envelope contains `event_id`, `event_type`, `schema_version`, `occurred_at`, `observed_at`, `ingested_at`, `tenant_id`, `site_id`, `source.system`, `source.external_id`, `correlation_id`, optional `causation_id`, `data_quality.status/reasons`, `payload`, and nullable context IDs for line, asset, order, run, lot, unit, operation, and recipe. IDs are UUIDv7 and timestamps are UTC ISO-8601.

Required topics include telemetry, asset state, production context, inspection results, anomalies, quality events, maintenance predictions, workflow actions, agent requests, agent results, and knowledge proposals. Configure dead-letter topics, idempotent consumers, replay-safe handlers, and an archive sink to MinIO.

## Functional behavior

### Ingestion and contextualization

- Accept MQTT, HTTP batch/stream, CSV upload, and simulator data in the initial deployment.
- Include connector interfaces and working example adapters for OPC UA, MES REST, QMS REST, and CMMS REST. They may target simulators locally but must use production-shaped contracts.
- Validate schema, timestamp, unit, expected rate, and context completeness at ingestion.
- Preserve raw payloads immutably before normalization.
- Resolve signal and event context against site, line, asset, order, product, recipe, lot, unit, operation, and shift.
- Auto-accept exact deterministic matches. Send ambiguous matches to a contextualization review queue with candidates, confidence, and source evidence.
- Display missing, stale, late, duplicated, and out-of-range data quality conditions.

### Streaming detection

Compute cycle and rolling-window features including mean, standard deviation, min/max, slope, EWMA, robust z-score, rate of change, cycle time, phase duration, spectral-band summaries for simulated vibration, and specification distance.

Baselines must be conditioned by asset, product, revision, recipe, operation, and operating mode. Implement:

- Deterministic specification and control-limit rules.
- Change-point or EWMA detection.
- Robust multivariate anomaly detection using Isolation Forest or an equivalent interpretable baseline.
- Data-quality suppression so bad or stale sensors do not create production-quality diagnoses.
- Alert deduplication, hysteresis, cooldown, severity, consequence, and confidence thresholds.

Persist the feature window, baseline version, rule/model version, contributing features, and raw evidence references for every anomaly.

### Predictive maintenance

- Model predictions by explicit asset/component failure mode and action horizon.
- Include one working demonstration model for bearing degradation.
- Produce probability-in-horizon and health index; do not claim remaining useful life unless the training data supports it.
- Connect predictions to recent maintenance, replaced components, calibration, product/recipe, and actual technician findings.
- Create a maintenance recommendation only when confidence and consequence thresholds pass.
- Require a human to convert a recommendation into an executable work order unless policy explicitly permits automatic creation.
- Track precision, recall, false-alert rate, lead time, drift, inspection result, and avoided/unplanned downtime.

### Quality event workflow

Implement this deterministic state machine:

```text
DETECTED -> VALIDATION -> CONTAINMENT -> INVESTIGATION -> DISPOSITION
-> CORRECTIVE_ACTION -> EFFECTIVENESS_CHECK -> CLOSED
```

Allow `CANCELLED` from validation with a reason and `REOPENED` from closed after recurrence. Every transition must validate the actor role, required fields, signature/approval policy, and state version.

Quality events must support manual, rule, model, and agent-assisted origins. Store characteristic, actual value, units, specification, product genealogy, suspected affected scope, severity, risk, evidence, owner, due date, containment, disposition, RCA, CAPA, verification, and recurrence.

Implement role defaults:

- Operator: acknowledge, add evidence, perform assigned containment.
- Production supervisor: prioritize, hold/resume according to policy, assign operations work.
- Quality engineer: validate, scope, investigate, propose disposition and RCA.
- Maintenance technician: inspect, execute maintenance tasks, record findings.
- Process engineer: analyze parameters and propose controlled changes.
- Quality manager: approve disposition, CAPA, effectiveness, and closure.
- Knowledge steward: approve case/taxonomy promotion.
- Data/ML steward: approve model, feature, prompt, and evaluation changes.
- Administrator: configure integrations, users, policies, and site boundaries.

## Agent runtime

Implement a provider interface with:

- `MockAgentProvider`: deterministic, seeded, and enabled by default so the entire system and evaluations work without external credentials.
- `OpenAIResponsesProvider`: enabled when `AGENT_PROVIDER=openai` and `OPENAI_API_KEY` is present. Use the maintained OpenAI SDK, Responses API, function calling, and strict Structured Outputs generated from Pydantic schemas. Select the model through `OPENAI_MODEL`; do not hard-code a volatile model ID.

Apply timeouts, bounded retries, token/cost budgets, circuit breakers, concurrency limits, redaction, and audit metadata. Store conclusions and tool traces, not hidden chain-of-thought. Treat model text as untrusted until schema and policy checks pass.

### RCA Investigator

Trigger after a validated anomaly or on explicit user request. Give it read-only tools:

- Read event/production context, time-series/features, matched baselines, similar anomalies, genealogy, inspections/defects, maintenance/calibration/alarms/findings, approved RCA cases, and controlled documents.
- Run only approved statistical calculations.

It may write only a draft RCA analysis record. Its strict result schema must contain:

- Summary/facts and possible affected scope.
- Ranked hypotheses with cause code, 0–1 confidence, rationale, evidence and counter-evidence IDs, and assumptions.
- Confirmation tests with owner role and expected discriminating result; proposed containment.
- Missing/unreliable data; citations to immutable evidence; overall confidence and why it may be wrong.

Reject any response with nonexistent evidence IDs, unsupported numerical claims, missing counter-evidence analysis, or a definitive root-cause statement before human confirmation.

### Knowledge Curator

Trigger only after an RCA is human-confirmed and the quality event reaches effectiveness review or closure. Give it read access to the confirmed case and approved knowledge, and write access only to a draft knowledge proposal.

Its result schema must contain canonical problem statement, symptoms, operating context, confirmed cause, contributing factors, corrective actions, effectiveness result, applicability constraints, source case IDs, duplicate candidates, contradiction candidates, taxonomy changes, proposed retrieval text, and generated evaluation cases.

Promotion requires Knowledge Steward approval; it versions rather than overwrites, updates graph edges and embeddings, preserves provenance, adds regression-evaluation cases, and never auto-edits production prompts, policies, models, or taxonomies.

### Action orchestration

Agents propose; deterministic services commit. Agents cannot write PLC/controller/safety/recipe values; release, scrap, or disposition product; close events or approve CAPA; change permissions; promote knowledge/prompts/features/models; or dispatch maintenance without policy and approval.

## Executable UI/UX specification

Build a polished industrial application, not a generic admin template. Optimize for a control-room monitor, engineering laptop, rugged tablet, and mobile technician.

### Visual system

- Use a 4 px spacing scale and an 8 px default radius. Avoid decorative gradients, glass effects, oversized cards, and excessive shadows.
- Use a neutral background, high-contrast content surfaces, and one restrained brand accent.
- Status palette: blue/information, green/normal or completed, amber/warning or due, red/critical or blocked, gray/inactive. Pair every color with text and an icon or shape.
- Use a system sans-serif or Inter-like font, tabular numerals for telemetry, and a monospace face only for identifiers and raw payloads.
- Provide light and dark themes with identical semantic status mapping.
- Meet WCAG 2.2 AA, visible focus, full keyboard operation, reduced-motion support, 44 px touch targets, accessible chart summaries, and never encode status by color alone.

### Application shell

- Desktop: fixed 240 px left navigation, 56 px top bar, fluid content area, and no arbitrary maximum width on operational dashboards.
- Tablet: collapsible navigation rail and persistent page actions.
- Mobile: drawer navigation and bottom action bar only on task-heavy screens.
- Top bar contains plant/location selector, global time range, data freshness indicator, search, notification inbox, and user menu.
- Left navigation order: Overview, Live Production, Quality, Reliability, Work, RCA, Knowledge, then Admin. Hide unauthorized routes rather than showing disabled links.
- Global search must resolve assets, orders, lots, units, quality events, work orders, and knowledge cases with type, location, status, and recent context.
- Preserve selected plant, line, time range, and filters in URL parameters.

### Overview `/`

Create a plant overview with:

- Header: plant, current shift, last refresh, live/paused control.
- Compact KPI row: throughput vs target, first-pass yield, open critical events, unplanned downtime, and assets at risk. Each KPI links to the filtered detail view.
- Main visualization: line status map showing stations in process order, current state, order, product, rate, quality status, and active issue count.
- Below: production vs target trend, quality Pareto, equipment-risk list, and role-specific action queue.
- A critical event appears as a persistent inline banner with acknowledge and open-event actions; never use an auto-disappearing toast for a critical condition.

### Live Production `/live`

- Left filter rail: site, line, cell, asset, product, order, recipe, shift, and time window.
- Main synchronized time-series chart with multiple axes only when units differ, event markers, specification bands, operating-state bands, anomaly intervals, zoom, brush selection, and cursor-linked values.
- Signal selector supports search, unit display, data-quality badge, sampling rate, and pinning.
- Right context panel shows current order, lot/unit, operation, recipe, shift, machine mode, tool/calibration, recent maintenance, and current data quality.
- Selecting an anomaly opens a detail drawer with contributing features, baseline comparison, model/rule version, evidence snapshot, create-quality-event, and request-RCA actions.
- Provide a table fallback containing the visible chart data and event markers.

### Quality queue `/quality`

- Default to a dense, sortable table, not cards.
- Columns: severity, event ID, status, age/SLA, site/line, product, order/lot, characteristic, owner, affected quantity, origin, and updated time.
- Saved views: My work, Critical, Awaiting validation, Containment due, Investigation, CAPA due, Effectiveness due, and Closed recently.
- Bulk operations are limited to assignment and non-critical acknowledgements; disposition and closure remain single-event actions.
- `Create event` opens a guided form with context lookup, characteristic/specification, observation, affected scope, severity, evidence upload, and containment request.

### Quality event `/quality/[eventId]`

- Sticky header with event ID, severity, status, SLA, owner, product/order/lot, and permitted next-state action.
- Horizontal state stepper for the deterministic lifecycle.
- Two-column desktop layout: primary investigation workspace and 360 px context/action panel; stack on tablet/mobile.
- Tabs: Overview, Evidence, RCA, Genealogy, Actions, Audit.
- Overview shows problem statement, measurement vs specification, timeline, containment, affected scope, and approvals.
- Evidence combines signal snapshots, inspection results, images/documents, alarms, maintenance history, and human notes. Every item exposes origin and timestamp.
- Genealogy shows upstream materials and downstream units with affected/possibly affected/cleared status and reason.
- Actions shows assignments, due dates, dependencies, completion evidence, and approval state.
- Audit is append-only and filterable by human, service, model, and agent actor.

### RCA workspace `/rca/[eventId]`

- Three-pane desktop layout:
  - Left 260 px evidence catalog with filters and drag/add controls.
  - Center investigation canvas containing synchronized trend charts, causal map, timeline, and document/image evidence.
  - Right 360 px hypothesis panel.
- On smaller screens, convert panes to accessible tabs without losing content.
- `Generate hypotheses` displays progress by tool category, then renders ranked hypotheses in a table with confidence, supporting evidence count, counter-evidence count, and status: proposed, testing, rejected, or confirmed.
- Expanding a hypothesis shows rationale, assumptions, evidence links, counter-evidence, similar cases, and confirmation tests.
- Humans can edit wording, attach evidence, reject with reason, or confirm only after required tests are completed.
- The causal map distinguishes observation, symptom, contributing factor, hypothesis, confirmed cause, action, and verified outcome with labels and shapes.
- Export a signed RCA report as PDF/HTML from the confirmed human record, never directly from an unapproved agent draft.

### Reliability `/reliability`

- Fleet health table with asset, component, operating state, health index, failure mode, probability/horizon, lead time, alert status, last maintenance, and owner.
- Risk matrix plots consequence against probability with accessible table equivalent.
- Asset detail route `/assets/[assetId]` contains health trend, contributing signals, maintenance timeline, active predictions, failure-mode history, documents, and open work.
- Prediction detail shows model version, training-data window, feature contributions, uncertainty, drift status, similar failures, and recommended inspection.
- Actions: acknowledge, request inspection, link existing work order, create draft work request, dismiss with reason, and mark finding after inspection.

### Work `/work`

- Role-specific Kanban plus table toggle for assigned tasks.
- Columns: New, Accepted, In progress, Awaiting review, Blocked, Done.
- Each task displays source event, asset/product context, priority, due time, required evidence, and dependency.
- Mobile task execution uses one question/action per section, supports photo/document attachment, local draft persistence, and safe retry after reconnection.

### Knowledge `/knowledge`

- Search approved RCA cases, failure modes, symptoms, equipment types, products, and corrective actions.
- Filters: site applicability, asset type, product family, cause taxonomy, verification result, recurrence, and approval version.
- Results show problem, confirmed cause, applicability, evidence strength, corrective action, effectiveness, and source cases.
- Case detail displays causal chain, evidence, timeline, related and contradictory cases, superseded versions, and usage by agent runs.
- A separate Steward review queue shows proposed merges, conflicts, taxonomy edits, and generated evaluation cases with side-by-side diffs and approve/reject controls.

### Administration

- `/admin/data`: source health, lag, schema version, data-quality score, unresolved context, replay and dead-letter inspection.
- `/admin/integrations`: configured connectors, credentials by secret reference, test connection, last success, throughput, and error history.
- `/admin/agents`: agent versions, prompts/skills, allowed tools, budgets, policies, test cases, run history, and promotion/rollback.
- `/admin/models`: feature definitions, training datasets, versions, metrics, drift, deployments, shadow results, and rollback.
- `/admin/audit`: immutable audit explorer with actor, action, target, site, correlation ID, before/after references, and export.

### Interaction requirements

- Every async action handles loading, success, error/retry, denial, and stale versions.
- Optimistic UI is only for reversible low-risk edits; transitions, dispositions, approvals, and agent writes wait for server confirmation.
- Confirm consequential actions with impact and reason where auditable. Toasts are only for transient noncritical results; operational problems stay inline.
- Show freshness and plant-local timezone, retaining UTC in details/exports. Queue live row updates while editing.
- Never fabricate UI data; make empty, disconnected, and degraded modes explicit.

## API contract

Expose documented `/api/v1` endpoints for auth/permissions; plant, asset, product, recipe, production, lot/unit and genealogy; signals/features/state/data quality; anomalies/predictions/explanations; permissioned quality workflow/scope/evidence/actions/approvals/audit; RCA/tests/decisions/export; knowledge search/review/version/conflicts; integration/schema/context/dead-letter/agent/model administration; and SSE/WebSocket live summaries and updates.

Generate a typed frontend client. Use cursor pagination, explicit sort/filter schemas, ETags or version fields, idempotency keys for commands, and RFC 7807 problem responses. Enforce authorization server-side on every route.

## Demo plant and seeded scenario

The deployment must be useful immediately after startup. Seed a discrete/batch hybrid demonstration plant with:

- One enterprise/site, two lines, three cells per line, and at least three instrumented assets per line.
- Full product, process, order/lot/unit, specification, shift, user, and maintenance context plus 90 simulated days of summarized history.
- An accelerated live stream with at least 30 temperature, pressure, vibration, torque, speed, cycle-time, energy, and quality signals.
- A reproducible `bearing_wear` scenario where vibration and temperature drift, process torque changes, dimensional quality moves toward and then beyond specification, an anomaly is raised, affected genealogy is calculated, and a quality event is created.
- At least ten approved RCA cases, including similar, irrelevant, and contradictory examples.
- Deterministic ground truth so mock-agent evaluations can verify hypothesis ranking and evidence citation.

Provide `make demo-reset` to restore the seeded demo without dropping users or configuration.

## Security and governance

- Enforce tenant/site policy and PostgreSQL row security; least-privilege human and service identities.
- Keep secrets out of source/images. Encrypt transport; validate, type/size-limit, and safely reference uploads. Use CSRF defenses where relevant, secure cookies, CSP, rate/request limits, and input validation.
- Immutably audit login, mutations, transitions, approvals, model/prompt deployment, agent tools, and administration.
- Generate an SBOM and scan dependencies, secrets, images, and code in CI/`make verify` when tools exist.
- OT access defaults read-only; document zones/conduits, outbound edge flow, buffering, and failures.
- Support audit, signatures, versions, and validation without claiming certification; document customer validation responsibility.

## Observability and operations

- Propagate trace/correlation, tenant/site, event/workflow, agent-run, and model-version IDs.
- Measure latency/errors/saturation, lag/bad events, workflow failures, agent cost/latency, drift, and freshness. Dashboard platform, ingestion, quality, agents, and models in Grafana.
- Alert on source silence, lag/dead letters, workflow failure, stale/drifting models, degraded data, agent failure, and capacity.
- Implement liveness/readiness/dependency health; document backup/restore/retention/replay, schema/model/prompt rollback, DR, and shutdown.

## Testing and verification

`make verify` runs formatting, lint/types, unit/contract/migration/security tests, Helm lint/render, and browser tests; it fails on any failure and prints a concise summary.

Minimum required tests:

- Cover every workflow transition; schema compatibility/idempotency; context/unit/late/duplicate/bad-sensor handling; seeded detection vs normal data; genealogy; every role and cross-site denial; agent schemas, fake citations, tool allowlist, budgets/timeouts, injection, missing data and fallback; knowledge promotion/version/conflict/rollback; and OpenAPI/client compatibility.
- Playwright flows:
  1. Operator sees and acknowledges a generated event.
  2. Quality engineer validates, contains, investigates, and requests RCA.
  3. RCA agent returns evidence-backed ranked hypotheses.
  4. Maintenance records the seeded bearing finding.
  5. Quality manager confirms cause and corrective action.
  6. Effectiveness passes and the event closes.
  7. Knowledge steward approves the proposed case.
  8. The approved case appears in search and the agent evaluation set.
- Accessibility checks on every primary route.
- A configurable load test demonstrating sustained telemetry ingestion and responsive operational queries without making hardware-specific performance claims.

Require at least 80% branch coverage in domain, workflow, policy, and agent-safety modules; exclude generated code and trivial UI wrappers.

## Deployment assets

### Local

Provide Compose with named volumes, health checks, limits, restart policies, internal networks, readiness ordering, and only documented exposed ports.

### Kubernetes

Provide a Helm chart with workloads/services/ingress, config and secret references, service accounts/network policies, probes/PDBs/resources/autoscaling/topology/PVCs, safe idempotent migration and seed jobs, and TLS/domain/image/retention/observability values. Allow bundled PostgreSQL, ClickHouse, Kafka, object storage, OIDC, and Temporal to be disabled for managed services. Verify with Helm lint, render, and schema validation.

Do not provision a cloud account without explicit credentials and authorization. If a valid Kubernetes context is supplied, deploy, wait for rollout, run smoke/e2e tests against `DOMAIN`, and report the real result.

## CI contract

CI restores locked dependencies; runs format/lint/types/unit/contract/security; builds reproducible SHA-tagged images; boots and tests the full stack including agent evals and Playwright; emits OpenAPI, SBOM, coverage, test, and image metadata; and verifies Helm. It never pushes or deploys without a configured protected environment.

## Documentation deliverables

Include `README.md` with outcome, prerequisites, command, demo access, URLs, operations, and real UI screenshots; plus implemented-system documentation for architecture/event flow/failures, data model/retention/extensions, security/OT posture, agent tools/gates/evals/rollback, operations/backup/replay/DR, and material decisions in the paths defined under Repository layout.

Documentation must describe the implemented system, not an aspirational design.

## Definition of done

The task is complete only when `make one-shot` passes from a clean clone; services are healthy and restart safely; every specified route and interaction works; simulated contextual data is live; seeded degradation creates the anomaly, quality event, task, and RCA; RCA cites immutable evidence and ranks ground truth; a human completes quality and knowledge workflows; reliability and quality share context; role/site and agent boundaries pass tests; `make verify` passes; Helm validates and any supplied cluster is genuinely deployed and smoke-tested; introduced code has no critical/high security findings; and no placeholders, fake metrics, broken links, or unexplained skips remain.

## Final handoff format

After implementation report only verifiable results: what was built; command run and status; application/observability URLs; demo accounts and local credential location; test totals and environment-specific skips; security result; narrow real limitations; and the exact next command.

Do not present unexecuted commands as completed work and do not call a scaffold a deployment.
