# Statuspage Platform

A status page & incident communication platform modeled on Atlassian Statuspage
(status.atlassian.com): a public-facing status page plus a private admin
console for managing components, incidents, scheduled maintenance,
subscribers, metrics, and branding.

## Stack

- Next.js (App Router) + TypeScript
- MongoDB via the raw `mongodb` driver (`lib/db.ts`) — no ORM, schemaless by
  design; document shapes in `lib/db.ts` are plain TypeScript interfaces for
  readability only, not enforced at write time
- Tailwind CSS
- Server Actions for admin CRUD, Route Handlers for the public/management API
- `jose` for signed session cookies, `bcryptjs` for password hashing

## Getting started

```bash
npm install
docker compose up -d      # local MongoDB with a single-node replica set
npm run db:indexes
npm run db:seed
npm run dev
```

Visit `http://localhost:3000`.

- Admin console: `/admin` — demo login `admin@acme.test` / `password123`
- Demo hub page: `/hub/acme`
- Demo public pages: `/api-platform`, `/consumer-app`
- Demo private page: `/internal-tools` — password `internal123`
- Demo audience-specific page: `/enterprise-customers` — logins
  `customerA@example.com` / `demo123` and `customerB@example.com` / `demo123`
  (each sees different components)

## What's implemented

- **Multi-tenant SaaS**: self-serve signup (`/signup`) creates an
  organization with an OWNER account; every query is org-scoped
  (`assertPageInOrg`, org-scoped sessions), so tenants are fully isolated.
- **Billing & plans** (`/admin/billing`): Free / Pro ($29) / Enterprise ($99)
  with enforced limits (status pages, team members, subscribers per page)
  and plan-gated features (custom domains, branding removal). Payments are
  simulated — plan switches record an Invoice instead of charging a card;
  swap `lib/billing.ts#changePlan` for Stripe in production.
- **Tenant admin** (`/admin/settings`): org name/billing email, role-gated
  (OWNER/ADMIN) team & billing management, owner-only org deletion with a
  full cascade (pages, incidents, subscribers, keys, invoices).
- **Custom domains**: a Pro+ page can claim a domain (Page settings).
  Middleware detects non-app hosts and rewrites the root to the page that
  claimed the domain (`app/custom-domain/[domain]`). Point a CNAME at the
  app domain; set `NEXT_PUBLIC_APP_DOMAIN` so the middleware knows which
  host is the app itself.
- **Page types**: public, private (password), and audience-specific
  (per-user/group login with scoped component visibility), plus a hub page
  that aggregates child pages (like status.atlassian.com).
- **Components**: groups, ordering, visibility, third-party provider mirrors
  (50-provider seeded catalog), 90-day uptime bars computed from a status
  event history, per-component automation token for external monitoring
  tools.
- **Incidents**: full Investigating → Identified → Monitoring → Resolved
  lifecycle, impact levels, timestamped updates, backfill (no notification),
  postmortems (draft/publish), incident templates & template groups.
- **Scheduled maintenance**: its own lifecycle (Scheduled → In Progress →
  Verifying → Completed), auto-start/auto-complete based on the scheduled
  window (`lib/maintenance-sync.ts`, invoked on read paths since there's no
  background worker in this build).
- **Subscribers**: email/SMS with OTP verification, webhook/Slack direct
  subscribe, per-component subscription scoping, quarantine, CSV
  import/export, one-click unsubscribe.
- **Metrics**: named time-series graphs with pushed data points, rendered
  publicly with Recharts.
- **Public API** (`/api/v1/status/[slug]`) and **management API**
  (`/api/v1/manage/*`, Bearer API-key auth) so every console action is also
  scriptable. RSS/Atom feeds. A status embed script
  (`/api/v1/embed/[slug]`) that stays invisible until an incident/maintenance
  is active.
- **Team & audit**: team members with roles, an audit log of admin actions.

## What's simulated rather than fully live

This is a from-scratch build in a single session, not a production SaaS —
some integrations from the spec are implemented as realistic stand-ins
rather than live third-party connections:

- **Email/SMS delivery**: every notification is recorded in
  `NotificationLog` (visible in practice via the OTP flow, which echoes the
  code back in dev) instead of going through a real ESP/SMS provider. Wire
  one up in `lib/notify.ts`.
- **Webhook subscribers and configured webhook endpoints** *do* receive real
  HTTP POSTs.
- **Inbound automation**: rather than a real inbound-email-to-component
  pipeline, each component gets a POST endpoint
  (`/api/v1/webhook-component/<token>`) that any monitoring tool can call to
  flip its status with zero human involvement.
- **Third-party provider catalog** is a static seeded list (50 well-known
  services) that pages can mirror as components; there's no live poller
  against each vendor's real status API. Mirrored status changes are applied
  the same way as any other component status change (manually, or via the
  automation endpoint above).
- **Slack/Teams/PagerDuty/Twitter/SSO/custom-domain SSL**: not implemented as
  live OAuth/API integrations — Slack subscription support accepts an
  incoming-webhook URL (real delivery), the rest are natural extension
  points on top of the existing webhook/API-key infrastructure.

## Project layout

- `app/(public)/[slug]` — public status page, incident permalinks, history
  archive, access gate for private/audience pages
- `app/(public)/hub/[slug]` — hub page
- `app/admin/*` — management console (Server Actions for mutations)
- `app/api/v1/*` — public read API, management API, feeds, embed script,
  subscribe/OTP, inbound automation webhook
- `lib/*` — auth, status computation, notification dispatch, access control,
  `db.ts` (Mongo connection + collection getters), `mongo-utils.ts` (id
  conversion helpers), `cascade.ts` (cascading deletes), `ensure-indexes.ts`
- `scripts/seed.ts` — demo data
