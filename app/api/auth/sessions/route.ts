import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, getSession } from "@/lib/auth";
import { apiError, routeError } from "@/lib/api-response";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

export async function GET() {
  try {
    const [tenant, platform] = await Promise.all([getSession(), getPlatformSession()]);
    if (!tenant && !platform) return apiError(401, "UNAUTHENTICATED", "Sign in first");
    const sessions = await collections
      .authSessions()
      .find({
        ...(tenant
          ? { kind: "TENANT" as const, userId: oid(tenant.userId) }
          : { kind: "PLATFORM" as const, platformAdminId: oid(platform!.platformAdminId) }),
        revokedAt: null,
        absoluteExpiresAt: { $gt: new Date() },
      })
      .sort({ lastSeenAt: -1 })
      .limit(100)
      .toArray();
    return NextResponse.json({
      sessions: sessions.map((session) => ({
        id: session._id.toHexString(),
        current: session._id.toHexString() === (tenant?.sessionId ?? ""),
        kind: session.kind,
        authMethod: session.authMethod,
        mfaVerified: session.mfaVerified,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        idleExpiresAt: session.idleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
      })),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const [tenant, platform] = await Promise.all([getSession(), getPlatformSession()]);
    if (!tenant && !platform) return apiError(401, "UNAUTHENTICATED", "Sign in first");
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return apiError(400, "MISSING_ID", "Session id is required");
    const result = await collections.authSessions().updateOne(
      {
        _id: oid(id),
        ...(tenant
          ? { kind: "TENANT" as const, userId: oid(tenant.userId) }
          : { kind: "PLATFORM" as const, platformAdminId: oid(platform!.platformAdminId) }),
        revokedAt: null,
      },
      { $set: { revokedAt: new Date(), revokedReason: "user-revoked" } }
    );
    if (!result.matchedCount) return apiError(404, "SESSION_NOT_FOUND", "Session not found");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
