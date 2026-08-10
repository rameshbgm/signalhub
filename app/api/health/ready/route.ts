import { NextResponse } from "next/server";
import { inspectMigrationState } from "@/lib/migrations";
import { database, verifyDatabaseConnection } from "@/lib/postgres/client";

export async function GET() {
  const checks = {
    database: false,
    migrations: false,
    worker: false,
    smtpConfigured: Boolean(process.env.SMTP_HOST),
    smsConfigured: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    ),
    assetStorage: (process.env.ASSET_STORAGE_DRIVER ?? "local").toLowerCase(),
    oidcConfigured: Boolean(
      process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET
    ),
    enterpriseIdentityConnections: 0,
  };
  try {
    await verifyDatabaseConnection();
    checks.database = true;
    checks.migrations = (await inspectMigrationState()).current;
    const identityCount = await database
      .selectFrom("identityConnections")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("enabled", "=", true)
      .executeTakeFirstOrThrow();
    checks.enterpriseIdentityConnections = Number(identityCount.count);
    const heartbeat = await database
      .selectFrom("workerHeartbeats")
      .select("id")
      .where("status", "=", "READY")
      .where("lastSeenAt", ">", new Date(Date.now() - 30_000))
      .orderBy("lastSeenAt", "desc")
      .executeTakeFirst();
    checks.worker = Boolean(heartbeat);
  } catch {
    // The structured response below identifies which dependency is unavailable.
  }
  const requireWorker = process.env.REQUIRE_WORKER !== "false";
  const ready = checks.database && checks.migrations && (!requireWorker || checks.worker);
  return NextResponse.json(
    { ready, checks },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
