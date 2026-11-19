# ClickRanchi

**Automated Jharkhand news aggregation and publishing platform.** The operating goal is zero routine manual newsroom work: authorised feeds are collected, processed, categorised, deduplicated and automatically published.

## Current MVP
- Node.js 20+ application.
- RSS/Atom collection at a default 10-minute interval.
- Johar LIVE feed configured and auto-publish enabled based on the project owner's confirmation that permission has been obtained.
- Initial publishing payload: RSS headline, short feed excerpt, publisher attribution and original article link.
- Duplicate URL detection.
- Public homepage with publisher attribution and source links.
- Admin endpoints for source/story inspection and manual sync (optional operational tools, not a required publishing step).

## Local run
1. Copy `.env.example` to `.env`.
2. Set a strong `ADMIN_PASSWORD`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Automated publishing policy
- No routine human approval step for enabled, authorised sources.
- Stories from an enabled source with `autoPublish: true` are published as soon as ingestion succeeds.
- Feed failures are recorded; the next scheduled run retries.
- Duplicate items are skipped.
- Sources without confirmed permission remain disabled.
- The platform does not reproduce full articles or publisher images by default. Expand reproduction only where the written permission expressly allows it.

## Production work still required
This MVP is not production-ready. Before VPS launch, replace JSON-file persistence with PostgreSQL, use a durable background worker/queue, harden authentication and session storage, add feed-specific parsers/retries/rate limits, structured logs/alerts, backups, tests and deployment isolation on the Hostinger Ubuntu VPS. AI summaries, robust Hindi/Jharkhand geography classification and story clustering are planned modules, not yet implemented.

## Security
Never commit `.env`, passwords, tokens, private keys or production data.
