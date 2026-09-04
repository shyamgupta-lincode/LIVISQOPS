# FactoryOps Intelligence Platform

Production-oriented manufacturing intelligence platform evolved in place from LIVIS MES to the FactoryOps one-shot contract (`AGENTS.md`).

## Quick start

```bash
make one-shot
```

| Surface | URL |
|---|---|
| App | http://localhost:18080 |
| API docs | http://localhost:18000/docs |
| Grafana | http://localhost:13001 (admin/admin) |
| Prometheus | http://localhost:19090 |
| Temporal UI | http://localhost:18088 |
| MinIO console | http://localhost:19001 |

Demo password for all seeded users: `demo`

| User | Role |
|---|---|
| `qe@factoryops.local` | quality_engineer |
| `op@factoryops.local` | operator |
| `qm@factoryops.local` | quality_manager |
| `mt@factoryops.local` | maintenance_technician |
| `ks@factoryops.local` | knowledge_steward |
| `jordan.hale@harleydavidson.com` | Harley site manager |

## Commands

```bash
make one-shot PROFILE=local
make verify                 # contract/security + helm; Playwright unless SKIP_PLAYWRIGHT=1
make demo-reset
make down
```

## Golden path (verified)

Simulator drifts spindle vibration → stream-worker anomaly + quality event → QE lifecycle (VALIDATION…CLOSED) → Mock RCA (`bearing_wear`) → maintenance finding → knowledge steward approval → knowledge search.

Live API orchestration is covered by `tests/contract/test_golden_api_live.py` when the stack is up. Browser path: `tests/e2e/golden-path.spec.ts`.

## Layout

`apps/{web,api,stream-worker,workflow-worker,agent-worker,simulator}`, `packages/{ui,contracts,domain,config}`, `infra/{compose,helm/factoryops,keycloak,grafana,observability}`, `docs/*`.

Legacy Vite SPA retained at `apps/web-legacy` during cutover.
