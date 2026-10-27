# Operations

Day-2 runbook: health checks, metrics, backups, key rotation, retention, audit verification, upgrades.

> Setup: [Setup and deployment guide](OPEN_SOURCE_SETUP_GUIDE.md) · Settings: [Configuration](configuration.md) · Security: [Security and data protection](security.md)

## The CLI: `signalhubctl`

Bundled in the image at `dist-runtime/signalhubctl.mjs` (`statusctl` is a compatibility alias). In a checkout use `npm run signalhubctl -- <command>`.

```bash
docker compose exec signalhub node dist-runtime/signalhubctl.mjs <command>
```

| Command | Purpose |
|---|---|
| `preflight` | Validate configuration (secrets, `DATABASE_URL`, HTTPS URL, proxy hops). Prints JSON, exits non-zero on errors. |
| `doctor` | Runtime diagnostics. |
| `migrate [--check]` | Apply migrations, or with `--check` report whether the schema is current. |
| `backup [--output FILE]` | `pg_dump` (custom format) plus a SHA-256 manifest. Needs the `pg_dump` binary on the machine that runs it. |
| `restore --archive FILE [--execute --confirm RESTORE]` | Verify the manifest checksum; with `--execute --confirm RESTORE` run `pg_restore --clean`. |
| `audit [--seal]` | Verify the audit hash chain (optionally seal pending entries first). Non-zero exit on a break. |
| `export --org <orgId> [--requested-by <userId>]` | Queue a full organization data export. |
| `rotate-encryption-key` | Re-encrypt every stored secret with the active key. |
| `reset-password --username <id> [--clear-mfa]` | Operator recovery: set a temporary password that must be changed at sign-in. With `--clear-mfa`, delete the person's authenticator devices and recovery codes and force re-enrollment. |
| `settings show \| export \| import \| reset [--all \| --key NAME]` | Runtime settings from the command line: see them with their sources, back them up, restore a validated file, or reset to defaults when the admin console is unreachable. |

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

Back up two things:

