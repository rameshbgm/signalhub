/** The MFA rules in one place. Pure: no database, no clock except what is passed in. */
export const MAX_DEVICES = 2;
export const MIN_DEVICES = 1;
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MINUTES = 15;
export const STEP_UP_WINDOW_MS = 5 * 60_000;
export const PENDING_DEVICE_TTL_MS = 10 * 60_000;
export const CHALLENGE_TTL_MS = 5 * 60_000;
/** Typing a code is quick; installing an app, scanning and saving codes is not. */
export const ENROLL_CHALLENGE_TTL_MS = 30 * 60_000;
export const challengeTtlMs = (kind: "CODE" | "ENROLL") => (kind === "ENROLL" ? ENROLL_CHALLENGE_TTL_MS : CHALLENGE_TTL_MS);
export const REVEAL_TTL_MS = 15 * 60_000;
export const TRUSTED_DEVICE_DAYS = 30;
export const REQUEST_TTL_DAYS = 7;
export const REJECTION_COOLDOWN_HOURS = 24;
export const OVERDUE_DAYS = 3;
export const RECOVERY_CODE_COUNT = 10;
export const REVEAL_EMAIL_LIMIT = 3;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const canAddDevice = (activeCount: number) => activeCount < MAX_DEVICES;
/** Deleting is allowed only while a device would remain. */
export const canDeleteDevice = (activeCount: number) => activeCount > MIN_DEVICES;

/** The counter after one wrong code, and when the account unlocks if that was one too many. */
export function afterFailedAttempt(previousAttempts: number, now: Date) {
  const attempts = previousAttempts + 1;
  return attempts >= LOCKOUT_THRESHOLD
    ? { attempts: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * MINUTE) }
    : { attempts, lockedUntil: null as Date | null };
}

export const isLocked = (lockedUntil: Date | null, now: Date) => Boolean(lockedUntil && lockedUntil.getTime() > now.getTime());

export function lockoutMessage(lockedUntil: Date, now: Date) {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / MINUTE));
  return `Too many wrong codes. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

export const stepUpIsFresh = (stepUpAt: Date | null, now: Date) =>
  Boolean(stepUpAt && now.getTime() - stepUpAt.getTime() <= STEP_UP_WINDOW_MS);

export const requestExpiry = (now: Date) => new Date(now.getTime() + REQUEST_TTL_DAYS * DAY);
export const trustedDeviceExpiry = (now: Date) => new Date(now.getTime() + TRUSTED_DEVICE_DAYS * DAY);

/** When a rejected requester may file again, or null if they already may. */
export function cooldownUntil(lastRejectedAt: Date | null, now: Date) {
  if (!lastRejectedAt) return null;
  const until = new Date(lastRejectedAt.getTime() + REJECTION_COOLDOWN_HOURS * 60 * MINUTE);
  return until.getTime() > now.getTime() ? until : null;
}

export const isOverdue = (createdAt: Date, now: Date) => now.getTime() - createdAt.getTime() > OVERDUE_DAYS * DAY;

/** Normalises what a person typed: spaces and dashes never matter, case does not either. */
export const normalizeRecoveryCode = (code: string) => code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
export const looksLikeRecoveryCode = (code: string) => /^[A-F0-9]{12}$/.test(normalizeRecoveryCode(code));
