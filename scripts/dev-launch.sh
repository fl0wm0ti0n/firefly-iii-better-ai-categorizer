#!/usr/bin/env bash
# scripts/dev-launch.sh — Deterministic local Categorizer launch (US-0006)
#
# Usage:
#   bash scripts/dev-launch.sh          # Launch with --build
#   bash scripts/dev-launch.sh --stop   # Stop the local service
#
# Per DEC-0018: uses explicit -f flag for docker-compose.local.yml.
# Health poll: GET http://localhost:3001/ every 2s, 60s timeout.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.local.yml"
HEALTH_URL="http://localhost:3001/"
POLL_SECONDS="${UAT_PROCESS_HEALTH_POLL_SECONDS:-60}"
POLL_INTERVAL="${UAT_PROCESS_HEALTH_POLL_INTERVAL_SECONDS:-2}"
HOST_PORT=3001

cd "${REPO_ROOT}"

# --- Stop mode ---
if [[ "${1:-}" == "--stop" ]]; then
  echo "Stopping local Categorizer service..."
  docker compose -f "${COMPOSE_FILE}" down
  echo "Service stopped."
  exit 0
fi

# --- Pre-check: is port 3001 already in use? ---
if command -v ss &>/dev/null; then
  if ss -tlnp 2>/dev/null | grep -q ":${HOST_PORT} " ; then
    echo "ERROR: Port ${HOST_PORT} is already in use."
    echo "  Stop the other service, or run: bash scripts/dev-launch.sh --stop"
    exit 1
  fi
elif command -v lsof &>/dev/null; then
  if lsof -iTCP:${HOST_PORT} -sTCP:LISTEN &>/dev/null; then
    echo "ERROR: Port ${HOST_PORT} is already in use."
    echo "  Stop the other service, or run: bash scripts/dev-launch.sh --stop"
    exit 1
  fi
fi

# --- Pre-check: .env exists ---
if [[ ! -f .env ]]; then
  echo "ERROR: .env file not found."
  echo "  Copy the example and fill in your values: cp .env.example .env"
  exit 1
fi

# --- Launch ---
echo "Starting local Categorizer service (port ${HOST_PORT}:3000)..."
docker compose -f "${COMPOSE_FILE}" up -d --build
echo "Service starting. Polling ${HEALTH_URL} every ${POLL_INTERVAL}s (timeout ${POLL_SECONDS}s)..."

# --- Health poll ---
elapsed=0
while (( elapsed < POLL_SECONDS )); do
  HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' "${HEALTH_URL}" 2>/dev/null || true)
  if [[ "${HTTP_CODE}" == "200" ]]; then
    echo "Service healthy after ${elapsed}s (HTTP ${HTTP_CODE})."
    echo "Browse to: ${HEALTH_URL}"
    exit 0
  fi
  sleep "${POLL_INTERVAL}"
  elapsed=$((elapsed + POLL_INTERVAL))
done

# --- Timeout ---
echo "ERROR: Service did not become healthy within ${POLL_SECONDS}s."
echo "  Check logs: docker compose -f ${COMPOSE_FILE} logs"
echo "  Last HTTP code: ${HTTP_CODE:-none}"
exit 1
