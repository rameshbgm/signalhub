# SignalHub Agent Guide

The authoritative repository instructions are in [`AGENTS.md`](AGENTS.md).
This compatibility file summarizes setup only; follow `AGENTS.md` whenever the
two files overlap.

## Project overview

This repository contains a multi-tenant status-page and incident
communication platform built with Next.js, TypeScript, Tailwind CSS, and
PostgreSQL 18 or newer. PostgreSQL is the only supported database; do not add
code, configuration, documentation, or dependencies for another database.

## Development setup

```bash
git clone https://github.com/rameshbgm/signalhub.git
cd signalhub
npm ci
cp .env.example .env
```

Set `POSTGRES_PASSWORD`, `SESSION_SECRET`, and `ENCRYPTION_KEY`, then start the
complete local topology:

```bash
docker compose config --quiet
docker compose up -d --build
printf '%s' 'choose-a-long-development-password' \
  | docker compose exec -T web node dist-runtime/bootstrap.mjs --password-stdin
npm run dev
```

Docker Compose serves the application at `http://localhost:3301`. Run
`npm run dev` only when developing the Next.js process directly; keep the
PostgreSQL and worker services available as required by the change.

Disposable sample data is optional and must only be loaded into a development or test database:

```bash
NODE_ENV=development ALLOW_DEV_SEED=true npm run db:seed
```

The seed generates and prints fresh credentials for each run; do not add shared credentials or fixed API keys.

## Repository structure

- `app/(public)` contains public status pages, history, incidents, and access
  gates.
- `app/admin` contains the authenticated management console.
- `app/api/v1` contains public and management API routes.
- `components` contains shared React components.
- `lib` contains authentication, PostgreSQL access, notification, access
  control, and status-domain logic.
- `db/migrations` contains the PostgreSQL schema and `scripts` contains
  migration, bootstrap, seed, and operator commands.
- `worker` contains the TypeScript background runtime for monitoring,
  notifications, exports, audit delivery, and platform jobs.
- `docs/OPEN_SOURCE_SETUP_GUIDE.md` covers AWS, Azure, GCP, Kubernetes, Docker,
  and VPS deployment; `public/docs/user-manual.html` is the complete user guide.

## Working guidelines

- Keep all tenant-owned database operations scoped to the organization.
- Use Kysely through `lib/postgres/client.ts`; keep SQL relational, indexed, and transactionally safe.
- Preserve the distinction between public, private, and audience-specific
  pages.
- Use Server Actions for admin mutations and Route Handlers for APIs.
- Validate untrusted input and enforce authentication and authorization on
  the server.
- Do not commit secrets or modify `.env` files unless explicitly requested.
- Keep changes focused and preserve unrelated work in the repository.
- Keep README, setup guide, Helm guide, `.env.example`, landing-page links, HTML
  user manual, and in-app help aligned with the implemented product.

## Validation

Run the checks relevant to the files changed:

```bash
npm run typecheck
npm run build
```

For database-dependent behavior, start PostgreSQL with Docker and run migrations
before testing. Only load the opt-in sample data when the test requires it.
