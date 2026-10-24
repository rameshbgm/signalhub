import { writePlatformAudit } from "@/lib/platform-policy";
import type { DatabaseExecutor } from "@/lib/postgres/client";

export type MfaAuditEvent =
  | "MFA_ENROLLMENT_STARTED" | "MFA_ENROLLMENT_COMPLETED" | "MFA_ENROLLMENT_ABANDONED"
  | "MFA_DEVICE_ADDED" | "MFA_DEVICE_REMOVED" | "MFA_DEVICE_RENAMED"
  | "MFA_LOGIN_SUCCESS" | "MFA_LOGIN_FAILED" | "MFA_LOCKED" | "MFA_LOCKOUT_CLEARED"
  | "MFA_RECOVERY_CODES_GENERATED" | "MFA_RECOVERY_CODE_USED" | "MFA_RECOVERY_CODES_EMAILED"
  | "MFA_TRUSTED_DEVICE_CREATED" | "MFA_TRUSTED_DEVICES_REVOKED"
  | "MFA_REQUEST_CREATED" | "MFA_REQUEST_CANCELLED" | "MFA_REQUEST_APPROVED" | "MFA_REQUEST_REJECTED"
  | "MFA_REQUEST_EXPIRED" | "MFA_ADMIN_RESET" | "MFA_BREAK_GLASS";

/** Keys that must never reach the audit log, whoever passes them. */
const SENSITIVE_KEY = /secret|password|token|^code$|recoverycodes$|^uri$/i;

export function auditSafeMetadata(metadata: Record<string, unknown> | undefined) {
  const entries = Object.entries(metadata ?? {}).filter(([key, value]) =>
    !SENSITIVE_KEY.test(key) && (value === null || ["string", "number", "boolean"].includes(typeof value)));
  return entries.length ? Object.fromEntries(entries) : null;
}

/**
 * One audit entry on the sealed installation log. `subject` is the account the
 * event is about; `admin` identifies an administrator acting on their own account or another account.
 * Takes an executor so it can join the transaction that made the change.
 */
export async function auditMfa(
  event: MfaAuditEvent,
  input: {
    subject: { id: string; email: string };
    admin?: { id: string; email: string };
    reason?: string | null;
    metadata?: Record<string, unknown>;
    executor?: DatabaseExecutor;
  },
) {
  const actor = input.admin ?? input.subject;
  await writePlatformAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: input.admin ? "ADMIN" : "SYSTEM",
    action: event,
    targetType: "user",
    targetId: input.subject.id,
    reason: input.reason ?? null,
    metadata: auditSafeMetadata(input.metadata),
  }, { executor: input.executor });
}
