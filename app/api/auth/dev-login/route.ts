import { NextRequest, NextResponse } from "next/server";
import { createPlatformSession, createSession } from "@/lib/auth";
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
    accounts: DEVELOPMENT_ACCOUNTS.map(({ key, audience, email, name, role, description }) => ({
      key,
      audience,
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

  if (account.audience === "tenant") {
    const user = await collections.users().findOne({
      canonicalEmail: account.email,
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
    return NextResponse.json({ ok: true, redirectTo: "/admin" });
  }

  const platformAdmin = await collections.platformAdmins().findOne({
    canonicalEmail: account.email,
    role: account.role,
    status: "ACTIVE",
  });
  if (!platformAdmin) {
    return NextResponse.json(
      { error: "Development platform accounts are not seeded. Run npm run db:seed-roles." },
      { status: 409 }
    );
  }
  await createPlatformSession(
    {
      platformAdminId: platformAdmin._id.toHexString(),
      email: platformAdmin.email,
      name: platformAdmin.name,
      role: account.role,
      sessionVersion: platformAdmin.sessionVersion ?? 1,
      mfaVerified: true,
    },
    {
      authMethod: "PASSWORD",
      ipAddress: requestIp(request),
      userAgent: request.headers.get("user-agent"),
    }
  );
  return NextResponse.json({ ok: true, redirectTo: "/platform" });
}
