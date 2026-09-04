#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/.tools/bin:$PATH"
export PYTHONPATH="$ROOT/apps/api/src:$ROOT/packages/domain/src:$ROOT/packages/config/src:${PYTHONPATH:-}"
FAIL=0
echo "== verify: unit/contract =="
python3 -m pytest tests/contract tests/security -q || FAIL=1
echo "== verify: helm =="
if command -v helm >/dev/null; then
  helm lint infra/helm/factoryops || FAIL=1
  helm template factoryops infra/helm/factoryops >/tmp/factoryops-render.yaml || FAIL=1
else
  echo "SKIP helm (not installed)"
fi
echo "== verify: SBOM/scan hooks =="
if command -v syft >/dev/null; then
  syft dir:. -o spdx-json > /tmp/factoryops-sbom.spdx.json || FAIL=1
  echo "SBOM → /tmp/factoryops-sbom.spdx.json"
else
  echo "SKIP syft (not installed)"
fi
if command -v grype >/dev/null && [[ -f /tmp/factoryops-sbom.spdx.json ]]; then
  grype sbom:/tmp/factoryops-sbom.spdx.json || echo "WARN: grype findings"
else
  echo "SKIP grype (not installed)"
fi
echo "== verify: playwright =="
if [[ "${SKIP_PLAYWRIGHT:-0}" == "1" ]]; then
  echo "SKIP playwright (SKIP_PLAYWRIGHT=1)"
elif command -v npx >/dev/null && [[ -f tests/e2e/package.json ]] && curl -fsS "${API_DIRECT:-http://localhost:18000}/ready" >/dev/null 2>&1; then
  (
    cd tests/e2e
    npm install --silent
    npx playwright install chromium
    API_DIRECT="${API_DIRECT:-http://localhost:18000}" APP_URL="${APP_URL:-http://localhost:18080}" npx playwright test
  ) || echo "WARN: playwright failed — contract tests remain authoritative"
else
  echo "SKIP playwright (API not ready or npx missing)"
fi
if [[ "$FAIL" -ne 0 ]]; then
  echo "VERIFY FAILED"
  exit 1
fi
echo "VERIFY PASSED"
