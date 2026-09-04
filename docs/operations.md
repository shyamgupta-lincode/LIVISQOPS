# Operations (implemented)

```bash
make one-shot          # preflight → compose up → wait-ready → seed → smoke
make verify            # pytest + helm lint/render + optional SBOM/Playwright
make demo-reset        # wipe operational demo rows; reseed plant/cases; keep users
make down              # compose down
```

Published local ports (shifted to avoid host conflicts): Traefik `18080`, API `18000`, Grafana `13001`, Prometheus `19090`, Temporal UI `18088`, MinIO `19000/19001`.

Health: API `/health` + `/ready` (DB ping). Web `/api/health` inside the Next container (`HOSTNAME=0.0.0.0`).
