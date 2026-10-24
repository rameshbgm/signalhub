"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { requirePlatformCapability } from "@/lib/admin-guard";
import { verifyPassword } from "@/lib/auth";
import { sendMfaMail } from "@/lib/mfa/mail";
import { adminClearLockout, adminDeleteDevice, adminResetMfa, approveRequest, listUserDevices, rejectRequest } from "@/lib/mfa/requests";
import { MfaError, requireFreshCode } from "@/lib/mfa/service";
import { database } from "@/lib/postgres/client";
import { consumeNamedLimit, RateLimitError } from "@/lib/rate-limit";

export type MfaActionResult = { ok: true; message: string } | { ok: false; message: string };

const PATHS = ["/organization/platform/mfa-requests", "/organization/platform/users"];
const refresh = () => PATHS.forEach((path) => revalidatePath(path));

async function guarded(run: () => Promise<string>): Promise<MfaActionResult> {
  try {
    return { ok: true, message: await run() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MfaError) return { ok: false, message: error.message };
    if (error instanceof RateLimitError) return { ok: false, message: "Too many attempts. Try again in a few minutes." };
    throw error;
  }
}

/** The admin proves they hold their own device right now before any approval, rejection or reset. */
async function adminWithFreshCode(code: string) {
  const actor = await requirePlatformCapability("mfa.manage");
  await consumeNamedLimit("mfa-account", actor.userId, "admin");
  await requireFreshCode({ userId: actor.userId, sessionId: actor.sessionId }, code);
  return { actor, admin: { id: actor.userId, email: actor.email } };
}

export async function approveMfaRequest(input: { requestId: string; code: string }) {
  return guarded(async () => {
    const { admin } = await adminWithFreshCode(input.code);
    const user = await approveRequest(input.requestId, admin);
    after(() => sendMfaMail(user.email, user.name || user.username, { kind: "request-approved" }));
    refresh();
    return `Approved. ${user.username} was signed out everywhere and must set up a new authenticator at next sign-in.`;
  });
}

export async function rejectMfaRequest(input: { requestId: string; code: string; note: string }) {
  return guarded(async () => {
    const { admin } = await adminWithFreshCode(input.code);
    const done = await rejectRequest(input.requestId, admin, input.note);
    after(() => sendMfaMail(done.user.email, done.user.name || done.user.username, { kind: "request-rejected", note: done.note }));
    refresh();
    return "Rejected. The user was emailed your note and can file again after 24 hours.";
  });
}

/**
 * Emergency route for the only administrator, who cannot ask anyone else. It needs
 * their password and a typed confirmation instead of a code (they may have lost the
 * device), and it is recorded as MFA_BREAK_GLASS and emailed to the account owner.
 */
export async function breakGlassMfaRequest(input: { requestId: string; password: string; confirm: string }) {
  return guarded(async () => {
    const actor = await requirePlatformCapability("mfa.manage");
    await consumeNamedLimit("mfa-account", actor.userId, "break-glass");
    if (input.confirm.trim().toUpperCase() !== "BREAK GLASS") throw new MfaError("MFA_CONFIRM_REQUIRED", "Type BREAK GLASS to confirm.", 400);
    const self = await database.selectFrom("users").select("passwordHash").where("id", "=", actor.userId).executeTakeFirst();
    if (!self?.passwordHash || !(await verifyPassword(input.password, self.passwordHash))) {
      throw new MfaError("INVALID_CREDENTIALS", "That password is not correct.", 401);
    }
    const user = await approveRequest(input.requestId, { id: actor.userId, email: actor.email }, { breakGlass: true });
    after(() => sendMfaMail(user.email, user.name || user.username, { kind: "request-approved", byBreakGlass: true }));
    refresh();
    return "Break-glass used. You were signed out and must set up a new authenticator at your next sign-in.";
  });
}

export async function resetUserMfa(input: { userId: string; reason: string; code: string }) {
  return guarded(async () => {
    const { admin } = await adminWithFreshCode(input.code);
    const user = await adminResetMfa(input.userId, admin, input.reason);
    after(() => sendMfaMail(user.email, user.name || user.username, { kind: "admin-reset" }));
    refresh();
    return `MFA reset for ${user.username}. They set up a new authenticator at next sign-in.`;
  });
}

export async function clearUserLockout(userId: string) {
  return guarded(async () => {
    const actor = await requirePlatformCapability("mfa.manage");
    await adminClearLockout(userId, { id: actor.userId, email: actor.email });
    refresh();
    return "Lockout cleared.";
  });
}

export async function listUserMfaDevices(userId: string) {
  await requirePlatformCapability("mfa.manage");
  return (await listUserDevices(userId)).map((device) => ({
    id: device.id, name: device.name, createdAt: device.createdAt.toISOString(), lastUsedAt: device.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function deleteUserMfaDevice(input: { userId: string; deviceId: string; reason: string; code: string }) {
  return guarded(async () => {
    const { admin } = await adminWithFreshCode(input.code);
    const done = await adminDeleteDevice(input.userId, input.deviceId, admin, input.reason);
    after(() => sendMfaMail(done.user.email, done.user.name || done.user.username, { kind: "device-removed", deviceName: done.deviceName }));
    refresh();
    return done.last ? `Deleted. ${done.user.username} has no devices left and must set up a new one at next sign-in.` : "Device deleted.";
  });
}
