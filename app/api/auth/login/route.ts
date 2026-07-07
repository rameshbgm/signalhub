import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { email, password } = parsed.data;

  const member = await prisma.teamMember.findFirst({ where: { email } });
  if (!member || !(await verifyPassword(password, member.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession({ teamMemberId: member.id, orgId: member.orgId, email: member.email, name: member.name, role: member.role });
  await prisma.auditLog.create({ data: { orgId: member.orgId, actor: member.email, action: "LOGIN", target: "session" } });

  return NextResponse.json({ ok: true });
}
