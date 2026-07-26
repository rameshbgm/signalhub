import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { collections } from "@/lib/db";
import {
  DEVELOPMENT_ACCOUNTS,
  developmentQuickLoginAllowed,
} from "@/lib/dev-accounts";
import { requestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function available(request: NextRequest) {
  return developmentQuickLoginAllowed({
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.ENABLE_DEV_QUICK_LOGIN,
    hostname: request.nextUrl.hostname,
  });
}

export async function GET(request: NextRequest) {
  if (!available(request)) return new NextResponse(null, { status: 404 });
  return NextResponse.json({
    accounts: DEVELOPMENT_ACCOUNTS.map(({ key, username, email, name, role, description }) => ({
      key,
      username,
      email,
      name,
      role,
      description,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!available(request)) return new NextResponse(null, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const account = DEVELOPMENT_ACCOUNTS.find((candidate) => candidate.key === body.key);
  if (!account) {
    return NextResponse.json({ error: "Unknown development account" }, { status: 400 });
  }

  const user = await collections.users().findOne({
      canonicalUsername: account.username,
      disabled: { $ne: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "Development accounts are not seeded. Run npm run db:seed-roles." },
        { status: 409 }
      );
    }
    const membership = await collections.memberships().findOne({
      userId: user._id,
      role: account.role,
      status: "ACTIVE",
    });
    if (!membership) {
      return NextResponse.json(
        { error: "Development role membership is unavailable. Rerun the role seed." },
        { status: 409 }
      );
    }
    const organization = await collections.organizations().findOne({
      _id: membership.orgId,
      suspended: { $ne: true },
      status: { $nin: ["PROVISIONING", "SUSPENDED", "DELETING"] },
    });
    if (!organization) {
      return NextResponse.json({ error: "Development organization is unavailable." }, { status: 409 });
    }
  await createSession(
      {
        userId: user._id.toHexString(),
        membershipId: membership._id.toHexString(),
        orgId: membership.orgId.toHexString(),
        username: user.username,
        email: user.email,
        name: user.name,
        role: membership.role,
      },
      {
        authMethod: "PASSWORD",
        mfaVerified: true,
        ipAddress: requestIp(request),
        userAgent: request.headers.get("user-agent"),
      }
    );
  return NextResponse.json({ ok: true, redirectTo: "/organization" });
}
