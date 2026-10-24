import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(), assertPageInOrg: vi.fn(), consumeNamedLimit: vi.fn(),
  prepareMonitorInput: vi.fn(), runMonitorTest: vi.fn(), createMonitor: vi.fn(),
  selectFrom: vi.fn(), revalidatePath: vi.fn(), loadMonitorProxy: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin-guard", () => ({ requireCapability: mocks.requireCapability, assertPageInOrg: mocks.assertPageInOrg }));
vi.mock("@/lib/rate-limit", () => ({ consumeNamedLimit: mocks.consumeNamedLimit }));
vi.mock("@/lib/monitor-test", () => ({ runMonitorTest: mocks.runMonitorTest }));
vi.mock("@/lib/domain/monitors", () => ({ prepareMonitorInput: mocks.prepareMonitorInput, createMonitor: mocks.createMonitor }));
vi.mock("@/lib/postgres/client", () => ({ database: { selectFrom: mocks.selectFrom } }));
vi.mock("@/lib/proxies", () => ({ loadMonitorProxy: mocks.loadMonitorProxy }));
vi.mock("@/lib/monitoring-settings", () => ({ effectiveMonitoringSettings: async () => ({ certExpiryWarnDays: 14 }) }));

const { testMonitor } = await import("@/app/admin/(protected)/monitors/actions");
const pageId = "a0000000-0000-4000-8000-000000000001";
const monitorId = "a0000000-0000-4000-8000-000000000002";

describe("monitor test authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireCapability.mockResolvedValue({ orgId: "organization", userId: "user" });
    mocks.prepareMonitorInput.mockResolvedValue({ type: "HTTP", proxyId: null });
    mocks.loadMonitorProxy.mockResolvedValue(null);
    mocks.runMonitorTest.mockResolvedValue({ ok: true, message: "Test passed", latencyMs: 1, statusCode: 200 });
  });

  it("requires monitor permission and page access before checking a target", async () => {
    mocks.requireCapability.mockRejectedValueOnce(new Error("Permission denied"));
    expect(await testMonitor(pageId, null, new FormData())).toMatchObject({ ok: false, message: "Permission denied" });
    expect(mocks.requireCapability).toHaveBeenCalledWith("monitor.manage", pageId);
    expect(mocks.runMonitorTest).not.toHaveBeenCalled();
    mocks.assertPageInOrg.mockRejectedValueOnce(new Error("Page not found"));
    expect(await testMonitor(pageId, null, new FormData())).toMatchObject({ ok: false, message: "Page not found" });
    expect(mocks.runMonitorTest).not.toHaveBeenCalled();
  });

  it("tests draft settings without creating a monitor or revalidating service pages", async () => {
    expect(await testMonitor(pageId, null, new FormData())).toMatchObject({ ok: true, statusCode: 200 });
    expect(mocks.assertPageInOrg).toHaveBeenCalledWith(pageId, "organization");
    expect(mocks.consumeNamedLimit).toHaveBeenCalledWith("monitor-test-account", "organization:user");
    expect(mocks.runMonitorTest).toHaveBeenCalledWith({ type: "HTTP", proxyId: null }, { saved: undefined, proxy: null, certWarnDays: 14 });
    expect(mocks.createMonitor).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("stops before the network check when the rate limit is exceeded", async () => {
    mocks.consumeNamedLimit.mockRejectedValueOnce(new Error("Too many requests"));
    expect(await testMonitor(pageId, null, new FormData())).toMatchObject({ ok: false, message: "Too many requests" });
    expect(mocks.runMonitorTest).not.toHaveBeenCalled();
  });

  it("scopes saved credentials and proxies to the authorized page and organization", async () => {
    const query = { select: vi.fn(), where: vi.fn(), executeTakeFirst: vi.fn().mockResolvedValue(undefined) };
    query.select.mockReturnValue(query);
    query.where.mockReturnValue(query);
    mocks.selectFrom.mockReturnValue(query);
    expect(await testMonitor(pageId, monitorId, new FormData())).toMatchObject({ ok: false, message: "Monitor not found on this page" });
    expect(query.where).toHaveBeenCalledWith("pageId", "=", pageId);
    mocks.prepareMonitorInput.mockResolvedValueOnce({ type: "HTTP", proxyId: monitorId });
    expect(await testMonitor(pageId, null, new FormData())).toMatchObject({ ok: false, message: "Proxy not found in your organization" });
    expect(query.where).toHaveBeenCalledWith("orgId", "=", "organization");
    expect(mocks.runMonitorTest).not.toHaveBeenCalled();
  });
});
