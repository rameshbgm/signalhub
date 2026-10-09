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
