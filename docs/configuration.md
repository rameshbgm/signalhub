# Configuration reference

All runtime configuration is environment variables (see [`.env.example`](../.env.example)), plus a few settings managed in the **platform console** (`/organization/platform`). Docker Compose passes the documented variables to `web`, `worker` and `migrate`.

> Setup walkthrough: [Setup and deployment guide](OPEN_SOURCE_SETUP_GUIDE.md)

## Required

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Signs session JWTs. At least 32 characters. Generate with `openssl rand -base64 48`. |
| `ENCRYPTION_KEY` | Key material for AES-256-GCM encryption of stored credentials, TOTP secrets and subscriber contacts. Independent from `SESSION_SECRET`. **Back it up.** |
| `DATABASE_URL` | PostgreSQL connection string. Compose builds its own from the `POSTGRES_*` values. |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL, e.g. `https://status.example.com`. Used for links in emails, OIDC/SAML callbacks and cookies. |

## Key rotation keyrings (optional)

| Variable | Description |
|---|---|
| `SESSION_SIGNING_KEYS` | JSON keyring of session signing keys. All listed keys verify; the active one signs. |
| `SESSION_ACTIVE_KEY_ID` | ID of the key used for new sessions. |
| `ENCRYPTION_KEYS` | JSON keyring of encryption keys. All remain readable. |
| `ENCRYPTION_ACTIVE_KEY_ID` | ID of the key used for new writes. |

