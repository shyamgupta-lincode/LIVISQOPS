# Seeds

Runtime seed logic lives in `apps/api/src/factoryops_api/seed.py` and is invoked by `make seed` / `scripts/seed.sh`.

Stable IDs for the primary `bearing_wear` plant are defined in `STABLE` inside that module so demo URLs and Playwright selectors remain stable across `demo-reset`.

## Context graph

`factoryops_api.context_graph_seed.seed_context_graph` upserts the published ISA-95 graph (`entity_nodes` / `entity_edges`) on every seed:

- Midwest Hybrid spine: enterprise → site → areas → lines → cells → assets
- Production thread: product / order / lot / unit linked to the discrete line and bearing asset
- `bearing_wear` failure mode + vibration/temperature/torque/speed signal nodes
- Harley York areas/lines/stations from the legacy LIVIS MES topology as graph-only enrichment under the existing Harley site
- Object bindings + ISA-95 levels from the legacy context-graph schema (adapted to FactoryOps kinds)

`factoryops_api.hero_seed.seed_hero_tenant` adds a **second tenant** with a full Dharuhera plant (domain + graph via `seed_hero_context_graph`, compliance with `id_offset=1000`). Synthetic demo only.

Re-run with `make seed` or `make demo-reset`. Graph rows use stable IDs; orphans from earlier sparse seeds are deleted per tenant.

## Compliance & quality reporting

`factoryops_api.compliance_seed.seed_compliance` upserts obligations, OEM-specific report templates, report instances (draft→accepted sample path), and calendar deadlines with stable IDs (`bbbb…` / `cccc…` / `dddd…` / `eeee…`). Problem-solving drafts link to existing quality events / genealogy when present. See `docs/compliance-reporting.md`.
