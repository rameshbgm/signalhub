import { CamelCasePlugin, Kysely, PostgresDialect, type Transaction } from "kysely";
import { Pool } from "pg";
import type { SignalHubDatabase } from "@/lib/postgres/schema";
import { logger } from "@/lib/logger";

type PostgresGlobal = {
  signalHubPool?: Pool;
  signalHubDatabase?: Kysely<SignalHubDatabase>;
};

const globalForPostgres = globalThis as typeof globalThis & PostgresGlobal;

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not set");
  if (!/^postgres(?:ql)?:\/\//.test(value)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string");
  }
  return value;
}

function createPool() {
  return new Pool({
    connectionString: connectionString(),
    max: Number(process.env.DATABASE_POOL_SIZE ?? 20),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000),
    application_name: process.env.SERVICE_NAME ?? "signalhub",
  });
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
