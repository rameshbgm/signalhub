import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  liveRole: "ADMIN", liveMember: true,
  session: vi.fn(), challenge: vi.fn(), freshCode: vi.fn(), start: vi.fn(), confirm: vi.fn(),
  regenerate: vi.fn(), remove: vi.fn(), request: vi.fn(), audit: vi.fn(),
  user: { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", name: "Admin", username: "admin" },
}));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/login-session", () => ({ completeLogin: vi.fn() }));
vi.mock("@/lib/postgres/client", () => ({ database: {
  selectFrom: (table: string) => {
    const query = { select: () => query, where: () => query, executeTakeFirst: async () => table === "memberships" ? (mocks.liveMember ? { role: mocks.liveRole } : undefined) : mocks.user };
    return query;
  },
} }));
vi.mock("@/lib/mfa/service", () => ({
  MfaError: class extends Error { constructor(readonly code: string, message: string, readonly status = 400) { super(message); } },
  findChallenge: mocks.challenge, requireFreshCode: mocks.freshCode,
  startDevice: mocks.start, confirmDevice: mocks.confirm, regenerateRecoveryCodes: mocks.regenerate, deleteDevice: mocks.remove,
  mfaStatus: vi.fn(async () => ({ devices: [{ id: "device" }], recoveryCodesRemaining: 10 })),
  acknowledgeRecoveryCodes: vi.fn(), deleteChallenge: vi.fn(), renameDevice: vi.fn(), takeRevealForEmail: vi.fn(async () => ["backup"]),
}));
vi.mock("@/lib/mfa/requests", () => ({ createRequest: mocks.request, notifyRequestCreated: vi.fn(), cancelRequest: vi.fn(), requestStateFor: vi.fn() }));
vi.mock("@/lib/mfa/audit", () => ({ auditMfa: mocks.audit }));
vi.mock("@/lib/mfa/mail", () => ({ sendMfaMail: vi.fn(), sendRecoveryCodesMail: vi.fn() }));
vi.mock("@/lib/mfa/qr", () => ({ qrDataUrl: vi.fn(async () => "qr") }));
vi.mock("@/lib/rate-limit", () => ({ consumeNamedLimit: vi.fn(), requestIp: () => null, RateLimitError: class extends Error {} }));
vi.mock("@/lib/smtp", () => ({ smtpConfigured: vi.fn(async () => true) }));

import { POST } from "../app/api/auth/mfa/route";
const reason = "Replacing my lost phone";
const deviceId = "22222222-2222-4222-8222-222222222222";
const post = (body: Record<string, unknown>) => POST(new NextRequest("http://localhost/api/auth/mfa", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.liveRole = "ADMIN"; mocks.liveMember = true;
  mocks.session.mockResolvedValue({ userId: mocks.user.id, role: "ADMIN", sessionId: "session" });
  mocks.challenge.mockResolvedValue(null);
  mocks.start.mockResolvedValue({ secret: "secret", uri: "uri" });
  mocks.confirm.mockResolvedValue({ first: false, deviceName: "Phone", recoveryCodes: null });
  mocks.regenerate.mockResolvedValue(["backup"]);
  mocks.remove.mockResolvedValue({ deviceName: "Phone" });
  mocks.request.mockResolvedValue({ requestId: "request" });
});

describe("administrator MFA changes", () => {
  it.each(["start", "delete", "regenerate", "request-removal", "email-codes"])("accepts a reason without an existing-device code for %s", async (action) => {
    const response = await post({ action, deviceId, reason });
    expect(response.status).toBe(200);
    expect(mocks.freshCode).not.toHaveBeenCalled();
    const audit = { admin: mocks.user, reason };
    if (action === "start") expect(mocks.start).toHaveBeenCalledWith(mocks.user, undefined, audit);
    if (action === "delete") expect(mocks.remove).toHaveBeenCalledWith(mocks.user, deviceId, audit);
    if (action === "regenerate") expect(mocks.regenerate).toHaveBeenCalledWith(mocks.user, undefined, audit);
    if (action === "request-removal") expect(mocks.request).toHaveBeenCalledWith(mocks.user, expect.objectContaining(audit));
    if (action === "email-codes") expect(mocks.audit).toHaveBeenCalledWith("MFA_RECOVERY_CODES_EMAILED", { subject: mocks.user, ...audit });
  });

  it.each(["start", "confirm", "delete", "regenerate", "request-removal", "email-codes"])("requires a reason for admin %s", async (action) => {
    for (const reason of [undefined, " ", "tiny", "a".repeat(501)]) {
      expect((await post({ action, deviceId, code: "123456", reason })).status).toBe(400);
    }
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.regenerate).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("still requires the new device's code to complete enrollment", async () => {
    expect((await post({ action: "confirm", reason })).status).toBe(400);
    expect((await post({ action: "confirm", code: "123456", reason })).status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith(mocks.user, "123456", undefined, { admin: mocks.user, reason });
  });

  it.each(["delete", "regenerate", "request-removal"])("does not let a non-admin substitute a reason for a code on %s", async (action) => {
    mocks.liveRole = "EDITOR";
    mocks.session.mockResolvedValue({ userId: mocks.user.id, role: "EDITOR", sessionId: "session" });
    expect((await post({ action, deviceId, reason, isAdmin: true })).status).toBe(403);
    expect((await post({ action, deviceId, reason, code: "123456" })).status).toBe(200);
    expect(mocks.freshCode).toHaveBeenCalledWith({ userId: mocks.user.id, sessionId: "session" }, "123456");
  });

  it("checks step-up when a non-admin adds another authenticator", async () => {
    mocks.liveRole = "EDITOR";
    mocks.session.mockResolvedValue({ userId: mocks.user.id, role: "EDITOR", sessionId: "session" });
    await post({ action: "start", reason });
    expect(mocks.freshCode).toHaveBeenCalledWith({ userId: mocks.user.id, sessionId: "session" }, undefined);
    expect(mocks.start).toHaveBeenCalledWith(mocks.user, undefined, {});
  });

  it("keeps a pending enrollment challenge from using an admin session", async () => {
    mocks.challenge.mockResolvedValue({ kind: "ENROLL", userId: mocks.user.id });
    expect((await post({ action: "regenerate", reason })).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect((await post({ action: "start" })).status).toBe(200);
    expect(mocks.start).toHaveBeenCalledWith(mocks.user, undefined, {});
  });
  it("does not trust the old Admin role after demotion or membership revocation", async () => {
    mocks.liveRole = "VIEWER";
    expect((await post({ action: "delete", deviceId, reason })).status).toBe(403);
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.liveMember = false;
    expect((await post({ action: "start", reason })).status).toBe(401);
    expect(mocks.start).not.toHaveBeenCalled();
  });

});
