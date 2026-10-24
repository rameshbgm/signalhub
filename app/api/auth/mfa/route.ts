import { readRequestJson } from "@/lib/request-body";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { completeLogin } from "@/lib/login-session";
import { auditMfa } from "@/lib/mfa/audit";
import { challengeToken, clearChallengeCookie, mfaRouteError } from "@/lib/mfa/http";
import { sendMfaMail, sendRecoveryCodesMail } from "@/lib/mfa/mail";
import { canAddDevice } from "@/lib/mfa/policy";
import { qrDataUrl } from "@/lib/mfa/qr";
import {
  acknowledgeRecoveryCodes, confirmDevice, deleteChallenge, deleteDevice, findChallenge, MfaError, mfaStatus,
  regenerateRecoveryCodes, renameDevice, requireFreshCode, startDevice, takeRevealForEmail,
} from "@/lib/mfa/service";
import { cancelRequest, createRequest, notifyRequestCreated, requestStateFor } from "@/lib/mfa/requests";
import { database } from "@/lib/postgres/client";
import { consumeNamedLimit, requestIp } from "@/lib/rate-limit";
import { setting } from "@/lib/settings/effective";
import { smtpConfigured } from "@/lib/smtp";

const code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");
const reason = z.string().trim().min(5).max(500);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("stepup"), code }),
  z.object({ action: z.literal("start"), reason: reason.optional() }),
  z.object({ action: z.literal("confirm"), code, reason: reason.optional() }),
  z.object({ action: z.literal("acknowledge") }),
  z.object({ action: z.literal("email-codes"), reason: reason.optional() }),
  z.object({ action: z.literal("rename"), deviceId: z.string().uuid(), name: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal("delete"), deviceId: z.string().uuid(), code: code.optional(), reason: reason.optional() }),
  z.object({ action: z.literal("regenerate"), code: code.optional(), reason: reason.optional() }),
  z.object({ action: z.literal("request-removal"), reason, code: code.optional() }),
  z.object({ action: z.literal("cancel-request"), requestId: z.string().uuid() }),
]);

/** Who is asking: a signed-in user, or someone who passed the password and owes enrollment. */
async function actor(request: NextRequest) {
  // Mid sign-in, the challenge wins: a leftover session from someone else in this browser must not be used.
  const challenge = await findChallenge(challengeToken(request));
  if (challenge?.kind === "ENROLL") {
    const user = await database.selectFrom("users").select(["id", "email", "name", "username"])
      .where("id", "=", challenge.userId).where("disabled", "=", false).executeTakeFirst();
    if (user) return { kind: "challenge" as const, user, challenge };
  }
  const session = await getSession();
  if (session) {
    const user = await database.selectFrom("users").select(["id", "email", "name", "username"])
      .where("id", "=", session.userId).where("disabled", "=", false).executeTakeFirst();
    const membership = await database.selectFrom("memberships").select("role")
      .where("id", "=", session.membershipId).where("userId", "=", session.userId)
      .where("status", "=", "ACTIVE").executeTakeFirst();
    if (user && membership) return { kind: "session" as const, user, session: { ...session, role: membership.role } };
  }
  return null;
}

const label = (user: { name: string; username: string }) => user.name || user.username;

export async function GET(request: NextRequest) {
  try {
    const who = await actor(request);
    if (!who) return apiError(401, "UNAUTHENTICATED", "Sign in first");
    const status = await mfaStatus(who.user.id);
    return NextResponse.json({
      mode: who.kind,
      canManageRequests: who.kind === "session" && who.session.role === "ADMIN",
      globalEnabled: setting("mfaEnabled"),
      devices: status.devices,
      canAdd: canAddDevice(status.devices.length),
      recoveryCodesRemaining: status.recoveryCodesRemaining,
      lockedUntil: status.lockedUntil,
      reenrollRequired: status.reenrollRequired,
      emailAvailable: await smtpConfigured().catch(() => false),
      request: who.kind === "session" ? await requestStateFor(who.user.id) : null,
    });
  } catch (error) {
    return mfaRouteError(error, "GET /api/auth/mfa");
  }
}

