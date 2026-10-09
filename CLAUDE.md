# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

SignalHub: self-hosted, Apache-2.0 status pages, monitoring and incident communication. Next.js (App Router, webpack) + PostgreSQL (Kysely) + a separate Graphile Worker process. See `.env.example` for config; `login-credentials.txt` holds local dev logins.

## Commands

- `npm run dev:all` — web (port 3301) + worker through the setup supervisor (`scripts/start.ts --dev`): migrates on start, or serves the setup wizard if `.env` has no `DATABASE_URL`. `npm run dev` is the same with web only; `npm run dev:web` is bare `next dev`; `npm run worker:dev` worker only.
- `npm run start:all` — production from a checkout after `npm run build` (supervisor on `.next/standalone`), default `127.0.0.1:3301`.
- `npm run verify` — lint (zero warnings) + typecheck + tests + build. Run before committing.
- `npm test` / `npx vitest run tests/status.test.ts` / `npx vitest run -t "name"` — unit tests (Vitest, `@` aliases repo root).
- `INTEGRATION_DATABASE_URL=postgresql://.../signalhub_integration_test npm run test:integration` — needs a disposable DB whose name contains "test"; skipped otherwise.
- `npm run test:e2e` — Playwright (`tests/e2e`).
- `npm run db:migrate`, `db:seed`, `db:seed-roles`, `db:reset-dev`, `bootstrap`, `signalhubctl`, `statusctl` — tsx scripts in `scripts/`.
- `npm run build` builds web (`build:web`) and bundles worker + CLI scripts into `dist-runtime/` (esbuild); `start:worker` runs `dist-runtime/worker.mjs`.

## Architecture

- **First-run setup:** `scripts/start.ts` (image entrypoint) merges `SIGNALHUB_DATA_DIR/signalhub.json` under env (env wins), generates secrets, migrates, and runs web + worker. With no `DATABASE_URL` or no users it runs web only with `SIGNALHUB_SETUP_MODE`; `proxy.ts` then serves only `/setup` (`app/setup`, `app/api/setup/*`, logic in `lib/setup/`). Setup-mode code must not import `lib/postgres/client.ts` (it binds `DATABASE_URL` at import).
- **Two processes share one codebase and DB.** Web (`app/`) and worker (`worker/index.ts`) both import from `lib/`. The web side never runs background work itself: it enqueues via `enqueueJobSweep` (`lib/jobs.ts`, `JOB_TASKS`) inside its DB transaction, and `worker/tasks.ts` maps those tasks to handlers (`monitors`, `notifications`, `exports`, `audit-delivery`, `platform-jobs`, maintenance, retention, audit seal). Sweeps are idempotent and lease-based (`lease-heartbeat.ts`).
- **URL rewriting in `proxy.ts`** (Next 16 middleware): public URLs `/organization/*` and `/organization/platform/*` are rewritten to the internal `app/admin/*` and `app/platform/*` routes; `/admin` and `/platform` redirect to the public forms. Auth is the `sp_session` JWT cookie (jose, rotating keyring from `lib/session-secret.ts`). New admin routes live under `app/admin/(protected)`.
- **Route groups:** `app/(public)` status pages (`[slug]`, `hub`), `custom-domain`, `app/api/{v1,admin,platform,scim,internal,...}`. `/api/v1` is the scoped-API-key public API (`lib/api-auth.ts`, `lib/openapi.ts`).
- **Data layer:** `lib/postgres/client.ts` (Kysely + pg pool created lazily on first query, so imports never need `DATABASE_URL`; `DatabaseExecutor` accepts pool or transaction) and `schema.ts` types; plain SQL migrations in `db/migrations/NNN_*.sql` applied by `lib/migrations.ts`. Schema changes = new numbered migration + `schema.ts` update.
- **Domain logic** in `lib/` (flat, one concern per file: auth, identity/OIDC/SAML/SCIM, RBAC in `access.ts`/`platform-roles.ts`, audit chain in `audit-integrity.ts`/`tenant-audit.ts`, SSRF guards in `guarded-fetch.ts`/`network-policy.ts`) and `lib/domain/` (incidents, maintenance, monitors, webhooks). Tenancy: organizations → pages → components; platform-level (installation) admin is separate from org admin.
- **UI:** `components/ui/` primitives, `components/admin|public|platform|landing`. Design contract (tokens, shell, radii) is `DESIGN.md` (tracked in git history; currently deleted in the working tree — `git show HEAD:DESIGN.md`). Tokens live in `app/theme.css` (Tailwind v4).

## Conventions

- Deploy artifacts: `Dockerfile` (CMD `dist-runtime/start.mjs`), `docker-compose.yml` + `deploy/compose/*` overrides, `install.sh`, `deploy/kubernetes` (kustomize), `render.yaml`, `fly.toml`; guides in `docs/deploy/`.
- Commit finished phases rather than leaving them pending.
