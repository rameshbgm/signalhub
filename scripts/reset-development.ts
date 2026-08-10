import { closeDatabase, postgresPool } from "@/lib/postgres/client";
import { runMigrations } from "@/lib/migrations";
import { migrateJobSchema } from "@/lib/job-schema";
import {
  assertDevelopmentSeedEnabled,
  generateDevelopmentPassword,
  printGeneratedSecrets,
} from "@/scripts/dev-seed";
import { seedDevelopmentRoleUsers } from "@/scripts/seed-role-users";

async function main() {
  assertDevelopmentSeedEnabled("The development database reset");
  const result = await postgresPool.query<{ name: string }>("select current_database() as name");
  const databaseName = result.rows[0]?.name;
  if (!databaseName || ["postgres", "template0", "template1"].includes(databaseName)) {
    throw new Error(`Refusing to reset PostgreSQL system database ${databaseName ?? "unknown"}`);
  }
  if (process.env.CONFIRM_DEV_DATABASE_RESET !== databaseName) {
    throw new Error(`Set CONFIRM_DEV_DATABASE_RESET=${databaseName} to confirm the exact development database being cleared.`);
  }
  await postgresPool.query("drop schema public cascade");
  await postgresPool.query("create schema public");
  await runMigrations();
  await migrateJobSchema();
  const password = process.env.DEV_ROLE_PASSWORD || generateDevelopmentPassword();
  await seedDevelopmentRoleUsers({ password });
  printGeneratedSecrets("Development role seed", [{ label: "Shared role password", value: password }]);
  console.log(`Reset ${databaseName}; no pages, incidents, components, or subscribers were created.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
