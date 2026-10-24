import { beforeAll, describe, expect, it } from "vitest";

/** Disposable database only; see tests/integration/postgresql.test.ts. */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("authenticator MFA", () => {
  let service: typeof import("../../lib/mfa/service");
  let totp: typeof import("../../lib/totp");
  let client: typeof import("../../lib/postgres/client");
  let decrypt: typeof import("../../lib/encryption");
  let counter = 0;

  beforeAll(async () => {
    await (await import("../../lib/migrations")).runMigrations();
    service = await import("../../lib/mfa/service");
    totp = await import("../../lib/totp");
    client = await import("../../lib/postgres/client");
    decrypt = await import("../../lib/encryption");
  });

  async function newUser() {
    const stamp = `${Date.now()}${counter++}`;
    const row = await client.database.insertInto("users").values({
      username: `mfa-${stamp}`, canonicalUsername: `mfa-${stamp}`, email: `mfa-${stamp}@example.com`,
      canonicalEmail: `mfa-${stamp}@example.com`, passwordHash: "x", name: "MFA Test",
    } as never).returning(["id", "email"]).executeTakeFirstOrThrow();
    return { id: row.id, email: row.email };
  }

  /** The secret of a user's pending device, as the phone would have scanned it. */
  async function secretOf(deviceId: string) {
    const row = await client.database.selectFrom("mfaDevices").select("secretCiphertext").where("id", "=", deviceId).executeTakeFirstOrThrow();
    return decrypt.decryptSecret(row.secretCiphertext);
  }

  /** A new step each call, so replay protection never trips between helper calls. */
  let clock = Date.now() + 10 * 60_000;
  const later = () => new Date((clock += 90_000));

  async function enroll(user: { id: string; email: string }) {
    const at = later();
    const started = await service.startDevice(user, at);
    const done = await service.confirmDevice(user, totp.totpCode(started.secret, at.getTime()), at);
    return { ...done, secret: started.secret };
  }

  it("enrolls a first device, shows recovery codes once and stores only hashes", async () => {
    const user = await newUser();
    const device = await enroll(user);
    expect(device.first).toBe(true);
    expect(device.recoveryCodes).toHaveLength(10);
    const stored = await client.database.selectFrom("mfaRecoveryCodes").select("codeHash").where("userId", "=", user.id).execute();
    expect(stored).toHaveLength(10);
    for (const code of device.recoveryCodes!) expect(stored.map((row) => row.codeHash)).not.toContain(code);
    expect((await service.mfaStatus(user.id)).recoveryCodesRemaining).toBe(10);
  });

  it("does not count an unconfirmed or expired setup as a device", async () => {
    const user = await newUser();
    const started = await service.startDevice(user);
    expect((await service.mfaStatus(user.id)).devices).toHaveLength(0);
    const tooLate = new Date(Date.now() + 11 * 60_000);
    await expect(service.confirmDevice(user, totp.totpCode(started.secret, tooLate.getTime()), tooLate))
      .rejects.toMatchObject({ code: "MFA_ENROLLMENT_EXPIRED" });
    expect((await service.mfaStatus(user.id)).devices).toHaveLength(0);
  });

  it("gives every device its own secret and restarting replaces the unfinished one", async () => {
    const user = await newUser();
    const at = later();
    const first = await service.startDevice(user, at);
    const second = await service.startDevice(user, at);
    expect(second.secret).not.toBe(first.secret);
    const pending = await client.database.selectFrom("mfaDevices").select("id").where("userId", "=", user.id).execute();
    expect(pending).toHaveLength(1);
    await expect(service.confirmDevice(user, totp.totpCode(first.secret, at.getTime()), at)).rejects.toMatchObject({ code: "INVALID_MFA_CODE" });
  });

  it("allows two devices and refuses a third", async () => {
    const user = await newUser();
    await enroll(user);
    await enroll(user);
    expect((await service.mfaStatus(user.id)).devices).toHaveLength(2);
    await expect(service.startDevice(user)).rejects.toMatchObject({ code: "MFA_DEVICE_LIMIT" });
  });

  it("keeps the 2-device cap when two confirmations race", async () => {
    const user = await newUser();
    await enroll(user);
    // Two unfinished setups (two tabs) that both try to become the second device.
    const secrets = ["JBSWY3DPEHPK3PXP", "KRSXG5CTMVRXEZLU"];
    const ids: string[] = [];
    for (const secret of secrets) {
      const row = await client.database.insertInto("mfaDevices").values({
        userId: user.id, name: "Racer", secretCiphertext: decrypt.encryptSecret(secret), status: "PENDING",
        pendingExpiresAt: new Date(Date.now() + 600_000),
      }).returning("id").executeTakeFirstOrThrow();
      ids.push(row.id);
    }
    const at = later();
    const results = await Promise.allSettled(secrets.map((secret) => service.confirmDevice(user, totp.totpCode(secret, at.getTime()), at)));
    expect((await service.mfaStatus(user.id)).devices.length).toBeLessThanOrEqual(2);
    expect(results.filter((result) => result.status === "fulfilled").length).toBeLessThanOrEqual(1);
  });

  it("never deletes the last device, even when two deletes race", async () => {
    const user = await newUser();
    const a = await enroll(user);
    const b = await enroll(user);
    const results = await Promise.allSettled([service.deleteDevice(user, a.deviceId), service.deleteDevice(user, b.deviceId)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ code: "MFA_LAST_DEVICE" });
    expect((await service.mfaStatus(user.id)).devices).toHaveLength(1);
    const left = (await service.mfaStatus(user.id)).devices[0];
    await expect(service.deleteDevice(user, left.id)).rejects.toMatchObject({ code: "MFA_LAST_DEVICE" });
  });

  it("signs trusted browsers out when a device is added or removed", async () => {
    const user = await newUser();
    const first = await enroll(user);
    const { token } = await service.createTrustedDevice(user, { userAgent: "test", ip: null });
    expect(await service.isTrustedDevice(user.id, token)).toBe(true);
    const second = await enroll(user);
    expect(await service.isTrustedDevice(user.id, token)).toBe(false);
    const again = await service.createTrustedDevice(user, { userAgent: "test", ip: null });
    await service.deleteDevice(user, second.deviceId);
    expect(await service.isTrustedDevice(user.id, again.token)).toBe(false);
    expect(first.deviceId).toBeTruthy();
  });

  it("rejects a code that was already used, even inside its validity window", async () => {
    const user = await newUser();
    const device = await enroll(user);
    const at = later();
    const code = totp.totpCode(device.secret, at.getTime());
    expect((await service.verifyCode(user.id, { code }, at)).ok).toBe(true);
    expect(await service.verifyCode(user.id, { code }, at)).toMatchObject({ ok: false, reason: "reused" });
  });

  it("locks MFA attempts after five wrong codes and says when it unlocks", async () => {
    const user = await newUser();
    const device = await enroll(user);
    const base = later();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(await service.verifyCode(user.id, { code: "000000" }, base)).toMatchObject({ ok: false, reason: "invalid" });
    }
    const fifth = await service.verifyCode(user.id, { code: "000000" }, base);
    expect(fifth).toMatchObject({ ok: false, reason: "locked" });
    // A right code does not help while locked.
    const right = totp.totpCode(device.secret, base.getTime());
    expect(await service.verifyCode(user.id, { code: right }, base)).toMatchObject({ ok: false, reason: "locked" });
    const afterLockout = new Date(base.getTime() + 16 * 60_000);
    expect((await service.verifyCode(user.id, { code: totp.totpCode(device.secret, afterLockout.getTime()) }, afterLockout)).ok).toBe(true);
  });

  it("accepts each recovery code once and warns when few remain", async () => {
    const user = await newUser();
    const device = await enroll(user);
    const [first, second] = device.recoveryCodes!;
    const used = await service.verifyCode(user.id, { recoveryCode: first.toLowerCase() });
    expect(used).toMatchObject({ ok: true, method: "recovery", recoveryRemaining: 9 });
    expect(await service.verifyCode(user.id, { recoveryCode: first })).toMatchObject({ ok: false, reason: "invalid" });
    expect((await service.verifyCode(user.id, { recoveryCode: second })).ok).toBe(true);
  });

  it("stops old recovery codes working the moment new ones are generated", async () => {
    const user = await newUser();
    const device = await enroll(user);
    const fresh = await service.regenerateRecoveryCodes(user);
    expect(fresh).toHaveLength(10);
    expect(await service.verifyCode(user.id, { recoveryCode: device.recoveryCodes![0] })).toMatchObject({ ok: false });
    expect((await service.verifyCode(user.id, { recoveryCode: fresh[0] })).ok).toBe(true);
  });

  it("requires a fresh code, then remembers it for five minutes", async () => {
    const user = await newUser();
    const device = await enroll(user);
    const session = await client.database.insertInto("authSessions").values({
      tokenHash: `t-${Date.now()}${counter++}`, userId: user.id, authMethod: "PASSWORD", mfaVerified: true,
      idleExpiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    }).returning("id").executeTakeFirstOrThrow();
    const ctx = { userId: user.id, sessionId: session.id };
    await expect(service.requireFreshCode(ctx, undefined)).rejects.toMatchObject({ code: "MFA_CODE_REQUIRED" });
    const at = later();
    await service.requireFreshCode(ctx, totp.totpCode(device.secret, at.getTime()), at);
    await expect(service.requireFreshCode(ctx, undefined, new Date(at.getTime() + 4 * 60_000))).resolves.toBeUndefined();
    await expect(service.requireFreshCode(ctx, undefined, new Date(at.getTime() + 6 * 60_000))).rejects.toMatchObject({ code: "MFA_CODE_REQUIRED" });
  });

  it("purges everything and forces re-enrollment", async () => {
    const user = await newUser();
    await enroll(user);
    await client.withDatabaseTransaction((transaction) => service.purgeMfa(transaction, user.id, { forceReenroll: true, reason: "test" }));
    const status = await service.mfaStatus(user.id);
    expect(status.devices).toHaveLength(0);
    expect(status.recoveryCodesRemaining).toBe(0);
    expect(status.reenrollRequired).toBe(true);
    await enroll(user);
    expect((await service.mfaStatus(user.id)).reenrollRequired).toBe(false);
  });

  it("leaves MFA untouched when the password is reset", async () => {
    const user = await newUser();
    await enroll(user);
    const secrets = await import("../../lib/secrets");
    const reset = await import("../../lib/password-reset");
    const { token, hash } = secrets.generateSecret("shpr_");
    await client.database.insertInto("passwordResetTokens").values({ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60_000), requestedIp: null }).execute();
    await reset.resetPasswordWithToken(token, "a-brand-new-long-passphrase");
    expect((await service.mfaStatus(user.id)).devices).toHaveLength(1);
  });

  it("persists administrator reasons on enrollment, deletion and recovery-code audits", async () => {
    const user = await newUser();
    const audit = { admin: user, reason: "Replacing an old authenticator" };
    const at = later();
    const started = await service.startDevice(user, at, audit);
    await service.confirmDevice(user, totp.totpCode(started.secret, at.getTime()), at, audit);
    const secondAt = later();
    const second = await service.startDevice(user, secondAt, audit);
    await service.confirmDevice(user, totp.totpCode(second.secret, secondAt.getTime()), secondAt, audit);
    await service.deleteDevice(user, second.deviceId, audit);
    await service.regenerateRecoveryCodes(user, later(), audit);
    const rows = await client.database.selectFrom("platformAuditLogs")
      .select(["action", "actorId", "actorRole", "reason", "metadata"])
      .where("targetId", "=", user.id).execute();
    expect(rows.map((row) => row.action)).toEqual(expect.arrayContaining([
      "MFA_ENROLLMENT_STARTED", "MFA_ENROLLMENT_COMPLETED", "MFA_DEVICE_ADDED",
      "MFA_DEVICE_REMOVED", "MFA_RECOVERY_CODES_GENERATED",
    ]));
    for (const row of rows) {
      expect(row.actorId).toBe(user.id);
      expect(row.actorRole).toBe("ADMIN");
      expect(row.reason).toBe(audit.reason);
    }
    expect(JSON.stringify(rows)).not.toContain(started.secret);
    expect(JSON.stringify(rows)).not.toContain(second.secret);
  });

  it("writes audit records without codes or keys", async () => {
    const user = await newUser();
    const device = await enroll(user);
    await service.verifyCode(user.id, { code: "000000" });
    const rows = await client.database.selectFrom("platformAuditLogs").select(["action", "metadata"]).where("targetId", "=", user.id).execute();
    const actions = rows.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["MFA_ENROLLMENT_STARTED", "MFA_ENROLLMENT_COMPLETED", "MFA_DEVICE_ADDED", "MFA_RECOVERY_CODES_GENERATED", "MFA_LOGIN_FAILED"]));
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(device.secret);
    for (const code of device.recoveryCodes!) expect(dump).not.toContain(code);
    void secretOf;
  });
});
