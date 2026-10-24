import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDatabaseId } from "@/lib/database-id";
import { database } from "@/lib/postgres/client";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ sessions: [] });
  const sessions = await database
    .selectFrom("authSessions")
    .selectAll()
    .where("userId", "=", session.userId)
    .where("revokedAt", "is", null)
    .orderBy("createdAt", "desc")
    .execute();
  return NextResponse.json({
    sessions: sessions.map((item) => ({
      id: item.id,
      current: item.id === session.sessionId,
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
  if (!isDatabaseId(id)) return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  await database
    .updateTable("authSessions")
    .set({ revokedAt: new Date(), revokedReason: "user-revoked" })
    .where("id", "=", id)
    .where("userId", "=", session.userId)
    .where("revokedAt", "is", null)
    .execute();
  return NextResponse.json({ ok: true });
}
