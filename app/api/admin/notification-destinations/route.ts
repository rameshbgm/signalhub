import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { newDatabaseId, isDatabaseId } from "@/lib/database-id";
import { encryptSecret } from "@/lib/encryption";
import { DESTINATION_CHANNELS, DESTINATION_EVENT_TYPES, PLATFORM_CONNECTION_KEY } from "@/lib/destination-catalog";
import { validateDestinationConfig } from "@/lib/destination-validation";
import { deliverDestination } from "@/lib/notification-providers";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { destinationConnections, destinationDefaults, enabledDestinationChannels } from "@/lib/platform-configuration";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import type { NotificationDestinationRow } from "@/lib/postgres/schema";

const schema = z.object({
  pageId: z.string(),
  name: z.string().trim().min(1).max(100),
  channel: z.enum(DESTINATION_CHANNELS),
  config: z.record(z.string(), z.string()),
  /** Send the verification message without storing the destination. */
  dryRun: z.boolean().optional(),
  /** Send through the platform administrator's shared connection instead of own credentials. */
  usePlatformConnection: z.boolean().optional(),
  /** Limit the destination to these events / components; empty means all. */
  eventTypes: z.array(z.enum(DESTINATION_EVENT_TYPES.map((event) => event.value) as [string, ...string[]])).max(20).default([]),
  componentIds: z.array(z.string()).max(200).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const session = await requireCapability("integration.manage", parsed.data.pageId);
    const enabledChannels = await enabledDestinationChannels();
    if (!enabledChannels.includes(parsed.data.channel)) {
      return apiError(403, "DESTINATION_DISABLED", "This notification provider is disabled by the platform administrator");
    }
    const page = await database
      .selectFrom("pages")
      .select(["id", "name"])
      .where("id", "=", parsed.data.pageId)
      .where("orgId", "=", session.orgId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");

    let config: Record<string, string>;
    try {
      if (parsed.data.usePlatformConnection) {
        if (!(await destinationConnections())[parsed.data.channel]) throw new Error("This provider has no platform connection");
        // Only a marker is stored; the credentials stay with the platform and are resolved at send time.
        config = { [PLATFORM_CONNECTION_KEY]: "true" };
      } else {
        config = await validateDestinationConfig(parsed.data.channel, parsed.data.config, await destinationDefaults());
      }
    } catch (error) {
      return apiError(400, "INVALID_CONFIG", error instanceof Error ? error.message.slice(0, 300) : "Invalid configuration");
    }
    const componentIds = [...new Set(parsed.data.componentIds)];
    if (componentIds.length) {
      const owned = await database.selectFrom("components").select("id")
        .where("pageId", "=", page.id).where("id", "in", componentIds.filter(isDatabaseId)).execute();
      if (owned.length !== componentIds.length) return apiError(400, "INVALID_COMPONENTS", "Choose components from this page");
    }
    const now = new Date();
    const destination: NotificationDestinationRow = {
      id: newDatabaseId(),
      pageId: page.id,
      name: parsed.data.name,
      channel: parsed.data.channel,
      configCiphertext: encryptSecret(JSON.stringify(config)),
      active: true,
      verifiedAt: now,
      lastTestedAt: now,
      lastTestOk: true,
      lastError: null,
      eventTypes: [...new Set(parsed.data.eventTypes)],
      componentIds: componentIds.length ? componentIds : null,
      createdAt: now,
    };
    try {
      await deliverDestination(destination, {
        subject: `${page.name} connection test`,
        body: "This destination is ready to receive incident and maintenance updates.",
        eventType: "destination.test",
      });
    } catch (error) {
      return apiError(502, "TEST_FAILED", error instanceof Error ? error.message.slice(0, 300) : "Connection test failed");
    }
    if (parsed.data.dryRun) return NextResponse.json({ ok: true, tested: true });
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      const currentPage = await transaction
        .selectFrom("pages")
        .select("id")
        .where("id", "=", page.id)
        .where("orgId", "=", session.orgId)
        .where("deletedAt", "is", null)
        .forShare()
        .executeTakeFirst();
      if (!currentPage) throw new Error("Page not found in your organization");
      await transaction.insertInto("notificationDestinations").values(destination).execute();
    });
    return NextResponse.json({
      ok: true,
      destination: {
        id: destination.id,
        name: destination.name,
        channel: destination.channel,
        active: true,
        verifiedAt: now.toISOString(),
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!isDatabaseId(id)) return apiError(400, "INVALID_ID", "Invalid destination");
    const destination = await database
      .selectFrom("notificationDestinations")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!destination) return apiError(404, "NOT_FOUND", "Destination not found");
    const session = await requireCapability("integration.manage", destination.pageId);
    const page = await assertPageInOrg(destination.pageId, session.orgId);

    if (body.action === "toggle") {
      await withDatabaseTransaction(async (transaction) => {
        await fenceActiveOrganizationMutation(session.orgId, transaction);
        const updated = await transaction
          .updateTable("notificationDestinations")
          .set({ active: !destination.active })
          .where("id", "=", destination.id)
          .where("pageId", "=", page.id)
          .returning("id")
          .executeTakeFirst();
        if (!updated) throw new Error("Destination not found");
      });
      return NextResponse.json({ ok: true });
    }

    try {
      await deliverDestination(destination, {
        subject: `${page.name} connection test`,
        body: "This destination is ready to receive incident and maintenance updates.",
        eventType: "destination.test",
      });
      const testedAt = new Date();
      await updateTestResult(destination.id, page.id, session.orgId, testedAt, true, null);
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Connection test failed";
      await updateTestResult(destination.id, page.id, session.orgId, new Date(), false, message);
      return apiError(502, "TEST_FAILED", message);
    }
  } catch (error) {
    return routeError(error);
  }
}

async function updateTestResult(
  destinationId: string,
  pageId: string,
  organizationId: string,
  testedAt: Date,
  ok: boolean,
  error: string | null
) {
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(organizationId, transaction);
    const updated = await transaction
      .updateTable("notificationDestinations")
      .set({
        lastTestedAt: testedAt,
        lastTestOk: ok,
        lastError: error,
        ...(ok ? { verifiedAt: testedAt } : {}),
      })
      .where("id", "=", destinationId)
      .where("pageId", "=", pageId)
      .returning("id")
      .executeTakeFirst();
    if (!updated) throw new Error("Destination not found");
  });
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!isDatabaseId(id)) return apiError(400, "INVALID_ID", "Invalid destination");
    const destination = await database
      .selectFrom("notificationDestinations")
      .select(["id", "pageId"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!destination) return NextResponse.json({ ok: true });
    const session = await requireCapability("integration.manage", destination.pageId);
    const page = await assertPageInOrg(destination.pageId, session.orgId);
    await withDatabaseTransaction(async (transaction) => {
      await fenceActiveOrganizationMutation(session.orgId, transaction);
      await transaction
        .deleteFrom("notificationDestinations")
        .where("id", "=", destination.id)
        .where("pageId", "=", page.id)
        .execute();
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
