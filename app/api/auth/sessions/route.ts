import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import { oid } from "@/lib/mongo-utils";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ sessions: [] });
  const sessions = await collections.authSessions().find({
    userId: oid(session.userId),
    revokedAt: null,
  }).sort({ createdAt: -1 }).toArray();
  return NextResponse.json({
    sessions: sessions.map((item) => ({
      id: item._id.toHexString(),
      current: item._id.toHexString() === session.sessionId,
      authMethod: item.authMethod,
      ipAddress: item.ipAddress,
      userAgent: item.userAgent,
      createdAt: item.createdAt,
      lastSeenAt: item.lastSeenAt,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  await collections.authSessions().updateOne(
    { _id: oid(id), userId: oid(session.userId), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "user-revoked" } }
  );
  return NextResponse.json({ ok: true });
}
