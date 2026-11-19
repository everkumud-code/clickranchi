# ClickRanchi

Jharkhand-focused news discovery and aggregation platform.

## Repository status

This repository has been initialized. The current first commit is a placeholder; the full local MVP ZIP should be imported as the next code commit.

## Product direction

- Collect permitted news headlines and metadata from publisher RSS/Atom feeds.
- Attribute every story to its original publisher and link to the source.
- Deduplicate stories and organise by topic and Jharkhand geography.
- Support editorial review and source-specific auto-publishing.
- Default collection cadence: every 10 minutes.

## Planned production architecture

Next.js or equivalent web UI, PostgreSQL, a durable background worker/queue, secure admin authentication, monitoring and automated backups on the existing Hostinger Ubuntu VPS. Deploy in an isolated directory/service and preserve the other hosted websites.

## Content rights

The project owner states that permission has been obtained from Johar LIVE. Confirm the exact permitted uses (headline, excerpt, image, AI summary and full article) before enabling each type of reproduction. Other publisher integrations remain disabled until permissions and feed terms are confirmed.

## Important

Do not commit credentials, API keys, passwords, session secrets, private keys or production database dumps.
