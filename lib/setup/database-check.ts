import { Client } from "pg";
import { postgresPoolOptions } from "@/lib/postgres/pool-options";

export type DatabaseInput =
  | { url: string; ca?: string }
  | {
      host: string;
      port?: number;
      database: string;
      user: string;
      password: string;
      /**
       * pg treats libpq's `require` as `verify-full`, so the modes offered are
       * the ones it really implements: verify, encrypt-only, or off.
       */
      sslMode: "verify-full" | "no-verify" | "disable";
      ca?: string;
    };

export type CheckStatus = "pass" | "warn" | "fail";
export type DatabaseCheck = { id: string; status: CheckStatus; message: string };
export type DatabaseTestResult = {
  ok: boolean;
  /** True when the database holds unrelated tables and the operator must confirm. */
  needsConfirmation: boolean;
  /** Set when the server is reachable but the database does not exist yet. */
  missingDatabase: string | null;
  url: string | null;
  ca: string | null;
  checks: DatabaseCheck[];
};

// Nothing in the migrations needs more than PostgreSQL 14 (built-in
// gen_random_uuid, declarative partitioning); CI and the bundled image use 18.
export const MINIMUM_SERVER_VERSION = 140000;
const TESTED_SERVER_VERSION = 180000;

export function databaseUrlFromInput(input: DatabaseInput): string {
  if ("url" in input) {
    const value = input.url.trim();
    if (!/^postgres(?:ql)?:\/\//.test(value)) {
      throw new Error("The connection URL must start with postgresql://");
    }
    return value;
  }
  if (!input.host.trim()) throw new Error("Enter the database host");
  if (!input.database.trim()) throw new Error("Enter the database name");
  if (!input.user.trim()) throw new Error("Enter the database user");
  // URL() percent-encodes credentials, so passwords with @ : / # work.
  const url = new URL("postgresql://placeholder");
  url.hostname = input.host.trim();
  url.port = String(input.port || 5432);
  url.username = input.user.trim();
  url.password = input.password;
  url.pathname = `/${encodeURIComponent(input.database.trim())}`;
  // With a pasted CA, pool options pin it and verify fully instead.
  if (!input.ca?.trim()) url.searchParams.set("sslmode", input.sslMode);
  return url.toString();
}

/** Plain-language explanation for the connection errors operators actually hit. */
export function describeConnectionError(error: unknown): string {
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  switch (code) {
    case "28P01":
    case "28000":
      return "The database rejected the user name or password.";
    case "3D000":
      return "The database does not exist yet. Check the name, or create it.";
    case "ECONNREFUSED":
      return "Nothing is listening at that host and port. Check the host, the port and any firewall.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "The database host name could not be resolved.";
    case "ETIMEDOUT":
      return "The connection timed out. Check that the database allows connections from this server.";
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
      return "The server's TLS certificate is not trusted. Paste your provider's CA certificate.";
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "The server's TLS certificate does not match the host name.";
  }
  if (/does not support SSL|server does not support ssl/i.test(message)) {
    return "The server does not accept TLS. Choose SSL mode \"disable\" (only on a private network).";
  }
  if (/no pg_hba\.conf entry/i.test(message)) {
    return "The server does not allow connections from this host (pg_hba.conf). Ask your provider or admin to allow it.";
  }
  if (/timeout/i.test(message)) {
    return "The connection timed out. Check that the database allows connections from this server.";
  }
  return `Could not connect: ${message}`;
}

/** Transaction poolers break LISTEN/NOTIFY and session advisory locks. */
export function looksLikeTransactionPooler(url: string) {
  const parsed = new URL(url);
  return parsed.port === "6543" || /pgbouncer|pooler/i.test(parsed.hostname);
}

