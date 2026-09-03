import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
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

export const LATEST_MIGRATION_ID = "006_remove_monitor_templates.sql";

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
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
