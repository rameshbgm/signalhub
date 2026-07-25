import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
  isActivePlatformOwner,
  platformSessionVersionTransition,
  platformStepUpCredentialsAreValid,
  transitionRemovesActivePlatformOwner,
} from "../lib/platform-admin-safety";
import { encodeBase32, totpCode } from "../lib/totp";

describe("platform administrator Owner invariant", () => {
  it("treats legacy role and status omissions as an active Owner", () => {
    expect(isActivePlatformOwner({})).toBe(true);
    expect(isActivePlatformOwner({ role: "OWNER", status: "DISABLED" })).toBe(false);
    expect(isActivePlatformOwner({ role: "OPERATOR", status: "ACTIVE" })).toBe(false);
  });

  it("detects demotion and disabling transitions that remove an active Owner", () => {
    expect(
      transitionRemovesActivePlatformOwner(
        { role: "OWNER", status: "ACTIVE" },
        { role: "AUDITOR", status: "ACTIVE" }
      )
    ).toBe(true);
    expect(
      transitionRemovesActivePlatformOwner(
        { role: "OWNER", status: "ACTIVE" },
        { role: "OWNER", status: "DISABLED" }
      )
    ).toBe(true);
    expect(
      transitionRemovesActivePlatformOwner(
        { role: "OWNER", status: "DISABLED" },
        { role: "AUDITOR", status: "DISABLED" }
      )
    ).toBe(false);
  });
});

describe("platform sensitive-action step-up", () => {
  it("requires both the current password and the current TOTP", async () => {
    const password = "a-strong-current-password";
    const passwordHash = await bcrypt.hash(password, 4);
    const secret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
    const at = 59_000;
    const currentTotpCode = totpCode(secret, at);
    const admin = {
      passwordHash,
      totpSecretCiphertext: "encrypted-secret",
    };
    const dependencies = {
      decryptSecret: () => secret,
      at,
    };

    await expect(
      platformStepUpCredentialsAreValid(
        admin,
        { currentPassword: password, currentTotpCode },
        dependencies
      )
    ).resolves.toBe(true);
    await expect(
      platformStepUpCredentialsAreValid(
        admin,
        { currentPassword: "wrong-password", currentTotpCode },
        dependencies
      )
    ).resolves.toBe(false);
    await expect(
      platformStepUpCredentialsAreValid(
        admin,
        { currentPassword: password, currentTotpCode: "000000" },
        dependencies
      )
    ).resolves.toBe(false);
  });
});

describe("platform session revocation transition", () => {
  it("advances a legacy missing sessionVersion from its effective version 1 to 2", () => {
    expect(platformSessionVersionTransition({})).toEqual({
      current: 1,
      next: 2,
      filter: { sessionVersion: { $exists: false } },
    });
  });

  it("uses the stored version as a compare-and-set guard", () => {
    expect(platformSessionVersionTransition({ sessionVersion: 7 })).toEqual({
      current: 7,
      next: 8,
      filter: { sessionVersion: 7 },
    });
  });
});
