import { CamelCasePlugin, Kysely, PostgresDialect, type Transaction } from "kysely";
import { Pool, types } from "pg";
import type { SignalHubDatabase } from "@/lib/postgres/schema";
import { logger } from "@/lib/logger";
import { postgresPoolOptions } from "@/lib/postgres/pool-options";

// DATE columns are calendar days, typed as "YYYY-MM-DD" strings in the schema.
// The pg default turns them into local-midnight Date objects, which React
// cannot render and which shift across time zones.
types.setTypeParser(types.builtins.DATE, (value) => value);

type PostgresGlobal = {
  signalHubPool?: Pool;
  signalHubDatabase?: Kysely<SignalHubDatabase>;
};

const globalForPostgres = globalThis as typeof globalThis & PostgresGlobal;

function createPool() {
  return new Pool(postgresPoolOptions(process.env));
}

export const postgresPool = globalForPostgres.signalHubPool ?? createPool();
globalForPostgres.signalHubPool = postgresPool;
if (postgresPool.listenerCount("error") === 0) {
  postgresPool.on("error", (error) => {
    logger.error({ err: error }, "Unexpected error from an idle PostgreSQL connection");
  });
}
if (postgresPool.listenerCount("connect") === 0) {
  postgresPool.on("connect", (client) => {
    client.on("error", (error) => {
      logger.error({ err: error }, "Unexpected error from an active PostgreSQL connection");
    });
  });
}

export const database = globalForPostgres.signalHubDatabase ?? new Kysely<SignalHubDatabase>({
  dialect: new PostgresDialect({ pool: postgresPool }),
  plugins: [new CamelCasePlugin()],
});
globalForPostgres.signalHubDatabase = database;

export type DatabaseTransaction = Transaction<SignalHubDatabase>;
export type DatabaseExecutor = Kysely<SignalHubDatabase> | DatabaseTransaction;

export function withDatabaseTransaction<T>(
  operation: (transaction: DatabaseTransaction) => Promise<T>
) {
  return database.transaction().execute(operation);
}

export async function verifyDatabaseConnection() {
  const client = await postgresPool.connect();
  try {
    await client.query("select 1");
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  await database.destroy();
  delete globalForPostgres.signalHubDatabase;
  delete globalForPostgres.signalHubPool;
}
