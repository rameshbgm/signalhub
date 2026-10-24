import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs", () => ({ enqueueJobSweep: async () => undefined, JOB_TASKS: { notifications: "notifications" } }));

const { dispatchNotifications } = await import("../lib/notify");

/** Minimal stand-in for the Kysely executor: every query chain resolves to the rows configured for its table. */
function fakeExecutor(tables: Record<string, unknown[]>, inserted: Record<string, unknown>[]) {
  const query = (table: string) => {
    const chain: unknown = new Proxy({}, {
      get: (_target, property) => {
        if (property === "execute") return async () => tables[table] ?? [];
        if (property === "executeTakeFirst") return async () => (tables[table] ?? [])[0];
        if (property === "values") return (values: Record<string, unknown>[]) => { inserted.push(...values); return chain; };
        return () => chain;
      },
    });
    return chain;
  };
  return { selectFrom: query, insertInto: query } as never;
}

describe("dispatchNotifications audience", () => {
  const tables = {
    pages: [{ id: "page", slug: "acme", isHub: false, hubParentId: null, orgId: "org", name: "Acme" }],
    subscribers: [{ id: "sub", channel: "EMAIL", contact: "reader@example.com", eventTypes: [], componentIds: [], verified: true, quarantined: false, unsubscribeToken: "t" }],
    webhookEndpoints: [{ id: "hook", url: "https://hooks.example.com/x" }],
    notificationDestinations: [{ id: "dest", channel: "SLACK", name: "ops", eventTypes: [], componentIds: [] }],
  };
  const event = { pageId: "page", subject: "[Certificate expiring] API", body: "expires in 3 days", eventType: "monitor.cert_expiring", eventId: "m:cert:x" };

  it("sends public events to subscribers, webhooks and destinations", async () => {
    const inserted: Record<string, unknown>[] = [];
    await dispatchNotifications(event, fakeExecutor(tables, inserted));
    expect(inserted.map((job) => job.channel).sort()).toEqual(["EMAIL", "SLACK", "WEBHOOK"]);
  });

  it("keeps operator-only events away from page subscribers", async () => {
    const inserted: Record<string, unknown>[] = [];
    await dispatchNotifications({ ...event, audience: "operators" }, fakeExecutor(tables, inserted));
    expect(inserted.map((job) => job.channel).sort()).toEqual(["SLACK", "WEBHOOK"]);
  });

  it("adds a saved response to webhook and destination payloads but never to subscriber jobs", async () => {
    const inserted: Record<string, unknown>[] = [];
    await dispatchNotifications({ ...event, eventType: "monitor.down", response: '{"error":"db down"}' }, fakeExecutor(tables, inserted));
    const payloadOf = (channel: string) => inserted.find((job) => job.channel === channel)?.payload as Record<string, unknown>;
    expect(payloadOf("WEBHOOK").response).toBe('{"error":"db down"}');
    expect(payloadOf("SLACK").response).toBe('{"error":"db down"}');
    expect(payloadOf("EMAIL")).not.toHaveProperty("response");
    expect(JSON.stringify(inserted.find((job) => job.channel === "EMAIL"))).not.toContain("db down");
  });
});
