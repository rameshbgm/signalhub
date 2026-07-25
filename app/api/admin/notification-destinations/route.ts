import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertPageInOrg, requireCapability } from "@/lib/admin-guard";
import { apiError, routeError, validationError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { encryptSecret } from "@/lib/encryption";
import {
  DESTINATION_CHANNELS,
  deliverDestination,
  type DestinationChannel,
} from "@/lib/notification-providers";
import { isValidOid, oid } from "@/lib/mongo-utils";
import { validateHttpTarget } from "@/lib/target-validation";
import { withTransaction } from "@/lib/cascade";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";

const schema = z.object({
  pageId: z.string(),
  name: z.string().trim().min(1).max(100),
  channel: z.enum(DESTINATION_CHANNELS),
  config: z.record(z.string(), z.string()),
});

const URL_CHANNELS = new Set<DestinationChannel>([
  "SLACK",
  "MICROSOFT_TEAMS",
  "DISCORD",
  "GOOGLE_CHAT",
]);

async function validateConfig(channel: DestinationChannel, config: Record<string, string>) {
  if (URL_CHANNELS.has(channel)) {
    config.url = (await validateHttpTarget(config.url ?? "", { httpsOnly: true, allowPrivate: false })).toString();
  }
  if (channel === "NTFY" && config.serverUrl) {
    config.serverUrl = (await validateHttpTarget(config.serverUrl, { httpsOnly: true, allowPrivate: false })).toString();
  }
  const requiredByChannel: Record<DestinationChannel, string[]> = {
    SLACK: ["url"],
    MICROSOFT_TEAMS: ["url"],
    DISCORD: ["url"],
    GOOGLE_CHAT: ["url"],
    TELEGRAM: ["botToken", "chatId"],
    WHATSAPP: ["accountSid", "authToken", "from", "to"],
    PAGERDUTY: ["routingKey"],
    OPSGENIE: ["apiKey"],
    NTFY: ["topic"],
  };
  for (const field of requiredByChannel[channel]) {
    if (!config[field]?.trim()) throw new Error(`${field} is required`);
  }
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])
  );
}

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const session = await requireCapability("integration.manage", parsed.data.pageId);
    const page = await collections.pages().findOne({
      _id: oid(parsed.data.pageId),
      orgId: oid(session.orgId),
    });
    if (!page) return apiError(404, "PAGE_NOT_FOUND", "Page not found");
    const config = await validateConfig(parsed.data.channel, parsed.data.config);
    const now = new Date();
    const destination = {
      _id: new ObjectId(),
      pageId: page._id,
      name: parsed.data.name,
      channel: parsed.data.channel,
      configCiphertext: encryptSecret(JSON.stringify(config)),
      active: true,
      verifiedAt: now,
      lastTestedAt: now,
      lastTestOk: true,
      lastError: null,
      eventTypes: [],
      componentIds: null,
      createdAt: now,
    };
    await deliverDestination(destination, {
      subject: `${page.name} connection test`,
      body: "This destination is ready to receive incident and maintenance updates.",
      eventType: "destination.test",
    });
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const currentPage = await collections.pages().findOne(
        { _id: page._id, orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!currentPage) throw new Error("Page not found in your organization");
      await collections.notificationDestinations().insertOne(
        destination,
        { session: databaseSession }
      );
    });
    return NextResponse.json({
      ok: true,
      destination: {
        id: destination._id.toHexString(),
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
    if (!isValidOid(id)) return apiError(400, "INVALID_ID", "Invalid destination");
    const destination = await collections.notificationDestinations().findOne({ _id: oid(id) });
    if (!destination) return apiError(404, "NOT_FOUND", "Destination not found");
    const session = await requireCapability("integration.manage", destination.pageId.toHexString());
    await assertPageInOrg(destination.pageId.toHexString(), session.orgId);
    if (body.action === "toggle") {
      await withTransaction(async (databaseSession) => {
        await fenceActiveOrganizationMutation(session.orgId, databaseSession);
        const page = await collections.pages().findOne(
          { _id: destination.pageId, orgId: oid(session.orgId) },
          { session: databaseSession }
        );
        if (!page) throw new Error("Destination not found");
        await collections.notificationDestinations().updateOne(
          { _id: destination._id, pageId: page._id },
          { $set: { active: !destination.active } },
          { session: databaseSession }
        );
      });
      return NextResponse.json({ ok: true });
    }
    const page = await collections.pages().findOne({
      _id: destination.pageId,
      orgId: oid(session.orgId),
    });
    if (!page) return apiError(404, "NOT_FOUND", "Destination not found");
    try {
      await deliverDestination(destination, {
        subject: `${page?.name ?? "SignalHub"} connection test`,
        body: "This destination is ready to receive incident and maintenance updates.",
        eventType: "destination.test",
      });
      await withTransaction(async (databaseSession) => {
        await fenceActiveOrganizationMutation(session.orgId, databaseSession);
        const currentPage = await collections.pages().findOne(
          { _id: destination.pageId, orgId: oid(session.orgId) },
          { session: databaseSession }
        );
        if (!currentPage) throw new Error("Destination not found");
        await collections.notificationDestinations().updateOne(
          { _id: destination._id, pageId: currentPage._id },
          { $set: { lastTestedAt: new Date(), lastTestOk: true, lastError: null, verifiedAt: new Date() } },
          { session: databaseSession }
        );
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Connection test failed";
      await withTransaction(async (databaseSession) => {
        await fenceActiveOrganizationMutation(session.orgId, databaseSession);
        const currentPage = await collections.pages().findOne(
          { _id: destination.pageId, orgId: oid(session.orgId) },
          { session: databaseSession }
        );
        if (!currentPage) throw new Error("Destination not found");
        await collections.notificationDestinations().updateOne(
          { _id: destination._id, pageId: currentPage._id },
          { $set: { lastTestedAt: new Date(), lastTestOk: false, lastError: message } },
          { session: databaseSession }
        );
      });
      return apiError(502, "TEST_FAILED", message);
    }
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!isValidOid(id)) return apiError(400, "INVALID_ID", "Invalid destination");
    const destination = await collections.notificationDestinations().findOne({ _id: oid(id) });
    if (!destination) return NextResponse.json({ ok: true });
    const session = await requireCapability("integration.manage", destination.pageId.toHexString());
    await assertPageInOrg(destination.pageId.toHexString(), session.orgId);
    await withTransaction(async (databaseSession) => {
      await fenceActiveOrganizationMutation(session.orgId, databaseSession);
      const page = await collections.pages().findOne(
        { _id: destination.pageId, orgId: oid(session.orgId) },
        { session: databaseSession }
      );
      if (!page) return;
      await collections.notificationDestinations().deleteOne(
        { _id: destination._id, pageId: page._id },
        { session: databaseSession }
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
