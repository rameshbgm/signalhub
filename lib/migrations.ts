import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runMigrations as runGraphileMigrations } from "graphile-worker";
import { importLegacyDeliveryEnvironment } from "@/lib/delivery-config";
import { log } from "@/lib/logger";
import { postgresPool } from "@/lib/postgres/client";
import {
  evaluateMigrationState,
  type MigrationInspection,
  type MigrationManifestEntry,
} from "@/lib/migration-state";

export {
  migrationIssueSummary,
  type MigrationInspection,
} from "@/lib/migration-state";

const migrationDirectory = path.join(process.cwd(), "db", "migrations");

async function migrationManifest(): Promise<MigrationManifestEntry[]> {
  const filenames = (await readdir(migrationDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  return Promise.all(filenames.map(async (filename) => {
    const source = await readFile(path.join(migrationDirectory, filename), "utf8");
    return {
      id: filename,
      description: filename.replace(/^\d+_/, "").replace(/\.sql$/, "").replaceAll("_", " "),
      checksum: createHash("sha256").update(source).digest("hex"),
    };
  }));
}

export const LATEST_MIGRATION_ID = "012_destination_connections.sql";

export async function inspectMigrationState(): Promise<MigrationInspection> {
  const manifest = await migrationManifest();
  const result = await postgresPool.query<{ id: string; checksum: string }>(
    "select id, checksum from schema_migrations order by id"
  );
  return evaluateMigrationState(result.rows, manifest);
}

export async function runMigrations() {
  const manifest = await migrationManifest();
  const client = await postgresPool.connect();
  const newlyApplied: string[] = [];
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('signalhub-schema-migrations'))");
    await client.query(`
      create table if not exists schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now(),
        checksum text not null
      )
    `);
    for (const migration of manifest) {
      const applied = await client.query<{ checksum: string }>(
        "select checksum from schema_migrations where id = $1",
        [migration.id]
      );
      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== migration.checksum) {
          throw new Error(`Applied migration ${migration.id} has been modified`);
        }
        continue;
      }
      const source = await readFile(path.join(migrationDirectory, migration.id), "utf8");
      await client.query(source);
      await client.query(
        "insert into schema_migrations (id, checksum) values ($1, $2)",
        [migration.id, migration.checksum]
      );
      newlyApplied.push(migration.id);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  // Only on the upgrade itself: a later "clear" in the console must stick even
  // if the old environment variables are still set.
  if (newlyApplied.includes("008_delivery_providers.sql")) {
    const imported = await importLegacyDeliveryEnvironment();
    if (imported.length) {
      log("warn", "Imported delivery providers from environment; manage them in Platform configuration and remove SMTP_* / TWILIO_* variables", { imported });
    }
  }
  // Web requests enqueue jobs with graphile_worker.add_job, so the queue schema
  // must exist before any web process serves traffic, not only after the
  // first worker has started.
  await runGraphileMigrations({ pgPool: postgresPool });
}
