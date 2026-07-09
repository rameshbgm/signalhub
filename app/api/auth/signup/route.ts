import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  orgName: z.string().min(2).max(80),
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8),
});

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  const { orgName, name, email, password } = parsed.data;

  const existingMember = await collections.teamMembers().findOne({ email });
  if (existingMember) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  let slug = slugify(orgName) || "org";
  if (await collections.organizations().findOne({ slug })) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const orgId = new ObjectId();
  await collections.organizations().insertOne({
    _id: orgId,
    name: orgName,
    slug,
    plan: "free",
    planRenewsAt: null,
    billingEmail: email,
    createdAt: new Date(),
  });

  const memberId = new ObjectId();
  await collections.teamMembers().insertOne({
    _id: memberId,
    orgId,
    email,
    passwordHash: await hashPassword(password),
    name,
    role: "TENANT_ADMIN",
    twoFactorEnabled: false,
    createdAt: new Date(),
  });

  await collections.auditLogs().insertOne({
    _id: new ObjectId(),
    orgId,
    actor: email,
    action: "SIGNUP",
    target: slug,
    createdAt: new Date(),
  });

  await createSession({
    teamMemberId: memberId.toHexString(),
    orgId: orgId.toHexString(),
    email,
    name,
    role: "TENANT_ADMIN",
  });

  return NextResponse.json({ ok: true });
}
