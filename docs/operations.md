# Operations

Day-2 runbook: health checks, metrics, backups, key rotation, retention, audit verification, upgrades.

> Setup: [Setup and deployment guide](OPEN_SOURCE_SETUP_GUIDE.md) · Settings: [Configuration](configuration.md) · Security: [Security and data protection](security.md)

## The CLI: `signalhubctl`

Bundled in the image at `dist-runtime/signalhubctl.mjs` (`statusctl` is a compatibility alias). In a checkout use `npm run signalhubctl -- <command>`.

```bash
docker compose exec web node dist-runtime/signalhubctl.mjs <command>
```

| Command | Purpose |
|---|---|
| `preflight` | Validate configuration (secrets, `DATABASE_URL`, S3, HTTPS URL, proxy hops). Prints JSON, exits non-zero on errors. |
| `doctor` | Runtime diagnostics. |
| `migrate [--check]` | Apply migrations, or with `--check` report whether the schema is current. |
| `backup [--output FILE]` | `pg_dump` (custom format) plus a SHA-256 manifest. Needs the `pg_dump` binary on the machine that runs it. |
| `restore --archive FILE [--execute --confirm RESTORE]` | Verify the manifest checksum; with `--execute --confirm RESTORE` run `pg_restore --clean`. |
| `audit [--seal]` | Verify the audit hash chain (optionally seal pending entries first). Non-zero exit on a break. |
| `export --org <orgId> [--requested-by <userId>]` | Queue a full organization data export. |
| `rotate-encryption-key` | Re-encrypt every stored secret with the active key. |

Other scripts: `bootstrap.mjs` (first admin), `migrate.mjs`.

## Health and metrics

| Endpoint | Meaning |
|---|---|
| `GET /api/health/live` (web) | Process is running. Use for liveness probes. |
| `GET /api/health/ready` (web) | Database reachable, migrations current, worker heartbeat fresh (when `REQUIRE_WORKER=true`). Use for readiness probes and load balancers. |
| `GET :8081/ready` (worker) | Worker loop is healthy. Used by the Compose healthcheck. |
| `GET /api/internal/metrics` | Prometheus text format, `Authorization: Bearer $METRICS_TOKEN`. Returns 404 unless `METRICS_TOKEN` is set. |

Exposed metrics: Node/process defaults plus `status_info`, `status_notification_jobs{state="pending|dead_letter"}`, `status_active_workers`, `status_platform_jobs`. Alert on **dead-letter jobs > 0**, **active workers = 0**, and readiness failures. Per-monitor uptime is not exported as metrics; use the status API or the UI.

Logs are JSON (Pino) on stdout. Tracing: set `OTEL_EXPORTER_OTLP_ENDPOINT`.

The platform console overview shows the same signals (organizations, queued jobs, delivery dead letters, migrations, worker):

![Platform overview](screenshots/platform-overview.png)

## Backup and restore

Back up three things:

1. **PostgreSQL**: all pages, incidents, subscribers (encrypted), audit chain, users.
2. **Assets** (only with `ASSET_STORAGE_DRIVER=s3`): your S3 bucket. With the default `db` driver, logos, covers and exports live in PostgreSQL and are included in the dump (`assetsIncluded: true` in the manifest).
3. **Secrets**: `ENCRYPTION_KEY`/`ENCRYPTION_KEYS` and `SESSION_SECRET`/keyring, stored separately from the database backup. Without the encryption key, restored credentials and subscriber contacts cannot be decrypted.

### Docker Compose

```bash
# database (custom format, restorable with pg_restore)
docker compose exec -T postgres pg_dump -U signalhub -Fc signalhub > backups/signalhub-$(date +%F).dump
```

Schedule with cron or a systemd timer, ship offsite, and keep several generations. 

### Using `signalhubctl` (host with PostgreSQL client tools)

```bash
DATABASE_URL=postgresql://... signalhubctl backup --output /backups/signalhub.dump
# verify checksum only
DATABASE_URL=postgresql://... signalhubctl restore --archive /backups/signalhub.dump
# restore into an empty database (destructive: drops existing objects)
DATABASE_URL=postgresql://... signalhubctl restore --archive /backups/signalhub.dump --execute --confirm RESTORE
```