1. **PostgreSQL**: all pages, incidents, subscribers (encrypted), audit chain, users.
2. **Application keys**: keep `ENCRYPTION_KEY`/`ENCRYPTION_KEYS` and `SESSION_SECRET`/its signing keyring in your secret manager or protected config backup, separate from the database dump. The session key signs login sessions; losing it means users sign in again. The encryption key protects stored credentials, MFA secrets and subscriber contact values; without the matching key, those values in a restored database cannot be decrypted. See [what each key protects](configuration.md#what-the-two-application-keys-do).

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
2. Restore the dump, supply the original `ENCRYPTION_KEY` and `SESSION_SECRET`.
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

An hourly sweep applies retention. Defaults: checks 90 days, analytics/metric points 90, notification logs and finished delivery jobs 365, closed service status history 365, expired sessions 30 days after expiry, audit 2,555 days. Organizations can override within platform bounds. Analytics expires by calendar date, including old backfilled rows edited recently. Active status intervals and unfinished delivery jobs are preserved. Tenant rows are removed according to their policy; whole monthly check/metric partitions are dropped only after every tenant's retention window has elapsed. A lease fences duplicate sweeps while allowing the next hourly run.

Public display is independent: default 90 days, with configurable incident/maintenance history in the page's Appearance settings. See [public pages and data lifecycle](public-pages.md) for exact cleanup behavior, sample-data commands, and verification.

Organization exports: **Platform administration → Configuration → Organization** in the UI or `signalhubctl export --org <id>`; the worker writes a gzipped JSON archive with a checksum to PostgreSQL.

## Audit verification and SIEM

```bash
docker compose exec signalhub node dist-runtime/signalhubctl.mjs audit --seal   # seal pending entries, then verify
```

Run it from a scheduled job and alert on a non-zero exit. Configure SIEM sinks in the platform console (**Audit**): HTTPS endpoint, 32+ character HMAC secret; verify the `x-status-signature` header on your receiver.

![Platform audit](screenshots/platform-audit.png)

## Multi-factor authentication in operation

Turn it on at **Platform administration → Configuration → Runtime → Sign-in policy → Require authenticator codes** (see the [MFA guide](mfa.md)). Day to day it needs very little care:

| Situation | What to do |
|---|---|
| Someone is locked out after five wrong codes | They wait 15 minutes, or an administrator opens **User management → Unlock**. Every lockout is in the audit log (`MFA_LOCKED`, `MFA_LOCKOUT_CLEARED`). |
| Someone lost their phone | They choose **Can't access your device?** on the sign-in screen. Another administrator reviews it under **Security → MFA requests** and approves with their own code. Requests untouched for 3 days are flagged **Overdue**. |
| The only administrator is locked out | `reset-password --username <id> --clear-mfa` from the server shell (above). Break-glass in the console exists for a *signed-in* sole administrator. |
| You need to sign everyone out | Turning the switch on already ends every other session. For one person: **User management → MFA → Reset all MFA**. |
| Emails are not arriving | Configure a provider under **Configuration**. MFA works without email; only notices, "this wasn't me" links and "Email to me" need it. |

The worker sweeps expired removal requests (7 days), abandoned setups (10 minutes), finished sign-in challenges and expired trusted browsers as part of its maintenance round, so there is nothing to schedule. Watch for repeated `MFA_LOGIN_FAILED` events in your SIEM: five in a row on one account is a lockout, and many accounts from one address is a spray the per-address rate limit (`mfa-ip`) already slows.

## Upgrades

1. Read the release notes; back up (database + keys).
2. Pull the new image or sources and `docker compose up -d`. Migrations run first on start.
3. `signalhubctl migrate --check`, `preflight`, and watch `/api/health/ready`.
4. Roll back by restoring the backup and redeploying the previous image. Migrations are forward-only.

## Scaling

- **Worker**: run more replicas (leases keep sweeps idempotent) and raise `WORKER_MONITOR_CONCURRENCY` for many monitors.
- **Web**: stateless; add replicas behind your load balancer.
- **Database**: size `DATABASE_POOL_SIZE` so `pool × processes` stays below Postgres `max_connections`; do not put a transaction-mode pooler (PgBouncer transaction mode, Supabase port 6543, Neon `-pooler` hosts) between SignalHub and PostgreSQL, because it breaks the worker's `LISTEN`/`NOTIFY` and advisory locks. Raise `max_connections` or use session-mode pooling instead.
- **Delivery**: notifications retry with transient/permanent error classification and end in a dead-letter state you can retry from **Operations** in the platform console.

## Troubleshooting

| Symptom | Check |
|---|---|
| Readiness fails | `curl /api/health/ready` body; `docker compose logs signalhub` |
| Dead-letter count rising | Platform console → Operations; usually SMTP/SMS credentials or a destination URL |
| Worker shows Stale | Worker container down or can't reach Postgres; heartbeat must be < 30 s old |
| Audit chain verification fails | Stop, snapshot the database, investigate before anything else; compare with your SIEM copy |
| `restore` rejects the archive | Manifest checksum mismatch: the dump changed or the `.manifest.json` is missing |
| Lost `ENCRYPTION_KEY` | Encrypted credentials and subscriber contacts are unrecoverable; restore the key from your secret manager backup |

Incident records and timelines are retained; Admins and Incident Managers can hide and restore public visibility. Incident history is not removed by the retention sweep.

## Recovering a suspended organization

An installation Admin can sign in with their existing User ID, password, and any required MFA after suspending their own organization, including when no active organizations remain. The sign-in opens `/organization/platform` in a restricted platform shell. Select **Reactivate** for the organization to restore workspace access. Suspension is never reversed automatically, and signing in does not reset the account password.

If platform access is denied, check that the account is enabled, its Admin membership and session have not been revoked, and the request satisfies the configured platform network restrictions. Other organization roles do not receive platform recovery access.
