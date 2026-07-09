import { NextRequest, NextResponse } from "next/server";
import { collections } from "@/lib/db";
import { verifyPassword, createPlatformSession } from "@/lib/auth";
import { toId } from "@/lib/mongo-utils";
import { z } from "zod";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { email, password } = parsed.data;

  const adminDoc = await collections.platformAdmins().findOne({ email });
  if (!adminDoc || !(await verifyPassword(password, adminDoc.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const admin = toId(adminDoc);

  await createPlatformSession({ platformAdminId: admin.id, email: admin.email, name: admin.name });
  return NextResponse.json({ ok: true });
}
