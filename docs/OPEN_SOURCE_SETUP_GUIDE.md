# SignalHub: Open-Source Enterprise Setup Guide

This guide takes an installation from an empty host or Kubernetes namespace to
a hardened, observable, recoverable SignalHub deployment. It covers the web
application, background worker, PostgreSQL, object storage, identity providers,
notification providers, audit delivery, metrics, tracing, backups, upgrades,
and validation.

The public project landing page is [signalhub.at](https://signalhub.at).

> SignalHub is Apache-2.0 software. There is no license server, feature key, usage
> metering, or phone-home requirement. Operating it safely remains the
> responsibility of the organization running it.

## 1. Choose a deployment profile

| Profile | Recommended use | Application topology | Data topology |
| --- | --- | --- | --- |
| Local development | Engineering and evaluation | One Next.js development process; optional worker | Local PostgreSQL instance; local uploads |
| Docker Compose | Pilot, lab, or controlled single-host production | Web, worker, migration job, and PostgreSQL containers | Persistent Docker volumes; optional S3-compatible object storage |
| Kubernetes | Enterprise production and horizontal scale | Multiple web and worker replicas plus a Helm migration hook | External highly available PostgreSQL cluster and S3-compatible object storage |

For an enterprise production deployment, use Kubernetes or an equivalent
orchestrator, an external highly available PostgreSQL cluster, external object storage, an
external secrets manager, TLS ingress, centralized logs, metrics, and tested
backup restoration.

## 2. Tools and infrastructure

### Required for every deployment

- A DNS name such as `signalhub.at`.
- TLS termination at a trusted reverse proxy or ingress controller.
- PostgreSQL 18 or newer with durable storage. Lifecycle, authorization, audit,
  and cascade workflows rely on ACID transactions and row-level locking.
- Two independent high-entropy secrets:
  - `SESSION_SECRET` for signed session tokens.
  - `ENCRYPTION_KEY` for encrypted provider credentials and MFA material.
- An SMTP relay if email subscriptions and incident email delivery are needed.

### Docker Compose path

- Docker Engine with the Compose v2 plugin.
- `openssl` or an equivalent cryptographic random generator.
- PostgreSQL client tools on the backup operator host for `pg_dump` and
  `pg_restore`.
- A reverse proxy such as NGINX, Caddy, HAProxy, Traefik, or an enterprise load
  balancer.

### Kubernetes path

- Kubernetes 1.27 or newer. The bundled chart declares this minimum.
- Helm 3 and `kubectl`.
- An ingress controller and certificate automation or enterprise TLS
  termination.
- An external highly available PostgreSQL cluster.
- S3-compatible object storage.
- A Kubernetes Secret created by an external secrets workflow where possible.
- Optional Prometheus-compatible scraping and an OTLP-compatible tracing
  collector.

### Application build and development tools

- Node.js 22 and npm.
- TypeScript, Next.js, React, Tailwind CSS, Vitest, Playwright, and esbuild are
  installed by `npm ci`.
- The runtime image uses Node.js 22 Alpine and runs as an unprivileged user.

## 3. Repository layout

| Path | Purpose |
| --- | --- |
| `app/` | Next.js public pages, tenant console, platform console, and APIs |
| `components/` | Shared tenant, platform, public, and landing components |
| `lib/` | Authentication, identity, authorization, encryption, audit, storage, and domain services |
| `worker/` | Monitoring, notification, export, retention, audit, and lifecycle worker |
| `scripts/` | Bootstrap, migration, development seed, and `signalhubctl` operator commands |
| `deploy/helm/status/` | Production Helm chart |
| `docker-compose.yml` | Single-host deployment topology |
| `.env.example` | Complete configuration reference |
| `.github/workflows/` | Quality, container, Helm, end-to-end, and signed release automation |

## 4. Clone, verify, and build SignalHub

### 4.1 Clone into an organization-owned repository

Fork `rameshbgm/signalhub` into the organization's source-control account when
the organization needs its own review, release, and patch process. Otherwise,
clone the upstream repository directly:

```bash
git clone https://github.com/rameshbgm/signalhub.git
cd signalhub
git remote -v
git switch main
```

For an organization fork, keep `origin` pointed at the fork and add the public
project as a read-only upstream:

```bash
git remote add upstream https://github.com/rameshbgm/signalhub.git
git fetch upstream --tags
```

Pin production deployments to a reviewed release tag or immutable commit, not
to a moving branch. Record the source commit beside the image digest in the
organization's change record.

### 4.2 Verify the source checkout

Install exactly the locked dependency tree and run the repository gates:

```bash
node --version
npm --version
npm ci
npm run verify
```

The supported build uses Node.js 22. Review dependency-audit findings,
container findings, and any local changes before producing a release.

### 4.3 Build and publish the runtime image

The final Docker stage contains the standalone Next.js server, worker,
migration/bootstrap/operator commands, public assets, and production
dependencies. Build the same image once and promote its digest through
environments:

```bash
docker build --target runtime \
  --label org.opencontainers.image.revision="$(git rev-parse HEAD)" \
  -t registry.example.com/operations/signalhub:1.0.0 .
docker image inspect registry.example.com/operations/signalhub:1.0.0
docker push registry.example.com/operations/signalhub:1.0.0
```

Use a private registry when policy requires it and configure the runtime or
Kubernetes namespace with the corresponding pull identity. Prefer an immutable
digest for production rollouts.

## 5. Generate and manage secrets

Generate independent values:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 32
```

Use the first two values for `SESSION_SECRET` and `ENCRYPTION_KEY`. The third can
be used for `METRICS_TOKEN`. Do not reuse values across environments.

For rotation without immediately invalidating old material, configure JSON
keyrings:

```dotenv
SESSION_SIGNING_KEYS={"2026-07":"new-session-secret","2026-01":"old-session-secret"}
SESSION_ACTIVE_KEY_ID=2026-07
ENCRYPTION_KEYS={"2026-07":"new-encryption-secret","2026-01":"old-encryption-secret"}
ENCRYPTION_ACTIVE_KEY_ID=2026-07
```

The active key writes new material while all configured keys remain readable.
After rotating encrypted data with `signalhubctl`, remove the retired key only
after confirming no record depends on it.

Never commit `.env`, exported credentials, SCIM tokens, API keys, IdP secrets,
SMTP passwords, object-storage credentials, or backup archives.

## 6. Cloud-provider deployment blueprints

SignalHub does not depend on a cloud-specific control plane. Every production
topology must provide the same contracts:

1. One release image used by the migration job, web service, worker service,
   and operator commands.
2. A PostgreSQL 18 or newer writable primary reached through `DATABASE_URL`.
3. At least one long-running web process and one long-running worker process.
4. One migration execution before new web and worker processes become ready.
5. Durable local asset storage for one replica, or S3-compatible object storage
   for multiple replicas.
6. TLS, DNS, runtime secrets, outbound provider access, logs, metrics, backups,
   and tested restoration.

If a managed database offering does not yet provide the PostgreSQL version
required by this release, run a supported PostgreSQL cluster separately or
select another compatible service. Do not silently deploy against an older
major version.

### 6.1 AWS

Recommended managed mapping:

| SignalHub need | AWS service choice |
| --- | --- |
| Container registry | Amazon ECR |
| Kubernetes or containers | Amazon EKS with the bundled Helm chart; ECS or EC2 with equivalent web/worker/migration separation |
| PostgreSQL | Amazon RDS for PostgreSQL or Aurora PostgreSQL only when it meets the required major version and behavior |
| Shared assets | Amazon S3 |
| Secrets | AWS Secrets Manager or SSM Parameter Store |
| TLS and routing | Route 53, ACM, and an ALB/NLB or cluster ingress |
| Email and observability | Amazon SES or approved SMTP; CloudWatch and/or an OTLP collector |

Deployment sequence:

1. Create private application/database subnets and permit PostgreSQL only from
   the SignalHub workload security group.
2. Create the database, database user, encrypted backups, deletion protection,
   and a tested restore target. Build a TLS `DATABASE_URL`.
3. Create a private S3 bucket with public access blocked, encryption,
   versioning, and lifecycle policy. Grant only the required object operations.
4. Build the image, push it to ECR, and record the digest.
5. Store `DATABASE_URL`, signing/encryption material, metrics token, and
   provider credentials in the approved secret store. The S3 client uses the
   AWS SDK default credential chain when explicit `S3_ACCESS_KEY_ID` and
   `S3_SECRET_ACCESS_KEY` values are absent, so an ECS task role or EKS workload
   role is preferred over static AWS keys.
6. On EKS, create the external Secret and install the Helm chart from section
   9. On ECS, define separate services using `node server.js` and
   `node dist-runtime/worker.mjs`, plus a one-shot deployment task using
   `node dist-runtime/migrate.mjs`.
7. Route HTTPS to web port `3000`; keep worker port `8081` and the database
   private. Configure `NEXT_PUBLIC_APP_URL`, proxy trust, and DNS.
8. Run bootstrap once, validate both health endpoints, send a test email, run a
   test monitor, and restore a backup into an isolated database.

### 6.2 Microsoft Azure

Recommended managed mapping:

| SignalHub need | Azure service choice |
| --- | --- |
| Container registry | Azure Container Registry |
| Kubernetes or host | AKS with Helm; Azure VM/VM Scale Set with Docker Compose |
| PostgreSQL | Azure Database for PostgreSQL Flexible Server only when it meets the required major version and behavior |
| Shared assets | An S3-compatible object store reachable from Azure |
| Secrets | Azure Key Vault with an external-secrets or deployment integration |
| TLS and routing | Azure DNS with Application Gateway, Front Door, or cluster ingress |
| Email and observability | Approved SMTP service; Azure Monitor and/or an OTLP collector |

SignalHub currently implements `local` and `s3` asset drivers. Azure Blob
Storage is not a native driver. For multiple replicas, deploy or procure an
S3-compatible service; do not substitute Blob connection settings for `S3_*`.

Deployment sequence:

1. Create a virtual network with private database access and controlled
   outbound access for monitors, identity, SMTP, webhooks, and telemetry.
2. Provision PostgreSQL, require TLS, enable backups and high availability as
   policy requires, and test name resolution from the workload subnet.
3. Provision the S3-compatible asset store and least-privilege credentials, or
   use persistent local storage only for a deliberately single-replica VM.
4. Push the reviewed image to ACR and grant the AKS cluster or VM identity pull
   access.
5. Materialize the SignalHub Secret from Key Vault. Use distinct secrets per
   environment and never put secret values in Helm values committed to Git.
6. For AKS, install the chart from section 9. For a VM, follow sections 7 and 8
   and keep Compose ports on loopback behind the Azure load balancer or proxy.
7. Configure the public origin, proxy hop count, certificate, DNS, health
   probes, autoscaling, and availability zones.
8. Bootstrap once and complete the runtime and recovery acceptance checks.

### 6.3 Google Cloud Platform

Recommended managed mapping:

| SignalHub need | Google Cloud service choice |
| --- | --- |
| Container registry | Artifact Registry |
| Kubernetes or host | GKE with Helm; Compute Engine with Docker Compose |
| PostgreSQL | Cloud SQL for PostgreSQL only when it meets the required major version and behavior, or a compatible PostgreSQL service |
| Shared assets | An S3-compatible object store reachable from GCP |
| Secrets | Secret Manager with an external-secrets or deployment integration |
| TLS and routing | Cloud DNS and a Google Cloud or GKE HTTPS load balancer |
| Email and observability | Approved SMTP relay; Cloud Logging/Monitoring and/or OTLP |

SignalHub does not implement the native Google Cloud Storage JSON API. Use the
implemented S3 client against a validated S3-compatible endpoint or select an
S3-compatible object service. Treat interoperability modes as a production
dependency and test upload, download, delete, and signed access before launch.

Deployment sequence:

1. Create the VPC, private database path, workload identities, firewall rules,
   and approved egress path.
2. Provision compatible PostgreSQL with TLS, automated backups, point-in-time
   recovery, and an isolated restore drill.
3. Provision and validate S3-compatible shared asset storage.
4. Build the reviewed image, publish it to Artifact Registry, and pin the
   deployment to the digest.
5. Deliver runtime values from Secret Manager into the namespace or VM without
   checking them into source control.
6. Install on GKE using section 9, or on Compute Engine using sections 7 and 8.
7. Configure HTTPS, DNS, health checks, canonical URL, proxy trust, logging,
   metrics, alerts, and outbound notification access.
8. Bootstrap once and execute the functional acceptance checklist.

### 6.4 Other clouds and VPS providers

The Docker Compose path works on a Linux VPS from providers such as
DigitalOcean, Hetzner, Linode/Akamai, OVHcloud, Oracle Cloud, or an on-premises
virtualization platform. The provider name is not significant; the runtime
contracts above are.

1. Create a dedicated Linux host with persistent storage, time synchronization,
   automatic security updates, and enough memory for PostgreSQL, web, worker,
   image builds, and backup jobs.
2. Create DNS records, then allow inbound SSH from an administrative network
   and HTTPS from intended audiences. Do not expose PostgreSQL or port `3301`
   publicly.
3. Install Docker Engine, Compose v2, Git, OpenSSL, and PostgreSQL client tools.
4. Clone a pinned release, copy `.env.example` to `.env`, generate secrets, and
   set a unique `POSTGRES_PASSWORD` in addition to the application secrets.
5. Follow section 7 to start and bootstrap the application.
6. Put Caddy, NGINX, HAProxy, or Traefik in front of `127.0.0.1:3301`; obtain a
   certificate and configure the canonical URL and proxy trust.
7. Send encrypted database and asset backups to a different failure domain.
8. Configure host, container, certificate-expiry, disk, queue, worker, and
   external status-page alerts; then perform a restore drill.

For higher availability, move PostgreSQL and assets off the single host and use
Kubernetes or another orchestrator that preserves the separate migration,
web, and worker process model.

## 7. Docker Compose installation

### 7.1 Configure the instance

```bash
cp .env.example .env
```

At minimum, set:

```dotenv
SESSION_SECRET=<independent-random-value>
ENCRYPTION_KEY=<independent-random-value>
POSTGRES_PASSWORD=<independent-database-password>
NEXT_PUBLIC_APP_URL=https://signalhub.at
ALLOW_PUBLIC_SIGNUP=false
STATUS_PORT=3301
REQUIRE_WORKER=true
```

Keep `ENABLE_DEV_QUICK_LOGIN=false` and `ALLOW_DEV_SEED=false` in every shared
or production environment.

### 7.2 Start the stack

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Compose starts:

1. PostgreSQL with a persistent volume.
2. The idempotent migration job.
3. The background worker.
4. The web process after migrations and worker health succeed.

The default web and PostgreSQL ports bind to `127.0.0.1`. Expose the application
through the TLS reverse proxy, not by changing the binding to all interfaces.

### 7.3 Bootstrap the first administrator

Configure the `STATUS_BOOTSTRAP_*` values in `.env`, then pipe the password over
standard input:

```bash
printf '%s' 'a-unique-long-password' \
  | docker compose exec -T web \
      node dist-runtime/bootstrap.mjs --password-stdin
```

The bootstrap creates or updates the initial organization and its first unified
`ADMIN` identity in one transaction. That Admin can manage the organization and
the installation-management area exposed under `/organization/platform`. The
account must change its bootstrap password and complete its profile at first
sign-in. Run bootstrap only through the approved initialization procedure.

### 7.4 Confirm health

```bash
curl -fsS https://signalhub.at/api/health/live
curl -fsS https://signalhub.at/api/health/ready
docker compose logs --tail=100 web worker migrate
```

Readiness requires:

- Database connectivity.
- Current migrations.
- A recent ready worker heartbeat when `REQUIRE_WORKER=true`.

The response also reports provider and storage configuration without returning
credentials.

## 8. Reverse proxy and DNS

Create an `A`, `AAAA`, or internal load-balancer record for the canonical
application hostname. Terminate TLS at the proxy and forward:

- `Host`
- `X-Forwarded-Proto`
- The client address chain only when proxy trust is deliberately enabled.

Set:

```dotenv
NEXT_PUBLIC_APP_URL=https://signalhub.at
TRUST_PROXY_HEADERS=true
TRUSTED_PROXY_HOPS=1
```

`TRUSTED_PROXY_HOPS` must match the actual number of controlled proxy hops. Do
not trust forwarded headers when clients can reach the application directly.
Set `PLATFORM_ADMIN_ALLOWED_CIDRS` to restrict the platform console to approved
administrative networks.

Custom status domains must resolve to the same proxy. Preserve their original
host header so SignalHub can route public pages, incident details, history, feeds,
and access challenges.

Recommended proxy controls:

- TLS 1.2 or newer.
- HSTS after confirming every hostname is HTTPS-ready.
- Request-body limits.
- Edge rate limits for login and subscription endpoints.
- WebSocket support for local development only.
- Access logs with request IDs and secret redaction.

## 9. Kubernetes and Helm installation

### 9.1 Create the namespace and Secret

```bash
kubectl create namespace signalhub
kubectl -n signalhub create secret generic signalhub-production \
  --from-literal=DATABASE_URL='postgresql://signalhub:<password>@postgres-primary.example.net:5432/signalhub?sslmode=require' \
  --from-literal=SESSION_SECRET='<session-secret>' \
  --from-literal=ENCRYPTION_KEY='<encryption-secret>' \
  --from-literal=METRICS_TOKEN='<metrics-token>' \
  --from-literal=S3_BUCKET='signalhub-assets' \
  --from-literal=S3_REGION='us-east-1' \
  --from-literal=S3_ACCESS_KEY_ID='<access-key>' \
  --from-literal=S3_SECRET_ACCESS_KEY='<secret-key>'
```

Prefer an external secret controller, sealed-secret workflow, or platform
secret manager instead of an imperative command in production.

The existing Secret can also hold:

- `SESSION_SIGNING_KEYS`
- `SESSION_ACTIVE_KEY_ID`
- `ENCRYPTION_KEYS`
- `ENCRYPTION_ACTIVE_KEY_ID`
- `OTEL_EXPORTER_OTLP_HEADERS`
- SMTP, SMS, identity-provider, and object-storage credentials

### 9.2 Create a values override

```yaml
image:
  repository: ghcr.io/your-org/signalhub
  tag: "1.0.0"

replicaCount: 3
workerReplicaCount: 2

config:
  appUrl: https://signalhub.at
  assetStorageDriver: s3
  requireWorker: "true"
  trustProxyHeaders: "true"
  trustedProxyHops: "1"
  platformAdminAllowedCidrs: "10.20.0.0/16"
  otlpEndpoint: https://otel-collector.observability.svc:4318

secrets:
  existingSecret: signalhub-production

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: signalhub.at
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: signalhub-tls
      hosts: [signalhub.at]

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

### 9.3 Validate and install

```bash
helm lint deploy/helm/status -f values-production.yaml
helm template signalhub deploy/helm/status -f values-production.yaml > /tmp/signalhub-rendered.yaml
helm upgrade --install signalhub deploy/helm/status \
  --namespace signalhub \
  --create-namespace \
  -f values-production.yaml
kubectl -n signalhub rollout status deployment/signalhub-signalhub-web
kubectl -n signalhub rollout status deployment/signalhub-signalhub-worker
```

The chart includes:

- A pre-install and pre-upgrade migration Job.
- Separate web and worker Deployments.
- Readiness, liveness, and startup probes.
- Restricted security contexts, dropped capabilities, and read-only root filesystems.
- Pod disruption budgets.
- Optional horizontal autoscaling.
- Topology spread.
- NetworkPolicy.

The default egress policy is intentionally broad because monitors, identity
providers, notification providers, object storage, audit sinks, and telemetry
collectors may be external. Replace it with approved CIDRs and platform-specific
egress controls.

## 10. Configuration reference

### Core and database

| Variable | Purpose | Production guidance |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection URI | Use TLS, authentication, high availability, and least-privilege database credentials |
| `SESSION_SECRET` | Legacy and baseline session signing key | Minimum 32 characters; keep during keyring rotation until old sessions expire |
| `ENCRYPTION_KEY` | Baseline encrypted-secret key material | Store separately from the database |
| `SESSION_SIGNING_KEYS` | JSON signing-key ring | Use stable key IDs and overlap old/new keys during rotation |
| `ENCRYPTION_KEYS` | JSON encryption-key ring | Rotate records with `signalhubctl` before retiring old keys |
| `NEXT_PUBLIC_APP_URL` | Canonical external origin | HTTPS URL |
| `ALLOW_PUBLIC_SIGNUP` | Public organization creation | Keep `false` unless intentionally offering self-registration |

### Authentication and network policy

| Variable | Default | Purpose |
| --- | --- | --- |
| `PASSWORD_MIN_LENGTH` | `14` | New local password minimum, bounded by application policy |
| `ARGON2_MEMORY_KIB` | `19456` | Argon2id memory cost |
| `ARGON2_TIME_COST` | `2` | Argon2id iterations |
| `ARGON2_PARALLELISM` | `1` | Argon2id parallelism |
| `TENANT_SESSION_IDLE_SECONDS` | `28800` | Tenant idle timeout |
| `TENANT_SESSION_ABSOLUTE_SECONDS` | `604800` | Tenant absolute timeout |
| `PLATFORM_SESSION_IDLE_SECONDS` | `3600` | Platform-admin idle timeout |
| `PLATFORM_SESSION_ABSOLUTE_SECONDS` | `43200` | Platform-admin absolute timeout |
| `TRUST_PROXY_HEADERS` | `false` | Enables proxy-derived client addresses |
| `TRUSTED_PROXY_HOPS` | `1` | Number of controlled proxy hops |
| `PLATFORM_ADMIN_ALLOWED_CIDRS` | empty | Optional platform-console network allowlist |

### Delivery

| Variables | Purpose |
| --- | --- |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | Email verification and incident notification |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Optional SMS subscriptions and delivery |
| `WEBHOOK_TIMEOUT_MS` | Outbound webhook timeout |

### Storage

| Variable | Purpose |
| --- | --- |
| `ASSET_STORAGE_DRIVER` | `local` for one host or `s3` for shared storage |
| `ASSET_LOCAL_DIR` | Persistent local upload directory |
| `S3_ENDPOINT` | Optional custom S3-compatible endpoint |
| `S3_REGION`, `S3_BUCKET` | Object-storage location |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Object-storage credentials |
| `S3_FORCE_PATH_STYLE` | Compatibility mode for some S3 providers |

### Monitoring, workers, and telemetry

| Variable | Purpose |
| --- | --- |
| `MONITOR_ALLOW_PRIVATE_TARGETS` | Permits monitors to reach private networks; disabled by default |
| `MONITOR_ENABLE_ICMP` | Enables ICMP checks where container permissions permit |
| `MONITOR_MAX_RESPONSE_BYTES` | Bounds downloaded monitor response data |
| `MONITOR_HISTORY_RETENTION_DAYS` | Baseline monitor-history retention |
| `WORKER_CONCURRENCY` | Concurrent Graphile jobs per worker process |
| `WORKER_POLL_INTERVAL_MS` | Graphile fallback polling interval; PostgreSQL notifications normally wake jobs immediately |
| `WORKER_HEARTBEAT_INTERVAL_MS` | SignalHub worker readiness heartbeat interval |
| `WORKER_MONITOR_CONCURRENCY` | Concurrent monitor checks |
| `WORKER_NOTIFICATION_BATCH` | Notification batch size |
| `WORKER_AUDIT_DELIVERY_BATCH` | Audit sink delivery batch size |
| `WORKER_PLATFORM_JOB_BATCH` | Platform lifecycle job batch size |
| `REQUIRE_WORKER` | Makes worker health part of web readiness |
| `METRICS_TOKEN` | Bearer token for Prometheus endpoints |
| `LOG_LEVEL` | Structured log threshold |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP collector endpoint |
| `OTEL_EXPORTER_OTLP_HEADERS` | Collector authentication headers |

## 11. Enterprise identity

### Local break-glass administrator

Retain at least one local organization Admin, enroll TOTP when required by
policy, store recovery codes offline, and test the account periodically. Local
authentication remains available when an external IdP is unavailable. The
same Admin identity enters installation administration through
`/organization/platform`.

### OIDC

Create a connection under **Platform → Identity** and provide the issuer,
client ID, client secret, audience, and optional `acr`/`amr` requirements.
SignalHub uses discovery, authorization code flow, PKCE, state, nonce, issuer,
audience, and verified-email checks.

Register the callback URL displayed by the console. Test the connection before
enabling it. For installation administration, require an IdP MFA signal
according to organizational policy and link only to an existing active Admin.

### SAML

Provide:

- IdP SSO URL.
- IdP signing certificate.
- SP entity ID.
- Optional SP private key and public certificate for signed requests and
  encrypted assertions.

SignalHub validates signed responses and assertions, `InResponseTo`, audience, and
time conditions. Publish the per-connection metadata URL to the IdP.

### SCIM 2.0

Generate a SCIM bearer token from the identity connection and configure the IdP
base URL:

```text
https://signalhub.at/api/scim/v2/<connection-slug>
```

Users, Groups, filtering, pagination, PATCH, PUT, ETags, group-to-role mapping,
token rotation, deprovisioning, and immediate session revocation are supported.
Store the token in the IdP once; SignalHub stores only its hash.

## 12. Authorization model

Tenant roles:

| Role | Intended scope |
| --- | --- |
| Admin | Every organization capability plus installation administration |
| Incident Manager | Incident lifecycle, subscribers, analytics, and audit |
| Responder | Incident updates, monitors, components, and analytics |
| Viewer | Read-only analytics and audit |

Installation administration:

| Identity | Intended scope |
| --- | --- |
| Organization Admin | Cross-organization operations, global users, provider configuration, identity connections, audit delivery, and audited organization lifecycle actions |

API keys are independently scoped by capability, optional page IDs, expiration,
and source CIDRs. Avoid using browser accounts for automation.

## 13. Notifications and integrations

1. Configure SMTP and verify delivery to a controlled mailbox.
2. Optionally configure Twilio and verify E.164 sender/recipient handling.
3. Create tenant notification destinations for Slack, Teams, email, or signed
   webhooks.
4. Exercise a test incident through create, update, resolve, and postmortem.
5. Inspect delivery history, retries, and dead-letter state.
6. Rotate webhook and automation tokens after testing.

Delivery uses durable jobs with leases, retries, and dead-letter visibility.
The public subscription interface reports unavailable providers rather than
accepting contacts it cannot verify.

## 14. Observability

### Health

- `/api/health/live` checks the web process.
- `/api/health/ready` checks database, migrations, and required worker health.
- The worker exposes `/live`, `/ready`, and authenticated `/metrics` on its
  health port.

### Metrics

Set `METRICS_TOKEN` and scrape:

- Web: `/api/internal/metrics`
- Worker: `/metrics`

Metrics include runtime defaults, pending and dead-letter notification jobs,
active workers, and queued platform jobs.

### Tracing

Set the OTLP endpoint and optional headers. The application initializes HTTP
and Undici tracing through OpenTelemetry. Apply sampling and retention policies
at the collector.

### Logs

Logs are structured JSON outside local development and redact common credential
fields. Ship stdout/stderr through the platform log agent. Alert on:

- Readiness failures.
- Missing worker heartbeats.
- Queue growth.
- Dead-letter jobs.
- Repeated authentication failures.
- Audit sink failures.
- Migration drift.

## 15. Audit, retention, and SIEM

Tenant and platform audit records are sealed into per-scope SHA-256 chains.
Verify them:

```bash
npm run signalhubctl -- audit --org <organization-id>
npm run signalhubctl -- audit
```

Admins can configure signed HTTPS audit sinks from installation administration. The worker signs
payloads with HMAC-SHA256, retries transient failures, and exposes dead-letter
delivery counts.

Retention combines platform defaults with bounded organization overrides.
Audit pruning writes a retained-chain checkpoint so verification remains valid
after expired records are removed.

## 16. Backups, exports, and disaster recovery

### Database backup

```bash
npm run signalhubctl -- backup --output signalhub.dump
```

The command uses the custom `pg_dump` format and creates an adjacent
manifest containing a SHA-256 checksum and storage notes.

### Restore validation

```bash
npm run signalhubctl -- restore --archive signalhub.dump
```

This verifies the checksum without changing a database. An actual restore is
deliberately explicit:

```bash
npm run signalhubctl -- restore \
  --archive signalhub.archive.gz \
  --execute \
  --confirm RESTORE
```

Run destructive restoration only against an isolated target or a deliberately
stopped production environment.

### Assets

- Back up the local upload volume separately when using local storage.
- Enable bucket versioning, lifecycle protection, and provider snapshots when
  using S3-compatible storage.
- Test that database records and asset objects restore to a consistent point.

### Organization export

Admins can queue a gzip JSON export. The worker builds a checksummed archive and
asset manifest without secret ciphertext or credential hashes.

### Recovery exercise

At least quarterly:

1. Restore the database to an isolated environment.
2. Restore or attach a copy of assets.
3. Run migrations with the target release.
4. Start one worker and one web process.
5. Validate login, public pages, incident history, and audit chains.
6. Record recovery time and gaps.

## 17. Upgrades and key rotation

1. Review release notes, `.env.example`, chart values, and migration changes.
2. Create and verify a database backup.
3. Build or pull the signed image by immutable digest.
4. Run `signalhubctl preflight` and `signalhubctl migrate --check`.
5. Run the migration job once.
6. Roll workers and then web replicas.
7. Confirm readiness, queue drain, login, and public status pages.
8. Keep the previous image available for application rollback. Database
   rollback requires a tested restore plan.

Rotate encrypted secrets:

```bash
npm run signalhubctl -- rotate-encryption-key
```

The command rewrites supported encrypted records with the active key and
reports failures. Keep the old key configured until the failure list is empty
and validation succeeds.

Release automation builds `linux/amd64` and `linux/arm64` images, attaches SBOM
and provenance data, and signs the pushed digest with Cosign.

## 18. Operator CLI

```text
signalhubctl doctor
signalhubctl preflight
signalhubctl migrate [--check]
signalhubctl backup --output <archive>
signalhubctl restore --archive <archive> [--execute --confirm RESTORE]
signalhubctl audit [--org <id>] [--seal]
signalhubctl export --org <id>
signalhubctl rotate-encryption-key
```

Run the CLI from an application image or trusted operator host with the same
database and secret configuration as the deployment.

## 19. Validation

### Source and build

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

### Runtime

```bash
npm run signalhubctl -- preflight
npm run signalhubctl -- doctor
npm run signalhubctl -- migrate --check
curl -fsS https://signalhub.at/api/health/live
curl -fsS https://signalhub.at/api/health/ready
```

### Functional acceptance

- Local Admin login and TOTP recovery work.
- OIDC and/or SAML login works for every mapped role.
- SCIM create, update, group membership, disable, and delete have expected
  session-revocation behavior.
- Tenant and platform role boundaries match policy.
- Incident creation, updates, resolution, postmortem, and notifications work.
- HTTP/TCP/DNS/SSL/heartbeat monitors update components as intended.
- Public, private, audience, feed, embed, badge, and API surfaces
  behave correctly.
- Metrics and traces arrive at the approved observability backend.
- Audit exports, chain verification, and SIEM delivery succeed.
- Backup restoration succeeds in an isolated environment.

## 20. Troubleshooting

### Readiness returns 503

Read the `checks` object. Common causes are an unreachable database, unapplied
migrations, or no recent ready worker heartbeat. Inspect web, worker, and
migration logs.

### Transactions fail

Confirm the PostgreSQL URI reaches the writable primary, TLS settings are valid,
and the hostname resolves from the application containers or pods.

### Login redirects back to the form

Confirm the canonical URL, TLS termination, cookie domain/path, shared session
keyring, database-backed session record, account status, membership status, and
system clock.

### Platform login remains unauthorized

Confirm the platform administrator is active, has an enrolled TOTP secret, has
the expected session version, and originates from an allowed CIDR.

### Worker appears unhealthy

Check database connectivity, migration state, lease errors, outbound DNS and
network policy, health-port binding, and queue/dead-letter metrics.

### Monitors cannot reach targets

Private targets are blocked unless `MONITOR_ALLOW_PRIVATE_TARGETS=true`. Keep
the safe default unless the worker is intentionally placed in a controlled
monitoring network.

### Assets disappear across replicas

Local storage is not shared across pods. Use S3-compatible storage for
multi-replica deployments.

## 21. Production readiness checklist

### Governance

- [ ] Service owner, on-call team, data owner, and security contact assigned.
- [ ] Data classification and retention policies approved.
- [ ] Upgrade, vulnerability response, and incident processes documented.

### Security

- [ ] TLS and canonical URL configured.
- [ ] Unique secrets stored outside source control.
- [ ] Signing and encryption rotation procedures tested.
- [ ] Public signup disabled unless explicitly approved.
- [ ] Local break-glass Admin enrolled in TOTP when required, with offline recovery codes.
- [ ] OIDC/SAML MFA policy and SCIM deprovisioning tested.
- [ ] Platform administration restricted by network where appropriate.
- [ ] PostgreSQL, object storage, SMTP, IdP, and telemetry credentials are least privilege.
- [ ] Development seed and quick login disabled.

### Reliability

- [ ] highly available PostgreSQL cluster is monitored and backed up.
- [ ] Shared S3-compatible storage configured for multiple replicas.
- [ ] At least two web and two worker replicas deployed where availability requires it.
- [ ] Probes, disruption budgets, topology spread, and capacity limits reviewed.
- [ ] Notification retry and dead-letter alerts configured.

### Operations

- [ ] Metrics, logs, traces, and request IDs reach central observability.
- [ ] Audit chain verification scheduled.
- [ ] SIEM sink delivery tested.
- [ ] Backup restore and organization export tested.
- [ ] `signalhubctl doctor`, preflight, and migration checks are green.
- [ ] Public status pages are monitored from outside the primary infrastructure.

## 22. Related documentation

- [Project README](../README.md)
- [Standalone HTML user manual](../public/docs/user-manual.html)
- [Enterprise HTML deck](status-enterprise-deck.html)
- [Security policy](../SECURITY.md)
- [Contribution guide](../CONTRIBUTING.md)
- [Helm chart guide](../deploy/helm/status/README.md)
- [Environment template](../.env.example)
- [OpenAPI endpoint](../lib/openapi.ts)
