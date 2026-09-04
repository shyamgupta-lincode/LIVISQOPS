#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
RESET=0
[[ "${1:-}" == "--demo-reset" ]] && RESET=1
docker compose -f infra/compose/docker-compose.yml --env-file .env exec -T api \
  python -c "from factoryops_api.seed import seed; seed(demo_reset=${RESET})"
echo "seed OK"
