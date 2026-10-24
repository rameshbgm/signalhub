import { beforeAll, describe, expect, it } from "vitest";

/** Disposable database only; see tests/integration/postgresql.test.ts. */
const url = process.env.INTEGRATION_DATABASE_URL;
const databaseName = url ? new URL(url).pathname.replace(/^\//, "") : "";
const enabled = Boolean(url) && /test/i.test(databaseName);
if (enabled) process.env.DATABASE_URL = url;

describe.skipIf(!enabled)("MFA removal requests", () => {
  let service: typeof import("../../lib/mfa/service");
  let requests: typeof import("../../lib/mfa/requests");
  let totp: typeof import("../../lib/totp");
  let client: typeof import("../../lib/postgres/client");
  let setup: typeof import("../../lib/setup/admin");
  let counter = 0;
  let clock = Date.now() + 20 * 60_000;
  const later = () => new Date((clock += 90_000));

  beforeAll(async () => {
    await (await import("../../lib/migrations")).runMigrations();
    service = await import("../../lib/mfa/service");
    requests = await import("../../lib/mfa/requests");
    totp = await import("../../lib/totp");
    client = await import("../../lib/postgres/client");
    setup = await import("../../lib/setup/admin");
  });

  /** A real administrator (membership role ADMIN) in its own organization. */
  async function newAdmin() {
    const stamp = `${Date.now()}${counter++}`;
    await setup.bootstrapInstance({
      username: `rq-admin-${stamp}`, password: "a-very-long-unique-passphrase", name: "Request Admin",
      email: `rq-admin-${stamp}@example.com`, organizationName: `Rq ${stamp}`, organizationSlug: `rq-${stamp}`,
    }, { onlyIfNoUsers: false, mustChangePassword: false });
    return client.database.selectFrom("users").select(["id", "email"]).where("canonicalUsername", "=", `rq-admin-${stamp}`).executeTakeFirstOrThrow();
  }

  async function newUser() {
    const stamp = `${Date.now()}${counter++}`;
    return client.database.insertInto("users").values({
      username: `rq-${stamp}`, canonicalUsername: `rq-${stamp}`, email: `rq-${stamp}@example.com`,
      canonicalEmail: `rq-${stamp}@example.com`, passwordHash: "x", name: "Request User",
    } as never).returning(["id", "email"]).executeTakeFirstOrThrow();
  }

  async function enroll(user: { id: string; email: string }) {
    const at = later();
    const started = await service.startDevice(user, at);
    return service.confirmDevice(user, totp.totpCode(started.secret, at.getTime()), at);
  }

  async function userWithTwoDevices() {
    const user = await newUser();
    await enroll(user);
    await enroll(user);
    await client.database.insertInto("authSessions").values({
      tokenHash: `rq-${Date.now()}${counter++}`, userId: user.id, authMethod: "PASSWORD", mfaVerified: true,
      idleExpiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 3_600_000),
    }).execute();
    await service.createTrustedDevice(user, { userAgent: "t", ip: null });
    return user;
  }

  const file = (user: { id: string; email: string }) =>
    requests.createRequest(user, { type: "LOST_DEVICE", reason: "My phone was lost", ip: "203.0.113.5", userAgent: "vitest" });

  it("runs the whole flow: request, another admin approves, everything is removed, re-enrollment is forced", async () => {
    const user = await userWithTwoDevices();
    const admin = await newAdmin();
    const { requestId } = await file(user);
    await requests.approveRequest(requestId, admin);

    const status = await service.mfaStatus(user.id);
    expect(status.devices).toHaveLength(0);
    expect(status.recoveryCodesRemaining).toBe(0);
    expect(status.reenrollRequired).toBe(true);
    const live = await client.database.selectFrom("authSessions").select("id").where("userId", "=", user.id).where("revokedAt", "is", null).execute();
    expect(live).toHaveLength(0);
    const trusted = await client.database.selectFrom("mfaTrustedDevices").select("id").where("userId", "=", user.id).where("revokedAt", "is", null).execute();
    expect(trusted).toHaveLength(0);
    const audit = await client.database.selectFrom("platformAuditLogs").select("action").where("targetId", "=", user.id).execute();
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(["MFA_REQUEST_CREATED", "MFA_REQUEST_APPROVED"]));

    // The old devices stay deleted; enrolling again clears the flag.
    await enroll(user);
    expect((await service.mfaStatus(user.id)).reenrollRequired).toBe(false);
  });

  it("allows only one pending request per person", async () => {
    const user = await userWithTwoDevices();
    await file(user);
    await expect(file(user)).rejects.toMatchObject({ code: "MFA_REQUEST_EXISTS" });
  });

  it("blocks self-approval and break-glass while another administrator exists", async () => {
    const admin = await newAdmin();
    await newAdmin();
    await enroll(admin);
    const { requestId } = await file(admin);
    await expect(requests.approveRequest(requestId, admin)).rejects.toMatchObject({ code: "MFA_SELF_APPROVAL" });
    await expect(requests.approveRequest(requestId, admin, { breakGlass: true })).rejects.toMatchObject({ code: "MFA_BREAK_GLASS_UNAVAILABLE" });
    expect((await service.mfaStatus(admin.id)).devices).toHaveLength(1);
  });

  it("refuses to approve twice, with a clear message, and changes nothing the second time", async () => {
    const user = await userWithTwoDevices();
    const admin = await newAdmin();
    const { requestId } = await file(user);
    await requests.approveRequest(requestId, admin);
    await enroll(user);
    await expect(requests.approveRequest(requestId, admin)).rejects.toMatchObject({ code: "MFA_REQUEST_CLOSED", message: expect.stringMatching(/already approved/) });
    expect((await service.mfaStatus(user.id)).devices).toHaveLength(1);
  });

  it("cannot approve a cancelled or an expired request", async () => {
    const admin = await newAdmin();
    const cancelled = await userWithTwoDevices();
    const first = await file(cancelled);
    await requests.cancelRequest({ id: first.requestId, userId: cancelled.id });
    await expect(requests.approveRequest(first.requestId, admin)).rejects.toMatchObject({ code: "MFA_REQUEST_CLOSED", message: expect.stringMatching(/cancelled/) });
    expect((await service.mfaStatus(cancelled.id)).devices).toHaveLength(2);

    const stale = await userWithTwoDevices();
    const second = await file(stale);
    await client.database.updateTable("mfaRequests").set({ expiresAt: new Date(Date.now() - 1_000) }).where("id", "=", second.requestId).execute();
    await expect(requests.approveRequest(second.requestId, admin)).rejects.toMatchObject({ code: "MFA_REQUEST_CLOSED" });
    expect((await service.mfaStatus(stale.id)).devices).toHaveLength(2);
    await requests.expireMfaState();
    const row = await client.database.selectFrom("mfaRequests").select("status").where("id", "=", second.requestId).executeTakeFirstOrThrow();
    expect(row.status).toBe("EXPIRED");
  });

  it("lets exactly one of cancel and approve win when they race", async () => {
    const admin = await newAdmin();
    for (let round = 0; round < 5; round += 1) {
      const user = await userWithTwoDevices();
      const { requestId, cancelToken } = await file(user);
      const [approval, cancellation] = await Promise.allSettled([
        requests.approveRequest(requestId, admin),
        requests.cancelRequest({ token: cancelToken }),
      ]);
      const wins = [approval, cancellation].filter((result) => result.status === "fulfilled");
      expect(wins).toHaveLength(1);
      const loser = [approval, cancellation].find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect(loser.reason).toMatchObject({ code: "MFA_REQUEST_CLOSED" });
      const devices = (await service.mfaStatus(user.id)).devices.length;
      expect(devices).toBe(approval.status === "fulfilled" ? 0 : 2);
    }
  });

  it("needs a note to reject, then holds a 24 hour cooldown", async () => {
    const user = await userWithTwoDevices();
    const admin = await newAdmin();
    const { requestId } = await file(user);
    await expect(requests.rejectRequest(requestId, admin, " ")).rejects.toMatchObject({ code: "MFA_NOTE_REQUIRED" });
    await requests.rejectRequest(requestId, admin, "Could not verify the owner");
    await expect(file(user)).rejects.toMatchObject({ code: "MFA_REQUEST_COOLDOWN" });
    const tomorrow = new Date(Date.now() + 25 * 3_600_000);
    await expect(requests.createRequest(user, { type: "REMOVE_ALL", reason: "Trying again", ip: null, userAgent: null }, tomorrow)).resolves.toBeTruthy();
    expect((await service.mfaStatus(user.id)).devices).toHaveLength(2);
  });

  it("resets directly with a reason, never your own account, and cancels a pending request", async () => {
    const user = await userWithTwoDevices();
    const admin = await newAdmin();
    const { requestId } = await file(user);
    await expect(requests.adminResetMfa(admin.id, admin, "reset myself")).rejects.toMatchObject({ code: "MFA_SELF_APPROVAL" });
    await expect(requests.adminResetMfa(user.id, admin, "no")).rejects.toMatchObject({ code: "MFA_REASON_INVALID" });
    await requests.adminResetMfa(user.id, admin, "Verified by phone call");
    expect((await service.mfaStatus(user.id)).reenrollRequired).toBe(true);
    const row = await client.database.selectFrom("mfaRequests").select("status").where("id", "=", requestId).executeTakeFirstOrThrow();
    expect(row.status).toBe("CANCELLED");
  });

  it("lists requests by status with an overdue flag and shows each user's MFA state", async () => {
    const user = await userWithTwoDevices();
    const { requestId } = await file(user);
    await client.database.updateTable("mfaRequests").set({ createdAt: new Date(Date.now() - 4 * 86_400_000) }).where("id", "=", requestId).execute();
    const overdue = await requests.listRequests("OVERDUE");
    expect(overdue.find((row) => row.id === requestId)).toMatchObject({ overdue: true, status: "PENDING", ipAddress: "203.0.113.5" });
    const overview = await requests.mfaOverview([user.id]);
    expect(overview.get(user.id)).toMatchObject({ devices: 2, reenroll: false });
  });

  it("lets an administrator delete one device, or the last one, and forces re-enrollment only then", async () => {
    const user = await newUser();
    const first = await enroll(user);
    const second = await enroll(user);
    const admin = await newAdmin();
    await expect(requests.adminDeleteDevice(user.id, first.deviceId, admin, "no")).rejects.toMatchObject({ code: "MFA_REASON_INVALID" });
    await expect(requests.adminDeleteDevice(admin.id, first.deviceId, admin, "my own device")).rejects.toMatchObject({ code: "MFA_SELF_APPROVAL" });
    const one = await requests.adminDeleteDevice(user.id, first.deviceId, admin, "Lost the old phone");
    expect(one.last).toBe(false);
    expect((await service.mfaStatus(user.id)).reenrollRequired).toBe(false);
    const last = await requests.adminDeleteDevice(user.id, second.deviceId, admin, "Lost the other phone too");
    expect(last.last).toBe(true);
    const status = await service.mfaStatus(user.id);
    expect(status).toMatchObject({ reenrollRequired: true, recoveryCodesRemaining: 0 });
    expect(status.devices).toHaveLength(0);
    await expect(requests.adminDeleteDevice(user.id, second.deviceId, admin, "again")).rejects.toMatchObject({ code: "MFA_DEVICE_NOT_FOUND" });
  });
});
