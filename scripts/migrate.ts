import { closeDatabase } from "@/lib/postgres/client";
import { runMigrations } from "@/lib/migrations";
import { migrateJobSchema } from "@/lib/job-schema";

runMigrations()
  .then(() => migrateJobSchema())
  .then(() => console.log("PostgreSQL and Graphile Worker migrations are up to date."))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
