#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${API_DIRECT:-http://localhost:18000}"
echo -n "Waiting for API"
for _ in $(seq 1 120); do
  if curl -fsS "$API/ready" >/dev/null 2>&1; then
    echo " OK"
    curl -fsS "$API/health"; echo
    exit 0
  fi
  echo -n "."
  sleep 3
done
echo " TIMEOUT"
docker compose -f "$ROOT/infra/compose/docker-compose.yml" --env-file "$ROOT/.env" logs --tail=100 api || true
exit 1
