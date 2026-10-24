import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

/**
 * Drives the real visitor subscription routes against a disposable database:
 * request a code, verify it, then confirm an incident notification is queued
 * for the new subscriber. No email is sent; delivery jobs are only inspected.
 */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);
if (enabled) {
  process.env.DATABASE_URL = url;
  process.env.STATUS_EXPOSE_OTP = "true";
  process.env.NEXT_PUBLIC_APP_URL ??= "https://status.example.invalid";
}

function post(path: string, body: unknown, ip: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!enabled)("visitor subscription flow", () => {
  const slug = `subscribe-${randomUUID().slice(0, 8)}`;
  const contact = `visitor-${randomUUID().slice(0, 8)}@example.invalid`;
  let pageId = "";
  let modules: {
    client: typeof import("../../lib/postgres/client");
    migrations: typeof import("../../lib/migrations");
    requestOtp: typeof import("../../app/api/v1/subscribe/request-otp/route");
    verifyOtp: typeof import("../../app/api/v1/subscribe/verify-otp/route");
    notify: typeof import("../../lib/notify");
    deliveryConfig: typeof import("../../lib/delivery-config");
  };

  beforeAll(async () => {
    modules = {
      client: await import("../../lib/postgres/client"),
      migrations: await import("../../lib/migrations"),
      requestOtp: await import("../../app/api/v1/subscribe/request-otp/route"),
      verifyOtp: await import("../../app/api/v1/subscribe/verify-otp/route"),
      notify: await import("../../lib/notify"),
      deliveryConfig: await import("../../lib/delivery-config"),
    };
    await modules.migrations.runMigrations();
    const { database } = modules.client;
    // Email subscriptions require a configured SMTP provider; nothing is sent.
    await modules.deliveryConfig.upsertPlatformConfiguration(database, {
      updatedBy: null, smtpHost: "smtp.invalid", smtpPort: 587, smtpFrom: "SignalHub <status@example.invalid>",
    });
    modules.deliveryConfig.clearDeliveryConfigCache();
    const org = await database.insertInto("organizations")
      .values({ name: "Subscription test", slug: `org-${slug}` } as never)
      .returning("id").executeTakeFirstOrThrow();
    const page = await database.insertInto("pages")
      .values({ orgId: org.id, name: "Subscription page", slug, type: "PUBLIC", publicVisible: true } as never)
      .returning("id").executeTakeFirstOrThrow();
    pageId = page.id;
    // The capability check requires a live delivery worker.
    await database.insertInto("workerHeartbeats").values({
      workerId: `integration-${slug}`, startedAt: new Date(), lastSeenAt: new Date(), version: "test", status: "READY",
    } as never).execute();
  }, 60_000);

  afterAll(async () => {
    await modules?.client.postgresPool.end();
  });

  it("subscribes after a correct code and rejects wrong ones", async () => {
    const requested = await modules.requestOtp.POST(post("/api/v1/subscribe/request-otp", { pageSlug: slug, channel: "EMAIL", contact }, "198.51.100.10"));
    const requestBody = await requested.json();
    expect(requested.status, JSON.stringify(requestBody)).toBe(200);
    expect(requestBody.devCode).toMatch(/^\d{6}$/);

    const { database } = modules.client;
    const otpJob = await database.selectFrom("notificationJobs").selectAll()
      .where("pageId", "=", pageId).where("eventType", "=", "subscription.otp").executeTakeFirst();
    expect(otpJob?.contact).toBe(contact);
    expect(otpJob?.status).toBe("PENDING");

    const wrongCode = requestBody.devCode === "000000" ? "111111" : "000000";
    const rejected = await modules.verifyOtp.POST(post("/api/v1/subscribe/verify-otp", { pageSlug: slug, channel: "EMAIL", contact, code: wrongCode }, "198.51.100.10"));
    expect(rejected.status).toBe(400);

    const verified = await modules.verifyOtp.POST(post("/api/v1/subscribe/verify-otp", { pageSlug: slug, channel: "EMAIL", contact, code: requestBody.devCode }, "198.51.100.10"));
    expect(verified.status, JSON.stringify(await verified.clone().json())).toBe(200);

    const subscriber = await database.selectFrom("subscribers").selectAll()
      .where("pageId", "=", pageId).where("contact", "=", contact).executeTakeFirstOrThrow();
    expect(subscriber.verified).toBe(true);
    expect(subscriber.quarantined).toBe(false);
  });

  it("queues incident notifications with an unsubscribe link for the new subscriber", async () => {
    const queued = await modules.notify.dispatchNotifications({
      pageId,
      subject: "[Investigating] Elevated errors",
      body: "We are investigating elevated error rates.",
      eventType: "incident.created",
      eventId: `incident-${slug}`,
    });
    expect(queued).toBeGreaterThan(0);
    const job = await modules.client.database.selectFrom("notificationJobs").selectAll()
      .where("pageId", "=", pageId).where("eventType", "=", "incident.created").executeTakeFirstOrThrow();
    expect(job.contact).toBe(contact);
    expect(job.body).toContain("/api/v1/subscribe/unsubscribe/");
    expect(job.body).toContain(`/${slug}/subscription/`);
  });

  it("confirms the subscription by email with preference and unsubscribe links", async () => {
    const confirmation = await modules.client.database.selectFrom("notificationJobs").selectAll()
      .where("pageId", "=", pageId).where("eventType", "=", "subscription.confirmed").executeTakeFirstOrThrow();
    expect(confirmation.contact).toBe(contact);
    expect(confirmation.subject).toBe("You're subscribed to Subscription page");
    expect(confirmation.body).toContain("Manage preferences:");
    expect(confirmation.body).toContain("Unsubscribe:");
  });

  it("lets the subscriber change services and unsubscribe with the private token", async () => {
    const subscriptions = await import("../../lib/subscriptions");
    const { database } = modules.client;
    const subscriber = await database.selectFrom("subscribers").select(["unsubscribeToken"])
      .where("pageId", "=", pageId).where("contact", "=", contact).executeTakeFirstOrThrow();
    const { generateAutomationToken } = await import("../../lib/tokens");
    const token = generateAutomationToken();
    const component = await database.insertInto("components").values({
      pageId, name: "Checkout", description: "", status: "OPERATIONAL", order: 0, visible: true,
      showUptime: true, manualStatus: "OPERATIONAL", isThirdParty: false, thirdPartyProvider: null,
      automationTokenHash: token.hash, automationTokenPrefix: token.prefix, automationTokenLastFour: token.lastFour,
    } as never).returning("id").executeTakeFirstOrThrow();

    expect(await subscriptions.updateSubscriptionScope(subscriber.unsubscribeToken, [component.id])).toEqual({ ok: true });
    const narrowed = await database.selectFrom("subscribers").select("componentIds")
      .where("unsubscribeToken", "=", subscriber.unsubscribeToken).executeTakeFirstOrThrow();
    expect(narrowed.componentIds).toEqual([component.id]);

    // A service from another page is refused.
    const foreign = await subscriptions.updateSubscriptionScope(subscriber.unsubscribeToken, ["00000000-0000-4000-8000-000000000000"]);
    expect(foreign.ok).toBe(false);

    expect(await subscriptions.unsubscribe(subscriber.unsubscribeToken)).toEqual({ ok: true, removed: true });
    // Repeating it is harmless, as RFC 8058 one-click requires.
    expect(await subscriptions.unsubscribe(subscriber.unsubscribeToken)).toEqual({ ok: true, removed: false });
    expect(await subscriptions.findSubscription(subscriber.unsubscribeToken)).toBeUndefined();
  });
});
