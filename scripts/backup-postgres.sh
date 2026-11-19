#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/backups"
chmod 700 "$ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_dump -U clickranchi clickranchi | gzip > "$ROOT/backups/clickranchi-$STAMP.sql.gz"
chmod 600 "$ROOT/backups/clickranchi-$STAMP.sql.gz"
echo "Backup created: backups/clickranchi-$STAMP.sql.gz"
