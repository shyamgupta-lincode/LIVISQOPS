# Compliance & Quality Reporting

FactoryOps **Compliance** app (`/compliance`) manages automotive quality and regulatory report obligations for Midwest Hybrid (Tier-1 style demo).

## Audiences

1. **Internal** — audit / management-review evidence
2. **Customer** — OEM scorecards, PPAP, 8D, SCAR
3. **Regulatory** — local stubs only (no NHTSA/EPA/EU filing)
4. **Public** — non-confidential disclosure readiness

## API

Prefix: `/api/v1/compliance`

| Endpoint | Purpose |
|----------|---------|
| `GET /cockpit` | KPI summary + attention queues |
| `GET /obligations` | Obligation register |
| `GET /templates` | Versioned report templates |
| `GET/POST /reports` | Report instances |
| `GET /reports/{id}` | Detail + template/obligation |
| `POST /reports/{id}/transition` | Lifecycle transitions |
| `POST /reports/ai-draft` | Mock AI draft (always DRAFT) |
| `GET /calendar` | Compliance deadlines |
| `GET /regulatory-changes` | Static awareness feed |

Lifecycle: `DRAFT → VALIDATED → APPROVED → SUBMITTED → ACCEPTED | REJECTED → AMENDED`.

## Demo users

| Email | Role |
|-------|------|
| `qm@factoryops.local` | quality_manager (approve/submit) |
| `compliance@factoryops.local` | compliance |
| `cq@factoryops.local` | customer_quality |
| `reg@factoryops.local` | regulatory |
| `op@factoryops.local` | operator (draft only) |

Password: `demo`.

## Seeded coverage

At least one template + sample instance per family: QMS, PPAP, manufacturing, problem-solving, supplier, warranty, US regulatory, EU/UNECE, material/chemical/battery.

See also `docs/decisions.md` (D11) for ISO/IATF/eCoC/battery passport cadence.
