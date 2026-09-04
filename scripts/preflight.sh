#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "PREFLIGHT FAIL: $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

command -v docker >/dev/null || fail "docker not found"
docker info >/dev/null 2>&1 || fail "docker daemon not reachable"
ok "Docker $(docker --version | awk '{print $3}')"

if docker compose version >/dev/null 2>&1; then
  ok "Docker Compose $(docker compose version --short)"
else
  fail "docker compose plugin required"
fi

# Disk: need ~8GB free on workspace volume
avail_kb=$(df -k "$ROOT" | awk 'NR==2{print $4}')
[[ "${avail_kb:-0}" -gt 8000000 ]] || echo "WARN: less than ~8GB free disk (have ${avail_kb}KB)"

# Ports
for port in 18080 18000 18088 19001 19090 13001; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "WARN: port $port already in use — one-shot may fail to bind"
  else
    ok "port $port free"
  fi
done

command -v python3 >/dev/null || fail "python3 required for host scripts"
ok "python3 $(python3 --version | awk '{print $2}')"
ok "preflight complete"
