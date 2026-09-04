#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] || { echo "missing .env"; exit 1; }

gen() {
  python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
}

ensure() {
  local key="$1"
  if grep -qE "^${key}=$" "$ENV_FILE" || ! grep -qE "^${key}=" "$ENV_FILE"; then
    local val
    val="$(gen)"
    if grep -qE "^${key}=" "$ENV_FILE"; then
      # empty value → fill
      if grep -qE "^${key}=$" "$ENV_FILE"; then
        sed -i.bak "s|^${key}=$|${key}=${val}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
        echo "Generated $key"
      fi
    else
      echo "${key}=${val}" >>"$ENV_FILE"
      echo "Appended $key"
    fi
  fi
}

ensure SESSION_SECRET
ensure NEXTAUTH_SECRET
