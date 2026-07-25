import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { ObjectId } from "mongodb";
import { sealAuditEntries, verifyAuditScope } from "@/lib/audit-integrity";
import { collections, db, mongoClient } from "@/lib/db";
import { decryptSecret, encryptSecret, encryptedSecretKeyId } from "@/lib/encryption";
import { ensureIndexes } from "@/lib/ensure-indexes";
import { inspectMigrationState, migrationIssueSummary, runMigrations } from "@/lib/migrations";

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
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

async function doctor() {
  const migration = await inspectMigrationState();
  const worker = await collections.workerHeartbeats().findOne({
    status: "READY",
    lastSeenAt: { $gt: new Date(Date.now() - 30_000) },
  });
  const result = {
    database: Boolean(await db.command({ ping: 1 })),
    migrations: migration.current,
    migrationSummary: migrationIssueSummary(migration),
    worker: Boolean(worker),
    storage: process.env.ASSET_STORAGE_DRIVER ?? "local",
    trustedProxyHeaders: process.env.TRUST_PROXY_HEADERS === "true",
    signingKeyring: Boolean(process.env.SESSION_SIGNING_KEYS),
    encryptionKeyring: Boolean(process.env.ENCRYPTION_KEYS),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.database || !result.migrations || (process.env.REQUIRE_WORKER !== "false" && !result.worker)) {
    process.exitCode = 1;
  }
}

function preflight() {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!process.env.DATABASE_URL) errors.push("DATABASE_URL is required");
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) errors.push("SESSION_SECRET must be at least 32 characters");
  if (!process.env.ENCRYPTION_KEY && !process.env.ENCRYPTION_KEYS) errors.push("ENCRYPTION_KEY or ENCRYPTION_KEYS is required");
  if (process.env.ASSET_STORAGE_DRIVER?.toLowerCase() === "s3" && !process.env.S3_BUCKET) errors.push("S3_BUCKET is required for S3 storage");
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://")) {
    warnings.push("NEXT_PUBLIC_APP_URL should use HTTPS in production");
  }
  if (process.env.TRUST_PROXY_HEADERS === "true" && !process.env.TRUSTED_PROXY_HOPS) {
    warnings.push("Set TRUSTED_PROXY_HOPS explicitly when proxy headers are trusted");
  }
  console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings }, null, 2));
  if (errors.length) process.exitCode = 1;
}

async function backup() {
  const output = path.resolve(flag("--output") ?? `signalhub-backup-${new Date().toISOString().replaceAll(":", "-")}.archive.gz`);
  await run("mongodump", ["--uri", requireDatabaseUrl(), `--archive=${output}`, "--gzip"]);
  const bytes = await readFile(output);
  const manifest = {
    format: "signalhub-backup",
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
  const manifestPath = `${resolved}.manifest.json`;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { sha256?: string };
  const actual = createHash("sha256").update(await readFile(resolved)).digest("hex");
  if (!manifest.sha256 || manifest.sha256 !== actual) throw new Error("Backup checksum verification failed");
  if (!process.argv.includes("--execute")) {
    console.log(JSON.stringify({ verified: true, sha256: actual, execute: false }, null, 2));
    return;
  }
  if (flag("--confirm") !== "RESTORE") throw new Error("Use --confirm RESTORE with --execute");
  await run("mongorestore", ["--uri", requireDatabaseUrl(), `--archive=${resolved}`, "--gzip", "--drop"]);
  console.log("Restore completed");
}

async function audit() {
  if (process.argv.includes("--seal")) await sealAuditEntries();
  const org = flag("--org");
  const result = await verifyAuditScope(org ? new ObjectId(org) : undefined);
  console.log(JSON.stringify({ scope: org ?? "platform", ...result }, null, 2));
  if (!result.valid || result.unsealed) process.exitCode = 1;
}

async function rotateEncryption() {
  const targets = [
    { collection: "identityConnections", fields: ["configCiphertext"] },
    { collection: "notificationDestinations", fields: ["configCiphertext"] },
    { collection: "webhookEndpoints", fields: ["secretCiphertext"] },
    { collection: "auditSinks", fields: ["secretCiphertext"] },
    { collection: "monitors", fields: ["authSecret"] },
    {
      collection: "platformAdmins",
      fields: ["totpSecretCiphertext", "pendingTotpSecretCiphertext"],
    },
    {
      collection: "users",
      fields: ["totpSecretCiphertext", "pendingTotpSecretCiphertext"],
    },
  ];
  let rotated = 0;
  const failures: Array<{ collection: string; id: string; field: string }> = [];
  for (const target of targets) {
    const collection = db.collection(target.collection);
    const documents = await collection.find({
      $or: target.fields.map((field) => ({ [field]: { $type: "string", $ne: "" } })),
    }).toArray();
    for (const document of documents) {
      const updates: Record<string, string> = {};
      for (const field of target.fields) {
        const value = document[field];
        if (typeof value !== "string" || !value) continue;
        try {
          updates[field] = encryptSecret(decryptSecret(value));
          rotated += 1;
        } catch {
          failures.push({ collection: target.collection, id: String(document._id), field });
        }
      }
      if (Object.keys(updates).length) {
        await collection.updateOne({ _id: document._id }, { $set: updates });
      }
    }
  }
  console.log(JSON.stringify({
    rotated,
    failed: failures,
    activeKeyId: encryptedSecretKeyId(encryptSecret("probe")),
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

async function queueExport() {
  const orgValue = flag("--org");
  if (!orgValue || !ObjectId.isValid(orgValue)) throw new Error("--org must be a valid organization ID");
  const orgId = new ObjectId(orgValue);
  const organization = await collections.organizations().findOne({ _id: orgId });
  if (!organization) throw new Error("Organization not found");
  const existing = await collections.dataExportJobs().findOne({
    orgId,
    status: { $in: ["QUEUED", "PROCESSING"] },
  });
  if (existing) {
    console.log(JSON.stringify({ jobId: existing._id.toHexString(), status: existing.status }, null, 2));
    return;
  }
  const id = new ObjectId();
  const now = new Date();
  await collections.dataExportJobs().insertOne({
    _id: id,
    orgId,
    status: "QUEUED",
    requestedBy: new ObjectId("000000000000000000000000"),
    storageKey: null,
    storageDriver: null,
    checksum: null,
    attempts: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  });
  console.log(JSON.stringify({ jobId: id.toHexString(), status: "QUEUED" }, null, 2));
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
      await ensureIndexes();
    }
  } else if (command === "backup") await backup();
  else if (command === "restore") await restore();
  else if (command === "audit") await audit();
  else if (command === "export") await queueExport();
  else if (command === "rotate-encryption-key") await rotateEncryption();
  else {
    console.log("Usage: signalhubctl <doctor|preflight|migrate [--check]|backup|restore|audit|export --org ID|rotate-encryption-key>");
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoClient.close());
