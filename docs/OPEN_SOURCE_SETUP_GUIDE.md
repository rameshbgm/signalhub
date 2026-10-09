# Setup and deployment guide

Everything you need to take SignalHub from `git clone` to a production status page on a single host: installer, setup wizard, TLS, email/SMS, upgrades. For Kubernetes and cloud platforms see the [deployment overview](deploy/README.md).

> Related docs: [Configuration reference](configuration.md) · [Security and data protection](security.md) · [Operations](operations.md)

**Contents**

1. [Architecture and requirements](#1-architecture-and-requirements)
2. [Prepare a database](#2-prepare-a-database)
3. [Install](#3-install)
4. [The setup wizard](#4-the-setup-wizard)
5. [Verify the install](#5-verify-the-install)
6. [Reverse proxy and TLS](#6-reverse-proxy-and-tls)
7. [First-run configuration](#7-first-run-configuration)
8. [Prebuilt container image](#8-prebuilt-container-image)
9. [Scaling](#9-scaling)
10. [Upgrades and rollback](#10-upgrades-and-rollback)
11. [Backups](#11-backups)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture and requirements

SignalHub is two processes sharing one PostgreSQL database. In the default image a small supervisor, `dist-runtime/start.mjs`, runs migrations and then both processes in one container (Kubernetes runs them as separate pods):

| Process | What it does | Entry point |
|---|---|---|
| **web** | Next.js app: public status pages, admin UI, platform console, REST API | `node server.js` (port 3000 in the container) |
| **worker** | Graphile Worker: monitor checks, notification delivery, exports, audit delivery, maintenance transitions, retention | `node dist-runtime/worker.mjs` (health on port 8081) |
| **start** | Supervisor: applies migrations, generates first-boot secrets, runs the setup wizard until a database and administrator exist, then starts web and worker | `node dist-runtime/start.mjs` (the image's default command) |

The web process never runs background work itself; it enqueues jobs in the database and the worker picks them up. **If the worker is down, monitors stop running and no notifications are sent**, which is why web readiness depends on a recent worker heartbeat (`REQUIRE_WORKER=true`).

**Requirements**

| | Minimum | Notes |
|---|---|---|
| Docker | Engine 24+ with Compose v2.24+ | for the installer and Compose |
| PostgreSQL | 14 (tested with 18) | your own or managed; an optional bundled container exists for trials |
| Node.js | 22 | only for local development or building outside Docker |
| CPU / RAM | 2 vCPU / 2 GB | comfortable for dozens of pages and a few hundred monitors; scale the worker for more |
| Public DNS name + TLS | required for production | see [section 6](#6-reverse-proxy-and-tls) |

Outbound network access is needed from the **worker** for monitors, email/SMS providers and webhooks. Inbound access is needed only to the web port, through your reverse proxy.

---

## 2. Prepare a database

SignalHub keeps everything (pages, incidents, subscribers, uploaded images, exports) in **one PostgreSQL database**, which you choose. Create an empty database and a user that owns it:

```sql
CREATE USER signalhub WITH PASSWORD 'a-long-random-password';
CREATE DATABASE signalhub OWNER signalhub;
```

Managed databases (RDS, Cloud SQL, Azure, DigitalOcean, Neon, Supabase…) work as long as you use the **direct** connection, not a transaction pooler. Have the host, port, database, user, password and, if your provider uses a private CA, its CA certificate ready. The [database rules](deploy/README.md#database-rules-that-apply-everywhere) cover TLS and poolers.

Just trying SignalHub? Skip this: the installer can start a PostgreSQL container for you.

---

## 3. Install

```bash
git clone https://github.com/rameshbgm/signalhub.git
cd signalhub
./install.sh
```

The installer checks Docker, then asks:

| Question | Effect |
|---|---|
| Domain for HTTPS | Adds Caddy with automatic Let's Encrypt certificates (`deploy/compose/https.yml`). DNS must point at the host and ports 80/443 must be open. Leave empty to listen on `127.0.0.1:3301` only. |
| Bundled PostgreSQL? | Adds a PostgreSQL container (`deploy/compose/postgres.yml`) and offers it in the wizard. Default **no**: you enter your own database. |
| Browser or terminal setup | Where you enter the database and administrator (both use the same checks). |

It writes a small `.env` (which compose files to use, the domain, the image), pulls `ghcr.io/rameshbgm/signalhub:latest` (or builds locally if that is unavailable), starts the stack and prints the setup link and token. Re-running it is safe; flags make it non-interactive, for example `./install.sh --yes --domain status.example.com`. See `./install.sh --help`.

**Without the installer:** `docker compose up -d` works with no `.env` at all. Add overrides with `COMPOSE_FILE`, for example `COMPOSE_FILE=docker-compose.yml:deploy/compose/https.yml` and `DOMAIN=status.example.com` in `.env`.

Notes on the Compose setup:

- One `signalhub` service runs web, worker and migrations. Its `signalhub_data` volume holds `/app/data/signalhub.json`: the database connection you enter and the **session and encryption secrets generated on first start**. Back up this volume, or copy the values into environment variables (they always take precedence).
- The web port is bound to `127.0.0.1` unless the HTTPS override is used. Containers run as a non-root user with `cap_drop: ALL` and `no-new-privileges`.
- ICMP (ping) monitors are **off** by default. See [ICMP monitors](configuration.md#monitoring-and-worker).

---

## 4. The setup wizard

Until a database and an administrator exist, SignalHub serves only the setup wizard at `/setup`; every other page redirects there and the API answers `503 SETUP_REQUIRED`.

1. **Unlock.** Paste the one-time setup token. It proves you operate the server: the installer prints it, and it is in the logs and on the volume:
   ```bash
   docker compose logs signalhub | grep -A1 "SETUP TOKEN"
   docker compose exec signalhub cat /app/data/setup-token
   ```
2. **Database.** Enter host, port, database, user, password and the encryption mode (verify certificate, encrypt only, or off), or paste a connection URL. A custom CA can be pasted for RDS, Azure and Cloud SQL. **Test connection** reports, in plain language, whether it can connect and sign in, the PostgreSQL version, whether the user may create tables, and whether the database is empty, an existing SignalHub database (it will be upgraded) or holds other tables (you must confirm). Also confirm the **public URL**. Saving installs the schema; the page continues on its own.
3. **Administrator.** Organization name and ID, your name, email, User ID and password (at least `PASSWORD_MIN_LENGTH` characters, not containing your name or email). This account administers your organization and the installation. Download the **configuration backup** offered here.
4. **Done.** Sign in at `/login`.

**Terminal instead of browser:** `docker compose exec signalhub node dist-runtime/signalhubctl.mjs setup` asks the same questions (passwords are not echoed), then `docker compose restart signalhub`. For automation pass `--database-url`, `--admin-username`, `--admin-name`, `--admin-email`, `--org-name` and `--password-stdin`.

**No wizard at all:** set `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` and `STATUS_BOOTSTRAP_PASSWORD` (plus optional `STATUS_BOOTSTRAP_USERNAME`, `_EMAIL`, `_NAME`, `_ORG_NAME`, `_ORG_SLUG`). On an empty database the administrator is created on start and must change the password at first sign-in. In `.env` for Compose, use `SIGNALHUB_DATABASE_URL` and `SIGNALHUB_PUBLIC_URL` (so a development `DATABASE_URL` in the same file never leaks into the container).

**Database does not exist yet?** If the server is reachable but the database is missing, the wizard (and `signalhubctl setup`) offers **Create database**, which works when the user has the `CREATEDB` privilege.

**Start over.** Saved the wrong database? On the administrator step choose **Wrong database? Start over with a different one**; nothing in that database is deleted. From the command line, `signalhubctl setup --reset` forgets the saved connection (secrets are kept) and the next start runs the wizard again.

**Lost the setup token** (or someone else saw it)? `docker compose exec signalhub node dist-runtime/signalhubctl.mjs setup --new-token` prints a new one; the old one stops working immediately.

**Forgot a password later?** The sign-in page has **Forgot password?**: with email configured (Platform console → Configuration) and `NEXT_PUBLIC_APP_URL` set, users get a one-time link valid for 30 minutes. Without email, or for a locked-out administrator, the operator runs `signalhubctl reset-password --username USER_ID` (prints a temporary password that must be changed at sign-in; add `--clear-mfa` for a lost authenticator).

---

## 5. Verify the install

```bash
curl -fsS http://127.0.0.1:3301/api/health/live    # process is up
curl -fsS http://127.0.0.1:3301/api/health/ready   # DB reachable, migrations current, worker heartbeat fresh

docker compose exec signalhub node dist-runtime/signalhubctl.mjs preflight   # config sanity (secrets, URL, proxy)
docker compose exec signalhub node dist-runtime/signalhubctl.mjs doctor      # runtime checks
```

`preflight` flags problems such as `SESSION_SECRET` shorter than 32 characters, a non-HTTPS `NEXT_PUBLIC_APP_URL` in production, or `TRUST_PROXY_HEADERS=true` without an explicit `TRUSTED_PROXY_HOPS`.

In the platform console (`/organization/platform`), the overview should show **Database: Reachable**, **Migrations: Current** and **Worker: Ready**:

![Platform overview](screenshots/platform-overview.png)

---

## 6. Reverse proxy and TLS

Terminate TLS in front of SignalHub. Whichever proxy you use, set these in `.env` and restart:

```ini
NEXT_PUBLIC_APP_URL=https://status.example.com   # canonical public URL; login breaks if this is wrong
TRUST_PROXY_HEADERS=true                         # honour X-Forwarded-* from your proxy
TRUSTED_PROXY_HOPS=1                             # number of proxies between the internet and the app
```

Only enable `TRUST_PROXY_HEADERS` when the app is reachable **only** through your proxy; otherwise clients can spoof their IP and bypass rate limits and CIDR allowlists.

### Caddy (automatic HTTPS)

```caddyfile
status.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3301
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name status.example.com;

    ssl_certificate     /etc/letsencrypt/live/status.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/status.example.com/privkey.pem;

    client_max_body_size 10m;   # branding uploads

    location / {
        proxy_pass http://127.0.0.1:3301;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name status.example.com;
    return 301 https://$host$request_uri;
}
```

Optionally restrict the installation console to your office or VPN: `PLATFORM_ADMIN_ALLOWED_CIDRS=203.0.113.0/24,10.0.0.0/8` (IPv4 CIDRs; requires correct proxy settings above).

---

## 7. First-run configuration

Done in the UI, no restart needed.

1. **Email delivery** (platform console, **Configuration**). Pick a preset (Amazon SES, Brevo, Mailgun, Postmark, Resend, SendGrid, Microsoft 365, Gmail, and more) or a custom SMTP server. Without it, subscribers cannot receive email.
2. **SMS delivery** (optional, same page). Twilio, Vonage, Plivo, Telnyx, Sinch, ClickSend, Textmagic, Africa's Talking.
3. **Team destinations** (optional). Enable the chat/on-call channels your teams use (Slack, Teams, Discord, PagerDuty, Opsgenie, ntfy and more).
4. **Create your first page** (**Pages → New page**), add components, then add monitors so components update themselves.
5. **Invite your team** (platform console → **Users & Roles**). Roles: Admin, Incident Manager, Responder, Viewer.

![Platform users and roles](screenshots/platform-users-roles.png)

6. **Single sign-on** (optional). Platform console → **Identity**: OIDC, SAML 2.0 and SCIM 2.0 provisioning, per organization or installation-wide.

Legacy `SMTP_*` and `TWILIO_*` environment variables are imported **once** by `db:migrate` for upgrades and then ignored; manage providers in the console.

---

## 8. Prebuilt container image

Tagged releases (`v*`) are built by [`release.yml`](../.github/workflows/release.yml) as a multi-arch (amd64 + arm64) image published to GitHub Container Registry with an SBOM and build provenance, and signed with cosign.

```bash
docker pull ghcr.io/rameshbgm/signalhub:<version>

# verify the signature (keyless, from the GitHub Actions workflow identity)
cosign verify ghcr.io/rameshbgm/signalhub:<version> \
  --certificate-identity-regexp 'https://github.com/rameshbgm/signalhub/.github/workflows/release.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

To run Compose from the prebuilt image instead of building locally:

```bash
# .env
STATUS_IMAGE=ghcr.io/rameshbgm/signalhub:<version>

docker compose pull signalhub
docker compose up -d --no-build
```

> No tagged release exists yet in a fresh fork. Push a `v*` tag to your repository to produce the first image, or let `install.sh` build locally.

---

## 9. Scaling

Web and worker replicas can be scaled freely: they share one PostgreSQL database (including uploaded images and exports), and jobs and sweeps are lease-based and idempotent. On one host, run more `signalhub` containers against the same database with environment variables (not the wizard's file); across hosts use the [Kubernetes manifests](deploy/kubernetes.md) or a [cloud platform](deploy/README.md).

Scaling knobs live in [`configuration.md`](configuration.md#monitoring-and-worker): `WORKER_MONITOR_CONCURRENCY`, `WORKER_NOTIFICATION_BATCH`, `DATABASE_POOL_SIZE`.

---

## 10. Upgrades and rollback

```bash
# 0. back up first (section 11)
git pull
docker compose build
docker compose up -d          # start.mjs migrates before starting web and worker
docker compose exec signalhub node dist-runtime/signalhubctl.mjs migrate --check
```

- Migrations are plain, forward-only SQL files in `db/migrations/` applied on every start by `start.mjs` (serialized with an advisory lock, so several replicas are safe). Treat a failed migration as a failed release; fix it before retrying.
- **Rollback** = restore the pre-upgrade database backup and redeploy the previous image. Do not run an older image against a newer schema.
- Pin images by tag or digest in production; do not track `latest`.

---

## 11. Backups

Back up PostgreSQL (it holds uploaded images and exports too), and keep a copy of `ENCRYPTION_KEY` (or your keyring) stored separately. Details, restore drills and automation: [Operations: backup and restore](operations.md#backup-and-restore).

```bash
# logical backup (works from any host with PostgreSQL client tools)
pg_dump -Fc "$DATABASE_URL" > signalhub-$(date +%F).dump

# configuration and generated secrets (wizard installs)
docker compose cp signalhub:/app/data/signalhub.json ./signalhub-config-$(date +%F).json
```

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Every page redirects to `/setup` | No database or no administrator yet | Finish the wizard; the token is in `docker compose logs signalhub` |
| Wizard: "does not accept TLS" | Database without TLS on a private network | Choose encryption **Disabled** (only on a private network) |
| Wizard: "certificate is not trusted" | Provider uses a private CA | Paste the provider's CA certificate in the wizard (`DATABASE_SSL_CA`) |
| Wizard: "looks like a transaction pooler" | Pooled connection string | Use the direct connection (often port 5432) |
| Bundled database: "Set POSTGRES_PASSWORD in .env" | `deploy/compose/postgres.yml` without a password | Re-run `./install.sh` or set `POSTGRES_PASSWORD` |
| Login loops or redirects to the wrong host | `NEXT_PUBLIC_APP_URL` doesn't match the URL in the browser | Set it to the exact public `https://` URL and restart |
| Everyone shares one IP / rate limits too aggressive | Proxy headers not trusted | `TRUST_PROXY_HEADERS=true` and correct `TRUSTED_PROXY_HOPS` |
| `/api/health/ready` returns not ready | Worker not running or migrations pending | `docker compose ps`, `docker compose logs signalhub` |
| Monitors never run, subscribers get nothing | Worker down (platform console shows Worker: Stale) | Restart the worker; check logs |
| Emails not arriving | No SMTP configured | Platform console → Configuration; check Notification logs |
| ICMP monitors fail | Disabled or missing capability | `MONITOR_ENABLE_ICMP=true`; image includes `ping` |
| Monitor target rejected | SSRF guard blocks private/loopback ranges | Intended. Opt out only for trusted networks with `MONITOR_ALLOW_PRIVATE_TARGETS=true` |
| `preflight` warns about HTTPS | Production URL is `http://` | Terminate TLS and use `https://` |

Still stuck? Open an issue with the output of `docker compose logs --tail=200 web worker migrate` (redact secrets).
