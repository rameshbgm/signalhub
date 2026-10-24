import { runMigrations as runGraphileMigrations } from "graphile-worker";
import { postgresPool } from "@/lib/postgres/client";

/** Apply Graphile's vendor-owned schema from migration and operational CLIs. */
export async function migrateJobSchema() {
  await runGraphileMigrations({
    pgPool: postgresPool,
    noHandleSignals: true,
  });
}
