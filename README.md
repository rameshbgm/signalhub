# SignalHub

Self-hosted status pages, monitoring and incident communication. Apache-2.0.

![Public status page](docs/screenshots/public-status-page.png)

## Features

- **Public status pages and hubs** — branded pages, component groups, uptime bars, metrics, custom domains, private and audience-restricted pages, RSS/Atom feeds, status badge and embed banner.
- **Incidents and maintenance** — timelines with updates, scheduled maintenance, templates, subscriber notifications.
- **Monitoring** — HTTP, heartbeat and webhook monitors run by a background worker, with SSRF guards on outbound checks.
- **Subscribers** — email, SMS and webhook destinations with OTP verification.
- **Multi-tenant** — organizations → pages → components, with RBAC (Admin, Incident Manager, Responder, Viewer) and a separate installation (platform) console.
- **Identity** — local accounts with MFA, OIDC, SAML and SCIM.
- **Audit** — tamper-evident audit chain, export and delivery to external sinks.
- **Public API** — scoped API keys under `/api/v1`.

## Screenshots

| | |
|---|---|
| ![Landing](docs/screenshots/landing.png) Landing | ![Hub](docs/screenshots/public-hub.png) Public hub |
| ![Dashboard](docs/screenshots/admin-dashboard.png) Dashboard | ![Pages](docs/screenshots/admin-pages.png) Pages |
| ![Incidents](docs/screenshots/admin-incidents.png) Incidents | ![Maintenance](docs/screenshots/admin-maintenance.png) Maintenance |
| ![Monitors](docs/screenshots/admin-monitors.png) Monitors | ![Analytics](docs/screenshots/admin-analytics.png) Analytics |
| ![Subscribers](docs/screenshots/admin-subscribers.png) Subscribers | ![Platform](docs/screenshots/platform-overview.png) Platform console |

## Architecture

Two processes share one codebase and one PostgreSQL database.

- **Web** (`app/`) — Next.js App Router. Never runs background work; it enqueues jobs inside its DB transaction (`lib/jobs.ts`).
- **Worker** (`worker/`) — Graphile Worker. Runs monitors, notifications, exports, audit delivery, platform jobs, maintenance, retention. Sweeps are idempotent and lease-based.
- **Data** — Kysely + `pg`; plain SQL migrations in `db/migrations/NNN_*.sql`.
- **URLs** — `proxy.ts` rewrites public `/organization/*` and `/organization/platform/*` to internal `app/admin/*` and `app/platform/*`.

Directory map: `app/` routes and API · `components/` UI · `lib/` domain logic · `worker/` background tasks · `scripts/` CLIs and seeds · `db/` migrations · `deploy/helm` Kubernetes chart · `tests/` Vitest + Playwright.

## Quick start (local development)

Requires Node.js and PostgreSQL.

```bash
npm install
cp .env.example .env        # set DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY
npm run db:migrate
npm run bootstrap -- --password-stdin   # first organization + admin
npm run dev:all             # web on :3301 + worker
```

Generate secrets with `openssl rand -base64 48`.

Sample data (never on production): set `ALLOW_DEV_SEED=true`, then `npm run db:seed` and `npm run db:seed-roles` (needs `DEV_ROLE_PASSWORD`). `ENABLE_DEV_QUICK_LOGIN=true` adds one-click logins on localhost.

Logins: `/organization/login` (tenant), `/organization/platform/login` (installation).

## Docker

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY
docker compose up -d
```

Compose runs Postgres, web and worker. A Helm chart is in `deploy/helm`.

## Configuration

All settings are in [`.env.example`](.env.example), commented. Key groups: core secrets and URL, PostgreSQL, session and password policy, identity (OIDC), asset storage (local or S3), monitoring policy, worker tuning, OpenTelemetry. SMTP and Twilio are configured in the platform console (`/organization/platform/configuration`).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev:all` | web + worker |
| `npm run dev` / `worker:dev` | web only / worker only |
| `npm run verify` | lint (zero warnings), typecheck, tests, build |
| `npm test` | unit tests (Vitest) |
| `npm run test:integration` | needs `INTEGRATION_DATABASE_URL` pointing at a DB whose name contains `test` |
| `npm run test:e2e` | Playwright |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed`, `db:seed-roles`, `db:seed-demo`, `db:reset-dev` | dev data |
| `npm run signalhubctl`, `statusctl` | admin CLIs |
| `npm run build` / `start` / `start:worker` | production build and run |

Schema change = new numbered migration in `db/migrations/` plus an update to `lib/postgres/schema.ts`.

## Documentation

- In-app user manual: `public/docs/user-manual.html`
- Security policy: [SECURITY.md](SECURITY.md)
- Planned AI features: `docs/superpowers/`

## License

Apache-2.0 — see [LICENSE](LICENSE).
