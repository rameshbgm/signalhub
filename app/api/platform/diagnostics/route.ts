import { NextResponse } from "next/server";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { database, postgresPool } from "@/lib/postgres/client";
import { inspectMigrationState } from "@/lib/migrations";
import { routeError } from "@/lib/api-response";

export async function GET() {
  try {
    await requirePlatformCapability("operations.read");
    const [migration, workers, deadLetters, platformJobs, exports, identityConnections, server] =
      await Promise.all([
        inspectMigrationState(),
        database.selectFrom("workerHeartbeats").selectAll().orderBy("lastSeenAt", "desc").limit(20).execute(),
        database.selectFrom("notificationJobs").select(({ fn }) => fn.countAll<number>().as("count"))
          .where("status", "=", "DEAD_LETTER").executeTakeFirstOrThrow().then((row) => Number(row.count)),
        database.selectFrom("platformJobs").select(({ fn }) => fn.countAll<number>().as("count"))
          .where("status", "in", ["QUEUED", "PROCESSING", "FAILED"]).executeTakeFirstOrThrow().then((row) => Number(row.count)),
        database.selectFrom("dataExportJobs").select(({ fn }) => fn.countAll<number>().as("count"))
          .where("status", "in", ["QUEUED", "PROCESSING", "FAILED"]).executeTakeFirstOrThrow().then((row) => Number(row.count)),
        database
          .selectFrom("identityConnections")
          .select(["name", "type", "audience", "enabled", "lastTestOk", "lastTestedAt"])
          .execute(),
        postgresPool.query<{
          version: string;
          uptime_seconds: number;
          connections: number;
          max_connections: number;
        }>(`select
          current_setting('server_version') as version,
          extract(epoch from (clock_timestamp() - pg_postmaster_start_time()))::bigint as uptime_seconds,
          (select count(*)::int from pg_stat_activity) as connections,
          current_setting('max_connections')::int as max_connections`),
      ]);
    const serverInfo = server.rows[0];
    return NextResponse.json({
      generatedAt: new Date(),
      migrations: migration,
      database: {
        engine: "PostgreSQL",
        version: serverInfo.version,
        uptimeSeconds: Number(serverInfo.uptime_seconds),
        connections: {
          current: Number(serverInfo.connections),
          maximum: Number(serverInfo.max_connections),
        },
      },
      workers: workers.map((worker) => ({
        id: worker.workerId,
        status: worker.status,
        version: worker.version,
        lastSeenAt: worker.lastSeenAt,
        lastError: worker.lastError ?? null,
      })),
      queues: { deadLetters, platformJobs, exports },
      identityConnections,
      configuration: {
        storageDriver: process.env.ASSET_STORAGE_DRIVER ?? "local",
        signingKeyring: Boolean(process.env.SESSION_SIGNING_KEYS),
        encryptionKeyring: Boolean(process.env.ENCRYPTION_KEYS),
        trustedProxyHeaders: process.env.TRUST_PROXY_HEADERS === "true",
        metricsEnabled: Boolean(process.env.METRICS_TOKEN),
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
