# ServiceNow incident feed — discussion notes

Status: **discussion only, not planned, nothing implemented.** Captured 2026-10-09 so a
later planning session can start from here.

## Goal

Internal business users want to see incidents and maintenance (with status and progress)
for the business applications they care about, on a SignalHub page, without anyone
re-typing what is already in ServiceNow (SNOW).

## Decisions so far

- **Audience is internal.** Feed appears only on `PRIVATE` / `AUDIENCE` pages
  (`PageType` in `lib/postgres/schema.ts`). Never on `PUBLIC` pages; enforced server-side.
  Existing SSO/page access covers login.
- **Kept separate from public pages.** Existing `incidents` table, public pages, and
  manual incident flow are untouched. SNOW content is its own page section.
- **One-way: SNOW → SignalHub.** No write-back. SNOW is the single source of truth.
- **Work notes inserted in SNOW must show in SignalHub.**
- **Appears as soon as created in SNOW.** Auto, no manual step.
- **SignalHub does not store incident data.** It reads the SNOW API on demand.
  SignalHub stores only configuration. **SignalHub is display only.**
- **Only selected business applications** (plus priority filter) are shown, not all
  SNOW incidents.
- A SNOW test environment is available.

## Shape: read-through, no sync

```
Business user ──▶ SignalHub private/audience page
                     │  (server side, short shared cache)
                     ▼
                 SNOW Table API ── incident, change_request, sys_journal_field
```

### What SignalHub stores (config only)

- SNOW connection: instance URL + read-only integration user or OAuth client,
  secret encrypted (`encryptSecret`, `lib/encryption.ts`).
- Selected business applications: SNOW `sys_id` → display name (optionally → component).
- Filters: priority threshold (e.g. P1–P3), resolved-history window.
- Which private/audience page shows which applications.

### How each requirement maps

| Requirement | Approach |
|---|---|
| Show immediately on create | Each page render queries SNOW live; open page auto-refreshes ~30s. No worker job, no sync. |
| Work notes visible | One extra query on `sys_journal_field` (`element=work_notes`, `element_id IN <incident sys_ids>`) — batched, not one call per incident. |
| Selected apps only | Server builds `business_service IN (...)^priority<=N` from config. Browser cannot widen the filter. |
| Maintenance | Same pattern on `change_request` (planned `start_date` / `end_date`, same business service field). |
| Not mixed with public | SNOW feed attachable only to `PRIVATE` / `AUDIENCE` pages, checked server-side. |

A full page is 2–3 SNOW calls: incidents, change requests, journal entries.

## Non-negotiable rules

- **Browser never calls SNOW directly.** Credentials stay server-side (CORS would block
  it anyway). SignalHub server is the proxy; outbound calls go through `guardedFetch`.
- **Short shared server cache (~15–30s) per page/query.** Without it, N viewers = N SNOW
  calls and the integration user gets throttled.
- **Least-privilege integration user:** read-only on the needed tables; request only
  needed fields via `sysparm_fields`.

## Accepted trade-offs of storing nothing

1. **No email/SMS/Slack notifications** to business users — detecting "new" needs
   remembered state. Users must open the page.
   Later fix if wanted: a tiny "seen sys_ids" table used only for notifications.
2. **No history/uptime bars.** Past items come only from a SNOW query
   (e.g. resolved in last 7 days).
3. **SNOW down = nothing to show.** Mitigation: keep last good response in memory and
   show a "ServiceNow unreachable, last updated HH:MM" banner (cache, not storage).
4. RSS feeds, `/api/v1`, and search in SignalHub do not cover SNOW items.

## Caution: work notes are written for IT

Work notes may contain hostnames, error codes, customer names, internal jargon.
Alternative: show only "Additional comments" (`comments` field), which SNOW intends for
customer-facing text. Option: per-page toggle (work notes / comments only).

## Technical notes

- SNOW `sys_updated_on` and query values default to display values in the instance
  timezone; pass `sysparm_display_value=false` and treat times as UTC.
- "Business application" field varies by CMDB setup: `business_service`,
  `cmdb_ci`, `cmdb_ci_business_app`, or a custom `u_` field. Make the field configurable
  or confirm against the test instance first.
- Component status (if shown) can be derived on the fly from open incidents by priority
  (e.g. P1 = major outage, P2 = partial outage, P3 = degraded).

## Approaches considered and rejected

- **Push (SNOW Business Rule → SignalHub endpoint):** real-time but needs SNOW-side
  config and SignalHub storage.
- **Pull sync into SignalHub `incidents` table:** needs cursors, idempotency
  (`external_id` unique key), and lock/overwrite rules for local edits. Rejected because
  the requirement is no incident storage in SignalHub.
- **Two-way sync:** conflict and echo-loop risk; not needed since SignalHub is display only.

## Open questions (answer before planning)

1. Is losing notifications and history OK for v1?
2. Raw work notes, `comments` only, or a per-page toggle?
3. Is ~30s delay acceptable for "immediately"?
4. How far back to show resolved incidents / finished maintenance (e.g. 7 days)?
5. Which SNOW field identifies the business application in this instance?
6. Are maintenance windows recorded as Change Requests?
7. One SNOW instance for the whole installation, or per organization?
