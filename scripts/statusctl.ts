import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { sealAuditEntries, verifyAuditScope } from "@/lib/audit-integrity";
import { isDatabaseId } from "@/lib/database-id";
import { decryptSecret, encryptSecret, encryptedSecretKeyId } from "@/lib/encryption";
import { inspectMigrationState, migrationIssueSummary, runMigrations } from "@/lib/migrations";
import { migrateJobSchema } from "@/lib/job-schema";
import { enqueueJobSweep, JOB_TASKS } from "@/lib/jobs";
import { closeDatabase, database, postgresPool, verifyDatabaseConnection } from "@/lib/postgres/client";

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value?.startsWith("postgres")) throw new Error("A PostgreSQL DATABASE_URL is required");
  return value;
}

async function doctor() {
  let databaseHealthy = true;
  try {
    await verifyDatabaseConnection();
  } catch {
    databaseHealthy = false;
  }
  const migration = databaseHealthy ? await inspectMigrationState() : null;
  const worker = databaseHealthy
    ? await database.selectFrom("workerHeartbeats").select("id")
        .where("status", "=", "READY")
        .where("lastSeenAt", ">", new Date(Date.now() - 30_000))
        .executeTakeFirst()
    : undefined;
  const result = {
    database: databaseHealthy,
    migrations: migration?.current ?? false,
    migrationSummary: migration ? migrationIssueSummary(migration) : "Database connection failed",
    worker: Boolean(worker),
    storage: process.env.ASSET_STORAGE_DRIVER ?? "local",
    trustedProxyHeaders: process.env.TRUST_PROXY_HEADERS === "true",
    signingKeyring: Boolean(process.env.SESSION_SIGNING_KEYS),
    encryptionKeyring: Boolean(process.env.ENCRYPTION_KEYS),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.database || !result.migrations || (process.env.REQUIRE_WORKER !== "false" && !result.worker)) process.exitCode = 1;
}

function preflight() {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!process.env.DATABASE_URL?.startsWith("postgres")) errors.push("A PostgreSQL DATABASE_URL is required");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) errors.push("SESSION_SECRET must be at least 32 characters");
  if (!process.env.ENCRYPTION_KEY && !process.env.ENCRYPTION_KEYS) errors.push("ENCRYPTION_KEY or ENCRYPTION_KEYS is required");
  if (process.env.ASSET_STORAGE_DRIVER?.toLowerCase() === "s3" && !process.env.S3_BUCKET) errors.push("S3_BUCKET is required for S3 storage");
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")) warnings.push("NEXT_PUBLIC_APP_URL should use HTTPS in production");
  if (process.env.TRUST_PROXY_HEADERS === "true" && !process.env.TRUSTED_PROXY_HOPS) warnings.push("Set TRUSTED_PROXY_HOPS explicitly when proxy headers are trusted");
  console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings }, null, 2));
  if (errors.length) process.exitCode = 1;
}

async function backup() {
  const output = path.resolve(flag("--output") ?? `signalhub-backup-${new Date().toISOString().replaceAll(":", "-")}.dump`);
  await run("pg_dump", ["--dbname", requireDatabaseUrl(), "--format=custom", "--no-owner", "--file", output]);
  const bytes = await readFile(output);
  const manifest = {
    format: "signalhub-postgresql-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    archive: path.basename(output),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    assetStorageDriver: process.env.ASSET_STORAGE_DRIVER ?? "local",
    localAssetsIncluded: false,
  };
  await writeFile(`${output}.manifest.json`, JSON.stringify(manifest, null, 2), { flag: "wx" });
  console.log(JSON.stringify(manifest, null, 2));
}

async function restore() {
  const archive = flag("--archive");
  if (!archive) throw new Error("--archive is required");
  const resolved = path.resolve(archive);
  await access(resolved);
  const manifest = JSON.parse(await readFile(`${resolved}.manifest.json`, "utf8")) as { sha256?: string; format?: string };
  const actual = createHash("sha256").update(await readFile(resolved)).digest("hex");
  if (manifest.format !== "signalhub-postgresql-backup" || !manifest.sha256 || manifest.sha256 !== actual) {
    throw new Error("PostgreSQL backup manifest or checksum verification failed");
  }
  if (!process.argv.includes("--execute")) {
    console.log(JSON.stringify({ verified: true, sha256: actual, execute: false }, null, 2));
    return;
  }
  if (flag("--confirm") !== "RESTORE") throw new Error("Use --confirm RESTORE with --execute");
  await run("pg_restore", ["--dbname", requireDatabaseUrl(), "--clean", "--if-exists", "--no-owner", resolved]);
  console.log("Restore completed");
}

