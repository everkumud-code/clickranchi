# ClickRanchi

Automated Jharkhand-focused news aggregation and publishing. The product goal is zero routine manual newsroom work: authorised publisher feeds are collected, deduplicated, classified, tagged and published automatically.

## Current implementation
- Node.js 20+ application with public news feed and operational newsroom.
- RSS/Atom ingestion on startup and every 10 minutes (configurable).
- Johar LIVE configured as enabled + auto-publish based on the project owner's permission confirmation. Initial payload is limited to RSS headline, short feed excerpt, publisher attribution and canonical source link.
- Duplicate URL suppression with tracking-parameter normalisation.
- Heuristic Hindi/English detection, category classification and Jharkhand 24-district tagging.
- Similar-headline clustering metadata.
- PostgreSQL persistence when DATABASE_URL is configured; local JSON persistence for development only.
- Signed, expiring admin session cookies, login throttling, production secret checks and same-origin checks on admin mutations.
- Health endpoint, robots.txt and dynamic XML sitemap.
- Dockerfile, Docker Compose PostgreSQL setup and GitHub Actions test workflow.

## Local development
1. Install Node.js 20+.
2. Copy .env.example to .env; set ADMIN_PASSWORD and SESSION_SECRET.
3. For quick local mode, leave DATABASE_URL blank. For PostgreSQL mode, set DATABASE_URL to a local PostgreSQL connection.
4. Run npm install.
5. Run npm test.
6. Run npm start and open http://localhost:3000.

## Docker deployment
1. Copy .env.example to .env.
2. Set strong POSTGRES_PASSWORD, ADMIN_PASSWORD (16+ chars), SESSION_SECRET (32+ chars), and SITE_URL=https://clickranchi.com.
3. Run docker compose up -d --build.
4. App listens only on 127.0.0.1:3300 on the host. Configure a dedicated reverse-proxy vhost for clickranchi.com to proxy to that loopback port. Do not overwrite existing site configs.

## Publisher rights
Only enable feeds where the publisher's terms or written permission allow aggregation. Johar LIVE is enabled based on the project owner's confirmation. Other publishers remain disabled until permission is confirmed. Do not republish full article text, photos or publisher assets unless the agreement expressly grants those rights.

## Classification limitations
Current language/category/district classification is deterministic keyword-based baseline, not an AI model. District is set to Jharkhand when no district term is detected. Story clustering is a title-token similarity heuristic. These features need evaluation against a labelled Jharkhand news dataset before being treated as editorially reliable. No LLM API key is assumed or hard-coded.

## Production checklist
- Deploy to an isolated app directory and service/container; preserve all other VPS sites.
- Configure HTTPS and a dedicated reverse-proxy vhost after inspecting existing Nginx configuration.
- Configure backups and monitoring for PostgreSQL.
- Test the Johar LIVE feed from the VPS network and verify first ingestion.
- Add alert delivery and evaluate classification precision/recall.
- Set up off-host database backups and restore drills.

Never commit .env, credentials, access tokens, private keys or production data.