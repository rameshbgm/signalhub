# SignalHub Gap Analysis

Date: 2026-10-06 · Commit audited: `56a5c61` · Repository: `/Users/laxmi/ramesh/code/status`

Read-only audit of what is broken, incomplete, missing, or drifting, measured
against `IMPLEMENTATION_PLAN.txt` (sections 1–13), `README.md`, the user manual,
and the runtime contract in `AGENTS.md`.

**Baseline:** `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (39 files, 165 tests).
Build, e2e, and integration suites were not run.

Legend: ✔ = confirmed by direct source read during this audit; other items come
from the code sweep and should be re-checked before fixing.

---

## 1. Fix first (security / data / deploy)

| # | Issue | Evidence | Impact |
|---|---|---|---|
| S1 ✔ | `editIncidentUpdate` skips `assertPageInOrg`; every sibling action calls it | `app/admin/(protected)/incidents/actions.ts:89` (cf. `:27,:66,:155,:181`) | Page-scoped operator can edit/resolve/reopen incidents on pages outside their scope |
| S2 ✔ | Any org `ADMIN` can switch into **any** organization and is treated as installation admin | `app/api/auth/switch-org/route.ts:28`, `lib/admin-guard.ts:57,166` | No tenant isolation between org Admins. Contradicts README "separate tenant and platform identity spaces" (README.md:73). Decide: split roles, or document as single-tenant-admin model |
| S3 ✔ | Maintenance reminder ignores `notifySubscribers`; start/complete transitions honour it | `lib/domain/maintenance.ts:263` vs `:309,:319`; form defaults reminder on (`MaintenanceForm.tsx:36`) | Subscribers get notified for maintenance the operator chose not to announce |
| S4 | Admin CSV import marks subscribers verified and clears `quarantined` on upsert | `app/admin/(protected)/subscribers/actions.ts:75-81` | Sends without consent; un-quarantines bounced contacts |
| S5 | `PLATFORM_ADMIN_ALLOWED_CIDRS`, `PLATFORM_SESSION_IDLE_SECONDS`, `PLATFORM_SESSION_ABSOLUTE_SECONDS` documented + passed by Helm but never read | `.env.example`, `deploy/helm/status/templates/workloads.yaml:80-83` | Operators believe controls are enforced that are not |
| S6 | Regex HTML sanitizer is bypassable (`<img/onerror=…>`, unquoted `href=javascript:`) | `lib/safe-page-html.ts:2-4` | Latent today (header/footer HTML never rendered) — must be replaced before that ships |
| S7 | OTP verify attempt counter read+increment outside a transaction | `app/api/v1/subscribe/verify-otp/route.ts:34-36` | Parallel requests exceed 5-guess limit |
| S8 | `verify-otp` does not re-check page access (request-otp does) | `verify-otp/route.ts:29` vs `request-otp/route.ts:45` | Inconsistent private-page gate |
| S9 | Embed script for private pages inlines the feed token | `app/api/v1/embed/[slug]/route.ts:19-21` | Token becomes public on any host page |
| S10 | DNS rebinding: target validated, then `fetch` re-resolves (monitors and outbound webhooks) | `worker/checks.ts:70,80`; `worker/notifications.ts:155` | SSRF to internal addresses |
| S11 | Component webhook: token + IP rate limit only; no HMAC/timestamp/nonce, no audit, no last-error | `app/api/v1/webhook-component/[token]/route.ts:21-45` | Replayable state changes |
| S12 | Private-page access JWT not revoked on password change | `lib/auth.ts:243` | Old visitors keep access |
| S13 | Platform audit CSV export: oldest-first `limit(100_000)` truncates newest; no formula-injection escaping | `app/api/platform/audit/export/route.ts:16` | Incomplete evidence; CSV injection |
| S14 | Hidden components are not filtered when building public incident cards | `lib/public-data.ts:106-112` | Hidden component names leak publicly |
| D1 ✔ | Helm: migrate Job is a `pre-install` hook using `envFrom` the chart Secret, but `secret.yaml` has no hook annotation | `deploy/helm/status/templates/workloads.yaml:9,31`, `secret.yaml:1` | First `helm install` fails unless `secrets.existingSecret` is set |
| D2 | Helm drops all capabilities, so ICMP monitors cannot work | `workloads.yaml` securityContext | ICMP monitor type silently fails on Kubernetes |
| D3 ✔ | Tenant audit is a no-op (`void audit;`); migration 004 dropped `audit_logs` | `lib/tenant-audit.ts:37`, `db/migrations/004_minimal_status_pages.sql:84-86` | API key, token, webhook, page, subscriber mutations are unaudited. README.md:32,98-99 still advertise sealed tenant audit export |

## 2. Broken features (exist in UI, do not work)

| Feature | Evidence | Fix direction |
|---|---|---|
| ✔ "Ask search engines not to index" checkbox | Saves `pages.noindex` (`pages/actions.ts:270`); metadata reads `design.seo.noIndex` (`app/(public)/[slug]/page.tsx:32`) | Read `page.noindex` in `generateMetadata` |
| Analytics ID setting | Stored (`pages/actions.ts:269`), never rendered | Render or remove field |
| Maintenance timezone | Form fills `datetime-local` with a UTC string; server parses as server-local; `page.timezone` ignored (`MaintenanceForm.tsx:17-20,66`, `maintenance/actions.ts:28`) | Parse in page timezone, display in page timezone |
| Page timezone input | Free text, no validation; bad value silently becomes UTC (`settings/page.tsx:27`, `lib/page-locale.ts:10`) | Validate with `Intl.supportedValuesOf("timeZone")` |
| ✔ New heartbeat monitor goes DOWN immediately | `lastHeartbeatAt: null` → `last = 0` → "No heartbeat received" (`worker/checks.ts:230`, `lib/domain/monitors.ts:138`) | Treat null as "pending" until `createdAt + interval + grace` |
| Auto-incident lost on failure | Down state committed before `createIncident`; failure never retries (`worker/monitors.ts:176-194`) | Same transaction or retry on next tick |
| Retention runs ~every 2 h, not hourly | Lease set to `now+60m` after run; hourly cron sees it held (`lib/retention.ts:107`, `worker/index.ts:173`) | Release lease on completion |
| Org-scoped audit sinks never receive events | Created with org (`platform audit/actions.ts:14`); enqueue only `orgId is null` (`lib/audit-integrity.ts:39`) | Enqueue org sinks or block creation |
| Postmortem re-publish re-notifies; saving unchecked silently unpublishes | `incidents/actions.ts:187,209` | Stable event id; explicit unpublish |
| Public timeline "immutable" | Updates editable, no "edited" marker on public timeline (`components/public/IncidentTimeline.tsx`) | Show `editedAt` publicly |
| `npm run test:integration` | `tests/integration/` does not exist | Add suite or drop script + AGENTS.md mention |
| Notification provider errors | Every error treated as transient; 4xx retried 8× (`worker/notifications.ts:122`); Slack/Teams branches `:125-143` dead | Classify 4xx as permanent |
| Analytics expiry | Hard-coded 90-day `expiresAt` vs 395-day retention default (`app/api/v1/analytics/event/route.ts:68`) | Use retention config |

## 3. Feature gap matrix (vs IMPLEMENTATION_PLAN.txt)

### §1 Org & multi-page
- ✅ Multiple pages, page modes (public/password/audience) enforced server-side, page-scoped operators, invitations, MFA, SAML/OIDC/SCIM (platform level).
- 🟡 No page switcher inside page management (only "Back to pages").
- 🟡 Page type cannot be changed after creation.
- 🟡 IP allowlist only for API keys; platform CIDR allowlist unimplemented (S5).
- 🔴 Tenant audit/activity history gone (D3).

### §2 New page creation & launch checklist
- ✅ Name/slug/type/access, draft with example component.
- 🟡 Slug clash silently gets a random suffix instead of an error; unique-index race (23505) uncaught (`pages/actions.ts:68-70`).
- 🟡 Launch checklist is a fixed 3-step display. `onboarding_step` column exists, `advancePageSetup` (`pages/actions.ts:152`) has no caller, `setup/[step]/page.tsx` just redirects. Missing steps: logo/brand, subscriber channels, invite team, practice incident, domain review.
- 🟡 Publish gate only requires one visible component.

### §3 Page overview & navigation
- ✅ Visibility, URL, state, component count.
- 🔴 No open incidents, upcoming maintenance, or subscriber count on page overview.
- 🔴 No Domains / Localization / SEO areas.

### §4 Components
- ✅ CRUD, hide, flat reorder, 5-status vocabulary, manual/API/webhook/monitor updates, uptime history, audience visibility.
- 🔴 Start date (no column).
- 🟡 Groups: create/delete only — no rename, reorder (`reorderPageComponents` uncalled), or collapse editing.
- 🔴 Third-party components: 004 added `components.external_*`/`source_type`; nothing reads them, no sync worker, no UI.
- 🟡 Description length enforced client-side only (`components-actions.ts:82,133`).

### §5 Incidents & maintenance
- ✅ Create with lifecycle/components/notify choice; update; resolve; delete; maintenance schedule/progress/complete; component status reconciliation (`lib/component-status.ts`).
- 🟡 API `notify` defaults to `true` (`lib/domain/incidents.ts:32`).
- 🔴 Cannot change component status on a later update (`lib/incident-update-validation.ts`).
- 🟡 Reopen only via editing newest update or API; composer hidden once resolved.
- 🔴 Incident reminders: `next_reminder_at`/`reminder_interval_minutes` columns unused.
- 🔴 Incident templates dropped by migration 005, no replacement — **plan still requires them; decide and update the plan**.
- 🟡 Postmortems: draft/publish only, no review state; notification body is a fixed string.
- 🟡 Maintenance: one reminder only; no cancel state (`MAINTENANCE_STATUSES` lacks CANCELLED); cannot edit/reschedule a window.
- 🟡 Delete incident has no confirmation.

### §6 Subscribers & delivery
- ✅ OTP self-subscribe (email, SMS/Twilio), unsubscribe, component-targeted delivery, 9 team destination providers with retry + dead-letter retry.
- 🔴 Visitor Slack/webhook subscriptions (`subscribe/direct` returns 410).
- 🔴 Self-service preferences (`event_types` always `[]`; "preferences" page only deletes).
- 🔴 Per-page channel/event toggles; destinations always get `eventTypes: []`.
- 🟡 Bounce/quarantine manual only — no bounce or SMS STOP processing.
- 🟡 `notification_logs` written but no UI.
- 🟡 Import: email only, one bad row aborts all (`subscribers/actions.ts:64`).
- 🟡 Unsubscribe link only added when `NEXT_PUBLIC_APP_URL` set (`lib/notify.ts:113`); no `List-Unsubscribe` header.
- 🔴 Contact encryption: `contact_ciphertext/contact_hash/display_contact` (004) unused — contacts stored plaintext.
- 🔴 Audience users/groups bulk import/export.
- 🔴 Branded email: `email_from_name`, `reply_to`, `footer`, `email_logo_url` saved/ignored by worker; `updateEmailCustomization` uncalled; no preview; `emailReplyTo` not validated.
- 🟡 `default_sms_country_code` saved but unused.

### §7 Public page
- ✅ Banner, incidents, maintenance, grouped components, uptime bars, subscribe, history, incident permalink, hub pages, access enforcement on page/history/incident/hub/status/embed/badge/feeds.
- 🔴 Component detail page (no route; `ComponentList` has no links).
- 🟡 History does not flag incidents with postmortems.
- 🟡 Unbounded incident query (`lib/public-data.ts:85`).
- 🟡 A11y: `<html lang="en">` hard-coded (`app/layout.tsx:62`); embed banner is a clickable `div` without keyboard support.

### §8 Branding, content, localization
- ✅ Logo, favicon, cover, layout, presets, custom CSS rendering.
- 🔴 Language/localized copy (hard-coded `"en"`).
- 🟡 Headline/about/custom brand colour, support/terms/privacy links, SEO metadata, custom CSS editing, custom header/footer HTML: **server actions or schema exist, no UI calls them** (`design/actions.ts:174,200`, `pages/actions.ts:285`, `lib/page-design.ts:390`).
- 🔴 Custom domain + TLS: `app/custom-domain/[domain]/**` is empty folders; no DB column, no host routing in `proxy.ts`. User manual still mentions it (`public/docs/user-manual.html:155,505`).

### §9 Metrics
- ✅ Public visibility, monitor-latency provider metrics, audience visibility.
- 🟡 Only decimals editable after creation (name/suffix/description fixed).
- 🟡 Chart shows last 200 points, no time range.
- 🔴 No `metric_points` retention; monitor latency points grow unbounded.
- 🟡 Ingest: one point per call, no batch/backfill, timestamps not bounds-checked, no rate limit on any `/api/v1/manage/*` route.

### §10 Monitoring & automation
- ✅ HTTP/keyword/TCP/TLS/DNS/ICMP/heartbeat checks, thresholds, leases with `SKIP LOCKED`, explicit automation policy flags. Monitor-template removal (006) is clean.
- 🟡 DNS check ignores `timeoutMs`.
- 🟡 Heartbeat endpoint: no rate limit, state change via GET, returns 200 while OpenAPI says 202.
- 🔴 Inbound alert parsers (Alertmanager, Datadog, etc.).

### §11 APIs
- ✅ Read status API (rate-limited), key/token rotation and revocation, outbound signed webhooks with retries.
- 🔴 No management endpoints for subscribers or maintenance.
- 🟡 Scopes `status.read`, `components.read`, `metrics.read`, `analytics.read` grantable but checked by no endpoint.
- 🟡 No pagination (incidents capped at 100); malformed `pageId` unvalidated; wrong scope returns 401 not 403.
- 🔴 No rate limits on badge/embed/RSS/Atom; each token hit writes `lastUsedAt` (`lib/feed-access.ts:41`).
- 🟡 No per-endpoint delivery history; `webhook_endpoints` has no last-status/last-error.
- 🔴 OpenAPI drift (`lib/openapi.ts`): missing webhook-component, embed, badge, feeds, access, analytics/event, subscribe/*, heartbeat GET, SCIM `{id}` PATCH/PUT.

### §12 Analytics, audit, retention
- ✅ Page analytics (honours DNT), export jobs, org purge job.
- 🟡 Retention does not prune `metric_points`, `component_status_events`, `rate_limits`, expired OTPs/sessions, export/audit/platform jobs, or export blobs.
- 🔴 `asset_deletion_jobs` (004) unused: storage deletes run inline after commit (`lib/cascade.ts:39-73`); failures orphan blobs, several callers swallow errors.
- 🟡 Page delete is hard delete; `pages/deleted` route folder is empty.

### §13 Data model
- ✅ Kysely schema types match migrations exactly.
- 🟡 Columns added in 004 with no code path: `subscribers.contact_*`, `incidents.next_reminder_at`, `incidents.reminder_interval_minutes`, `components.external_*`.

## 4. Dead code and leftovers

- ✔ Unreachable pages: `app/admin/login/page.tsx`, `app/platform/login/page.tsx` (proxy redirects to `/login`); `app/platform/invite/[token]` tombstone sits behind the session gate so invitees cannot see it.
- Server actions with no caller: `advancePageSetup`, `saveDesignerBranding`, `saveDesignerVisitorLinks`, `updatePageCustomization`, `updateEmailCustomization`, `reorderPageComponents`, `duplicateStatusPage`, announcement CRUD, `resetLegacyCss`.
- Empty route folders: `admin/templates`, `audit-log`, `third-party`, `billing`, `platform/templates`, `api/admin/audit/export`, `app/custom-domain/**`, `pages/deleted`.
- `revalidatePath` on non-existent `/your-page/...` routes (`pages/actions.ts:281,305,321`).
- ✔ Unused dependencies: `three`, `@react-three/fiber`, `@types/three`. `@types/pg` belongs in devDependencies. `autoprefixer` redundant with `@tailwindcss/postcss`.
- Tombstone UI still uses `IconTile` after the "bare icons" redesign (`app/platform/invite/[token]/page.tsx`).

## 5. Documentation drift

| Claim | Where | Reality |
|---|---|---|
| Sealed / exportable tenant audit | README.md:32,98-99 | Tenant audit is a no-op |
| "audit" capability for Incident Manager and Viewer | README.md:159-161 | No tenant audit surface |
| `signalhubctl audit --org` | README.md:355 | `--org` ignored (`scripts/statusctl.ts:109`) |
| Org Security page has sign-in methods / identity / SSO / SCIM | `lib/help-content.ts:326`, user-manual.html:214 | Only MFA and sessions |
| Brand colour in Appearance | user-manual.html:240 | Presets only |
| Locale, description, visibility, slug/domain in Settings | user-manual.html:243,256 | Not present |
| Overview launch checklist | user-manual.html:244 | Fixed 3-step display |
| Custom domain | user-manual.html:155,505 | Not implemented |
| Support-session actions in audit log | `lib/help-content.ts:646` | Tenant-side actions not recorded |
| `tests/integration/` | AGENTS.md, package.json | Missing |
| Incident + monitor templates required | IMPLEMENTATION_PLAN.txt §5, §10, §13 | Deliberately removed by migrations 005/006 |

### Environment variable drift (`.env.example` ↔ code)
- Documented, never read: `PLATFORM_ADMIN_ALLOWED_CIDRS`, `PLATFORM_SESSION_IDLE_SECONDS`, `PLATFORM_SESSION_ABSOLUTE_SECONDS`, `ALLOW_PUBLIC_SIGNUP` (signup always 410), `MONITOR_HISTORY_RETENTION_DAYS`, `DEV_PLATFORM_TOTP_SECRET`.
- Read, undocumented: `ALLOW_INSECURE_AUDIT_SINKS`, `STATUS_EXPOSE_OTP`, `SERVICE_NAME`, `WORKER_ID`, `WORKER_*_SWEEP_MS` (6), `DEV_AUDIENCE_PASSWORD`, `CONFIRM_DEV_DATABASE_RESET`.

## 6. Test coverage gaps

- No tests: `runCheck` / `processMonitor`, webhook-component and heartbeat routes, manage-API scope enforcement, notification and audit-sink retry paths, retention sweep.
- No integration suite against PostgreSQL.
- E2E: three specs only (landing, button guard, health/OpenAPI/login smoke). Nothing covers incident → notification → public page, private-page access, or role-based UI.
- No public status page visually checked after the redesign (dev DB has no pages).

## 7. Suggested order

1. **Security & consent** — S1, S3, S4, S7, S8, S14 (small, contained diffs); decide S2 model.
2. **Deploy blockers** — D1 Helm secret hook, D2 ICMP note/capability, S5 remove or implement env vars.
3. **Broken toggles** — noindex, analytics ID, maintenance timezone, heartbeat initial state, retention lease, org audit sinks.
4. **Audit decision** — restore tenant audit (D3) or remove the claims from README/help/manual.
5. **Wire up orphaned actions** — branding, visitor links, SEO, email customization, group reorder (server code already exists; UI only).
6. **Docs/env/OpenAPI sync** and remove dead routes, folders, and unused deps.
7. **Larger gaps** — launch checklist, custom domains, third-party components, preference management, metrics retention/backfill, asset deletion jobs, contact encryption, management API for subscribers/maintenance.
8. **Tests** — integration suite on disposable PostgreSQL; e2e for incident lifecycle and private access.
