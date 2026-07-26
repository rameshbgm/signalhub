import { db, mongoClient } from "@/lib/db";
import { ensureIndexes } from "@/lib/ensure-indexes";
import { runMigrations } from "@/lib/migrations";
import {
  assertDevelopmentSeedEnabled,
  generateDevelopmentPassword,
  printGeneratedSecrets,
} from "@/scripts/dev-seed";
import { seedDevelopmentRoleUsers } from "@/scripts/seed-role-users";

async function main() {
  assertDevelopmentSeedEnabled("The development database reset");
  const databaseName = db.databaseName;
  if (["admin", "config", "local"].includes(databaseName)) {
    throw new Error(`Refusing to reset MongoDB system database ${databaseName}`);
  }
  if (process.env.CONFIRM_DEV_DATABASE_RESET !== databaseName) {
    throw new Error(
      `Set CONFIRM_DEV_DATABASE_RESET=${databaseName} to confirm the exact development database being cleared.`
    );
  }

  await db.dropDatabase();
  await runMigrations();
  await ensureIndexes();
  const password = process.env.DEV_ROLE_PASSWORD || generateDevelopmentPassword();
  await seedDevelopmentRoleUsers({ password });
  printGeneratedSecrets("Development role seed", [
    { label: "Shared role password", value: password },
  ]);
  console.log(`Reset ${databaseName}; no pages, incidents, components, or subscribers were created.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoClient.close());
