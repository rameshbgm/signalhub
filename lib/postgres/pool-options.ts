import type { PoolConfig } from "pg";

/**
 * Pure builder for the pg pool options so the app, the setup wizard's
 * connection test and unit tests all connect the same way.
 *
 * `DATABASE_SSL_CA` (PEM text) pins the server CA, which managed databases
 * (RDS, Azure, Cloud SQL) need because their CAs are not in Node's trust
 * store. pg lets a `sslmode=` in the URL override the `ssl` option, so the
 * parameter is stripped whenever a CA is supplied.
 */
export function postgresPoolOptions(env: Partial<NodeJS.ProcessEnv>): PoolConfig {
  const value = env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not set");
  if (!/^postgres(?:ql)?:\/\//.test(value)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string");
  }
  const ca = env.DATABASE_SSL_CA?.trim();
  let connectionString = value;
  if (ca) {
    const url = new URL(value);
    url.searchParams.delete("sslmode");
    connectionString = url.toString();
  }
  return {
    connectionString,
    ssl: ca ? { ca, rejectUnauthorized: true } : undefined,
    max: Number(env.DATABASE_POOL_SIZE ?? 20),
    idleTimeoutMillis: Number(env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000),
    application_name: env.SERVICE_NAME ?? "signalhub",
  };
}
