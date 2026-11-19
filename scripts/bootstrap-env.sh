#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f .env ]]; then echo ".env already exists; leaving it untouched."; exit 0; fi
command -v openssl >/dev/null || { echo "openssl is required"; exit 1; }
cp .env.example .env
ADMIN_SECRET="$(openssl rand -hex 24)"
DB_SECRET="$(openssl rand -hex 24)"
SESSION_SECRET_VALUE="$(openssl rand -hex 32)"
sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$ADMIN_SECRET|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_SECRET|" .env
sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SESSION_SECRET_VALUE|" .env
sed -i "s|^SITE_URL=.*|SITE_URL=https://clickranchi.com|" .env
sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
chmod 600 .env
echo "Created .env with unique random secrets (file mode 600)."
echo "Add AI_API_KEY to .env only if AI enrichment is required."
echo "Keep .env private; never commit or share it."