export async function POST(request: NextRequest) {
  try {
    const who = await actor(request);
    if (!who) return apiError(401, "UNAUTHENTICATED", "Sign in first");
    const requestBody = await readRequestJson(request);
    if (requestBody instanceof Response) return requestBody;
    const parsed = schema.safeParse(requestBody);
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const { user } = who;
    await consumeNamedLimit("mfa-account", user.id, "settings");

    // Before a session exists the only things allowed are the enrollment steps.
    const enrollmentOnly = ["start", "confirm", "acknowledge", "email-codes"];
    if (who.kind === "challenge" && !enrollmentOnly.includes(input.action)) {
      return apiError(403, "MFA_ENROLLMENT_ONLY", "Finish setting up your authenticator first.");
    }
    const session = who.kind === "session" ? { userId: user.id, sessionId: who.session.sessionId } : null;

    const isAdmin = who.kind === "session" && who.session.role === "ADMIN";
    const reasonActions = ["start", "confirm", "delete", "regenerate", "request-removal", "email-codes"];
    if (isAdmin && reasonActions.includes(input.action) && !("reason" in input && input.reason)) {
      return apiError(400, "MFA_REASON_REQUIRED", "Give a reason (5 to 500 characters). It is included in the audit log.");
    }
    const audit = isAdmin && "reason" in input ? { admin: user, reason: input.reason } : {};
    async function authoriseChange(freshCode: string | undefined) {
      if (!isAdmin) {
        if (!freshCode) throw new MfaError("MFA_CODE_REQUIRED", "Enter a code from your authenticator app to continue.", 403);
        await requireFreshCode(session!, freshCode);
      }
    }

    switch (input.action) {
      case "stepup":
        await requireFreshCode(session!, input.code);
        return NextResponse.json({ ok: true });

      case "start": {
        // Non-admins need a recent code from an existing device before adding another.
        if (session && !isAdmin && (await mfaStatus(user.id)).devices.length > 0) await requireFreshCode(session, undefined);
        const device = await startDevice(user, undefined, audit);
        return NextResponse.json({ secret: device.secret, uri: device.uri, qr: await qrDataUrl(device.uri) });
      }

      case "confirm": {
        const done = await confirmDevice(user, input.code, undefined, audit);
        after(async () => {
          await sendMfaMail(user.email, label(user), done.first ? { kind: "enabled" } : { kind: "device-added", deviceName: done.deviceName });
        });
        return NextResponse.json({ ok: true, first: done.first, deviceName: done.deviceName, recoveryCodes: done.recoveryCodes ?? [] });
      }

      case "acknowledge": {
        if (who.kind === "challenge") {
          // The password alone must never finish a sign-in: a device has to have been confirmed in this enrollment.
          const status = await mfaStatus(user.id);
          if (status.devices.length === 0 || status.reenrollRequired) {
            throw new MfaError("MFA_ENROLLMENT_INCOMPLETE", "Finish setting up your authenticator first.", 403);
          }
        }
        await acknowledgeRecoveryCodes(user.id);
        if (who.kind === "challenge") {
          const response = await completeLogin(request, { userId: user.id, orgId: who.challenge.orgId ?? undefined });
          if (response.ok) {
            await deleteChallenge(who.challenge.id);
            clearChallengeCookie(response);
          }
          return response;
        }
        return NextResponse.json({ ok: true });
      }

      case "email-codes": {
        if (!(await smtpConfigured().catch(() => false))) throw new MfaError("EMAIL_NOT_CONFIGURED", "Email is not set up on this installation.", 409);
        const codes = await takeRevealForEmail(user.id);
        await sendRecoveryCodesMail(user.email, label(user), codes);
        await auditMfa("MFA_RECOVERY_CODES_EMAILED", { subject: user, ...audit });
        return NextResponse.json({ ok: true, sentTo: user.email.replace(/^(.).*(@.*)$/, "$1***$2") });
      }

      case "rename":
        await renameDevice(user, input.deviceId, input.name);
        return NextResponse.json({ ok: true });

      case "delete": {
        await authoriseChange(input.code);
        const removed = await deleteDevice(user, input.deviceId, audit);
        after(() => sendMfaMail(user.email, label(user), { kind: "device-removed", deviceName: removed.deviceName }));
        return NextResponse.json({ ok: true });
      }

      case "request-removal": {
        await consumeNamedLimit("mfa-request-account", user.id);
        await authoriseChange(input.code);
        const created = await createRequest(user, {
          type: "REMOVE_ALL", admin: isAdmin ? user : undefined, reason: input.reason, ip: requestIp(request), userAgent: request.headers.get("user-agent"),
        });
        after(() => notifyRequestCreated({ ...user }, created, "REMOVE_ALL"));
        return NextResponse.json({ ok: true });
      }

      case "cancel-request":
        await cancelRequest({ id: input.requestId, userId: user.id });
        return NextResponse.json({ ok: true });

      case "regenerate": {
        await authoriseChange(input.code);
        return NextResponse.json({ ok: true, recoveryCodes: await regenerateRecoveryCodes(user, undefined, audit) });
      }
    }
  } catch (error) {
    return mfaRouteError(error, "POST /api/auth/mfa");
  }
}
