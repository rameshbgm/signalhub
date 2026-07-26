# SignalHub: Open-Source Enterprise Setup Guide

This guide takes an installation from an empty host or Kubernetes namespace to
a hardened, observable, recoverable SignalHub deployment. It covers the web
application, background worker, MongoDB, object storage, identity providers,
notification providers, audit delivery, metrics, tracing, backups, upgrades,
and validation.

The public project landing page is [signalhub.at](https://signalhub.at).

> SignalHub is Apache-2.0 software. There is no license server, feature key, usage
> metering, or phone-home requirement. Operating it safely remains the
> responsibility of the organization running it.

## 1. Choose a deployment profile

| Profile | Recommended use | Application topology | Data topology |
| --- | --- | --- | --- |
| Local development | Engineering and evaluation | One Next.js development process; optional worker | Local MongoDB replica set; local uploads |
| Docker Compose | Pilot, lab, or controlled single-host production | Web, worker, migration job, and MongoDB containers | Persistent Docker volumes; optional S3-compatible object storage |
| Kubernetes | Enterprise production and horizontal scale | Multiple web and worker replicas plus a Helm migration hook | External MongoDB replica set and S3-compatible object storage |

For an enterprise production deployment, use Kubernetes or an equivalent
orchestrator, an external MongoDB replica set, external object storage, an
external secrets manager, TLS ingress, centralized logs, metrics, and tested
backup restoration.

## 2. Tools and infrastructure

### Required for every deployment

- A DNS name such as `signalhub.at`.
- TLS termination at a trusted reverse proxy or ingress controller.
- MongoDB configured as a replica set. Transactions used by lifecycle,
  authorization, audit, and cascade workflows require replica-set semantics.
- Two independent high-entropy secrets:
  - `SESSION_SECRET` for signed session tokens.
  - `ENCRYPTION_KEY` for encrypted provider credentials and MFA material.
- An SMTP relay if email subscriptions and incident email delivery are needed.

### Docker Compose path

- Docker Engine with the Compose v2 plugin.
- `openssl` or an equivalent cryptographic random generator.
- MongoDB Database Tools on the backup operator host for `mongodump` and
  `mongorestore`.
- A reverse proxy such as NGINX, Caddy, HAProxy, Traefik, or an enterprise load
  balancer.

### Kubernetes path

- Kubernetes 1.27 or newer. The bundled chart declares this minimum.
- Helm 3 and `kubectl`.
- An ingress controller and certificate automation or enterprise TLS
  termination.
- An external MongoDB replica set.
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

## 4. Generate and manage secrets

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

## 5. Docker Compose installation

### 5.1 Configure the instance

```bash
cp .env.example .env
```

At minimum, set:

```dotenv
SESSION_SECRET=<independent-random-value>
ENCRYPTION_KEY=<independent-random-value>
NEXT_PUBLIC_APP_URL=https://signalhub.at
ALLOW_PUBLIC_SIGNUP=false
STATUS_PORT=3301
REQUIRE_WORKER=true
```

Keep `ENABLE_DEV_QUICK_LOGIN=false` and `ALLOW_DEV_SEED=false` in every shared
or production environment.

### 5.2 Start the stack

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

Compose starts:

1. MongoDB and initializes a single-node replica set.
2. The idempotent migration job.
3. The background worker.
4. The web process after migrations and worker health succeed.

The default web and MongoDB ports bind to `127.0.0.1`. Expose the application
through the TLS reverse proxy, not by changing the binding to all interfaces.

### 5.3 Bootstrap the first owner

Configure the `STATUS_BOOTSTRAP_*` values in `.env`, then pipe the password over
standard input:

```bash
printf '%s' 'a-unique-long-password' \
  | docker compose exec -T web \
      node dist-runtime/bootstrap.mjs --password-stdin
```

The bootstrap creates the first platform Owner, organization, tenant Owner, and
membership in one transaction. It refuses to create a second initial platform
administrator.

### 5.4 Confirm health

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

## 6. Reverse proxy and DNS

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

## 7. Kubernetes and Helm installation

### 7.1 Create the namespace and Secret

```bash
kubectl create namespace signalhub
kubectl -n signalhub create secret generic signalhub-production \
  --from-literal=DATABASE_URL='mongodb://user:password@mongo-a,mongo-b,mongo-c/signalhub?replicaSet=rs0' \
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

### 7.2 Create a values override

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

### 7.3 Validate and install

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

## 8. Configuration reference

### Core and database

| Variable | Purpose | Production guidance |
| --- | --- | --- |
| `DATABASE_URL` | MongoDB connection URI | Use a replica set, TLS, authentication, and least-privilege database credentials |
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
| `WORKER_POLL_INTERVAL_MS` | Queue polling interval |
| `WORKER_MONITOR_CONCURRENCY` | Concurrent monitor checks |
| `WORKER_NOTIFICATION_BATCH` | Notification batch size |
| `WORKER_PLATFORM_JOB_BATCH` | Platform lifecycle job batch size |
| `REQUIRE_WORKER` | Makes worker health part of web readiness |
| `METRICS_TOKEN` | Bearer token for Prometheus endpoints |
| `LOG_LEVEL` | Structured log threshold |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP collector endpoint |
| `OTEL_EXPORTER_OTLP_HEADERS` | Collector authentication headers |

## 9. Enterprise identity

### Local break-glass owner

Retain at least one local platform Owner, enroll TOTP, store recovery codes
offline, and test the account periodically. Local authentication remains
available when an external IdP is unavailable.

### OIDC

Create a connection under **Platform → Identity** and provide the issuer,
client ID, client secret, audience, and optional `acr`/`amr` requirements.
SignalHub uses discovery, authorization code flow, PKCE, state, nonce, issuer,
audience, and verified-email checks.

Register the callback URL displayed by the console. Test the connection before
enabling it. For platform administration, require an IdP MFA signal and link
only to an existing active platform administrator.

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

## 10. Authorization model

Tenant roles:

| Role | Intended scope |
| --- | --- |
| Owner | Every tenant capability and owner-safety operations |
| Admin | Full day-to-day tenant administration |
| Incident Manager | Incident lifecycle, subscribers, analytics, and audit |
| Responder | Incident updates, monitors, components, and analytics |
| Viewer | Read-only analytics and audit |

Platform roles:

| Role | Intended scope |
| --- | --- |
| Owner | All platform, identity, administrator, and purge capabilities |
| Operator | Operations without administrator management or irreversible organization purge |
| Auditor | Read-only platform oversight |

API keys are independently scoped by capability, optional page IDs, expiration,
and source CIDRs. Avoid using browser accounts for automation.

## 11. Notifications and integrations

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

## 12. Observability

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

## 13. Audit, retention, and SIEM

Tenant and platform audit records are sealed into per-scope SHA-256 chains.
Verify them:

```bash
npm run signalhubctl -- audit --org <organization-id>
npm run signalhubctl -- audit
```

Platform Owners can configure signed HTTPS audit sinks. The worker signs
payloads with HMAC-SHA256, retries transient failures, and exposes dead-letter
delivery counts.

Retention combines platform defaults with bounded organization overrides.
Audit pruning writes a retained-chain checkpoint so verification remains valid
after expired records are removed.

## 14. Backups, exports, and disaster recovery

### Database backup

```bash
npm run signalhubctl -- backup --output signalhub.archive.gz
```

The command uses `mongodump`, writes a gzip archive, and creates an adjacent
manifest containing a SHA-256 checksum and storage notes.

### Restore validation

```bash
npm run signalhubctl -- restore --archive signalhub.archive.gz
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

Owners can queue a gzip JSON export. The worker builds a checksummed archive and
asset manifest without secret ciphertext or credential hashes.

### Recovery exercise

At least quarterly:

1. Restore the database to an isolated environment.
2. Restore or attach a copy of assets.
3. Run migrations with the target release.
4. Start one worker and one web process.
5. Validate login, public pages, incident history, and audit chains.
6. Record recovery time and gaps.

## 15. Upgrades and key rotation

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

## 16. Operator CLI

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

## 17. Validation

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

- Local owner login and TOTP recovery work.
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

## 18. Troubleshooting

### Readiness returns 503

Read the `checks` object. Common causes are an unreachable database, unapplied
migrations, or no recent ready worker heartbeat. Inspect web, worker, and
migration logs.

### Transactions fail

Confirm the MongoDB URI names a working replica set and every advertised member
hostname resolves from the application containers or pods.

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

## 19. Production readiness checklist

### Governance

- [ ] Service owner, on-call team, data owner, and security contact assigned.
- [ ] Data classification and retention policies approved.
- [ ] Upgrade, vulnerability response, and incident processes documented.

### Security

- [ ] TLS and canonical URL configured.
- [ ] Unique secrets stored outside source control.
- [ ] Signing and encryption rotation procedures tested.
- [ ] Public signup disabled unless explicitly approved.
- [ ] Local break-glass Owner enrolled in TOTP with offline recovery codes.
- [ ] OIDC/SAML MFA policy and SCIM deprovisioning tested.
- [ ] Platform administration restricted by network where appropriate.
- [ ] MongoDB, object storage, SMTP, IdP, and telemetry credentials are least privilege.
- [ ] Development seed and quick login disabled.

### Reliability

- [ ] MongoDB replica set is monitored and backed up.
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

## 20. Related documentation

- [Project README](../README.md)
- [Enterprise HTML deck](status-enterprise-deck.html)
- [Security policy](../SECURITY.md)
- [Contribution guide](../CONTRIBUTING.md)
- [Helm chart guide](../deploy/helm/status/README.md)
- [Environment template](../.env.example)
- [OpenAPI endpoint](../lib/openapi.ts)
