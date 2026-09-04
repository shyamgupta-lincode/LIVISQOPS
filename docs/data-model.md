# Data model (implemented)

SQLAlchemy models in `apps/api/src/factoryops_api/models.py` cover:

- Org: tenant, site, line, cell, asset, failure_mode
- Product/production: product, production_order, lot, serial_unit
- Quality/reliability: quality_event, anomaly, prediction, work_task, signal_sample
- Investigation: hypothesis, rca_analysis, knowledge_case, knowledge_proposal
- Governance: user, audit_entry, entity_node, entity_edge (provenance, bi-temporal fields, confidence, approval)

Schema bootstrap: `factoryops_api.migrate` (`create_all` + RLS policies on site-scoped tables). Alembic revision `0001_initial_rls` mirrors RLS under `db/migrations/versions/`.

ClickHouse: `factoryops.telemetry_raw`, `factoryops.feature_windows` (`infra/compose/init-clickhouse.sql`).

Event envelopes: `schemas/events/*.json` + topic list in `schemas/events/topics.json`.
