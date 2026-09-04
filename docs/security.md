# Security (implemented)

- Demo OIDC-compatible auth with Keycloak realm import; `AUTH_MODE=oidc_with_demo_fallback` issues bearer sessions for seeded users (password `demo`).
- Quality transitions enforce role + state machine (`factoryops_domain.quality`).
- Postgres RLS policies on `quality_events`, `anomalies`, `work_tasks`, `audit_entries` (gated by `app.current_site_id`; unset = service access).
- Audit entries written on quality transitions and knowledge approvals.
- OT write deny covered by security tests; agents propose only — commit paths are API/services.
- Integration connectors store `secret_ref` only; resolve at test-time via `env:` / `secret:` maps. Connector configure/test requires admin (or Plant Manager / data_ml_steward).
- CSP/rate limits are Compose-local defaults; harden at ingress for production.
