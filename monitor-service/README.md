# monitor-service

Standalone Python scheduler that runs the status page's uptime/health checks.
Replaces the old `/api/cron/run-checks` Next.js route — checks no longer run
inside the web app's request lifecycle.

Talks directly to the same MongoDB the Next.js app uses (`monitors`,
`monitorChecks`, `components`, `componentStatusEvents`, `incidents`,
`metricPoints` collections). No HTTP dependency between the two services;
either can be deployed/restarted independently.

## Setup

```bash
cd monitor-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # point DATABASE_URL at the same Mongo as the app
python main.py
```

Runs forever, polling every `POLL_INTERVAL_SEC` (default 30s) for monitors
whose `intervalSec` has elapsed since `lastCheckedAt`, and running up to
`CHECK_CONCURRENCY` checks in parallel per poll.

## What it does

- `checks.py` — HTTP, KEYWORD (HTTP + body assertion), TCP, PING, SSL
  checks, with an SSRF guard (rejects loopback/RFC1918/link-local/cloud
  metadata targets) and ping argument-injection guard.
- `state.py` — applies a check result: writes to `monitorChecks`, and on a
  fail/recover threshold crossing flips the linked component's status,
  records a response-time metric point, and auto-opens/resolves an incident
  — whichever actions the monitor has enabled.
- `main.py` — the scheduler loop.

This intentionally duplicates what used to be `lib/monitor-runner.ts` in the
Next.js app (now removed) — same collections, same field names, same
threshold semantics — so monitors configured via the admin UI work
unchanged.
