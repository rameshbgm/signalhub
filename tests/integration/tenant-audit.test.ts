import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Tenant actions land on the sealed audit chain and reach only their organization's sink. */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("tenant audit", () => {
  const suffix = randomUUID().slice(0, 8);
  let modules: {
    client: typeof import("../../lib/postgres/client");
    migrations: typeof import("../../lib/migrations");
    tenantAudit: typeof import("../../lib/tenant-audit");
    integrity: typeof import("../../lib/audit-integrity");
  };
  let orgA = "";
  let orgB = "";
  let sinkA = "";
  let sinkB = "";

  beforeAll(async () => {
    modules = {
      client: await import("../../lib/postgres/client"),
      migrations: await import("../../lib/migrations"),
      tenantAudit: await import("../../lib/tenant-audit"),
      integrity: await import("../../lib/audit-integrity"),
    };
    await modules.migrations.runMigrations();
    const { database } = modules.client;
    const user = await database.insertInto("users").values({
      username: `auditor-${suffix}`, canonicalUsername: `auditor-${suffix}`,
      email: `auditor-${suffix}@example.invalid`, canonicalEmail: `auditor-${suffix}@example.invalid`, name: "Auditor",
    } as never).returning("id").executeTakeFirstOrThrow();
    orgA = (await database.insertInto("organizations").values({ name: "A", slug: `a-${suffix}` } as never).returning("id").executeTakeFirstOrThrow()).id;
    orgB = (await database.insertInto("organizations").values({ name: "B", slug: `b-${suffix}` } as never).returning("id").executeTakeFirstOrThrow()).id;
    const sink = (orgId: string, name: string) => database.insertInto("auditSinks").values({
      name, orgId, url: "https://sink.example.invalid/audit", secretCiphertext: "unused", createdBy: user.id,
    } as never).returning("id").executeTakeFirstOrThrow();
    sinkA = (await sink(orgA, `sink-a-${suffix}`)).id;
    sinkB = (await sink(orgB, `sink-b-${suffix}`)).id;
  }, 60_000);

  afterAll(async () => {
    await modules?.client.postgresPool.end();
  });

  it("records, seals, and routes a tenant action to its organization only", async () => {
    const { database } = modules.client;
    const target = `api-key-${suffix}`;
    await modules.tenantAudit.writeActiveTenantAudit(orgA, { actor: "responder@example.invalid", action: "CREATE_API_KEY", target });
    // Drain the seal queue (batches of 500).
    while ((await modules.integrity.sealAuditEntries()) > 0) { /* keep sealing */ }

    const entry = await database.selectFrom("platformAuditLogs").selectAll()
      .where("targetId", "=", target).executeTakeFirstOrThrow();
    expect(entry.actorRole).toBe("TENANT");
    expect(entry.organizationId).toBe(orgA);
    expect(entry.entryHash).toMatch(/^[0-9a-f]{64}$/);

    const deliveries = await database.selectFrom("auditDeliveryJobs").select("sinkId")
      .where("deduplicationKey", "like", `%:${entry.id}`).execute();
    const sinks = deliveries.map((delivery) => delivery.sinkId);
    expect(sinks).toContain(sinkA);
    expect(sinks).not.toContain(sinkB);
  });
});