### Restore drill (do this before you need it)

1. Start an **isolated** environment (a fresh Compose project or namespace) with the same image version.
2. Restore the dump and assets, supply the original `ENCRYPTION_KEY` and `SESSION_SECRET`.
3. Run `signalhubctl migrate --check` and `audit`; sign in and open a status page.
4. Record how long it took. That is your real recovery time.

For managed PostgreSQL (RDS, Cloud SQL, Azure) prefer the provider's point-in-time recovery in addition to logical dumps.

## Rotating keys

Both keys support zero-downtime rotation through keyrings. All keys in the ring stay readable; only the **active** key writes.

**Encryption key**

1. Add a new key to `ENCRYPTION_KEYS` (JSON object of `id: key`) alongside the existing one(s) and set `ENCRYPTION_ACTIVE_KEY_ID` to the new id. Restart web and worker.
2. Re-encrypt existing data: `signalhubctl rotate-encryption-key` (reports `rotated` and any `failed` rows; exits non-zero if some failed).
3. After a successful run and a verified backup, remove the old key from the ring.

**Session signing key**: add the new key to `SESSION_SIGNING_KEYS`, set `SESSION_ACTIVE_KEY_ID`, restart. Old sessions stay valid until they expire or you remove the old key (which signs users out).

## Retention and data lifecycle

An hourly sweep applies retention. Defaults: checks 90 days, analytics 395, notification logs 90, resolved incidents 730, expired sessions 30 days after expiry, audit 2,555 days. Organizations can override within platform bounds. Monitor check and metric history are stored in monthly partitions; expired partitions are dropped rather than deleted row by row, so retention is cheap even with millions of checks.

Organization exports: **Settings** in the UI or `signalhubctl export --org <id>`; the worker writes a gzipped JSON archive with a checksum to your asset storage.

## Audit verification and SIEM

```bash
docker compose exec web node dist-runtime/signalhubctl.mjs audit --seal   # seal pending entries, then verify
```

Run it from a scheduled job and alert on a non-zero exit. Configure SIEM sinks in the platform console (**Audit**): HTTPS endpoint, 32+ character HMAC secret; verify the `x-status-signature` header on your receiver.

![Platform audit](screenshots/platform-audit.png)

## Upgrades

1. Read the release notes; back up (database + assets + keys).
2. Pull the new image or sources and `docker compose up -d` (Helm: `helm upgrade`). The `migrate` service runs first.
3. `signalhubctl migrate --check`, `preflight`, and watch `/api/health/ready`.
4. Roll back by restoring the backup and redeploying the previous image. Migrations are forward-only.

## Scaling

- **Worker**: run more replicas (leases keep sweeps idempotent) and raise `WORKER_MONITOR_CONCURRENCY` for many monitors.
- **Web**: stateless; add replicas behind your load balancer. Requires S3 storage once more than one replica exists.
- **Database**: size `DATABASE_POOL_SIZE` so `pool × processes` stays below Postgres `max_connections`; consider PgBouncer in transaction mode only after testing with your workload.
- **Delivery**: notifications retry with transient/permanent error classification and end in a dead-letter state you can retry from **Operations** in the platform console.

## Troubleshooting

| Symptom | Check |
|---|---|
| Readiness fails | `curl /api/health/ready` body; `docker compose logs worker migrate` |
| Dead-letter count rising | Platform console → Operations; usually SMTP/SMS credentials or a destination URL |
| Worker shows Stale | Worker container down or can't reach Postgres; heartbeat must be < 30 s old |
| Audit chain verification fails | Stop, snapshot the database, investigate before anything else; compare with your SIEM copy |
| `restore` rejects the archive | Manifest checksum mismatch: the dump changed or the `.manifest.json` is missing |
| Lost `ENCRYPTION_KEY` | Encrypted credentials and subscriber contacts are unrecoverable; restore the key from your secret manager backup |
