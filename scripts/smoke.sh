#!/usr/bin/env bash
set -euo pipefail
API="${API_DIRECT:-http://localhost:18000}"
echo "Smoke against $API"
TOKEN=$(curl -fsS -X POST "$API/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"qe@factoryops.local","password":"demo"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
AUTH="Authorization: Bearer $TOKEN"
for path in /health /ready /api/v1/plant/overview /api/v1/quality/events /api/v1/reliability/assets /api/v1/knowledge/search /api/v1/admin/data-health; do
  code=$(curl -s -o /tmp/fo_smoke.json -w "%{http_code}" -H "$AUTH" "$API$path")
  echo "$code $path"
  [[ "$code" == "200" ]] || { cat /tmp/fo_smoke.json; exit 1; }
done
echo "smoke OK"
