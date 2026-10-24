import { describe, expect, it } from "vitest";
import { auditSafeMetadata } from "../lib/mfa/audit";
import { renderMfaMail } from "../lib/mfa/mail";
import {
  afterFailedAttempt, canAddDevice, canDeleteDevice, cooldownUntil, isLocked, isOverdue, lockoutMessage,
  looksLikeRecoveryCode, normalizeRecoveryCode, stepUpIsFresh,
} from "../lib/mfa/policy";
import { generateRecoveryCodes, hashRecoveryCode, recoveryCodeLookupHashes, totpCode, totpStep } from "../lib/totp";
import { hashSecret } from "../lib/secrets";

const now = new Date("2026-10-12T10:00:00Z");
const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

describe("device limits", () => {
  it("allows at most two devices", () => {
    expect([0, 1, 2, 3].map(canAddDevice)).toEqual([true, true, false, false]);
  });
  it("never allows deleting the last device", () => {
    expect([0, 1, 2].map(canDeleteDevice)).toEqual([false, false, true]);
  });
});

describe("lockout", () => {
  it("counts wrong codes and locks on the fifth", () => {
    let attempts = 0;
    for (let index = 1; index < 5; index += 1) {
      const next = afterFailedAttempt(attempts, now);
      expect(next.lockedUntil).toBeNull();
      attempts = next.attempts;
    }
    const fifth = afterFailedAttempt(attempts, now);
    expect(fifth.lockedUntil).toEqual(minutes(15));
    expect(fifth.attempts).toBe(0);
  });
  it("says how long is left, rounded up", () => {
    expect(lockoutMessage(minutes(15), now)).toBe("Too many wrong codes. Try again in 15 minutes.");
    expect(lockoutMessage(new Date(now.getTime() + 1_000), now)).toBe("Too many wrong codes. Try again in 1 minute.");
  });
  it("unlocks once the time has passed", () => {
    expect(isLocked(minutes(1), now)).toBe(true);
    expect(isLocked(minutes(-1), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});

describe("step-up and request timing", () => {
  it("accepts a code from the last five minutes only", () => {
    expect(stepUpIsFresh(minutes(-4), now)).toBe(true);
    expect(stepUpIsFresh(minutes(-6), now)).toBe(false);
    expect(stepUpIsFresh(null, now)).toBe(false);
  });
  it("holds a 24 hour cooldown after a rejection", () => {
    expect(cooldownUntil(minutes(-60), now)).not.toBeNull();
    expect(cooldownUntil(minutes(-25 * 60), now)).toBeNull();
    expect(cooldownUntil(null, now)).toBeNull();
  });
  it("flags requests untouched for more than three days", () => {
    expect(isOverdue(minutes(-3 * 24 * 60 + 1), now)).toBe(false);
    expect(isOverdue(minutes(-3 * 24 * 60 - 1), now)).toBe(true);
  });
});

describe("recovery codes", () => {
  it("normalises spacing, dashes and case", () => {
    expect(normalizeRecoveryCode(" b7df-3e16-4d43 ")).toBe("B7DF3E164D43");
    expect(looksLikeRecoveryCode("b7df 3e16 4d43")).toBe(true);
    expect(looksLikeRecoveryCode("123456")).toBe(false);
  });
  it("hashes keyed and finds old unkeyed hashes too", () => {
    const [code] = generateRecoveryCodes(1);
    const [keyed, legacy] = recoveryCodeLookupHashes(code.toLowerCase());
    expect(keyed).toBe(hashRecoveryCode(code));
    expect(keyed).not.toBe(legacy);
    expect(legacy).toBe(hashSecret(normalizeRecoveryCode(code)));
  });
  it("makes unique codes in the shown format", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(code))).toBe(true);
  });
});

describe("totp", () => {
  it("accepts one step of drift and returns the step", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const at = 1_700_000_000_000;
    const step = totpStep(secret, totpCode(secret, at), at);
    expect(step).toBe(Math.floor(at / 30_000));
    expect(totpStep(secret, totpCode(secret, at - 30_000), at)).toBe(step! - 1);
    expect(totpStep(secret, totpCode(secret, at - 90_000), at)).toBeNull();
  });
});

describe("what never reaches mail or audit", () => {
  it("drops secrets, codes and tokens from audit metadata", () => {
    expect(auditSafeMetadata({ secret: "x", code: "123456", recoveryCodes: "a", token: "t", uri: "otpauth://", deviceId: "d", remaining: 2, nested: { a: 1 } }))
      .toEqual({ deviceId: "d", remaining: 2 });
    expect(auditSafeMetadata({ code: "1" })).toBeNull();
  });
  it("renders every mail without a code, key or recovery code", () => {
    const mails = [
      { kind: "enabled" }, { kind: "device-added", deviceName: "Phone" }, { kind: "device-removed", deviceName: "Phone" },
      { kind: "recovery-used", remaining: 2 }, { kind: "request-created", type: "LOST_DEVICE", cancelUrl: "https://x.test/mfa/cancel/shmq_abc" },
      { kind: "request-approved" }, { kind: "request-rejected", note: "Not verified" }, { kind: "admin-reset" },
      { kind: "admin-new-request", userLabel: "ann", reviewUrl: "https://x.test/organization/platform/mfa-requests" },
    ] as const;
    for (const mail of mails) {
      const { subject, text } = renderMfaMail(mail, "Ann");
      expect(subject.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/\b\d{6}\b/);
      expect(text).not.toMatch(/[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/);
    }
  });
  it("warns when few recovery codes remain", () => {
    expect(renderMfaMail({ kind: "recovery-used", remaining: 2 }, "Ann").text).toMatch(/running low/);
    expect(renderMfaMail({ kind: "recovery-used", remaining: 8 }, "Ann").text).not.toMatch(/running low/);
  });
});
