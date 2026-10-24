import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { database } from "@/lib/postgres/client";
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
    accounts: DEVELOPMENT_ACCOUNTS.map(({ key, username, email, name, role, description, organizationName }) => ({
      key,
      username,
      email,
      name,
      role,
      description,
      organizationName,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!available(request)) return new NextResponse(null, { status: 404 });
  const body = await readRequestJson(request);
  if (body instanceof Response) return body;
  const account = DEVELOPMENT_ACCOUNTS.find((candidate) => candidate.key === (body && typeof body === "object" && "key" in body ? body.key : null));
  if (!account) {
    return NextResponse.json({ error: "Unknown development account" }, { status: 400 });
  }

  const user = await database
    .selectFrom("users")
    .selectAll()
    .where("canonicalUsername", "=", account.username)
    .where("disabled", "=", false)
    .executeTakeFirst();
    if (!user) {
      return NextResponse.json(
        { error: "Development account is unavailable. Create or enable the matching user in the console." },
        { status: 409 }
      );
    }
    const membership = await database
      .selectFrom("memberships")
      .selectAll()
      .where("userId", "=", user.id)
      .where("role", "=", account.role)
      .where("orgId", "=", database.selectFrom("organizations").select("id").where("slug", "=", account.organizationSlug))
      .where("status", "=", "ACTIVE")
      .executeTakeFirst();
    if (!membership) {
      return NextResponse.json(
        { error: "Development role membership is unavailable. Assign the matching organization role in the console." },
        { status: 409 }
      );
    }
    const organization = await database
      .selectFrom("organizations")
      .select("id")
      .where("id", "=", membership.orgId)
      .where("suspended", "=", false)
      .where("status", "not in", ["PROVISIONING", "SUSPENDED", "DELETING"])
      .executeTakeFirst();
    if (!organization) {
      return NextResponse.json({ error: "Development organization is unavailable." }, { status: 409 });
    }
  await createSession(
      {
        userId: user.id,
        membershipId: membership.id,
        orgId: membership.orgId,
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
