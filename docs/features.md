# Feature guide

Every SignalHub feature area on one page: what it is, how to use it in a few steps, and what it looks like. Each section links to the deeper guide. Desktop screenshots preserve the captured browser viewport of a running instance with synthetic Estora data; mobile captures retain their phone viewport.

| Area | Where in the console | Deeper guide |
|---|---|---|
| [Pages and hubs](#pages-and-hubs) | Pages | [User manual](https://signalhub.at/docs/user-manual.html#pages) |
| [Private and audience access](#private-and-audience-access) | Pages → Access | [User manual](https://signalhub.at/docs/user-manual.html#pages) |
| [Design and publishing](#design-and-publishing) | Pages → Appearance | [User manual](https://signalhub.at/docs/user-manual.html#pages) |
| [Incidents](#incidents) | Events → Declare incident | [User manual](https://signalhub.at/docs/user-manual.html#incidents) |
| [Maintenance](#scheduled-maintenance) | Events → Schedule maintenance | [User manual](https://signalhub.at/docs/user-manual.html#maintenance) |
| [Monitoring](#monitoring) | Monitors | [User manual](https://signalhub.at/docs/user-manual.html#monitoring) |
| [Metrics](#metrics) | Metrics | [User manual](https://signalhub.at/docs/user-manual.html#monitoring) |
| [Subscribers](#subscribers-and-the-public-subscribe-flow) | Subscribers | [User manual](https://signalhub.at/docs/user-manual.html#communication) |
| [Destinations and providers](#notification-destinations-and-providers) | Destinations, Configuration | [Setup guide](OPEN_SOURCE_SETUP_GUIDE.md#7-first-run-configuration) |
| [Embeds and badges](#embeds-and-badges) | SignalHub Embed | [User manual](https://signalhub.at/docs/user-manual.html#integrations) |
| [Analytics](#analytics) | Analytics | [User manual](https://signalhub.at/docs/user-manual.html#menus) |
| [Team, invitations and roles](#team-roles-and-organization-settings) | User management, Configuration → Organization | [User manual](https://signalhub.at/docs/user-manual.html#roles) |
| [Data lifecycle](#data-lifecycle) | Configuration → Organization, Overview | [Security](security.md#privacy-and-data-lifecycle) |
| [Observability and CLI](#observability-and-the-command-line) | Health, metrics, `signalhubctl` | [Operations](operations.md) |
| [REST API and keys](#rest-api-and-api-keys) | Security → API keys | [README](../README.md#automation-and-api) |
| [Single sign-on and SCIM](#single-sign-on-and-scim) | Security → Identity | [Security](security.md) |
| [Multi-factor authentication](#multi-factor-authentication) | Security, Configuration → Runtime | [MFA guide](mfa.md) |
| [Sessions](#sessions) | Audit → Active session | [Security](security.md) |
| [Audit and SIEM](#audit-and-siem) | Audit | [Operations](operations.md#audit-verification-and-siem) |
| [Platform console](#platform-console) | Platform administration | [User manual](https://signalhub.at/docs/user-manual.html#platform) |
| [Runtime settings](#runtime-settings-and-abuse-protection) | Configuration → Runtime | [Configuration](configuration.md#runtime-settings-managed-in-the-admin-console) |
| [Operations](#operations-view) | Operations | [Operations](operations.md) |
| [Install and setup](#install-and-setup) | `/setup` | [Setup guide](OPEN_SOURCE_SETUP_GUIDE.md) |
| [Workspace welcome](#workspace-welcome) | `/` | [Homepage and marketing project](landing-page.md) |

## Pages and hubs

Three page types: **public**, **private** (shared password) and **audience** (named users and groups, per-component visibility). **Hubs** combine several pages into one "all our services" view.

1. **Pages → New page**, choose public, private or audience.
2. Add **services and groups** and order them by drag and drop.
3. Create a **hub** and add status pages to it; access is checked per child.

<table>
<tr>
<td width="50%"><img src="screenshots/admin-pages.png" alt="Pages and hubs list"></td>
<td width="50%"><img src="screenshots/admin-page-editor.png" alt="Hub overview with child status pages"></td>
</tr>
<tr>
<td align="center"><sub>Pages and hubs in one list</sub></td>
<td align="center"><sub>A hub: child pages, access and design version</sub></td>
</tr>
<tr>
<td><img src="screenshots/admin-page-status-pages.png" alt="Status pages inside a hub"></td>
<td><img src="screenshots/public-hub.png" alt="The public hub page"></td>
</tr>
<tr>
<td align="center"><sub>Managing the pages inside a hub</sub></td>
<td align="center"><sub>What visitors see</sub></td>
</tr>
</table>

## Private and audience access

A **private** page asks for one shared password. An **audience** page asks people to sign in and shows each person only the services assigned to them or their group. Feeds and badges for protected pages use revocable, scoped tokens, and access sessions are bound to the credential version, so changing a password signs everyone out of that page. A hub signs visitors in once while each child page still enforces its own rules.

<table>
<tr>
<td width="50%"><img src="screenshots/public-private-gate.png" alt="Password gate on a private page"></td>
<td width="50%"><img src="screenshots/public-audience-gate.png" alt="Sign-in gate on an audience page"></td>
</tr>
</table>

## Design and publishing

Layouts (standard, banner, compact), 12 theme presets, logo, favicon and cover image, uptime-bar styles, sanitized custom CSS and header and footer HTML. Changes stay a **draft** until you publish, and 30 versions of design history are kept.

New pages default to **collapsed service groups with average uptime** shown as small solid daily circles. Choose expanded groups during creation or change the default later in **Appearance → Layout**. The same panel controls the incident/maintenance history window (90 days by default). Services save their status with a green save icon; drag-and-drop order saves automatically, including on filtered or paginated lists. [Detailed public-page guide](public-pages.md).

<img src="screenshots/admin-page-appearance.png" alt="Appearance tab with layout and style choices" width="900">

Page details, time zone, headline, search-engine visibility and subscriber channels live under **Settings** and **Notifications**:

<table>
<tr>
<td width="50%"><img src="screenshots/admin-page-settings.png" alt="Page settings"></td>
<td width="50%"><img src="screenshots/admin-page-notifications.png" alt="Page notifications and delivery readiness"></td>
</tr>
</table>

## Incidents

Investigating, Identified, Monitoring and Resolved, with impact levels, editable timeline updates, affected components and an optional postmortem.

Public previews show at most 10 past incidents and 10 past maintenance windows, with separate history links below each preview. Full history uses the same configurable date window. Postmortems open directly without a redundant self-link.

1. **Events → Declare incident**, write what is happening and who is affected.
2. Pick status and impact, tick the affected components, choose whether to **notify subscribers**.
3. Post updates as it evolves; resolve when it is over.

<table>
<tr>
<td width="50%"><img src="screenshots/admin-incident-new.png" alt="Declare incident form"></td>
<td width="50%"><img src="screenshots/admin-incidents.png" alt="Events view"></td>
</tr>
<tr>
<td><img src="screenshots/public-incident.png" alt="Incident timeline on the public page"></td>
<td><img src="screenshots/public-history.png" alt="Public incident history"></td>
</tr>
</table>

## Scheduled maintenance

Scheduled, In progress, Verifying and Completed, with enforced transitions, **automatic start and completion** from the window, and a reminder email before it begins.

<table>
<tr>
<td width="50%"><img src="screenshots/admin-maintenance-new.png" alt="Schedule maintenance form"></td>
<td width="50%"><img src="screenshots/admin-maintenance.png" alt="Scheduled maintenance list"></td>
</tr>
</table>

## Monitoring

Seven monitor types (HTTP, keyword, TCP, TLS, DNS, ICMP, heartbeat), intervals from 10 seconds to 24 hours, failure and recovery thresholds, and optional proxies and authentication. A monitor can flip a component, record a metric, open an incident and notify. Private ranges are blocked by default and redirects are never followed.

<table>
<tr>
<td width="50%"><img src="screenshots/admin-monitor-new.png" alt="Add a monitor"></td>
<td width="50%"><img src="screenshots/admin-monitors.png" alt="Monitors with uptime bars and latency"></td>
</tr>
<tr>
<td><img src="screenshots/admin-monitor-edit.png" alt="Editing a monitor"></td>
<td><img src="screenshots/admin-monitor-thresholds.png" alt="Thresholds, failure status and automated actions"></td>
</tr>
<tr>
<td align="center"><sub>Edit a monitor: what to watch, request, content check, expiry</sub></td>
<td align="center"><sub>Thresholds, failure status and automated actions</sub></td>
</tr>
</table>

Open a monitor's edit page to tune it. Under **Security and authentication** choose Basic, Bearer or header auth; under **Request options** set a proxy, IP family and custom headers; under **Automated actions** decide whether a failure flips the component, records a metric, opens an incident and notifies subscribers.

<img src="screenshots/admin-monitor-auth.png" alt="Monitor request, content check and authentication options" width="900">

## Metrics

Publish response time, error rate or any series you push through the API or a monitor, with public charts from 24 hours to 90 days. Charts start at 90 days and remember a visitor's later choice.

<img src="screenshots/admin-metrics.png" alt="Metrics list" width="900">

## Subscribers and the public subscribe flow

Email, SMS and webhook subscribers with OTP verification, per-component and per-event filters, one-click unsubscribe (RFC 8058), bounce quarantine, and CSV import and export.

Public Subscribe controls require both page and platform subscriptions enabled and at least one configured email/SMS provider. The dialog exposes only usable channels and explains unavailable worker delivery. Disabling signup does not cancel existing subscribers. [Controls and storage/display defaults](public-pages.md#public-subscription-controls).

<table>
<tr>
<td width="50%"><img src="screenshots/admin-subscribers.png" alt="Subscriber management"></td>
<td width="50%"><img src="screenshots/public-subscribe.png" alt="The public subscribe dialog"></td>
</tr>
<tr>
<td align="center"><sub>Managing subscribers</sub></td>
<td align="center"><sub>What a visitor sees</sub></td>
</tr>
</table>

## Notification destinations and providers

Email through 19 provider presets or any SMTP server, 8 SMS providers, 23 team destinations (Slack, Teams, Discord, PagerDuty, Opsgenie, ntfy and more) and signed webhooks. Credentials are encrypted and never shown again, and every destination is tested before it is stored.

<table>
<tr>
<td width="50%"><img src="screenshots/admin-destinations.png" alt="Organization destinations"></td>
<td width="50%"><img src="screenshots/platform-configuration.png" alt="Platform configuration of providers"></td>
</tr>
<tr>
<td align="center"><sub>Choose a destination for your organization</sub></td>
<td align="center"><sub>The administrator enables providers installation-wide</sub></td>
</tr>
</table>

## Embeds and badges

An incident banner script and a live SVG status badge, plus RSS and Atom feeds, for your site, your README and your docs.

<img src="screenshots/admin-embed.png" alt="Embed snippets" width="900">

## Analytics

Cookie-free, aggregated daily: page views, incident views and subscription conversion.

<img src="screenshots/admin-analytics.png" alt="Page analytics" width="900">

## Team, roles and organization settings

Admin, Incident Manager, Responder and Viewer roles over ten capabilities, optionally limited to selected pages, with last-admin protection. Organization settings cover contact details and per-organization retention.

**Invitations.** Add a team member and choose *invite*: they receive an email with an expiring, single-use link to set their password (or keep an existing sign-in method), and you can resend a pending invitation. Pages, roles and page scope are set when you invite.

<table>
<tr>
<td width="50%"><img src="screenshots/admin-team.png" alt="Team members and roles"></td>
<td width="50%"><img src="screenshots/admin-settings.png" alt="Organization settings and data retention"></td>
</tr>
<tr>
<td><img src="screenshots/platform-users-roles.png" alt="Users and roles across the installation"></td>
<td><img src="screenshots/admin-help.png" alt="Help center"></td>
</tr>
<tr>
<td align="center"><sub>All accounts, roles and page scopes</sub></td>
<td align="center"><sub>A built-in help center for operators</sub></td>
</tr>
</table>

## REST API and API keys

Scoped keys (`status.read`, `components.read|write`, `incidents.read|write`, `metrics.read|write`, `analytics.read`) with optional page restriction, expiry and CIDR allowlist. An OpenAPI 3.1 document is served at `/api/openapi`.

<img src="screenshots/platform-api-keys.png" alt="API keys with scopes" width="900">

## Single sign-on and SCIM

OIDC and SAML 2.0 per organization or installation-wide, with group-to-role mapping, just-in-time provisioning and SCIM 2.0 with hashed bearer tokens. Test a connection before enforcing it.

<img src="screenshots/platform-identity-sso.png" alt="Add an OIDC or SAML connection" width="900">

## Multi-factor authentication

Authenticator-app codes with two devices, recovery codes, trusted browsers, lockout, and admin-approved recovery. One switch, off by default. The full walkthrough has its own guide: **[mfa.md](mfa.md)**.

<table>
<tr>
<td width="50%"><img src="screenshots/mfa-enroll.png" alt="Enrollment"></td>
<td width="50%"><img src="screenshots/mfa-recovery-management.png" alt="Recovery code regeneration confirmation"></td>
</tr>
<tr>
<td><img src="screenshots/mfa-settings-devices.png" alt="Device management"></td>
<td><img src="screenshots/platform-mfa-requests.png" alt="MFA requests for administrators"></td>
</tr>
<tr>
<td><img src="screenshots/platform-users-mfa.png" alt="MFA status per user"></td>
<td><img src="screenshots/platform-mfa-setting.png" alt="The global switch"></td>
</tr>
</table>

## Sessions

Every signed-in device with browser, address and time, revoke one, or sign out all the others.

<img src="screenshots/platform-sessions.png" alt="Active sessions" width="900">

## Audit and SIEM

Hash-chained, sealed, append-only, exportable as CSV or JSON, with signed delivery to your SIEM and a CLI verifier.

<table>
<tr>
<td width="50%"><img src="screenshots/platform-audit.png" alt="Audit log and SIEM sinks"></td>
<td width="50%"><img src="screenshots/platform-audit-mfa.png" alt="Audit log filtered to MFA events"></td>
</tr>
</table>

## Data lifecycle

Retention is set per organization under **Configuration → Organization** (monitor check history, analytics, notification logs, service status history), within limits the installation sets, and swept hourly by the worker. **Export** an organization's data as gzipped JSON with a checksum (secrets and token hashes are stripped) from the console or `signalhubctl export --org <id>`. **Purge** an organization through a cancellable platform job; a tombstone is kept. Subscribers can be deleted individually.

<img src="screenshots/admin-settings.png" alt="Organization settings and data retention" width="900">

## Platform console

Provision and suspend organizations, see identities, database, worker and queues at a glance, and run installation-wide configuration.

<img src="screenshots/platform-overview.png" alt="Platform overview" width="900">

## Runtime settings and abuse protection

Check database, migration and worker health, set proxy trust, HTTPS and session policy, and tune rate limits. Risky changes are checked first and apply on trial (**Keep** or they revert).

<img src="screenshots/platform-abuse-protection.png" alt="Abuse protection limits" width="900">

## Operations view

Platform jobs, dead-letter deliveries and worker heartbeats, with retry.

<img src="screenshots/platform-operations.png" alt="Operations" width="900">

## Observability and the command line

Health endpoints (`/api/health/live`, `/api/health/ready`), a Prometheus endpoint at `/api/internal/metrics` (bearer token, off unless `METRICS_TOKEN` is set), structured JSON logs and OpenTelemetry traces. `signalhubctl` covers `setup`, `reset-password [--clear-mfa]`, `doctor`, `preflight`, `migrate`, `backup`, `restore`, `audit`, `export`, `rotate-encryption-key` and `settings`. See the [README CLI table](../README.md#operator-cli) and [operations](operations.md).

The current isolated Estora reference environment reports `database: true`, `migrations: true` and preflight `ok: true`. It has no delivery worker, so `worker: false` is expected. Run `signalhubctl doctor` and `signalhubctl preflight` on your own installation for live results.

## Install and setup

<img src="screenshots/setup-2-database.png" alt="Setup wizard database connection fields" width="900">

<img src="screenshots/login.png" alt="Sign in" width="720">

## Workspace welcome

<img src="screenshots/application-workspace.png" alt="Application workspace welcome and sign-in action" width="900">

The application homepage provides installation branding and a workspace sign-in action. The public marketing site lives in a separate project. See [homepage branding and project separation](landing-page.md).
