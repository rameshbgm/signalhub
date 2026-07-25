import { NextResponse } from "next/server";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { collections, db } from "@/lib/db";
import { inspectMigrationState } from "@/lib/migrations";
import { routeError } from "@/lib/api-response";

export async function GET() {
  try {
    await requirePlatformCapability("operations.read");
    const [migration, workers, deadLetters, platformJobs, exports, identityConnections] =
      await Promise.all([
        inspectMigrationState(),
        collections.workerHeartbeats().find({}).sort({ lastSeenAt: -1 }).limit(20).toArray(),
        collections.notificationJobs().countDocuments({ status: "DEAD_LETTER" }),
        collections.platformJobs().countDocuments({ status: { $in: ["QUEUED", "PROCESSING", "FAILED"] } }),
        collections.dataExportJobs().countDocuments({ status: { $in: ["QUEUED", "PROCESSING", "FAILED"] } }),
        collections.identityConnections().find(
          {},
          { projection: { name: 1, type: 1, audience: 1, enabled: 1, lastTestOk: 1, lastTestedAt: 1 } }
        ).toArray(),
      ]);
    const database = await db.command({ serverStatus: 1 });
    return NextResponse.json({
      generatedAt: new Date(),
      migrations: migration,
      database: {
        version: database.version,
        uptimeSeconds: database.uptime,
        connections: database.connections,
        replicaSet: database.repl?.setName ?? null,
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
