# SignalHub

**Own the signal. Own the data. Own the response.**

SignalHub is an Apache-2.0 licensed, enterprise-ready status-page, monitoring, and
incident-communication platform designed to run entirely on infrastructure you
control. It combines public and private status experiences, multi-organization
administration, durable monitoring and delivery, enterprise identity, audit
evidence, and operator tooling without a license server, feature key, hosted
control plane, or phone-home requirement.

The public project landing page is [signalhub.at](https://signalhub.at).

[Enterprise overview deck](docs/status-enterprise-deck.html) ·
[Complete setup guide](docs/OPEN_SOURCE_SETUP_GUIDE.md) ·
[Security policy](SECURITY.md) ·
[Helm chart](deploy/helm/status/README.md)

## Why enterprises self-host SignalHub

- **Own the data:** incident history, subscriber contacts, monitoring results,
  audit evidence, identity mappings, and operational metadata remain in your
  MongoDB and object storage.
- **Own the infrastructure:** deploy on a controlled Docker host, Kubernetes,
  private cloud, sovereign cloud, or an isolated network.
- **Reduce external dependencies:** the communication channel used during an
  outage does not need to depend on another vendor's application control plane.
- **Control identity and access:** OIDC, SAML, SCIM 2.0, MFA, fixed RBAC,
  page-scoped roles, scoped API keys, CIDR policies, and a local break-glass
  Owner are built in.
- **Create verifiable evidence:** tenant and platform audits are sealed into
  SHA-256 chains, exportable, and deliverable to a SIEM over signed HTTPS.
- **Avoid license-driven scaling costs:** Apache-2.0 permits internal use,
  modification, and redistribution without per-seat or per-status-page
  application license fees. Infrastructure and operational costs still apply.
- **Integrate without lock-in:** OpenAPI, management APIs, webhooks, RSS/Atom,
  Prometheus metrics, OpenTelemetry, SMTP, Twilio, S3-compatible storage, and
  standard enterprise identity protocols keep the platform interoperable.

## Product capabilities

### SignalHub experiences

- Public, private, and audience-scoped status pages.
- Hub pages and child pages for portfolios or business units.
- Custom domains with public page, history, incident, access, and feed routing.
- Component groups, localized page settings, branding assets, custom CSS,
  embeds, badges, RSS, and Atom.
- Incident history, postmortems, scheduled maintenance, and public system
  metrics.
- Verified email and optional SMS subscriptions.

### Incident operations

- Investigating → Identified → Monitoring → Resolved lifecycle.
- Severity, impact, affected-component, and subscriber communication workflows.
- Incident templates and organization-independent platform monitor templates.
- Scheduled maintenance with lifecycle automation.
- Durable email, Slack, Teams, and signed webhook delivery.
- Retry leases, delivery history, and dead-letter visibility.

### Monitoring and automation

- HTTP, keyword, TCP, DNS, SSL-certificate, ICMP, and heartbeat monitors.
- Request methods, headers, bodies, authentication, expected status ranges, and
  response-size limits.
- Failure/recovery thresholds, grouping, tags, and component synchronization.
- Scoped management API keys with page boundaries, expiration, and source
  CIDRs.
- Per-component automation tokens, heartbeat tokens, and webhook integrations.
- OpenAPI 3.1 contract at `/api/openapi`.

### Multi-organization platform administration

- Separate tenant and platform identity spaces.
- Organization provisioning, suspension, reactivation, and retryable purge.
- Emergency global-user disable and audited support sessions.
- View-only or explicitly scoped operate-mode support access.
- Global templates, lifecycle jobs, diagnostics, retention defaults, and
  platform audit.
- Owner-safety invariants for destructive and administrator workflows.

### Enterprise identity

- Local Argon2id password authentication.
- TOTP MFA and single-use recovery codes.
- OIDC discovery and authorization code flow with PKCE, state, nonce, issuer,
  audience, and verified-email validation.
- SAML metadata, signed response/assertion validation, `InResponseTo`, audience,
  time conditions, and encrypted assertions.
- Optional `acr` and `amr` allowlists for IdP MFA assurance.
- SCIM 2.0 Users and Groups, filtering, pagination, PATCH, PUT, ETags,
  group-to-role mapping, token rotation, and deprovisioning.
- Immediate database-backed session revocation.

### Governance and evidence

- Platform retention defaults with bounded organization overrides.
- Checksummed organization data exports and asset manifests.
- Tenant and platform audit CSV/JSON export.
- Per-scope SHA-256 audit chains with retention checkpoints.
- Signed HTTPS SIEM delivery with retries and dead-letter state.
- Structured logs with redaction, request IDs, Prometheus metrics, and optional
  OpenTelemetry export.

## Architecture

```text
                         ┌──────────────────────────┐
 Customers / Employees ─▶ TLS ingress / reverse proxy
                         └─────────────┬────────────┘
                                       │
                         ┌─────────────▼────────────┐
                         │  Stateless web replicas  │
                         │  public · admin · APIs   │
                         └──────┬───────────┬───────┘
                                │           │
              ┌─────────────────▼──┐    ┌──▼────────────────────┐
              │ MongoDB replica set │    │ S3-compatible storage │
              │ source of truth     │    │ assets and exports     │
              └─────────────────▲──┘    └──▲────────────────────┘
                                │           │
                         ┌──────┴───────────┴───────┐
                         │     Worker replicas      │
                         │ monitors · delivery      │
                         │ exports · retention      │
                         │ audit · lifecycle jobs   │
                         └───┬─────────┬─────────┬──┘
                             │         │         │
                          SMTP/SMS  Webhooks   SIEM/OTLP
```

The web tier is stateless apart from signed cookies backed by revocable MongoDB
session records. The worker owns asynchronous and scheduled operations.
MongoDB replica-set transactions protect authorization and lifecycle changes.
S3-compatible storage is required when assets must be shared by multiple
application replicas.

## Security model

### Authentication and sessions

- Local passwords are hashed with configurable Argon2id parameters. Legacy
  bcrypt hashes are accepted and upgraded after successful authentication.
- Signed-cookie keyrings support controlled rotation.
- Every tenant and platform session has a database record, idle timeout,
  absolute timeout, device metadata, and revocation state.
- Disabling an identity, changing privileged role state, deprovisioning a SCIM
  identity, changing a password, or using logout revokes relevant sessions.
- Platform administration requires MFA; retain a local break-glass Owner.

### Authorization

Tenant roles:

| Role | Core scope |
| --- | --- |
| Owner | All organization capabilities and owner-only safeguards |
| Admin | Full tenant administration |
| Incident Manager | Incident lifecycle, subscribers, analytics, and audit |
| Responder | Incident updates, monitors, components, and analytics |
| Viewer | Read-only analytics and audit |

Platform roles:

| Role | Core scope |
| --- | --- |
| Owner | All platform, identity, administrator, and purge capabilities |
| Operator | Platform operations without administrator management or irreversible purge |
| Auditor | Read-only platform oversight |

API credentials are separate from human sessions and can be restricted by
capability, page, expiration, and source CIDR.

### Secrets and networks

- Provider credentials, TOTP material, and webhook secrets use versioned
  AES-256-GCM encryption.
- API keys, SCIM tokens, recovery codes, and other bearer credentials are stored
  hashed where the plaintext is not needed again.
- Session and encryption keyrings allow active-key rotation while older
  material remains readable during a transition.
- Platform-admin and API-key CIDR policy is available when trusted proxy
  headers are configured correctly.
- Monitor access to private targets is denied by default.
- The container runs as a non-root user; the Helm chart drops capabilities and
  uses read-only root filesystems.

Read [SECURITY.md](SECURITY.md) and the
[production checklist](docs/OPEN_SOURCE_SETUP_GUIDE.md#19-production-readiness-checklist)
before exposing an instance.

## Production quick start with Docker Compose

### 1. Configure

```bash
cp .env.example .env
openssl rand -base64 48
openssl rand -base64 48
```

Set the generated values independently:

```dotenv
SESSION_SECRET=<first-random-value>
ENCRYPTION_KEY=<second-random-value>
NEXT_PUBLIC_APP_URL=https://signalhub.at
NEXT_PUBLIC_APP_DOMAIN=signalhub.at
ALLOW_PUBLIC_SIGNUP=false
REQUIRE_WORKER=true
```

### 2. Start

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

The migration service waits for the MongoDB replica set, applies idempotent
migrations, and exits before web and worker startup.

### 3. Bootstrap

```bash
printf '%s' 'choose-a-unique-long-password' \
  | docker compose exec -T web \
      node dist-runtime/bootstrap.mjs --password-stdin
```

### 4. Validate

```bash
curl -fsS https://signalhub.at/api/health/live
curl -fsS https://signalhub.at/api/health/ready
docker compose logs --tail=100 web worker migrate
```

Keep the Compose port bound to `127.0.0.1` and publish it only through a trusted
TLS reverse proxy.

## Kubernetes quick start

The production Helm chart deploys web and worker replicas, a pre-upgrade
migration Job, probes, disruption budgets, optional autoscaling, topology
spread, restricted security contexts, and NetworkPolicy. It intentionally does
not bundle production MongoDB or object storage.

Create an externally managed Secret containing at least:

```text
DATABASE_URL
SESSION_SECRET
ENCRYPTION_KEY
METRICS_TOKEN
S3_BUCKET
S3_REGION
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
```

Install:

```bash
helm lint deploy/helm/status -f values-production.yaml
helm upgrade --install signalhub deploy/helm/status \
  --namespace signalhub \
  --create-namespace \
  -f values-production.yaml
```

See the [complete setup guide](docs/OPEN_SOURCE_SETUP_GUIDE.md) for a production
values example, secret keyrings, ingress, autoscaling, identity, observability,
backup, upgrade, and troubleshooting procedures.

## Configuration map

The canonical variable list is [`.env.example`](.env.example).

| Area | Important variables |
| --- | --- |
| Core | `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_DOMAIN` |
| Key rotation | `SESSION_SIGNING_KEYS`, `SESSION_ACTIVE_KEY_ID`, `ENCRYPTION_KEYS`, `ENCRYPTION_ACTIVE_KEY_ID` |
| Authentication | `PASSWORD_MIN_LENGTH`, `ARGON2_*`, tenant/platform session timeouts |
| Network trust | `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_HOPS`, `PLATFORM_ADMIN_ALLOWED_CIDRS` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Storage | `ASSET_STORAGE_DRIVER`, `ASSET_LOCAL_DIR`, `S3_*` |
| Monitoring | `MONITOR_*`, `WORKER_*`, `REQUIRE_WORKER` |
| Observability | `METRICS_TOKEN`, `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` |

Enterprise OIDC, SAML, SCIM, role mappings, and audit sinks are managed through
the platform console because their credentials are encrypted in the database.

## Operator CLI

The application image includes `signalhubctl`:

```text
signalhubctl doctor
signalhubctl preflight
signalhubctl migrate [--check]
signalhubctl backup --output <archive>
signalhubctl restore --archive <archive> [--execute --confirm RESTORE]
signalhubctl audit [--org <id>] [--seal]
signalhubctl export --org <id>
signalhubctl rotate-encryption-key
(`npm run statusctl` remains available as a compatibility alias.)
```

The restore command verifies the adjacent checksum manifest by default and does
not alter a database without both destructive-confirmation flags.

## Observability and operations

- Liveness: `/api/health/live`
- Readiness: `/api/health/ready`
- Authenticated web metrics: `/api/internal/metrics`
- Authenticated worker metrics: `/metrics` on the worker health port
- OpenAPI: `/api/openapi`
- Structured logs: stdout/stderr
- Distributed traces: optional OTLP HTTP export

Alert on readiness failure, missing worker heartbeats, growing queues,
dead-letter jobs, repeated authentication failures, audit delivery failures,
and migration drift.

Audit records are sealed by the worker. Verify the platform chain:

```bash
npm run signalhubctl -- audit
npm run statusctl -- audit
```

Verify a tenant chain:

```bash
npm run signalhubctl -- audit --org <organization-id>
npm run statusctl -- audit --org <organization-id>
```

## Backups and recovery

Create a checksummed archive when MongoDB Database Tools are installed:

```bash
npm run signalhubctl -- backup --output signal-backup.archive.gz
npm run statusctl -- backup --output signal-backup.archive.gz
```

Verify it without changing data:

```bash
npm run signalhubctl -- restore --archive signal-backup.archive.gz
npm run statusctl -- restore --archive signal-backup.archive.gz
```

Back up local uploads separately, or enable versioning and snapshots on the
S3-compatible bucket. A backup is not complete until it has been restored and
validated in an isolated environment.

## Development

```bash
npm ci
cp .env.example .env
npm run db:migrate
npm run bootstrap -- --password-stdin
npm run dev
```

Run the worker separately:

```bash
npm run worker:dev
```

Development sample data is deliberately opt-in:

```bash
NODE_ENV=development ALLOW_DEV_SEED=true npm run db:seed
```

Create one local account per tenant and platform role:

```bash
NODE_ENV=development \
ALLOW_DEV_SEED=true \
DEV_ROLE_PASSWORD='choose-a-development-password' \
DEV_PLATFORM_TOTP_SECRET='a-base32-authenticator-secret' \
npm run db:seed-roles
```

`ENABLE_DEV_QUICK_LOGIN=true` exposes local, role-specific quick-login buttons
only when the request hostname is loopback and the runtime is not production.
Never enable development seed or quick login in a shared environment.

## Quality and release

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high
docker compose config --quiet
helm lint deploy/helm/status
```

CI validates source quality, tests, production build, dependency audit,
container build, Helm rendering, and Playwright smoke coverage. Tagged releases
produce multi-architecture container images with SBOM, provenance, and
keyless Cosign signatures.

## APIs and interfaces

| Interface | Path |
| --- | --- |
| Public status API | `/api/v1/status/:slug` |
| Management API | `/api/v1/manage/*` |
| Heartbeat ingestion | `/api/v1/heartbeat/:token` |
| RSS and Atom | `/api/v1/feeds/:slug/{rss,atom}` |
| Embed | `/api/v1/embed/:slug` |
| Dynamic badge | `/api/v1/badge/:slug` |
| SCIM 2.0 | `/api/scim/v2/:connection/*` |
| OpenAPI 3.1 | `/api/openapi` |
| Platform console | `/platform` |

API failures use:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Human-readable explanation",
    "fields": {}
  }
}
```

## Cost and ownership

SignalHub has no application license fee. Total cost of ownership is determined by:

```text
compute + database + object storage + network
+ observability + delivery providers + backups
+ engineering and on-call operations
```

Self-hosting is most valuable where infrastructure already exists, operational
control is strategic, data residency matters, identity and audit integration
are mandatory, or vendor-dependent incident communication is an unacceptable
risk. Organizations without platform operations capacity should account for
the responsibility of patching, scaling, monitoring, backup testing, and
incident response.

## Documentation

- [Enterprise HTML deck](docs/status-enterprise-deck.html)
- [Open-source enterprise setup guide](docs/OPEN_SOURCE_SETUP_GUIDE.md)
- [Security policy](SECURITY.md)
- [Contribution guide](CONTRIBUTING.md)
- [Helm chart guide](deploy/helm/status/README.md)
- [Environment template](.env.example)

## License and contributions

SignalHub is licensed under [Apache-2.0](LICENSE). See
[CONTRIBUTING.md](CONTRIBUTING.md) for development and pull-request guidance
and [SECURITY.md](SECURITY.md) for responsible vulnerability disclosure.

## Project author

SignalHub is created and maintained by Ramesh BGM.

- [Ramesh's Notebook](https://rameshsnotebook.com/)
- [LinkedIn](https://www.linkedin.com/in/rameshbgm/)
- [GitHub](https://github.com/rameshbgm)
