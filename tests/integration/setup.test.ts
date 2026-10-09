import { beforeAll, describe, expect, it } from "vitest";

/** Disposable database only; see tests/integration/postgresql.test.ts. */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("first-run setup", () => {
  let setup: typeof import("../../lib/setup/admin");
  let check: typeof import("../../lib/setup/database-check");

  beforeAll(async () => {
    await (await import("../../lib/migrations")).runMigrations();
    setup = await import("../../lib/setup/admin");
    check = await import("../../lib/setup/database-check");
  });

  it("recognises an existing SignalHub database", async () => {
    const result = await check.testDatabase({ url: url! });
    expect(result.ok).toBe(true);
    expect(result.checks.find((item) => item.id === "contents")?.message).toMatch(/Existing SignalHub database/);
  });

  it("reports a wrong password without throwing", async () => {
    const wrong = new URL(url!);
    wrong.password = "definitely-wrong";
    const result = await check.testDatabase({ url: wrong.toString() });
    expect(result.ok).toBe(false);
    expect(result.checks[0]?.message).toMatch(/password/);
  });

  it("refuses wizard setup once any user exists", async () => {
    const stamp = Date.now();
    const input = {
      username: `setup-${stamp}`, password: "a-very-long-unique-passphrase", name: "Setup Admin",
      email: `setup-${stamp}@example.com`, organizationName: "Setup", organizationSlug: `setup-${stamp}`,
    };
    await setup.bootstrapInstance(input, { onlyIfNoUsers: false, mustChangePassword: true });
    expect(await setup.countUsers()).toBeGreaterThan(0);
    await expect(
      setup.bootstrapInstance({ ...input, username: `other-${stamp}` }, { onlyIfNoUsers: true, mustChangePassword: false })
    ).rejects.toBeInstanceOf(setup.SetupAlreadyCompleteError);
  });
});

describe.skipIf(!enabled)("password recovery", () => {
  let reset: typeof import("../../lib/password-reset");
  let client: typeof import("../../lib/postgres/client");
  let secrets: typeof import("../../lib/secrets");
  let auth: typeof import("../../lib/auth");
  let userId = "";
  const username = `recover-${Date.now()}`;

  beforeAll(async () => {
    await (await import("../../lib/migrations")).runMigrations();
    reset = await import("../../lib/password-reset");
    client = await import("../../lib/postgres/client");
    secrets = await import("../../lib/secrets");
    auth = await import("../../lib/auth");
    const setup = await import("../../lib/setup/admin");
    await setup.bootstrapInstance({
      username, password: "an-original-long-passphrase", name: "Recover Me",
      email: `${username}@example.com`, organizationName: "Recover", organizationSlug: username,
    }, { onlyIfNoUsers: false, mustChangePassword: false });
    userId = (await client.database.selectFrom("users").select("id").where("canonicalUsername", "=", username).executeTakeFirstOrThrow()).id;
  });

  it("resets with a valid link exactly once", async () => {
    const { token, hash } = secrets.generateSecret("shpr_");
    await client.database.insertInto("passwordResetTokens").values({ userId, tokenHash: hash, expiresAt: new Date(Date.now() + 60_000), requestedIp: null }).execute();
    expect(await reset.describeResetToken(token)).toEqual({ username });
    await expect(reset.resetPasswordWithToken(token, "short")).rejects.toMatchObject({ code: "PASSWORD_POLICY_FAILED" });
    await reset.resetPasswordWithToken(token, "a-brand-new-long-passphrase");
    const user = await client.database.selectFrom("users").select("passwordHash").where("id", "=", userId).executeTakeFirstOrThrow();
    expect(await auth.verifyPassword("a-brand-new-long-passphrase", user.passwordHash!)).toBe(true);
    await expect(reset.resetPasswordWithToken(token, "another-long-passphrase-x")).rejects.toMatchObject({ code: "RESET_LINK_INVALID" });
  });

  it("rejects expired links", async () => {
    const { token, hash } = secrets.generateSecret("shpr_");
    await client.database.insertInto("passwordResetTokens").values({ userId, tokenHash: hash, expiresAt: new Date(Date.now() - 1_000), requestedIp: null }).execute();
    expect(await reset.describeResetToken(token)).toBeNull();
  });

  it("lets the operator set a temporary password and clear MFA", async () => {
    const result = await reset.operatorResetPassword(username, { clearMfa: true });
    expect(result.generated).toBe(true);
    const user = await client.database.selectFrom("users").select(["passwordHash", "mustChangePassword", "totpSecretCiphertext"]).where("id", "=", userId).executeTakeFirstOrThrow();
    expect(await auth.verifyPassword(result.password, user.passwordHash!)).toBe(true);
    expect(user.mustChangePassword).toBe(true);
    expect(user.totpSecretCiphertext).toBeNull();
  });
});
