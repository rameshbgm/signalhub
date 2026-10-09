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
  const pool = new Pool(postgresPoolOptions(process.env));
  pool.on("error", (error) => {
    logger.error({ err: error }, "Unexpected error from an idle PostgreSQL connection");
  });
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      logger.error({ err: error }, "Unexpected error from an active PostgreSQL connection");
    });
  });
  return pool;
}

/**
 * The pool is created on first use, not at import: `next build` and the
 * first-run setup mode load route modules before any DATABASE_URL exists.
 */
function pool() {
  globalForPostgres.signalHubPool ??= createPool();
  return globalForPostgres.signalHubPool;
}

/** The shared pg Pool (created lazily); usable anywhere a Pool is expected. */
export const postgresPool: Pool = new Proxy({} as Pool, {
  get(_target, property) {
    const target = pool();
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
  set(_target, property, value) {
    return Reflect.set(pool(), property, value);
  },
  getPrototypeOf() {
    return Pool.prototype;
  },
});

export const database = globalForPostgres.signalHubDatabase ?? new Kysely<SignalHubDatabase>({
  dialect: new PostgresDialect({ pool: async () => pool() }),
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
  // Kysely only ends the pool if it created a connection itself.
  await database.destroy();
  const current = globalForPostgres.signalHubPool;
  if (current && !current.ended) await current.end();
  delete globalForPostgres.signalHubDatabase;
  delete globalForPostgres.signalHubPool;
}