export async function testDatabase(input: DatabaseInput): Promise<DatabaseTestResult> {
  const checks: DatabaseCheck[] = [];
  const ca = input.ca?.trim() || null;
  let url: string;
  try {
    url = databaseUrlFromInput(input);
  } catch (error) {
    checks.push({ id: "input", status: "fail", message: (error as Error).message });
    return { ok: false, needsConfirmation: false, missingDatabase: null, url: null, ca, checks };
  }

  const options = postgresPoolOptions({ DATABASE_URL: url, DATABASE_SSL_CA: ca ?? undefined });
  const client = new Client({
    connectionString: options.connectionString,
    ssl: options.ssl,
    connectionTimeoutMillis: 5_000,
    application_name: "signalhub-setup",
  });
  let needsConfirmation = false;
  let missingDatabase: string | null = null;
  try {
    await client.connect();
    checks.push({ id: "connect", status: "pass", message: "Connected and signed in." });

    const version = Number((await client.query("show server_version_num")).rows[0].server_version_num);
    const label = `PostgreSQL ${Math.floor(version / 10000)}`;
    if (version < MINIMUM_SERVER_VERSION) {
      checks.push({ id: "version", status: "fail", message: `${label} is too old. SignalHub needs PostgreSQL 14 or newer.` });
    } else if (version < TESTED_SERVER_VERSION) {
      checks.push({ id: "version", status: "warn", message: `${label} is supported; SignalHub is tested with PostgreSQL 18.` });
    } else {
      checks.push({ id: "version", status: "pass", message: `${label}.` });
    }

    const canCreate = (await client.query(
      "select has_schema_privilege(current_user, 'public', 'CREATE') as allowed"
    )).rows[0].allowed as boolean;
    checks.push(canCreate
      ? { id: "privileges", status: "pass", message: "The user can create tables." }
      : { id: "privileges", status: "fail", message: "The user cannot create tables in the public schema. GRANT CREATE ON SCHEMA public to it." });

    const state = (await client.query(`
      select to_regclass('public.schema_migrations') is not null as signalhub,
             (select count(*)::int from pg_tables where schemaname = 'public') as tables
    `)).rows[0] as { signalhub: boolean; tables: number };
    if (state.signalhub) {
      const applied = (await client.query("select count(*)::int as count from schema_migrations")).rows[0].count as number;
      checks.push({ id: "contents", status: "pass", message: `Existing SignalHub database (${applied} migrations applied). It will be upgraded.` });
    } else if (state.tables === 0) {
      checks.push({ id: "contents", status: "pass", message: "Empty database. SignalHub will install its tables." });
    } else {
      needsConfirmation = true;
      checks.push({ id: "contents", status: "warn", message: `The database already has ${state.tables} unrelated tables. A dedicated database is recommended.` });
    }
  } catch (error) {
    if ((error as { code?: string }).code === "3D000") missingDatabase = databaseName(url);
    checks.push({ id: "connect", status: "fail", message: describeConnectionError(error) });
  } finally {
    await client.end().catch(() => undefined);
  }

  if (checks.some((check) => check.id === "connect" && check.status === "pass") && looksLikeTransactionPooler(url)) {
    checks.push({
      id: "pooler",
      status: "warn",
      message: "This looks like a transaction pooler. Use the direct connection string: background jobs need LISTEN/NOTIFY and advisory locks.",
    });
  }

  return {
    ok: !checks.some((check) => check.status === "fail"),
    needsConfirmation,
    missingDatabase,
    url,
    ca,
    checks,
  };
}

function databaseName(url: string) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/**
 * Creates the database named in the connection, connecting to the server's
 * maintenance database with the same credentials. Needs CREATEDB (or a
 * superuser); managed providers usually grant it to their admin user.
 */
export async function createDatabase(input: DatabaseInput): Promise<{ ok: true } | { ok: false; message: string }> {
  let url: URL;
  try {
    url = new URL(databaseUrlFromInput(input));
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  const name = databaseName(url.toString());
  if (!name) return { ok: false, message: "Enter the database name first." };
  let lastError: unknown = null;
  for (const maintenance of ["postgres", "template1"]) {
    url.pathname = `/${maintenance}`;
    const options = postgresPoolOptions({ DATABASE_URL: url.toString(), DATABASE_SSL_CA: input.ca?.trim() || undefined });
    const client = new Client({ connectionString: options.connectionString, ssl: options.ssl, connectionTimeoutMillis: 5_000, application_name: "signalhub-setup" });
    try {
      await client.connect();
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`);
      return { ok: true };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "42P04") return { ok: true }; // already exists
      if (code === "42501") {
        return { ok: false, message: `This user may not create databases. Ask an administrator to run: CREATE DATABASE "${name}" OWNER "${decodeURIComponent(url.username)}";` };
      }
      lastError = error;
      if (code !== "3D000") break; // only retry when the maintenance database is missing
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  return { ok: false, message: describeConnectionError(lastError) };
}
