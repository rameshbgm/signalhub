# SignalHub Repository Instructions

## Project identity

- This repository is **SignalHub**, a self-hosted status-page, monitoring, and incident-communication platform.
- Repository root: /Users/laxmi/ramesh/code/status
- Package name: signalhub
- Primary local web port: 3301
- The product UI is branded **SignalHub**.
- This is **not** the OpenITSM AI for ServiceNow application.

## Mandatory preflight

Before changing files:

1. Run pwd and confirm the path ends with /code/status.
2. Read the root package.json and confirm name is signalhub.
3. Run git status --short and preserve all pre-existing user changes.
4. Confirm the request concerns status pages, monitoring, incident communication,
   subscribers, components, maintenance, platform administration, or another
   SignalHub feature.
5. If a screenshot or request is branded **OpenITSM**, mentions ServiceNow,
   Agent/MCP services, or port 3100, stop and switch to the OpenITSM repository
   instead of editing this one.

When repository choice could be ambiguous, state this exact repository path in
the first progress update before editing.

## Hard repository boundary

- Do not edit /Users/laxmi/ramesh/code/OpenITSM-AI/openitsm-ai while working on
  a SignalHub task.
- Do not copy an implementation between the two applications merely because
  both contain incidents, maintenance, administration, tables, or dashboards.
- A request spanning both repositories must name both projects explicitly.
  Keep the changes and verification for each project separate.

## Architecture and code locations

- app/: Next.js App Router pages, server actions, and API routes.
- components/: reusable public, tenant-admin, and platform-admin UI.
- lib/: domain logic, authorization, persistence, validation, and shared server
  utilities.
- worker/: monitoring, delivery, lifecycle, and other background work.
- tests/: Vitest coverage; integration tests live under tests/integration/.
- deploy/: deployment assets, including the Helm chart.
- db/migrations/: ordered PostgreSQL schema migrations.
- public/docs/user-manual.html: standalone operator and end-user manual served
  by every deployment at `/docs/user-manual.html`.

## Runtime and deployment contract

- PostgreSQL 18 or newer is the only supported database. Do not add an
  alternative database driver, URL format, library, terminology, or
  compatibility layer anywhere in this repository.
- Production consists of one immutable image used for a migration job, one or
  more stateless web processes, and one or more background worker processes.
- The web command is `node server.js`; the worker command is
  `node dist-runtime/worker.mjs`; migrations use
  `node dist-runtime/migrate.mjs`.
- Single-host deployments may use persistent local assets. Multiple web or
  worker replicas require the implemented S3-compatible asset driver.
- Docker Compose is the supported single-host path. The Helm chart is the
  supported Kubernetes path and expects externally managed production
  PostgreSQL and object storage.
- Provider guidance for AWS, Azure, GCP, Kubernetes, Docker, and other VPS
  environments lives in `docs/OPEN_SOURCE_SETUP_GUIDE.md`. Keep it generic and
  update it whenever the runtime contract or required configuration changes.

## Documentation contract

- `README.md` is the project entry point and quick start.
- `docs/OPEN_SOURCE_SETUP_GUIDE.md` is the authoritative clone, build,
  deployment, hardening, backup, upgrade, and troubleshooting guide.
- `deploy/helm/status/README.md` documents chart-specific operation.
- `public/docs/user-manual.html` is the detailed, deployment-served product
  manual. `lib/help-content.ts` is the signed-in contextual help source.
- `.env.example` is the canonical environment-variable inventory.
- When menus, roles, routes, setup commands, providers, or operational behavior
  change, update all affected documentation surfaces in the same change. Base
  claims on current code and manifests; do not describe aspirational features
  as implemented.

Preserve the separation between tenant administration, platform
administration, public status surfaces, and background workers. Authorization
must be enforced on the server; hiding a UI control is not an authorization
boundary.

## Common commands

    npm run dev          # Next.js development server on http://localhost:3301
    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm run verify       # lint + typecheck + tests + build

Run focused tests while iterating, then run verification proportional to the
risk of the change. Do not run database reset, purge, seed, migration, or other
state-changing operational commands unless the user explicitly requests them.

## Change discipline

- Use rg or rg --files for discovery.
- Inspect the current implementation before editing.
- Preserve unrelated modified and untracked files.
- Never discard, reset, or overwrite user work to obtain a clean tree.
- Use apply_patch for manual source edits.
- Keep secrets and real credentials out of source, logs, tests, and responses.
- Treat destructive tenant, page, subscriber, incident, and platform actions as
  high risk and require explicit scope.

## Completion checklist

Before reporting completion:

1. Reconfirm pwd and the package name.
2. Review git status --short for accidental cross-project or generated-file
   changes.
3. Run the relevant tests and at least npm run typecheck for source changes.
4. For broad or release-sensitive work, run npm run verify.
5. Confirm that source, configuration, documentation, and tracked paths contain
   only the supported PostgreSQL database implementation and terminology.
6. Report that the change was made in SignalHub and include this repository
   path.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
