import { consumeNamedLimit, RateLimitError, requestIp } from "@/lib/rate-limit";
import { routeError } from "@/lib/api-response";
import { NextResponse } from "next/server";
import { fenceActiveOrganizationMutation } from "@/lib/organization-mutation";
import { database, withDatabaseTransaction } from "@/lib/postgres/client";
import { heartbeatAuthorized, heartbeatChallenge } from "@/lib/heartbeat-auth";
import { hashSecret } from "@/lib/secrets";

async function heartbeat(request: Request, { params }: { params: Promise<{ token: string }> }) {
  await consumeNamedLimit("heartbeat-ip", requestIp(request));
  const { token } = await params;
  const tokenHash = hashSecret(token);
  const monitor = await database.selectFrom("monitors as monitor")
    .innerJoin("pages as page", "page.id", "monitor.pageId")
    .innerJoin("organizations as organization", "organization.id", "page.orgId")
    .select(["monitor.id", "monitor.pageId", "monitor.authType", "monitor.authUsername", "monitor.authSecret", "organization.id as orgId"])
    .where("monitor.type", "=", "HEARTBEAT").where("monitor.heartbeatTokenHash", "=", tokenHash)
    .where("monitor.enabled", "=", true).where("page.deletedAt", "is", null)
    .where("organization.status", "=", "ACTIVE").where("organization.suspended", "=", false)
    .executeTakeFirst();
  if (!monitor) return new NextResponse(null, { status: 404 });
  // A valid secret path with missing or wrong credentials is a 401, so a caller knows to fix its credentials.
  if (!heartbeatAuthorized(monitor, request.headers.get("authorization"))) {
    return new NextResponse(null, { status: 401, headers: { "www-authenticate": heartbeatChallenge(monitor) ?? "Basic" } });
  }
  await consumeNamedLimit("heartbeat-monitor", monitor.id);
  await withDatabaseTransaction(async (transaction) => {
    await fenceActiveOrganizationMutation(monitor.orgId, transaction);
    const now = new Date();
    const changed = await transaction.updateTable("monitors").set({ lastHeartbeatAt: now, runRequestedAt: now })
      .where("id", "=", monitor.id).where("pageId", "=", monitor.pageId)
      .where("type", "=", "HEARTBEAT").where("heartbeatTokenHash", "=", tokenHash)
      .where("enabled", "=", true).returning("id").executeTakeFirst();
    if (!changed) throw new Error("Heartbeat monitor is unavailable");
  });
  return NextResponse.json({ ok: true, monitorId: monitor.id });
}

async function guardedHeartbeat(request: Request, context: { params: Promise<{ token: string }> }) {
  try { return await heartbeat(request, context); }
  catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many heartbeat requests" } }, {
      status: 429, headers: { "retry-after": String(error.retryAfterSeconds) },
    });
    return routeError(error, { route: "heartbeat" });
  }
}
export const GET = guardedHeartbeat;
export const POST = guardedHeartbeat;
