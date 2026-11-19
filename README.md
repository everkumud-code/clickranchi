# ClickRanchi

Automated Jharkhand-focused news aggregation and publishing. The product goal is zero routine manual newsroom work: authorised publisher feeds are collected, deduplicated, classified, tagged and published automatically.

## Implemented foundation
- Node.js 20+ app, responsive public news homepage and operational newsroom dashboard.
- RSS/Atom ingestion on startup and every 10 minutes (configurable).
- Johar LIVE configured enabled + auto-publish based on project owner's permission confirmation. Initial payload is limited to RSS headline, short feed excerpt, publisher attribution and original source link.
- Duplicate URL suppression with tracking-parameter normalisation.
- Rule-based Hindi/English detection, category classification and 24-district tagging.
- Headline similarity clustering metadata.
- Optional AI enrichment adapter using an OpenAI-compatible chat-completions endpoint. Set AI_API_KEY to activate AI district/category/language classification and concise summary generation. Without a key, deterministic classification is used.
- PostgreSQL persistence when DATABASE_URL is configured; local JSON persistence for development only.
- Signed expiring admin session cookies, login throttling, production secret checks and same-origin checks on admin mutations.
- Health endpoint, robots.txt, dynamic XML sitemap.
- Dockerfile, Docker Compose PostgreSQL setup and GitHub Actions test workflow.

## Local development
1. Install Node.js 20+.
2. Copy .env.example to .env; set ADMIN_PASSWORD and SESSION_SECRET.
3. Leave DATABASE_URL blank for local JSON mode, or set it to a PostgreSQL connection.
4. Run npm install, npm test, then npm start.
5. Open http://localhost:3000.

## Docker deployment
1. Copy .env.example to .env.
2. Set strong POSTGRES_PASSWORD, ADMIN_PASSWORD (16+ chars), SESSION_SECRET (32+ chars), SITE_URL=https://clickranchi.com.
3. Add AI_API_KEY if AI enrichment is required.
4. Run docker compose up -d --build.
5. App listens only on 127.0.0.1:3300 on the host. Configure a dedicated reverse-proxy vhost for clickranchi.com to proxy to that loopback port. Do not overwrite existing site configs.

## Publisher rights
Only enable feeds where publisher terms or written permission allow aggregation. Johar LIVE is enabled based on the project owner's confirmation. Other publishers remain disabled until permission is confirmed. Do not republish full article text, photos or publisher assets unless the agreement expressly grants those rights.

## Classification limitations
AI enrichment is optional and is not active until an API key is configured. The deterministic fallback uses keywords. AI only receives headline + RSS excerpt and is instructed not to invent facts. District/category output still needs editorial-quality evaluation on a labelled Jharkhand dataset. Similarity clustering is a title-token heuristic, not a full semantic embedding model.

## Production checklist
- Deploy to isolated app directory/service/container and preserve every existing VPS site.
- Inspect current reverse-proxy config before adding a dedicated clickranchi.com vhost.
- Configure HTTPS, PostgreSQL backups and monitoring.
- Test Johar LIVE feed from VPS network and verify first ingestion.
- Configure AI_API_KEY securely if AI enrichment is desired.
- Add alert delivery, tune classification and run restore drills.

Never commit .env, credentials, access tokens, private keys or production data.