async function audit() {
  if (process.argv.includes("--seal")) await sealAuditEntries();
  const org = flag("--org");
  if (org && !isDatabaseId(org)) throw new Error("--org must be a valid organization ID");
  const result = await verifyAuditScope(org);
  console.log(JSON.stringify({ scope: org ?? "platform", ...result }, null, 2));
  if (!result.valid || result.unsealed) process.exitCode = 1;
}

const ENCRYPTED_COLUMNS = [
  { table: "identity_connections", field: "config_ciphertext" },
  { table: "notification_destinations", field: "config_ciphertext" },
  { table: "webhook_endpoints", field: "secret_ciphertext" },
  { table: "audit_sinks", field: "secret_ciphertext" },
  { table: "monitors", field: "auth_secret" },
  { table: "users", field: "totp_secret_ciphertext" },
  { table: "users", field: "pending_totp_secret_ciphertext" },
] as const;

async function rotateEncryption() {
  let rotated = 0;
  const failures: Array<{ table: string; id: string; field: string }> = [];
  for (const target of ENCRYPTED_COLUMNS) {
    const rows = await postgresPool.query<{ id: string; value: string }>(
      `select id::text, ${target.field} as value from ${target.table} where ${target.field} is not null and ${target.field} <> ''`
    );
    for (const row of rows.rows) {
      try {
        const ciphertext = encryptSecret(decryptSecret(row.value));
        await postgresPool.query(`update ${target.table} set ${target.field} = $1 where id = $2::uuid`, [ciphertext, row.id]);
        rotated += 1;
      } catch {
        failures.push({ table: target.table, id: row.id, field: target.field });
      }
    }
  }
  console.log(JSON.stringify({ rotated, failed: failures, activeKeyId: encryptedSecretKeyId(encryptSecret("probe")) }, null, 2));
  if (failures.length) process.exitCode = 1;
}

async function queueExport() {
  const orgId = flag("--org");
  if (!isDatabaseId(orgId)) throw new Error("--org must be a valid organization ID");
  const organization = await database.selectFrom("organizations").select("id").where("id", "=", orgId).executeTakeFirst();
  if (!organization) throw new Error("Organization not found");
  const existing = await database.selectFrom("dataExportJobs").select(["id", "status"])
    .where("orgId", "=", orgId).where("status", "in", ["QUEUED", "PROCESSING"]).executeTakeFirst();
  if (existing) {
    console.log(JSON.stringify({ jobId: existing.id, status: existing.status }, null, 2));
    return;
  }
  const requestedByFlag = flag("--requested-by");
  if (requestedByFlag && !isDatabaseId(requestedByFlag)) {
    throw new Error("--requested-by must be a valid user ID");
  }
  const actor = requestedByFlag
    ? await database.selectFrom("users").select("id").where("id", "=", requestedByFlag).executeTakeFirst()
    : await database.selectFrom("memberships as membership")
        .innerJoin("users as user", "user.id", "membership.userId")
        .select("user.id").where("membership.orgId", "=", orgId)
        .where("membership.status", "=", "ACTIVE").where("membership.role", "=", "ADMIN")
        .where("user.disabled", "=", false).orderBy("membership.createdAt").executeTakeFirst();
  if (!actor) throw new Error("No enabled organization Admin is available; pass --requested-by USER_ID");
  const job = await database.transaction().execute(async (transaction) => {
    const now = new Date();
    const queued = await transaction.insertInto("dataExportJobs").values({
      orgId, status: "QUEUED", requestedBy: actor.id, storageKey: null, storageDriver: null,
      checksum: null, attempts: 0, leaseOwner: null, leaseExpiresAt: null,
      lastError: null, createdAt: now, updatedAt: now, completedAt: null,
    }).returning(["id", "status"]).executeTakeFirstOrThrow();
    await enqueueJobSweep(transaction, JOB_TASKS.exports);
    return queued;
  });
  console.log(JSON.stringify({ jobId: job.id, status: job.status }, null, 2));
}

async function main() {
  const command = process.argv[2];
  if (command === "doctor") await doctor();
  else if (command === "preflight") preflight();
  else if (command === "migrate") {
    if (process.argv.includes("--check")) {
      const state = await inspectMigrationState();
      console.log(JSON.stringify(state, null, 2));
      if (!state.current) process.exitCode = 1;
    } else {
      await runMigrations();
      await migrateJobSchema();
    }
  } else if (command === "backup") await backup();
  else if (command === "restore") await restore();
  else if (command === "audit") await audit();
  else if (command === "export") await queueExport();
  else if (command === "rotate-encryption-key") await rotateEncryption();
  else {
    console.log("Usage: signalhubctl <doctor|preflight|migrate [--check]|backup|restore|audit|export --org ID [--requested-by USER_ID]|rotate-encryption-key>");
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
