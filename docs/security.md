# Security and data protection

What SignalHub does to protect your data, what it leaves to you, and how to report a vulnerability. To report a vulnerability privately, see [`SECURITY.md`](../SECURITY.md).

> This document describes implemented behaviour. It is **not legal advice** and SignalHub does **not claim certification or regulatory compliance** (GDPR, SOC 2, ISO 27001, HIPAA). Self-hosting gives you the controls; compliance is your organization's responsibility.

## Where your data lives

Everything is stored in **your PostgreSQL database** and **your asset storage** (local volume or your S3 bucket). SignalHub has no built-in phone-home or usage telemetry and no cloud dependency; fonts are self-hosted and the production CSP limits browser scripts, fonts and connections to your own origin. The only outbound server traffic is what you configure: monitor checks, your email/SMS providers, webhooks and destinations, SSO providers and an optional OTLP endpoint.

## Encryption

| What | How |
|---|---|
| Stored credentials: SMTP/SMS passwords, destination configs, webhook and audit-sink secrets, identity connection config, monitor auth secrets, TOTP secrets | AES-256-GCM with a versioned keyring (`ENCRYPTION_KEYS`, active key id) |
| Subscriber contacts (email addresses, phone numbers) | Encrypted at rest, with a separate lookup hash for deduplication |
| API keys, subscription/unsubscribe/feed/heartbeat tokens, OTPs, recovery codes | Stored **hashed**; shown once at creation |
| Passwords | Argon2id (`@node-rs/argon2`), tunable cost, automatic rehash on login, minimum length 14 by default |
| Session cookie `sp_session` | Signed JWT (jose) with a rotating signing keyring |
| In transit | Your reverse proxy terminates TLS; `upgrade-insecure-requests` is set; preflight warns on non-HTTPS URLs |

Rotate keys without downtime: [Operations: rotating keys](operations.md#rotating-keys).

## Authentication and access control

- **Local accounts** with login throttling per IP and per account (8 attempts / 15 min), forced password change after bootstrap or admin reset, idle and absolute session timeouts, session list and revoke, organization switching.
- **MFA**: TOTP with hashed recovery codes; organizations can require MFA.
- **Single sign-on**: OIDC (PKCE-style signed transaction, ACR/AMR checks), SAML 2.0 (replay tracking), per organization or installation-wide.
- **SCIM 2.0** user and group provisioning with hashed bearer tokens and group-to-role mapping.
- **RBAC**: four organization roles (Admin, Incident Manager, Responder, Viewer) over ten capabilities, optional per-page restrictions, last-admin protection. Installation (platform) administration is separate from organization administration and can be limited by IP (`PLATFORM_ADMIN_ALLOWED_CIDRS`).
- **Public API keys** carry explicit scopes (`status.read`, `components.read|write`, `incidents.read|write`, `metrics.read|write`, `analytics.read`), optional page restriction, expiry and CIDR allowlist.
- **Private and audience pages**: a shared password (private) or individual users and groups with per-component visibility (audience). Access sessions are bound to the credential version, so changing a password invalidates them. Protected feeds use scoped tokens; badges avoid caching protected data.

## Audit trail

- **Tamper-evident**: audit entries are chained with SHA-256 (each entry hashes the previous) and sealed in batches. `signalhubctl audit` verifies the chain and exits non-zero on a break; pruning preserves chain continuity.
- **Export**: CSV or JSON with a manifest from the platform console.
- **SIEM delivery**: the worker POSTs sealed entries to HTTPS sinks with an HMAC-SHA256 signature, retries and dead-letter visibility. Sinks can be installation-wide or per organization.
- Default retention is 2,555 days (~7 years), configurable.

## Network and application hardening

- **SSRF protection** for monitors, webhooks, destinations and audit sinks: addresses are validated at connect time (defeating DNS rebinding), redirects are never followed, credentials in URLs are rejected, and private, loopback, link-local, CGNAT, multicast and IPv6 ULA ranges are blocked unless you set `MONITOR_ALLOW_PRIVATE_TARGETS=true`.
- **Rate limiting** (database-backed) on login, OTP, page access, SSO start, public status reads, analytics and automation endpoints, with trusted-proxy aware client IPs.
- **Headers**: Content-Security-Policy, `frame-ancestors 'self'`, `form-action 'self'`, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP; `X-Powered-By` disabled. Custom page CSS is sanitized (no `@import`, `url()`, `expression()`; 20 KB cap).
- **CSV import/export** neutralizes spreadsheet formula injection.
- **Public messages** from monitors use sanitized failure categories, never raw error text.
- **Containers** run as a non-root user with all capabilities dropped (`cap_drop: ALL`) and `no-new-privileges`; the database network is internal. Helm adds a NetworkPolicy and pod disruption budgets.
- **Supply chain**: CI runs lint, typecheck, tests, `npm audit` (high) and an end-to-end Compose test; releases are multi-arch images published with an SBOM, provenance, and a cosign signature.

Known limits, stated plainly: the production CSP allows inline scripts (a Next.js constraint), IPv6 special-use range blocking is prefix based, and REST management API writes made with API keys are not yet recorded in the tenant audit log.

## Privacy and data lifecycle

- **Subscriber consent**: double opt-in via OTP for self-service sign-up; admin-added contacts require an explicit "agreed to receive updates" confirmation; one-click unsubscribe (`List-Unsubscribe`, RFC 2369 and RFC 8058) and a manage-preferences page; hard bounces quarantine the contact.
- **Analytics are cookie-free** and aggregated daily, stored in your database.
- **Retention**: scheduled hourly sweeps delete expired checks, analytics, notification logs, resolved incidents and sessions per policy.
- **Portability**: per-organization data export (gzipped JSON with checksum; secrets and token hashes stripped) from the UI or `signalhubctl export --org <id>`; subscriber CSV export.
- **Erasure**: delete individual subscribers; purge an entire organization through a platform job (cancellable until a worker leases it; a tombstone is retained).

Self-hosting makes it easier to meet data-residency and processor-agreement requirements because you choose the region and the providers, but a data-protection impact assessment, records of processing and request handling procedures remain yours to maintain.

## Production hardening checklist

- [ ] TLS in front, `NEXT_PUBLIC_APP_URL` is `https://`, HSTS at the proxy
- [ ] `TRUST_PROXY_HEADERS=true` only when reachable solely via the proxy, correct `TRUSTED_PROXY_HOPS`
- [ ] `PLATFORM_ADMIN_ALLOWED_CIDRS` set to your office/VPN
- [ ] Strong, independent `SESSION_SECRET` and `ENCRYPTION_KEY`, stored in a secret manager, backed up separately from the database
- [ ] MFA required for admins; SSO with SCIM where available
- [ ] PostgreSQL with TLS, backups and **tested restores**
- [ ] S3 bucket private, with versioning and encryption
- [ ] `METRICS_TOKEN` set and the metrics endpoint not publicly routed
- [ ] SIEM sink configured; periodic `signalhubctl audit`
- [ ] Image pinned by tag/digest and signature verified
- [ ] Key rotation procedure rehearsed

## Reporting a vulnerability

Do not open a public issue for security problems. Follow [`SECURITY.md`](../SECURITY.md) for private reporting. Supported versions are the latest release and the previous minor.
