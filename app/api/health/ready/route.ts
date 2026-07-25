import { NextResponse } from "next/server";
import { collections, db } from "@/lib/db";
import { inspectMigrationState } from "@/lib/migrations";

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
    await db.command({ ping: 1 }, { timeoutMS: 2_000 });
    checks.database = true;
    checks.migrations = (await inspectMigrationState()).current;
    checks.enterpriseIdentityConnections = await collections.identityConnections().countDocuments({ enabled: true });
    const heartbeat = await collections
      .workerHeartbeats()
      .find({ status: "READY", lastSeenAt: { $gt: new Date(Date.now() - 30_000) } })
      .sort({ lastSeenAt: -1 })
      .limit(1)
      .next();
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
