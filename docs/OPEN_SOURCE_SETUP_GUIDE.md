# Setup and deployment guide

Everything you need to take SignalHub from `git clone` to a production status page: Docker Compose, TLS, first admin, email/SMS, Kubernetes, upgrades.

> Related docs: [Configuration reference](configuration.md) · [Security and data protection](security.md) · [Operations](operations.md) · [Helm chart](../deploy/helm/status/README.md)

**Contents**

1. [Architecture and requirements](#1-architecture-and-requirements)
2. [Generate secrets](#2-generate-secrets)
3. [Docker Compose install](#3-docker-compose-install)
4. [Create the first administrator](#4-create-the-first-administrator)
5. [Verify the install](#5-verify-the-install)
6. [Reverse proxy and TLS](#6-reverse-proxy-and-tls)
7. [First-run configuration](#7-first-run-configuration)
8. [Prebuilt container image](#8-prebuilt-container-image)
9. [Kubernetes and Helm installation](#9-kubernetes-and-helm-installation)
10. [Object storage and scaling](#10-object-storage-and-scaling)
11. [Upgrades and rollback](#11-upgrades-and-rollback)
12. [Backups](#12-backups)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Architecture and requirements

SignalHub is two processes sharing one PostgreSQL database:

| Process | What it does | Entry point |
|---|---|---|
| **web** | Next.js app: public status pages, admin UI, platform console, REST API | `node server.js` (port 3000 in the container) |
| **worker** | Graphile Worker: monitor checks, notification delivery, exports, audit delivery, maintenance transitions, retention | `node dist-runtime/worker.mjs` (health on port 8081) |
| **migrate** | One-shot job that applies SQL migrations before web/worker start | `node dist-runtime/migrate.mjs` |

The web process never runs background work itself; it enqueues jobs in the database and the worker picks them up. **If the worker is down, monitors stop running and no notifications are sent**, which is why web readiness depends on a recent worker heartbeat (`REQUIRE_WORKER=true`).

**Requirements**

| | Minimum | Notes |
|---|---|---|
| Docker | Engine 24+ with Compose v2 | for the Compose path |
| PostgreSQL | 18 | bundled in Compose (`postgres:18.4-alpine`); external for Kubernetes |
| Node.js | 22 | only for local development or building outside Docker |
| CPU / RAM | 2 vCPU / 2 GB | comfortable for dozens of pages and a few hundred monitors; scale the worker for more |
| Public DNS name + TLS | required for production | see [section 6](#6-reverse-proxy-and-tls) |

Outbound network access is needed from the **worker** for monitors, email/SMS providers and webhooks. Inbound access is needed only to the web port, through your reverse proxy.

---

## 2. Generate secrets

Two independent secrets are required. Never reuse one for the other.

```bash
git clone https://github.com/rameshbgm/signalhub.git
cd signalhub
cp .env.example .env

# paste the output of each into .env
openssl rand -base64 48   # SESSION_SECRET   (signs session JWTs)
openssl rand -base64 48   # ENCRYPTION_KEY   (AES-256-GCM key material for stored credentials and contacts)
openssl rand -base64 24   # POSTGRES_PASSWORD
```

Edit `.env`:

```ini
SESSION_SECRET=...
ENCRYPTION_KEY=...
POSTGRES_PASSWORD=...
# The public URL users will type. Use https:// in production.
NEXT_PUBLIC_APP_URL=https://status.example.com
```

> **Back up `ENCRYPTION_KEY`.** It protects subscriber contacts, SMTP/SMS credentials, TOTP secrets and monitor auth secrets. Losing it makes that data unrecoverable. For key rotation without downtime, see [Operations: rotating keys](operations.md#rotating-keys).

Docker Compose refuses to start if `POSTGRES_PASSWORD`, `SESSION_SECRET` or `ENCRYPTION_KEY` is missing.

---

## 3. Docker Compose install

```bash
docker compose up -d --build
docker compose ps
```

What happens, in order:

1. `postgres` starts and becomes healthy.
2. `migrate` builds the image and applies migrations, then exits.
3. `worker` starts and publishes a heartbeat (healthcheck `http://127.0.0.1:8081/ready`).
4. `web` starts once the worker is healthy and listens on **`127.0.0.1:3301`**.

Notes on the default Compose file:

- Web and Postgres are bound to `127.0.0.1` on purpose. Put a reverse proxy in front for public access ([section 6](#6-reverse-proxy-and-tls)).
- The `database` network is internal (no internet). Only web and worker join the `egress` network.
- Containers run as a non-root user with `cap_drop: ALL` and `no-new-privileges`.
- Branding uploads and exports are stored in PostgreSQL (`ASSET_STORAGE_DRIVER=db`), so the database backup covers them. Use S3 if you prefer an object store ([section 10](#10-object-storage-and-scaling)).
- ICMP (ping) monitors are **off** by default. See [ICMP monitors](configuration.md#monitoring-and-worker).

Change the host port with `STATUS_PORT` in `.env`.

---

## 4. Create the first administrator

There is no public sign-up. An administrator creates the first organization and user from the command line. Pipe the password so it never lands in shell history or the process list:

```bash
printf '%s' 'a-long-unique-initial-password' | docker compose exec -T web \
  node dist-runtime/bootstrap.mjs \
    --username admin \
    --name "Your Name" \
    --email you@example.com \
    --org-name "Your Company" \
    --org-slug your-company \
    --password-stdin
```

| Flag | Default | Meaning |
|---|---|---|
| `--username` | `admin` | Login User ID |
| `--name` | `Instance Administrator` | Display name |
| `--email` | (empty) | Contact email |
| `--org-name` | `Default Organization` | First organization |
| `--org-slug` | `default` | Lowercase letters, numbers, single hyphens |
| `--password-stdin` | n/a | Read password from stdin (preferred) |

The same values can come from `STATUS_BOOTSTRAP_EMAIL`, `STATUS_BOOTSTRAP_NAME`, `STATUS_BOOTSTRAP_ORG_NAME`, `STATUS_BOOTSTRAP_ORG_SLUG`. Bootstrap is idempotent on the org slug.

Sign in at `https://status.example.com/organization/login`. You must change the password and complete your profile at first login. Installation-level (platform) administration lives at `/organization/platform`.

---

## 5. Verify the install

```bash
curl -fsS http://127.0.0.1:3301/api/health/live    # process is up
curl -fsS http://127.0.0.1:3301/api/health/ready   # DB reachable, migrations current, worker heartbeat fresh

docker compose exec web node dist-runtime/signalhubctl.mjs preflight   # config sanity (secrets, URL, S3, proxy)
docker compose exec web node dist-runtime/signalhubctl.mjs doctor      # runtime checks
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

docker compose pull migrate        # the migrate service owns the image reference
docker compose up -d --no-build
```

> No tagged release exists yet in a fresh fork. Push a `v*` tag to your repository to produce the first image, or build locally as in section 3.

---

## 9. Kubernetes and Helm installation

The chart in [`deploy/helm/status`](../deploy/helm/status/README.md) deploys separate **web** and **worker** Deployments plus a pre-install/pre-upgrade **migration Job**. It does **not** bundle PostgreSQL or object storage.

Prerequisites: Kubernetes 1.27+, Helm 3, an ingress controller with TLS, PostgreSQL 18+ with TLS and backups, S3-compatible storage if you run more than one replica, and an image reachable from every node.

```bash
# 1. runtime secret (use your secret manager in production)
kubectl create namespace signalhub
kubectl -n signalhub create secret generic signalhub-production \
  --from-literal=DATABASE_URL='postgresql://signalhub:<password>@postgres.example:5432/signalhub?sslmode=require' \
  --from-literal=SESSION_SECRET="$(openssl rand -base64 48)" \
  --from-literal=ENCRYPTION_KEY="$(openssl rand -base64 48)" \
  --from-literal=S3_BUCKET=signalhub-assets \
  --from-literal=S3_REGION=us-east-1

# 2. values-production.yaml
cat > values-production.yaml <<'YAML'
image:
  repository: ghcr.io/rameshbgm/signalhub
  tag: "<version>"
replicaCount: 2
workerReplicaCount: 2
config:
  appUrl: https://status.example.com
  assetStorageDriver: s3
  trustProxyHeaders: "true"
  trustedProxyHops: "1"
secrets:
  existingSecret: signalhub-production
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: status.example.com
      paths: [{ path: /, pathType: Prefix }]
  tls:
    - secretName: signalhub-tls
      hosts: [status.example.com]
YAML

# 3. validate and install
helm lint deploy/helm/status -f values-production.yaml
helm upgrade --install signalhub deploy/helm/status -n signalhub -f values-production.yaml
kubectl -n signalhub rollout status deployment/signalhub-signalhub-web
kubectl -n signalhub rollout status deployment/signalhub-signalhub-worker

# 4. bootstrap the first administrator
printf '%s' '<initial-password>' | kubectl -n signalhub exec -i deploy/signalhub-signalhub-web -- \
  node dist-runtime/bootstrap.mjs --username admin --email you@example.com \
  --org-name "Your Company" --org-slug your-company --password-stdin
```

What the chart gives you: pod disruption budgets, optional HPA (70% CPU), zone topology spread, a default-on NetworkPolicy, non-root containers, and optional `worker.enableIcmp` (adds only `NET_RAW`). Full value reference, ingress options and upgrade notes are in the [chart README](../deploy/helm/status/README.md).

---

## 10. Object storage and scaling

| Setting | Single host (Compose) | Multiple replicas / hosts |
|---|---|---|
| `ASSET_STORAGE_DRIVER` | `db` (default) | `db` or `s3` |
| Web replicas | 1 | any |
| Worker replicas | 1 | any (jobs and sweeps are lease-based and idempotent) |

```ini
ASSET_STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com   # or MinIO / R2 / Spaces endpoint
S3_REGION=us-east-1
S3_BUCKET=signalhub-assets
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false                         # true for MinIO
```

Scaling knobs live in [`configuration.md`](configuration.md#monitoring-and-worker): `WORKER_MONITOR_CONCURRENCY`, `WORKER_NOTIFICATION_BATCH`, `DATABASE_POOL_SIZE`.

---

## 11. Upgrades and rollback

```bash
# 0. back up first (section 12)
git pull
docker compose build
docker compose up -d          # migrate runs first, then worker, then web
docker compose exec web node dist-runtime/signalhubctl.mjs migrate --check
```

- Migrations are plain, forward-only SQL files in `db/migrations/` applied by the `migrate` service (Helm: pre-upgrade hook). Treat a failed migration as a failed release; fix it before retrying.
- **Rollback** = restore the pre-upgrade database backup and redeploy the previous image. Do not run an older image against a newer schema.
- Pin images by tag or digest in production; do not track `latest`.

---

## 12. Backups

Back up PostgreSQL (and your S3 bucket if you use `s3`), and keep a copy of `ENCRYPTION_KEY` (or your keyring) stored separately. Details, restore drills and automation: [Operations: backup and restore](operations.md#backup-and-restore).

```bash
# quick logical backup from the bundled Postgres container
docker compose exec -T postgres pg_dump -U signalhub -Fc signalhub > signalhub-$(date +%F).dump
```

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker compose up` stops with "Set SESSION_SECRET in .env" | Required variable missing | Fill `SESSION_SECRET`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD` |
| Login loops or redirects to the wrong host | `NEXT_PUBLIC_APP_URL` doesn't match the URL in the browser | Set it to the exact public `https://` URL and restart |
| Everyone shares one IP / rate limits too aggressive | Proxy headers not trusted | `TRUST_PROXY_HEADERS=true` and correct `TRUSTED_PROXY_HOPS` |
| `/api/health/ready` returns not ready | Worker not running or migrations pending | `docker compose ps`, `docker compose logs worker migrate` |
| Monitors never run, subscribers get nothing | Worker down (platform console shows Worker: Stale) | Restart the worker; check logs |
| Emails not arriving | No SMTP configured | Platform console → Configuration; check Notification logs |
| ICMP monitors fail | Disabled or missing capability | `MONITOR_ENABLE_ICMP=true`; image includes `ping`; Helm: `worker.enableIcmp` |
| Monitor target rejected | SSRF guard blocks private/loopback ranges | Intended. Opt out only for trusted networks with `MONITOR_ALLOW_PRIVATE_TARGETS=true` |
| `preflight` warns about HTTPS | Production URL is `http://` | Terminate TLS and use `https://` |

Still stuck? Open an issue with the output of `docker compose logs --tail=200 web worker migrate` (redact secrets).
