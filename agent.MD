# Agent Guide

## Project overview

This repository contains a multi-tenant status-page and incident
communication platform built with Next.js, TypeScript, Tailwind CSS, and
MongoDB.

## Development setup

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate
printf '%s' 'choose-a-long-development-password' | npm run bootstrap -- --password-stdin
npm run dev
```

The application runs at `http://localhost:3301`.

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
- `lib` contains authentication, database, billing, notification, access
  control, and status-domain logic.
- `scripts` contains database seed scripts.
- `worker` contains the TypeScript background runtime for monitoring,
  notifications, exports, audit delivery, and platform jobs.

## Working guidelines

- Keep all tenant-owned database operations scoped to the organization.
- Use the raw MongoDB driver and the collection helpers in `lib/db.ts`.
- Preserve the distinction between public, private, and audience-specific
  pages.
- Use Server Actions for admin mutations and Route Handlers for APIs.
- Validate untrusted input and enforce authentication and authorization on
  the server.
- Do not commit secrets or modify `.env` files unless explicitly requested.
- Keep changes focused and preserve unrelated work in the repository.

## Validation

Run the checks relevant to the files changed:

```bash
npx tsc --noEmit
npm run build
```

For database-dependent behavior, start MongoDB with Docker and run migrations
before testing. Only load the opt-in sample data when the test requires it.
