import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { collections, mongoClient } from "@/lib/db";
import { canonicalizeEmail } from "@/lib/identity";
import {
  exchangeAndVerifyOidcCode,
  OIDC_TRANSACTION_COOKIE,
  oidcConfigured,
  oidcRedirectUri,
  verifyOidcTransaction,
} from "@/lib/oidc";
import { writeActiveTenantAudit } from "@/lib/tenant-audit";

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "organization"
  );
}

function loginError(request: NextRequest, code: string) {
  const url = new URL("/admin/login", request.nextUrl.origin);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OIDC_TRANSACTION_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  if (!oidcConfigured()) return loginError(request, "oidc_disabled");
  try {
    const error = request.nextUrl.searchParams.get("error");
    if (error) return loginError(request, "oidc_denied");
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const transactionCookie = request.cookies.get(OIDC_TRANSACTION_COOKIE)?.value;
    if (!code || !state || !transactionCookie) return loginError(request, "oidc_invalid_response");

    const transaction = await verifyOidcTransaction(transactionCookie);
    if (transaction.state !== state) return loginError(request, "oidc_state_mismatch");
    const identity = await exchangeAndVerifyOidcCode({
      code,
      verifier: transaction.verifier,
      nonce: transaction.nonce,
      redirectUri: oidcRedirectUri(request.nextUrl.origin),
    });

    const canonicalEmail = canonicalizeEmail(identity.email);
    let user =
      (await collections.users().findOne({
        oidcIssuer: identity.issuer,
        oidcSubject: identity.subject,
      })) ?? (await collections.users().findOne({ canonicalEmail }));

    if (user && user.oidcSubject && (user.oidcSubject !== identity.subject || user.oidcIssuer !== identity.issuer)) {
      return loginError(request, "oidc_identity_conflict");
    }
    if (!user) {
      if (process.env.ALLOW_PUBLIC_SIGNUP !== "true") return loginError(request, "oidc_no_membership");
      const userId = new ObjectId();
      const now = new Date();
      await collections.users().insertOne({
        _id: userId,
        email: identity.email,
        canonicalEmail,
        passwordHash: null,
        name: identity.name,
        twoFactorEnabled: false,
        oidcIssuer: identity.issuer,
        oidcSubject: identity.subject,
        disabled: false,
        createdAt: now,
        updatedAt: now,
      });
      user = await collections.users().findOne({ _id: userId });
    } else if (!user.oidcSubject) {
      await collections.users().updateOne(
        { _id: user._id, oidcSubject: { $in: [null, undefined] } },
        {
          $set: {
            oidcIssuer: identity.issuer,
            oidcSubject: identity.subject,
            email: identity.email,
            canonicalEmail,
            updatedAt: new Date(),
          },
        }
      );
      user = await collections.users().findOne({ _id: user._id });
    }
    if (!user || user.disabled) return loginError(request, "oidc_account_disabled");

    let memberships = await collections
      .memberships()
      .find({ userId: user._id, status: "ACTIVE" })
      .sort({ createdAt: 1 })
      .toArray();
    if (!memberships.length && process.env.ALLOW_PUBLIC_SIGNUP === "true") {
      let slug = slugify(identity.name);
      if (await collections.organizations().findOne({ slug })) {
        slug = `${slug}-${randomBytes(3).toString("hex")}`;
      }
      const orgId = new ObjectId();
      const membershipId = new ObjectId();
      const now = new Date();
      const dbSession = mongoClient.startSession();
      try {
        await dbSession.withTransaction(async () => {
          await collections.organizations().insertOne(
            {
              _id: orgId,
              name: `${identity.name}'s organization`,
              slug,
              contactEmail: canonicalEmail,
              suspended: false,
              status: "ACTIVE",
              statusReason: null,
              statusChangedAt: now,
              statusChangedBy: null,
              createdAt: now,
              updatedAt: now,
            },
            { session: dbSession }
          );
          await collections.memberships().insertOne(
            {
              _id: membershipId,
              orgId,
              userId: user!._id,
              role: "OWNER",
              status: "ACTIVE",
              pageIds: null,
              invitationExpiresAt: null,
              invitationTokenHash: null,
              activatedAt: now,
              createdAt: now,
            },
            { session: dbSession }
          );
          await collections.auditLogs().insertOne(
            {
              _id: new ObjectId(),
              orgId,
              actor: identity.email,
              action: "SIGNUP",
              target: slug,
              metadata: { method: "oidc", issuer: identity.issuer },
              createdAt: now,
            },
            { session: dbSession }
          );
        });
      } finally {
        await dbSession.endSession();
      }
      memberships = (await collections.memberships().find({ _id: membershipId }).toArray());
    }
    if (!memberships.length) return loginError(request, "oidc_no_membership");

    const activeOrganizations = await collections
      .organizations()
      .find({
        _id: { $in: memberships.map((membership) => membership.orgId) },
        suspended: { $ne: true },
        status: { $nin: ["PROVISIONING", "SUSPENDED", "DELETING"] },
      })
      .toArray();
    const activeIds = new Set(activeOrganizations.map((organization) => organization._id.toHexString()));
    const membership = memberships.find((item) => activeIds.has(item.orgId.toHexString()));
    if (!membership) return loginError(request, "oidc_no_active_organization");

    const authorized = await writeActiveTenantAudit(
      membership.orgId,
      {
        actor: user.email,
        action: "LOGIN",
        target: "session",
        metadata: { method: "oidc", issuer: identity.issuer },
        createdAt: new Date(),
      },
      async (databaseSession) => {
        const currentUser = await collections.users().findOne(
          {
            _id: user!._id,
            disabled: { $ne: true },
            oidcIssuer: identity.issuer,
            oidcSubject: identity.subject,
          },
          { session: databaseSession }
        );
        const currentMembership = await collections.memberships().findOne(
          {
            _id: membership._id,
            userId: user!._id,
            orgId: membership.orgId,
            status: "ACTIVE",
          },
          { session: databaseSession }
        );
        if (!currentUser || !currentMembership) {
          throw new Error("OIDC authorization changed during login");
        }
        return { user: currentUser, membership: currentMembership };
      }
    );
    await createSession({
      userId: authorized.user._id.toHexString(),
      membershipId: authorized.membership._id.toHexString(),
      orgId: authorized.membership.orgId.toHexString(),
      email: authorized.user.email,
      name: authorized.user.name,
      role: authorized.membership.role,
    }, {
      authMethod: "OIDC",
      mfaVerified: true,
      ipAddress: request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.redirect(new URL(transaction.returnTo, request.nextUrl.origin));
    response.cookies.delete(OIDC_TRANSACTION_COOKIE);
    return response;
  } catch (error) {
    console.error("OIDC callback failed", error);
    return loginError(request, "oidc_failed");
  }
}