Procedure: [Operations: rotating keys](operations.md#rotating-keys).

## Ports, image and database

| Variable | Default | Description |
|---|---|---|
| `STATUS_PORT` | `3301` | Host port the web container is published on (`127.0.0.1` only). |
| `STATUS_IMAGE` | `signalhub:local` | Image tag Compose builds or runs. Set to a GHCR tag to use a prebuilt image. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `signalhub` / `signalhub` / required | Bundled Postgres credentials (Compose only). |
| `POSTGRES_PORT` | `5432` | Host port for the bundled Postgres (`127.0.0.1` only). |
| `DATABASE_POOL_SIZE` | `20` | Max connections per process. Total = pool × (web + worker replicas). |
| `DATABASE_IDLE_TIMEOUT_MS` | `30000` | Idle connection timeout. |
| `DATABASE_CONNECT_TIMEOUT_MS` | `5000` | Connection timeout. |

## Identity and sessions

Organizations and users are created by an administrator; there is **no public sign-up**. Prefer configuring OIDC/SAML/SCIM per organization in the console (**Identity**). The variables below configure a single env-defined OIDC provider.

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_OIDC_ENABLED` | `false` | Show the OIDC sign-in option. |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | empty | Env-defined OIDC provider. |
| `TENANT_SESSION_IDLE_SECONDS` | `28800` (8 h) | Idle timeout. |
| `TENANT_SESSION_ABSOLUTE_SECONDS` | `604800` (7 d) | Absolute session lifetime. |
| `PASSWORD_MIN_LENGTH` | `14` | Minimum password length for local accounts. |
| `ARGON2_MEMORY_KIB` / `ARGON2_TIME_COST` / `ARGON2_PARALLELISM` | `19456` / `2` / `1` | Argon2id hashing cost. Raise on faster hardware. |

## Reverse proxy and access control

| Variable | Default | Description |
|---|---|---|
| `TRUST_PROXY_HEADERS` | `false` | Trust `X-Forwarded-*` from your proxy. Enable **only** if the app is reachable solely through it. |
| `TRUSTED_PROXY_HOPS` | `1` | Number of trusted proxies in front of the app. Set explicitly when trusting headers. |
| `PLATFORM_ADMIN_ALLOWED_CIDRS` | empty | Comma-separated IPv4 CIDRs allowed to open `/organization/platform`. Requires correct proxy settings. |

## Email, SMS and destinations

Configured in the platform console at **Configuration**, not in environment variables.

- **Email (SMTP)**: presets for Amazon SES, Brevo, Elastic Email, Fastmail, Gmail, iCloud, MailerSend, Mailgun, Mailjet, Mailtrap, Microsoft 365, Outlook, Postmark, Resend, SendGrid, SMTP2GO, SparkPost, Yahoo, Zoho, or custom SMTP.
- **SMS**: Twilio, Vonage, Plivo, Telnyx, Sinch, ClickSend, Textmagic, Africa's Talking.
- **Team destinations**: Slack, Microsoft Teams, Discord, Google Chat, Mattermost, Rocket.Chat, Webex, Zulip, Matrix, Lark, DingTalk, WeCom, Telegram, WhatsApp, Signal, PagerDuty, Opsgenie, Splunk On-Call, ntfy, Pushover, Pushbullet, Gotify, generic HTTP. A platform admin enables channels; credentials are encrypted at rest.

Older `SMTP_*` / `TWILIO_*` variables are imported once by `db:migrate` when upgrading and then ignored.

## Asset storage

Branding images and organization exports are stored in PostgreSQL (the `asset_blobs` table), so there is nothing to configure.

Uploaded images are re-encoded server-side and served with `Cache-Control: public, max-age=31536000, immutable` plus an `ETag` (asset URLs change on every upload, so they are safe to cache for a year); org data exports are stored the same way.

## Monitoring and worker

| Variable | Default | Description |
|---|---|---|
| `MONITOR_ALLOW_PRIVATE_TARGETS` | `false` | Allow monitors, webhooks and destinations to reach private/loopback ranges. The SSRF guard blocks them by default. |
| `MONITOR_ENABLE_ICMP` | `false` | Enable ICMP (ping) monitors. The image includes `ping`. |
| `MONITOR_MAX_RESPONSE_BYTES` | `1048576` | Max response body read per HTTP check. |
| `WEBHOOK_TIMEOUT_MS` | `10000` | Outbound webhook timeout. |
| `REQUIRE_WORKER` | `true` | Make web readiness depend on a fresh worker heartbeat. |
| `WORKER_ID` | hostname+pid | Stable worker identity for leases. |
| `WORKER_POLL_INTERVAL_MS` | `1000` | Job poll interval. |
| `WORKER_CONCURRENCY` | `10` | Concurrent jobs. |
| `WORKER_MONITOR_CONCURRENCY` | `20` | Concurrent monitor checks. Raise for many monitors. |
| `WORKER_NOTIFICATION_BATCH` | `25` | Notifications per sweep. |
| `WORKER_AUDIT_DELIVERY_BATCH` | `25` | Audit events delivered per sweep. |
| `WORKER_PLATFORM_JOB_BATCH` | `1` | Platform jobs per sweep. |
| `WORKER_MONITOR_SWEEP_MS` / `…_NOTIFICATION_SWEEP_MS` / `…_EXPORT_SWEEP_MS` / `…_AUDIT_DELIVERY_SWEEP_MS` / `…_PLATFORM_JOB_SWEEP_MS` / `…_MAINTENANCE_SWEEP_MS` | `1000` / `1000` / `5000` / `2000` / `5000` / `10000` | Sweep intervals. |
| `WORKER_HEARTBEAT_INTERVAL_MS` | `5000` | Heartbeat write interval (readiness requires one within ~30 s). |
| `WORKER_SHUTDOWN_ABORT_TIMEOUT_MS` | `15000` | Graceful shutdown wait. |
| `WORKER_HEALTH_PORT` | `8081` | Worker health endpoint port (`/ready`). |

Monitor interval is configurable per monitor from 10 seconds to 24 hours. Check history is stored in monthly partitions and trimmed by retention.

## Observability

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Pino log level (JSON logs to stdout). |
| `SERVICE_NAME` | `signalhub` | Name in logs, metrics and PostgreSQL `application_name`. |
| `METRICS_TOKEN` | empty | Bearer token for `/api/internal/metrics` (Prometheus format). The endpoint returns 404 unless set. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | Enable OpenTelemetry trace export. |
| `OTEL_EXPORTER_OTLP_HEADERS` | empty | OTLP headers (e.g. auth). |
| `ALLOW_INSECURE_AUDIT_SINKS` | `false` | Allow plain-HTTP SIEM sinks. Not recommended outside isolated networks. |

## First-admin bootstrap (one-time)

`STATUS_BOOTSTRAP_EMAIL`, `STATUS_BOOTSTRAP_NAME`, `STATUS_BOOTSTRAP_ORG_NAME`, `STATUS_BOOTSTRAP_ORG_SLUG` provide defaults for `bootstrap.mjs`. Pass the password with `--password-stdin`; never put it in `.env`. See [guide section 4](OPEN_SOURCE_SETUP_GUIDE.md#4-create-the-first-administrator).

## Development and test only

**Never set these on a production database.**

| Variable | Description |
|---|---|
| `ALLOW_DEV_SEED` | Permit sample-data seed scripts (also requires `NODE_ENV=development` or `test`). |
| `ENABLE_DEV_QUICK_LOGIN` | Show one-click role logins on the sign-in page. |
| `DEV_ROLE_PASSWORD`, `DEV_AUDIENCE_PASSWORD` | Passwords for seeded role/audience users. |
| `CONFIRM_DEV_DATABASE_RESET` | Must equal the database name for `npm run db:reset-dev` and `db:seed-demo`. |
| `STATUS_EXPOSE_OTP` | Return subscription OTPs in API responses (testing). |

## Settings stored in the database (per organization or installation)

Managed in the UI and API, not env vars: page design/theme, custom CSS, announcements, retention overrides, MFA-required policy, identity connections (OIDC/SAML/SCIM), webhook endpoints, API keys (scopes, page restriction, expiry, CIDR allowlist), audit sinks.

**Default retention** (overridable per organization within platform bounds): monitor checks 90 days, analytics 395 days, notification logs 90 days, resolved incidents 730 days, audit log 2,555 days (~7 years).
