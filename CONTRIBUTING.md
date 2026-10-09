# Contributing to SignalHub

Thanks for helping. SignalHub is Apache-2.0; by contributing you agree your work is licensed under the same terms.

## Ground rules

- **Security issues** go through [SECURITY.md](SECURITY.md), never a public issue.
- Open an issue before large changes so we can agree on direction.
- Keep changes focused. Match the surrounding code's style, naming and comment density.

## Development setup

Requirements: Node.js 22+, PostgreSQL 18 (Docker is easiest), npm.

```bash
git clone https://github.com/rameshbgm/signalhub.git
cd signalhub
npm install
cp .env.example .env            # set SESSION_SECRET, ENCRYPTION_KEY, DATABASE_URL

docker run -d --name signalhub-dev-pg -e POSTGRES_USER=signalhub -e POSTGRES_PASSWORD=change-me \
  -e POSTGRES_DB=signalhub -p 127.0.0.1:5432:5432 postgres:18.4-alpine

npm run db:migrate
printf '%s' 'a-long-dev-password' | npm run bootstrap -- --password-stdin
npm run dev:all                 # web on :3301 + worker
```

Sign in at <http://localhost:3301/organization/login>. For sample data on a **disposable** dev database only, see `ALLOW_DEV_SEED`, `CONFIRM_DEV_DATABASE_RESET` and `npm run db:seed-demo` in [docs/configuration.md](docs/configuration.md#development-and-test-only).

## Project layout

| Path | Contents |
|---|---|
| `app/` | Next.js App Router: `(public)` status pages, `admin/(protected)` organization UI, `platform/` console, `api/` |
| `worker/` | Graphile Worker process (monitors, notifications, exports, audit delivery, maintenance, retention) |
| `lib/` | Domain logic, one concern per file; `lib/domain/` for incidents, maintenance, monitors, webhooks |
| `lib/postgres/` | Kysely client and generated-by-hand `schema.ts` types |
| `db/migrations/` | Numbered plain-SQL migrations |
| `components/` | `ui/` primitives, plus `admin`, `public`, `platform`, `landing` |
| `scripts/` | CLI and seed scripts (bundled to `dist-runtime/` by `npm run build`) |
| `tests/` | Vitest unit/integration tests and Playwright e2e |

Web and worker share one codebase and one database. The web side never runs background work: it enqueues jobs inside its DB transaction (`lib/jobs.ts`) and `worker/tasks.ts` handles them.

## Rules that matter

- **Schema changes** are a new numbered migration in `db/migrations/NNN_name.sql` **and** an update to `lib/postgres/schema.ts`. Never edit an applied migration.
- **Next.js here is not the one you may know.** Read the relevant guide in `node_modules/next/dist/docs/` before changing routing, caching or server APIs.
- **Security-sensitive code** (auth, RBAC, SSRF guards, crypto, audit) needs tests for the failure paths, not just the happy path.
- Don't add a dependency for something a few lines or the platform can do.

## Before you open a PR

```bash
npm run verify        # lint (zero warnings) + typecheck + unit tests + build
```

Also, when relevant:

```bash
npx vitest run tests/status.test.ts        # a single file
npx vitest run -t "name"                   # a single test
INTEGRATION_DATABASE_URL=postgresql://.../signalhub_integration_test npm run test:integration   # DB name must contain "test"
npm run test:e2e                           # Playwright
```

## Commits and PRs

- Short imperative subject with a conventional prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- One logical change per commit; explain the *why* in the body when it isn't obvious.
- In the PR describe what changed, how you tested it, and include screenshots for UI changes.

## Documentation and screenshots

Docs live in `docs/` and the root `README.md`. Screenshots are 1440×900 PNGs in `docs/screenshots/`, captured against a clean demo dataset (no errors, no personal data). Keep claims verifiable: describe what the code does today, not what it might do.
