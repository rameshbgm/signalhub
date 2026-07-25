import { ensureIndexes } from "@/lib/ensure-indexes";
import { mongoClient } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

async function main() {
  await runMigrations();
  await ensureIndexes();
  console.log("Database migrations and indexes are up to date.");
}

main()
  .then(() => mongoClient.close())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await mongoClient.close().catch(() => undefined);
    process.exitCode = 1;
  });
