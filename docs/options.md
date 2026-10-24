# Menus, controls, and options

This reference follows the current console at `/organization`. Menu visibility depends on role, page scope, and installation permissions. Use the [user manual](https://signalhub.at/docs/user-manual.html) for step-by-step workflows, [configuration](configuration.md) for environment variables, and [feature guide](features.md) for examples.

**All images are for reference only.** Screens use the Estora development organization. Reference incidents, monitor results, charts, subscribers, and traffic are synthetic examples, not real availability reports.

## Workspace navigation

| Menu | Controls and purpose |
|---|---|
| Organization switcher | Switch among organizations available to the signed-in account; open one of its pages or manage all pages. |
| Dashboard | Overall health, pages, component and subscriber counts, upcoming maintenance, open incidents, report an incident, view or manage a page. |
| Pages | Create status pages or hubs; search, filter, open, publish, hide, organize, and manage them. A draft stays internal until published. |
| Events | Current incidents and maintenance; event type and page filters; history; declare an incident; schedule maintenance; open an event timeline. |
| Monitors | Filter by page, state, group, or tags; create, edit, pause, resume, request a check, view recent results, and remove a monitor. |
| Metrics | Add a named numeric series, choose a page and optional service, unit suffix, decimal precision, description, and public visibility; push points using a scoped key. |
| Subscribers | Select a page; view channel, verification, service scope, and quarantine state; manage subscriptions and export audience data when permitted. |
| Destinations | Delivery readiness; add or edit a destination, choose event/service scope, verify or test delivery, disable or remove it; inspect delivery results. |
| Analytics | Page views, incident views, subscription funnel, and referrers over the selected period. Analytics must be enabled for the page. |
| SignalHub Embed | Select a page, copy incident-banner or status-badge snippets, and review the preview. |
| Security | Authenticator devices, recovery codes, trusted browsers, and security actions for your account. |
| Help | Search contextual articles and browse operations, pages, monitoring, communication, and administration topics. |
| Search | Jump to screens using the top-bar search or its displayed keyboard shortcut. Collapse the sidebar for more workspace. |

## Pages, hubs, and access

Create a page with a name and URL slug; choose a status page or hub. A hub groups child pages rather than monitoring its own components. Attach or detach pages from its overview. Published child pages retain their own access policies.

| Area | Options |
|---|---|
| Overview | Public preview, setup progress, health, services, current events, maintenance, audience counts, and quick actions. Hubs also expose attached pages. |
| Services | Name, description, group, visible/hidden, uptime display, order, manual status, automation token; create/edit groups, describe them, order them, and set collapse behavior. Third-party services use a supported external status source. |
| Access | Public; shared-password Private; or Audience-specific access. Manage audience users and access groups when that access type applies. |
| Settings | Page name, headline, about text, organization name, company website, IANA timezone, default SMS country code, search-engine no-index request, and permanent deletion with typed confirmation. Remove a hub's children before deleting the hub. |
| Notifications | Whether visitors can subscribe; channel availability; email logo, sender display name, reply-to, and footer; page-level subscriber settings. Provider credentials belong to platform Configuration. |
| Content | Announcements, rich text, and supporting content where the page supports them. Announcements have a title, body, severity, date window, call-to-action, priority, dismissal policy, and target surfaces. |
| Appearance | Draft layout and style, brand color, logo, site icon, cover image, history window, service display, subscription placement, header and footer links; preview and publish. Changes to a draft do not change the public design until publication. |

Service states are Operational, Degraded performance, Partial outage, Major outage, and Under maintenance. Public visibility and uptime calculation are separate: see [public pages and retention](public-pages.md).

### Appearance and saved design settings

The current Appearance editor offers **Standard**, **Banner**, and **Compact** layouts. Older saved layouts are preserved until a new layout is selected. The stored design model also understands Centered summary, Banner spotlight, Uptime timeline, Illustrated hero, Grouped directory, Product grid, Dense operations and Minimal enterprise; those internal names are not eight separate choices in the current editor.

The current style picker offers Default, Ocean, Emerald, Sunset, Violet, Slate, High contrast, Warm paper, Soft blue, Teal, Rose and Indigo. Brand color can be changed separately. Visitor links and search fields include support, terms, privacy, search title and search description. Brand assets include logo, site icon and cover image.

The design model supports the following settings. The simplified editor exposes controls appropriate to the selected layout and surface; persisted design settings are not a promise of a separate control for each field.

| Setting family | Supported values |
|---|---|
| Theme | Preset and individual palette colors for brand, accent, background, surface, text, muted text, and every service status. |
| Typography | System, Humanist, Geometric, Mono. |
| Density and width | Compact, Comfortable, Spacious; Narrow, Standard, Wide. |
| Corners and depth | None, Small, Medium, Large radius; None, Subtle, Elevated shadow. |
| Header | Standard, Centered, Hero, Minimal; sticky behavior; logo, title, hub link, navigation, support and subscribe items; up to 12 links. |
| Footer | Custom text, links, legal, branding, copyright; custom text and up to 12 links. |
| Media | Logo, favicon, cover; upload or permitted image URL; Cover or Contain fit, horizontal/vertical position, and crop. |
| Public links | Support, terms, privacy, company and navigation URLs. |
| History | Editor offers 30, 60, 90, 180, and 365 days, plus an existing saved custom value. The default is 90. This controls display, not retention. |
| Responsive placement | Status, history, incident, access and hub surfaces; full, primary and sidebar regions; desktop, tablet and mobile placement. |

### Design blocks

| Block | Options |
|---|---|
| Overall status | Panel, Solid, Centered, Compact; description and last-updated visibility. |
| Announcements | Maximum visible items, from 1 to 10. |
| Rich text | Heading, body, left or centered alignment. |
| Component status | List, Cards, Grid, Compact, Uptime; 30/60/90-day uptime bars; bar style, size and icon; Accordion/Sections/Cards grouping; grouping on/off; default group view; rows or pills; 1–3 columns; summary, legend, descriptions, uptime and search toggles. |
| Active incidents | Custom heading. |
| Scheduled maintenance | Custom heading. |
| Metrics | Heading and one or two columns. |
| History preview | Heading and history days from 1 to 365. |
| Subscribe | Button, Panel or Inline, with a heading. |
| Link cards | Up to 12 links, each with label, description and URL. |
| History list | Include or omit maintenance. |
| Incident detail | Show/hide affected services and postmortem. |
| Access form | Card or Centered. |
| Hub grid | One, two or three columns; show/hide descriptions. |

## Incidents and event history

Incident controls include name, first message, status, impact, affected services and their resulting states, whole-page impact, backfill, public visibility, and subscriber notification. Required text and lifecycle combinations are validated before submission.

| Field or action | Meaning |
|---|---|
| Status | Investigating, Identified, Monitoring, Resolved. A resolved incident stays resolved. |
| Impact | None, Minor, Major, Critical. Impact describes the incident; each affected service also has its own status. |
| Whole-page impact | Declare a page-wide event instead of selecting individual services. |
| Backfill | Record a resolved historical incident without sending a fresh live-incident notification. |
| Notify subscribers | Optional on an eligible live change. Notifications are not the default for new incident forms. |
| Public visibility | Hidden events remain available to administrators; public pages, history and feeds exclude them. Restoring visibility does not replay old notifications. |
| Timeline | Add an update; correct an existing message with edit evidence; inspect status transitions. Stale edits are rejected when the event changed elsewhere. |
| Resolution | Restore affected services as applicable. Resolved editing corrects title/message while keeping lifecycle and affected-service history locked. |
| Postmortem | Write and publish a retrospective after resolution, with causes, recovery, and follow-up. |
| Reminders | Set or cancel communication reminders where available; distinguish an internal reminder from a subscriber update. |

The Events view separates ongoing work from past events and supports incident/maintenance filters. Hidden records are an administrative state, not deletion.

## Scheduled maintenance

Choose the page, name, message, affected services, start and end in the page's timezone, subscriber notification, reminder lead time, and optional automatic lifecycle transitions. The end must follow the start. Lifecycle stages are Scheduled, In progress, Verifying, and Completed. Add progress updates as work proceeds. The worker must be running for automatic starts, completion and reminder delivery.

## Monitoring

| Monitor kind | Options and behavior |
|---|---|
| Website | HTTP availability, content keyword checks, and TLS certificate checks. Configure URL, method, headers, body when applicable, expected status range, keyword-present/absent conditions, and certificate warning days. |
| Port | TCP host and port. |
| Ping | ICMP host. Requires the installation's ICMP setting and the server's ping capability. |
| DNS | Domain; A, AAAA, CNAME, MX, TXT or NS; optional expected answer. |
| Job | Heartbeat: generated secret link, expected frequency and grace period; optional Basic or Bearer credentials. Keep the generated link private and rotate it if exposed. |

These choices map to seven stored monitor types: HTTP, KEYWORD, TLS, TCP, ICMP, DNS, HEARTBEAT. An existing monitor's kind may be locked during editing.

| Settings | Options |
|---|---|
| Identity | Name, page, optional service, group, tags. |
| HTTP request | UI methods GET, POST and HEAD; headers as a JSON object; optional request body; expected HTTP status range. |
| Authentication | None, HTTP Basic, Bearer token, Custom header, OAuth2 Client Credentials, mTLS. OAuth2 includes token URL, client ID/secret, scopes and credentials in body or Basic header. mTLS uses client certificate, key and optional CA. |
| Transport | Verify TLS, permitted proxy, automatic/IPv4/IPv6 resolution, cache buster, inverted result, and optional error-response storage. Proxy choices belong to the organization. |
| Schedule | Check interval, timeout, failures before marking down, passes before recovering. Limits are enforced by validation. |
| Failure state | Degraded performance, Partial outage or Major outage. |
| Actions | Flip service status, record latency metric, automatically open/resolve an incident, notify through configured delivery. Each action is independent. |
| Expiry | Certificate expiry and domain expiry notifications, when supported by the check. |
| Management | Pause/resume, run a check, inspect result history, edit, delete, and rotate heartbeat credentials. |

Private network targets are blocked by default. Enabling internal monitors does not enable private-network webhook destinations. Estora's documentation monitors are intentionally paused and their check/metric history is simulated.

## Metrics and analytics

Metrics use name, page, optional service, suffix, description, decimal precision and visibility. Publish points with `metrics.write` rather than an administrator session. Public chart settings support 24h/7d/30d/90d ranges; trend, percentiles, distribution, uptime and responses lenses; line, area, bar, step, scatter, bands, gauge and heatmap representations where the series supports them. Missing data is not proof of zero failures.

Analytics shows page visits, incident visits, subscription starts/completions and aggregate referrers. Retention controls stored analytics independently from public history display.

## Audience, destinations, feeds, and embeds

Visitors can subscribe to all services or a selection and, where supported, an individual incident. Available channels depend on provider readiness and page policy. Email/SMS verification, unsubscribe, RSS/Atom feeds, and feed-token management are separate flows. Disabling public subscription controls does not erase existing subscribers.

Destinations support provider-specific credentials or webhook URLs, selected event types, optional service scope, active state, verification, test delivery and retry/error visibility. Credentials are encrypted; use the provider's required configuration for the selected channel. [Feature guide](features.md#notification-destinations-and-providers) lists the providers. API keys, service automation tokens, heartbeat links, feed tokens, webhook signing secrets and SCIM tokens have different purposes and are not interchangeable.

Embeds provide a public incident banner and a status badge; copy the generated snippet and use the page's visibility policy. RSS and Atom reflect public events. Private/audience pages still require access.

## Identity, roles, and MFA

Organization roles are Admin, Incident Manager, Responder and Viewer; scope can cover all pages or selected pages. Manage invitation, resend, password-based or SSO access, role, scope and account status. Last-admin protection prevents removing the final administrator.

OIDC/SAML connections include audience, enabled state, provider metadata or endpoints, client credentials, group-to-role and page mappings, default role, just-in-time provisioning and accepted authentication claims. Test before enforcing. SCIM uses its own rotatable bearer tokens and supports users/groups and deprovisioning.

MFA options include installation enforcement, authenticator enrollment, up to two devices, rename/removal, one-time recovery codes, trusted browsers, step-up verification for sensitive actions, lost-device requests, approval/denial, cancellation, and audited last-admin recovery. Requests require verification before approval; see the [MFA guide](mfa.md) for timing, guards and recovery. SSO MFA follows the configured identity provider policy. Sessions expose device/session details, expiry and revocation, including sign out other devices.

## Platform administration

| Area | Options |
|---|---|
| Overview | Installation counts, organization lifecycle and health, operational summaries, support navigation. |
| Organizations | Create, inspect, edit, suspend/reactivate and delete through the appropriate lifecycle; settings, contact information, retention, export and purge controls. |
| Users and administrators | User invitations, roles, organizations, scope, disable/enable, MFA state and approved recovery. Platform permissions are separate from organization roles. |
| Configuration | Email provider, SMS provider, organization settings, retention and environment/runtime policy. Test provider connectivity with the real deployment before enabling notifications. |
| Runtime | Public address, secure cookies, HSTS, administration network ranges, idle and maximum session lifetime, minimum password length, MFA enforcement, private monitor targets, ICMP, response-size limit, and worker scheduling/batch/concurrency tuning. Environment overrides are shown and lock their corresponding controls. |
| Proxy trust | Auto, enabled or disabled forwarding-header trust; trusted hop count and optional trusted proxy CIDRs. Access-sensitive changes use confirm-or-revert. |
| Abuse protection | Per-endpoint database-backed rate limits, presets, limit/window, source, overrides and reset controls. |
| Audit | Filters, event details, integrity verification, CSV/JSON export, signed external delivery, retries and dead letters. |
| Operations | Database/migrations, web and worker health, queues, exports, delivery failures, maintenance/retention jobs, diagnostics and recovery actions. |
| API keys | Name, scopes, optional page restriction, expiry, source CIDRs, rotation and revocation. The full secret is shown only when created or rotated. |
| Identity | OIDC/SAML connections, mappings, connection tests, SCIM tokens. |
| MFA requests | Request context, approval, denial and audit trail. |
| Support | Authorized support sessions and their audit evidence. |

## Installation and developer options

The [deployment index](deploy/README.md) covers Docker/Compose and VPS, Node.js, Kubernetes, Render, Railway, Fly.io, DigitalOcean, AWS, GCP and Azure. The [setup guide](OPEN_SOURCE_SETUP_GUIDE.md) covers browser or terminal setup, database creation/testing, first administrator, environment-only startup, TLS, proxying, recovery, upgrading and rollback. The [operations guide](operations.md) covers backups, restore, key rotation, retention, audit checks, scaling and health.

Development needs Node.js **22.15.0+**, npm and PostgreSQL **14+**. `npm run dev:all` starts the application and worker on port 3301. The separate marketing project serves the public website on port 3300 with `node tools/serve.mjs`. `npm run verify` runs lint, typecheck, unit tests and the application build. See [CONTRIBUTING](../CONTRIBUTING.md), the environment template and deploy manifests in the [deployment index](deploy/README.md).

Supported management API operations currently include service status changes, incident creation/updates and metric-point ingestion. Read the generated OpenAPI contract from your running instance at `/api/openapi`; browser administration endpoints are not a supported replacement for a management API. AI assistance, custom status-page domains, translated content, more management endpoints, multi-region probes and passkeys remain roadmap items rather than shipped controls.
