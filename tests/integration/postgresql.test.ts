import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs against a disposable PostgreSQL database only:
 *   INTEGRATION_DATABASE_URL=postgresql://user:pass@127.0.0.1:5499/signalhub_integration_test npm run test:integration
 * The database name must contain "test" because these tests migrate the schema
 * and run destructive sweeps.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);

if (url && !enabled) {
  throw new Error(`Refusing to run integration tests against "${databaseName}": the database name must contain "test".`);
}
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("PostgreSQL integration", () => {
  let modules: {
    migrations: typeof import("../../lib/migrations");
    client: typeof import("../../lib/postgres/client");
    retention: typeof import("../../lib/retention");
    maintenance: typeof import("../../lib/domain/maintenance");
  };

  beforeAll(async () => {
    modules = {
      migrations: await import("../../lib/migrations"),
      client: await import("../../lib/postgres/client"),
      retention: await import("../../lib/retention"),
      maintenance: await import("../../lib/domain/maintenance"),
    };
    await modules.migrations.runMigrations();
  }, 60_000);

  afterAll(async () => {
    await modules?.client.postgresPool.end();
  });

  it("applies every migration idempotently and reports a current schema", async () => {
    await modules.migrations.runMigrations();
    const state = await modules.migrations.inspectMigrationState();
    expect(state.current).toBe(true);
    expect(state.missingIds).toEqual([]);
  });

  it("runs the retention sweep, then holds the lease for less than the hourly interval", async () => {
    const { database } = modules.client;
    await database.deleteFrom("maintenanceLeases").where("id", "=", "retention").execute();
    const now = new Date();
    expect(await modules.retention.runRetentionSweep("integration-a", now)).toBe(true);
    // A second worker in the same hour is fenced off...
    expect(await modules.retention.runRetentionSweep("integration-b", now)).toBe(false);
    // ...but the next hourly run is not.
    const nextHour = new Date(now.getTime() + 60 * 60_000);
    expect(await modules.retention.runRetentionSweep("integration-b", nextHour)).toBe(true);
  });

  it("runs maintenance transitions against the live schema", async () => {
    const result = await modules.maintenance.runMaintenanceTransitions(new Date());
    expect(result).toEqual({ reminded: expect.any(Number), started: expect.any(Number), completed: expect.any(Number) });
  });
});
