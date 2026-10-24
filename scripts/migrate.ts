import { loadRuntimeConfigIntoEnv } from "@/lib/setup/config-file";

// Settings saved by the setup wizard are loaded before the database modules,
// which read DATABASE_URL when imported.
async function main() {
  await loadRuntimeConfigIntoEnv();
  const { runMigrations } = await import("@/lib/migrations");
  const { migrateJobSchema } = await import("@/lib/job-schema");
  const { closeDatabase } = await import("@/lib/postgres/client");
  try {
    await runMigrations();
    await migrateJobSchema();
    console.log("PostgreSQL and Graphile Worker migrations are up to date.");
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
