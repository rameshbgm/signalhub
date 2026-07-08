import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { toId } from "@/lib/mongo-utils";
import { z } from "zod";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { email, password } = parsed.data;

  const memberDoc = await collections.teamMembers().findOne({ email });
  if (!memberDoc || !(await verifyPassword(password, memberDoc.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const member = toId(memberDoc);

  await createSession({ teamMemberId: member.id, orgId: member.orgId, email: member.email, name: member.name, role: member.role });
  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId: memberDoc.orgId,
    actor: member.email,
    action: "LOGIN",
    target: "session",
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
