# Configuration reference

Start with the minimal [`.env.example`](../.env.example). Leave the database connection blank to enter it through the [setup wizard](OPEN_SOURCE_SETUP_GUIDE.md#4-the-setup-wizard); the supervisor generates missing application secrets and saves them in `SIGNALHUB_DATA_DIR/signalhub.json`. Alternatively, supply the core values through your deployment environment.

The sections below are the complete reference for optional and advanced settings. Add only the variables you need: omitted values use built-in defaults or settings saved under **Platform administration → Configuration → Runtime**. Explicit environment values override console settings, so copying every default into `.env` can prevent console changes from taking effect.

For Docker, `./install.sh` creates the deployment `.env`. When configuring Compose manually, use `SIGNALHUB_DATABASE_URL` and `SIGNALHUB_PUBLIC_URL` instead of `DATABASE_URL` and `NEXT_PUBLIC_APP_URL`. Bundled PostgreSQL, HTTPS, ports, and image options are listed under [Ports, image and database](#ports-image-and-database).

> Setup walkthrough: [Setup and deployment guide](OPEN_SOURCE_SETUP_GUIDE.md)

## Core (set by the setup wizard, or as variables)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL 14+ connection string. Use the direct connection, not a transaction pooler. TLS via `?sslmode=verify-full` (`no-verify` encrypts without checking, `disable` turns TLS off). In Compose `.env`, set `SIGNALHUB_DATABASE_URL` instead. |
| `DATABASE_SSL_CA` | Optional PEM text of the database server's CA (RDS, Azure, Cloud SQL). Enables certificate verification against it and overrides `sslmode`. `NODE_EXTRA_CA_CERTS=/path/ca.pem` is the file-based alternative. |
| `SESSION_SECRET` | Signs login session tokens. Keep it stable: changing it invalidates sessions signed with the old value unless that key remains in `SESSION_SIGNING_KEYS`. At least 32 characters. Generated on first start when a writable data volume is available. |
| `ENCRYPTION_KEY` | Encrypts stored credentials, MFA secrets and subscriber contact values with AES-256-GCM. It is independent from `SESSION_SECRET`. Losing or replacing it without a key rotation makes existing encrypted values unreadable. Generated on first start when a writable data volume is available. |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL, e.g. `https://status.example.com`. Used for links in emails, OIDC/SAML callbacks and cookies. In Compose `.env`, set `SIGNALHUB_PUBLIC_URL`. |

## Application homepage branding

The installed application's `/` route is a workspace welcome screen, separate from the project's static marketing website in the separate `signalhub.at` checkout. It shows only installation branding, a workspace illustration, and a sign-in action. It does not load or display service, incident, or organization data. Signed-in visitors go to `/organization`; the first-run setup gate still takes precedence. Set the public address to the URL serving the application, which may differ from the marketing website's URL.

| Variable | Default | Description |
|---|---|---|
| `SIGNALHUB_INSTANCE_NAME` | `SignalHub` | Installation name in the welcome screen header and page title. |
| `SIGNALHUB_INSTANCE_LOGO_URL` | empty | Optional HTTP(S) image URL or uploaded `/api/assets/<uuid>` URL. Empty or unsupported URLs use the SignalHub mark. |
| `SIGNALHUB_MIGET_ATTRIBUTION` | `false` | Set to `true` on the Miget-hosted public demo to show a linked “Demo hosting by Miget” credit on the welcome screen and public status-page footers. Read at runtime; restart the web service after changing it. |

Set these in the server environment or Compose `.env`, then restart the app. They do not change organization names, individual status-page designs, or the standalone marketing website. See [Landing pages](landing-page.md).

## Setup and first administrator

### What the two application keys do

`SESSION_SECRET` protects sign-in sessions: SignalHub signs each session token with it and checks that signature on later requests. If the value changes, affected users must sign in again; their accounts and database records remain intact. To rotate it without ending sessions, use the `SESSION_SIGNING_KEYS` keyring and follow the [session-key rotation steps](operations.md#rotating-keys).

`ENCRYPTION_KEY` protects sensitive values saved in PostgreSQL, including integration credentials, monitor authentication, MFA authenticator secrets and subscriber email/phone values. It does not encrypt the entire database. Keep a secure backup of this key separately from PostgreSQL backups. Restoring a database requires the matching encryption key to read those protected values. To replace the key, use the [encryption-key rotation procedure](operations.md#rotating-keys); do not simply overwrite it.

When you use the setup wizard, SignalHub generates both keys and stores them in `signalhub.json` under `SIGNALHUB_DATA_DIR` (Docker: `/app/data`; Node.js: `./data`). Keep that file or its persistent volume in your backup plan. If you set the keys through environment variables or a secret manager, preserve the same values when replacing or restoring the service. Generate them with a cryptographic random generator, not by typing a phrase; run `openssl rand -base64 48` separately for each key and use a different output for each.

| Variable | Default | Description |
|---|---|---|
| `SIGNALHUB_DATA_DIR` | `/app/data` (image), `./data` | Where the wizard stores `signalhub.json` (mode 0600). Mount a persistent volume here, or provide the core variables instead. |
| `SIGNALHUB_HOST` | `127.0.0.1` | Listen address for `npm run start:all` from a checkout (the container always listens on all interfaces). |
| `STATUS_BOOTSTRAP_PASSWORD` | (unset) | Creates the first administrator on start when the database has **no users**, then is ignored. The password must be changed at first sign-in. |
| `STATUS_BOOTSTRAP_USERNAME` | `admin` | User ID for the first administrator. |
| `STATUS_BOOTSTRAP_EMAIL` | empty | Email for that administrator. |
| `STATUS_BOOTSTRAP_NAME` | `Instance Administrator` | Display name for that administrator. |
| `STATUS_BOOTSTRAP_ORG_NAME` | `Default Organization` | Initial organization name. |
| `STATUS_BOOTSTRAP_ORG_SLUG` | `default` | Initial organization ID. |
| `SIGNALHUB_SETUP_TOKEN` | generated on supervisor start | Optional operator token of 32–256 characters. Required to unlock first-run setup; ignored after setup completes. |

Without a database or administrator, the container serves only the setup wizard (`/setup`) and `/api/health/live`; other API calls return `503 SETUP_REQUIRED` and readiness stays false.

Unlock the initial setup wizard with the operator token printed in the server startup logs. The supervisor generates one when `SIGNALHUB_SETUP_TOKEN` is omitted. Keep the token private and restrict setup access to the intended operator. Launching bare Next.js without the supervisor requires an explicit token.

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
| `COMPOSE_FILE` | `docker-compose.yml` | Which Compose files to combine, for example `docker-compose.yml:deploy/compose/https.yml:deploy/compose/postgres.yml` for automatic HTTPS plus the bundled PostgreSQL. The installer writes this for you. |
| `DOMAIN` | (unset) | The public host name for the automatic-HTTPS overlay (`deploy/compose/https.yml`, Caddy). The installer asks for it. |
| `STATUS_IMAGE` | `signalhub:local` | Image tag Compose builds or runs. Set to a GHCR tag to use a prebuilt image. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `signalhub` / `signalhub` / required | Credentials of the optional bundled PostgreSQL (`deploy/compose/postgres.yml`). |
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
| `TRUST_PROXY_HEADERS` | unset (Auto) | `auto`, `true` or `false`. Leave unset to manage it from **Platform administration → Configuration → Visitor addresses and reverse proxy**; set it to fix the value for the whole deployment (the admin page then shows it as locked). See [Client IP and reverse proxies](#client-ip-and-reverse-proxies). |
| `TRUSTED_PROXY_HOPS` | unset (1) | Number of reverse proxies and CDNs in front of the app, 1-10. Only used when forwarded headers are trusted. Unset = the admin page value. |
| `TRUSTED_PROXY_CIDRS` | unset (any private address in Auto, any connection in On) | Comma-separated IPv4/IPv6 ranges. When set, `X-Forwarded-For` is believed only from connections inside them, in both Auto and On. A malformed entry makes the whole variable ignored (the admin page shows which). |
| `PLATFORM_ADMIN_ALLOWED_CIDRS` | empty | Comma-separated IPv4 CIDRs allowed to open `/organization/platform`. Checked against the client address described [below](#client-ip-and-reverse-proxies); the admin page refuses a proxy setting that would lock you out. |

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

The monitor options and worker sweep and batch values below are also editable under Platform administration → Configuration → Runtime and apply without a restart; `WORKER_CONCURRENCY`, `WORKER_POLL_INTERVAL_MS`, `WORKER_HEARTBEAT_INTERVAL_MS`, `WORKER_SHUTDOWN_ABORT_TIMEOUT_MS` and `WORKER_HEALTH_PORT` are read at start.

| Variable | Default | Description |
|---|---|---|
| `MONITOR_ALLOW_PRIVATE_TARGETS` | `false` | Allow monitor checks to reach private/loopback ranges. The SSRF guard blocks them by default. It also governs a monitor's proxy address and OAuth2 token URL: a proxy on a private network needs this set. Webhooks, notification destinations and audit sinks always stay blocked from private ranges. |
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
| `WORKER_MONITOR_SWEEP_MS` | `1000` | Monitor sweep interval. |
| `WORKER_NOTIFICATION_SWEEP_MS` | `1000` | Notification sweep interval. |
| `WORKER_EXPORT_SWEEP_MS` | `5000` | Data export sweep interval. |
| `WORKER_AUDIT_DELIVERY_SWEEP_MS` | `2000` | Audit delivery sweep interval. |
| `WORKER_PLATFORM_JOB_SWEEP_MS` | `5000` | Platform job sweep interval. |
| `WORKER_MAINTENANCE_SWEEP_MS` | `10000` | Maintenance sweep interval. |
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

## Administrator recovery

Users reset forgotten passwords themselves from **Forgot password?** on the sign-in page; that needs email configured in the platform console and `NEXT_PUBLIC_APP_URL` (links are never built from the request's host). Authenticator codes are required by one switch, **Require authenticator codes** (Platform > Configuration > Runtime). Operators recover any account with `signalhubctl reset-password --username USER_ID [--password-stdin] [--clear-mfa]`. `bootstrap.mjs` creates or resets an administrator and its organization; pass the password with `--password-stdin`. First-time setup normally uses the [setup wizard](OPEN_SOURCE_SETUP_GUIDE.md#4-the-setup-wizard) or `STATUS_BOOTSTRAP_PASSWORD`.

## Development and test only

**Never set these on a production database.**

| Variable | Description |
|---|---|
| `DEV_LAN_ORIGINS` | Comma-separated hosts (for example `192.168.1.20`) allowed to open the dev server from another device on your network, such as a phone on the same Wi-Fi. |
| `ENABLE_DEV_QUICK_LOGIN` | Show one-click role logins on the sign-in page. |
| `STATUS_EXPOSE_OTP` | Return subscription OTPs in API responses (testing). |

Sample-data generators are not included. Create development examples through the console on a disposable installation. These development flags do not populate a database or create accounts.

## Settings stored in the database (per organization or installation)

Managed in the UI and API, not env vars: page design/theme, custom CSS, announcements, retention overrides, identity connections (OIDC/SAML/SCIM), webhook endpoints, API keys (scopes, page restriction, expiry, CIDR allowlist), audit sinks.

**Default retention** (overridable per organization within platform bounds): monitor checks 90 days, analytics 90 days, notification logs 365 days, service status history 365 days, audit log 2,555 days (~7 years).

Retention is applied hourly by the worker. Analytics uses its calendar date, not its last edit time; metric points use their timestamp. The `resolvedIncidentsDays` field expires closed service status intervals; incident records and timelines are retained. Public pages independently default to a 90-day display window. Configure incident/maintenance history under **Appearance → Layout → History window** and publish the change. [Full retention and display rules](public-pages.md#stored-data-versus-public-display).

## Client IP and reverse proxies

SignalHub needs each visitor's address for rate limits (login, password reset, OTP, public reads), the API-key and `PLATFORM_ADMIN_ALLOWED_CIDRS` allowlists, and the addresses stored on sessions and audit logs.

The server always knows the address of the TCP connection. Behind a reverse proxy or CDN that address is the proxy's, and the visitor's real address arrives in the `X-Forwarded-For` header. That header is plain text any client can send, so it must only be believed when it came from your proxy. Pick how in **Platform administration → Configuration → Visitor addresses and reverse proxy**:

| Mode | Behaviour | Choose it when |
|---|---|---|
| **Auto** (default) | Trusts `X-Forwarded-For` only if the connection comes from a loopback or private address (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `fc00::/7`, ...). | Almost always: nginx, Caddy, Traefik, Docker, Kubernetes ingress, most PaaS load balancers. A visitor on the public internet cannot fake an address. |
| **On** | Always trusts `X-Forwarded-For`. | Your proxy or CDN reaches the server from a **public** address (Cloudflare straight to an origin, for example). Only safe if the proxy is the only way in. |
| **Off** | Never trusts forwarded headers. | Visitors connect straight to the server with no proxy. |

The page inspects your own request and shows the connection address, any forwarded header, recognised proxies (Cloudflare, AWS, Fly, Render, ...), whether a proxy appears to be in front, the address your request would be recorded as under each mode, and a recommendation with the reasons. For **On** and **Auto** it also detects how many proxies are in front; correct the **Proxies in front of this server** field if you know better (`1` for one proxy; a CDN in front of a load balancer is `2`). The Nth entry from the right of `X-Forwarded-For` is used, because each proxy appends the address it saw.

Things to know:

- **The environment wins.** `TRUST_PROXY_HEADERS` / `TRUSTED_PROXY_HOPS` override the admin page; it shows them as locked. Blank values count as unset.
- **Changes apply within 30 seconds** on every web replica (the saving replica applies it immediately). Each change is written to the platform audit log (`PROXY_TRUST_UPDATED`).
- **Lock-out guard.** If `PLATFORM_ADMIN_ALLOWED_CIDRS` is set, a change that would make your own address fall outside it is refused.
- **By default Auto trusts the whole private network, not one proxy.** Any machine that can connect from a private or loopback address (your LAN, VPN, VPC, or another container) can send its own `X-Forwarded-For` and be believed, which would let it dodge rate limits or pass an IP allowlist. To close that, pin **Trusted network ranges** to your proxy's network (the page offers a one-click suggestion such as `10.244.0.0/16`), or keep the app reachable only through your proxy with a firewall or network policy. `X-Real-IP` is trusted on the same terms. The default "private" ranges are loopback, `10/8`, `172.16/12`, `192.168/16`, `100.64/10` (CGNAT: Railway, Azure Container Apps, Tailscale), `169.254/16` (Cloud Run) and IPv6 `fc00::/7` and `fe80::/10`.
- **On with ranges** is the secure setup for a CDN that connects from public addresses: choose On, then list the CDN's published ranges so only it is believed.
- **Auto cannot see a public-address proxy.** If everyone shares one rate-limit allowance, or audit logs show the proxy's address, switch to On.
- **Run through the supervisor.** `start.mjs` / `npm run dev:all` stamps the real connection address on every request (`scripts/peer-address.mjs`). Started any other way (bare `next start`), the connection address is unknown and Auto falls back to `unknown`.
- **First-run setup** has no database yet, so only the environment variables apply there.
- `signalhubctl doctor` and `GET /api/platform/diagnostics` report the effective mode, hop count and where each came from.

### Layouts

| Layout | Choose | Notes |
|---|---|---|
| Local, or one server with nginx/Caddy on the same machine | **Auto** (nothing to set) | Keep the app on `127.0.0.1` (`STATUS_PORT` publishes it that way) and open only 80/443 in the firewall. With Docker, publish the port as `127.0.0.1:3301:3000`: Docker's userland proxy can make direct clients look like the Docker gateway. |
| Docker Compose with the Caddy overlay | **Auto** | The overlay no longer sets the variables. |
| Kubernetes behind an ingress controller | **Auto**, optionally pin the pod network | The image loads the connection-address module for every command, including `node server.js`; if you override `NODE_OPTIONS` in the manifest, append to it. If every visitor shows the same private address, the load balancer or `NodePort` is rewriting source addresses: use `externalTrafficPolicy: Local` or PROXY protocol, and see the NetworkPolicy example in `deploy/kubernetes/base/networkpolicy.yaml`. |
| Render, Railway, Fly.io, DigitalOcean App Platform, ECS, Cloud Run, Azure Container Apps | **Auto** | Their edges connect from private, CGNAT, link-local or unique-local addresses, which Auto covers. If every visitor still looks alike, open the page: it shows what it sees and recommends **On**. |
| Cloudflare or another CDN straight to your server | **On** + the CDN's ranges, 2 proxies if a load balancer is also in front | The CDN connects from a public address, so Auto ignores it. |
| No proxy, app port exposed | **Auto** (acts as Off) | No HTTPS, so not recommended for public use. |

## Runtime settings (managed in the admin console)

**Platform administration → Configuration → Runtime** shows system health and lets an administrator change installation settings. Changes apply on the saving server at once and on other servers within 30 seconds. Risky changes are reviewed and apply provisionally so an administrator can keep or undo them.

**Checks before anything is saved.** Every proposal is checked against what the server can see, live and again on Apply. *Errors* (an invalid value, or something that would lock you out, such as admin networks that exclude your own address or Secure cookies without HTTPS) block saving and usually offer a one-click fix. *Warnings* (forwarded addresses trusted with no proxy in front, a proxy in front but forwarded addresses ignored, a wrong proxy count, a public address that is not the one you are using, a private visitor address behind a proxy) must be ticked to accept. *Information* is advice. A configuration you insist on is applied: the app keeps working.

**Confirm or revert.** A change that could lock you out (proxy trust, public address, Secure cookies, admin networks) applies on trial. A banner with a two-minute countdown offers **Keep** or **Undo now**; if nobody presses Keep, any server (web or worker) restores the previous values and records `SETTINGS_REVERTED`. If the app can never become reachable again, see [break-glass](#when-the-admin-console-is-unreachable).

**Safe by construction.** Each saved value is re-validated when it is loaded; an unreadable or out-of-range value falls back to its default and the page says so. A missing public address does not stop the server: emails go out without links (creating an invitation asks for the address). The sign-in cookie is Secure when the site is served over HTTPS (the public address, or `X-Forwarded-Proto` from a trusted proxy), so a plain-HTTP intranet can still sign in; HSTS is sent only over HTTPS with an HTTPS public address, never because a public client claimed it.

### Settings and their overrides

| Setting | Default | Override | Notes |
|---|---|---|---|
| Public address | not set | `NEXT_PUBLIC_APP_URL` | Used in emails, invitations, single sign-on callbacks, embeds. The page offers the address you are using now. |
| Secure cookies | Auto (Secure on HTTPS) | | `Always` requires HTTPS. |
| HSTS | Auto (HTTPS public address and HTTPS request) | | Six-month `max-age`; browsers remember it. |
| Proxy trust, proxies in front, trusted ranges | Auto, 1, any private address | `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_HOPS`, `TRUSTED_PROXY_CIDRS` | See [Client IP and reverse proxies](#client-ip-and-reverse-proxies). |
| Platform administration networks | any | `PLATFORM_ADMIN_ALLOWED_CIDRS` | A malformed variable stays fail-closed: bad entries match nothing. |
| Sign out after inactivity / maximum session | 8 h / 7 d | `TENANT_SESSION_IDLE_SECONDS`, `TENANT_SESSION_ABSOLUTE_SECONDS` | Applies to new sessions. |
| Minimum password length | 14 | `PASSWORD_MIN_LENGTH` | 12 to 128. |
| Require authenticator codes (MFA) | off | | On: everyone must enroll an authenticator app and enter a code at sign-in; turning it on signs out all other sessions. Off: nobody is asked, devices are kept. Public status pages are never affected. See the [MFA guide](mfa.md). |
| Monitor private targets / ICMP / largest response | off / off / 1 MiB | `MONITOR_ALLOW_PRIVATE_TARGETS`, `MONITOR_ENABLE_ICMP`, `MONITOR_MAX_RESPONSE_BYTES` | |
| Worker sweep intervals, batch sizes, monitor concurrency | see [Monitoring and worker](#monitoring-and-worker) | the `WORKER_*` variables listed there | Applies on the worker's next round. Job-runner concurrency and poll interval are read at start and need a worker restart. |
| Rate limits | see below | `RATE_LIMIT_<ID>` | |

**Stays environment-only** (needed before the database is reachable, secret, or per-process tuning): `DATABASE_URL`, `DATABASE_SSL_CA`, `SESSION_SECRET`, `SESSION_SIGNING_KEYS`, `ENCRYPTION_KEY(S)`, the bootstrap administrator, `PORT`/`SIGNALHUB_HOST`, `WORKER_CONCURRENCY`, `WORKER_POLL_INTERVAL_MS`, `DATABASE_POOL_SIZE`, `LOG_LEVEL`, `OTEL_*`, `METRICS_TOKEN`, Argon2 cost. The page lists which of these are set (never their values).

### Abuse protection (rate limits)

Under **Configuration → Runtime → Abuse protection** every limit can be changed and takes effect on the very next request. Defaults are the values SignalHub shipped with, so upgrading changes nothing; each limit has a floor (for example per-account sign-in attempts cannot go below 3) so protection cannot be switched off, and a ceiling so a typo cannot make it meaningless.

| Limit (id) | Default | Range |
|---|---|---|
| Sign-in attempts per address (`login-ip`) | 20 per 15 min | 5 to 500 |
| Sign-in attempts per account (`login-account`) | 8 per 15 min | 3 to 50 |
| Password reset requests per address / per account (`password-reset-ip` / `password-reset-account`) | 10 per 15 min / 3 per hour | 3 to 100 / 1 to 20 |
| Password reset submissions per address (`password-reset-submit`) | 10 per 15 min | 3 to 100 |
| Invitation acceptances per address / per link (`accept-invite-ip` / `accept-invite-token`) | 20 / 8 per 15 min | 5 to 300 / 3 to 50 |
| Single sign-on starts (`oidc-start`, `enterprise-oidc-start`, `saml-start`) | 20 per 15 min | 5 to 300 |
| Sign-in method lookups (`identity-connection-discovery`) | 60 per 15 min | 10 to 600 |
| Private page password attempts (`page-access`) | 10 per 15 min | 3 to 100 |
| Subscriber code checks / requests / per contact (`otp-verify` / `subscription-ip` / `subscription-contact`) | 30 per 15 min / 10 per hour / 5 per hour | 5 to 300 / 2 to 200 / 1 to 50 |
| Public status / metric reads (`public-status` / `public-metric-window`) | 300 / 120 per minute | 30 to 6000 / 20 to 3000 |
| Page view events (`analytics`) | 120 per hour | 20 to 5000 |
| Component automation calls (`automation`) | 120 per minute | 10 to 6000 |
| Authenticator code attempts per address (`mfa-ip`) | 30 per 15 min | 5 to 300 |
| Authenticator actions per account (`mfa-account`) | 15 per 15 min | 3 to 100 |
| MFA removal requests per address / per account (`mfa-request-ip` / `mfa-request-account`) | 5 / 3 per hour | 1 to 50 / 1 to 20 |

Presets: **Standard** (defaults), **Relaxed** (five times the per-address limits, for many visitors behind one shared address such as a school, office or mobile carrier) and **Strict** (half). Presets never touch per-account, per-link or per-contact limits. To fix one in the deployment instead, set `RATE_LIMIT_<ID>=limit/seconds` with the id upper-cased and hyphens as underscores, for example `RATE_LIMIT_LOGIN_IP=40/900`; out-of-range values are clamped and unreadable ones ignored.

### When the admin console is unreachable

`signalhubctl settings` works from the command line:

```bash
signalhubctl settings show                 # every setting, its value and where it comes from
signalhubctl settings export > settings.json
signalhubctl settings import < settings.json   # validated completely first; nothing applies if any entry is invalid
signalhubctl settings reset --all          # or: reset --key hsts --key proxy --key rateLimits
```

Setting `SIGNALHUB_SAFE_MODE=true` makes a server ignore every saved value and use the defaults plus the environment, which is the way back in if a saved value somehow prevents sign-in. Remove it once you are in.

Incident records and timelines are retained; Admins and Incident Managers can hide and restore public visibility. Incident history is not removed by the retention sweep.

## Public documentation and Estora reference data

The [online documentation](https://signalhub.at/docs/) is maintained independently in the separate `signalhub.at` website project. For the configuration options in this application version, use this guide and [`.env.example`](../.env.example). The application remains on port 3301.

For documentation screenshots, follow the [Estora reference-data guidance](reference-data.md) using synthetic examples on a disposable local installation. All images are for reference only.
