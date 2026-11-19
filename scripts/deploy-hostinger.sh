#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v docker >/dev/null || { echo "Docker is required"; exit 1; }
docker compose version >/dev/null
[[ -f .env ]] || { echo "Missing .env. Copy .env.example and set production secrets first."; exit 1; }
docker compose config >/dev/null
docker compose up -d --build
for i in {1..30}; do
  if curl --silent --fail http://127.0.0.1:3300/api/health; then
    echo
    echo "ClickRanchi container is healthy on 127.0.0.1:3300."
    exit 0
  fi
  sleep 2
done
echo "Health check failed. Recent logs:"
docker compose logs --tail=100 app
exit 1
