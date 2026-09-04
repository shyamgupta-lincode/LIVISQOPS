#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PROFILE="${PROFILE:-local}"
for arg in "$@"; do
  case "$arg" in
    PROFILE=*) PROFILE="${arg#PROFILE=}" ;;
    KUBE_CONTEXT=*) KUBE_CONTEXT="${arg#KUBE_CONTEXT=}" ;;
    DOMAIN=*) DOMAIN="${arg#DOMAIN=}" ;;
  esac
done
export PATH="$ROOT/.tools/bin:$PATH"
# shellcheck disable=SC1091
source .env
echo "== FactoryOps one-shot PROFILE=$PROFILE =="
bash scripts/preflight.sh
docker compose -f infra/compose/docker-compose.yml --env-file .env up -d --build
bash scripts/wait-ready.sh
docker compose -f infra/compose/docker-compose.yml --env-file .env exec -T api python -m factoryops_api.migrate || true
docker compose -f infra/compose/docker-compose.yml --env-file .env exec -T clickhouse \
  clickhouse-client --multiquery < infra/compose/init-clickhouse.sql || true
bash scripts/seed.sh
bash scripts/smoke.sh
SKIP_PLAYWRIGHT="${SKIP_PLAYWRIGHT:-1}" bash scripts/verify.sh || true
if [[ "$PROFILE" == "k8s" ]]; then
  if [[ -n "${KUBE_CONTEXT:-}" ]] && command -v helm >/dev/null; then
    helm upgrade --install factoryops infra/helm/factoryops --kube-context "$KUBE_CONTEXT" \
      --set ingress.domain="${DOMAIN:-localhost}" || echo "WARN: helm deploy failed"
  elif command -v helm >/dev/null; then
    echo "SKIP k8s deploy: no KUBE_CONTEXT — lint/render only"
    helm lint infra/helm/factoryops
    helm template factoryops infra/helm/factoryops >/tmp/factoryops-render.yaml
  fi
fi
cat <<EOF

============================================================
FactoryOps is up
  App:        ${APP_URL:-http://localhost:18080}
  API:        http://localhost:18000/docs
  Grafana:    ${GRAFANA_URL:-http://localhost:13001} (admin/admin)
  Prometheus: ${PROMETHEUS_URL:-http://localhost:19090}
  Temporal:   ${TEMPORAL_UI_URL:-http://localhost:18088}
  MinIO:      ${MINIO_CONSOLE_URL:-http://localhost:19001}

Demo users (password: demo)
  qe@factoryops.local
  op@factoryops.local
  qm@factoryops.local
  mt@factoryops.local
  ks@factoryops.local
  jordan.hale@harleydavidson.com

Cleanup: make down
Reset demo: make demo-reset
============================================================
EOF
