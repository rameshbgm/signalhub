import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const transactionFencedSources = [
  "app/admin/(protected)/pages/actions.ts",
  "app/admin/(protected)/pages/[pageId]/setup/actions.ts",
  "app/admin/(protected)/pages/[pageId]/components-actions.ts",
  "app/admin/(protected)/pages/[pageId]/access-actions.ts",
  "app/admin/(protected)/metrics/actions.ts",
  "app/admin/(protected)/subscribers/actions.ts",
  "app/admin/(protected)/templates/actions.ts",
  "app/admin/(protected)/monitors/actions.ts",
  "app/admin/(protected)/settings/actions.ts",
  "app/api/admin/pages/[pageId]/assets/route.ts",
  "app/api/admin/api-keys/route.ts",
  "app/api/admin/api-keys/[id]/rotate/route.ts",
  "app/api/admin/feed-tokens/route.ts",
  "app/api/admin/webhook-endpoints/route.ts",
  "app/api/admin/webhook-endpoints/[id]/rotate/route.ts",
  "app/api/admin/notification-destinations/route.ts",
  "app/api/admin/components/[id]/rotate-token/route.ts",
  "app/api/admin/monitors/[id]/rotate-heartbeat/route.ts",
  "app/api/v1/manage/metrics/[id]/points/route.ts",
  "app/api/v1/analytics/event/route.ts",
  "app/api/v1/subscribe/request-otp/route.ts",
  "app/api/v1/subscribe/verify-otp/route.ts",
  "app/api/v1/heartbeat/[token]/route.ts",
] as const;

function source(path: string) {
  return readFileSync(path, "utf8");
}

function exportedFunctionSource(path: string, name: string) {
  const contents = source(path);
  const marker = `export async function ${name}`;
  const start = contents.indexOf(marker);
  expect(start, `${name} should be exported from ${path}`).toBeGreaterThanOrEqual(0);
  const next = contents.indexOf("\nexport async function ", start + marker.length);
  return contents.slice(start, next < 0 ? undefined : next);
}

describe("tenant mutation lifecycle-fence coverage", () => {
  it.each(transactionFencedSources)(
    "%s orders tenant writes through the organization row",
    (path) => {
      const contents = source(path);
      expect(contents).toContain("fenceActiveOrganizationMutation(");
      expect(contents).toMatch(/session:\s*(databaseSession|dbSession|session)/);
    }
  );

  it("serializes team membership changes through the installation Admin lock", () => {
    expect(source("lib/team-owner-safety.ts")).toContain(
      '"identityInvariantLocks"'
    );
  });

  it("keeps webhook and direct-notification inserts in caller transactions", () => {
    expect(source("lib/domain/webhooks.ts")).toContain(
      "insertOne(prepared.document, {"
    );
    expect(source("lib/notify.ts")).toContain("{ upsert: true, session }");
  });

  it("fences manual component status transitions before reconciliation inserts", () => {
    expect(source("lib/component-status.ts")).toContain(
      "fenceActiveOrganizationMutation(page.orgId, session)"
    );
  });

  it("commits postmortem updates and notification jobs behind one lifecycle fence", () => {
    const contents = source(
      "app/admin/(protected)/incidents/actions.ts"
    );
    expect(contents).toContain(
      "await fenceActiveOrganizationMutation(session.orgId, databaseSession)"
    );
    expect(contents).toMatch(
      /await dispatchNotifications\([\s\S]*databaseSession\s*\)/
    );
  });

  it.each([
    ["app/admin/(protected)/pages/[pageId]/setup/actions.ts", "saveSetupBranding"],
    ["app/admin/(protected)/pages/[pageId]/components-actions.ts", "deleteGroup"],
    ["app/admin/(protected)/pages/[pageId]/components-actions.ts", "updateComponentDetails"],
    ["app/admin/(protected)/pages/[pageId]/access-actions.ts", "deleteAccessGroup"],
    ["app/admin/(protected)/pages/[pageId]/access-actions.ts", "deleteAccessUser"],
    ["app/admin/(protected)/metrics/actions.ts", "toggleMetricVisible"],
    ["app/admin/(protected)/metrics/actions.ts", "updateMetricDecimals"],
    ["app/admin/(protected)/subscribers/actions.ts", "toggleQuarantine"],
    ["app/admin/(protected)/subscribers/actions.ts", "removeSubscriber"],
    ["app/admin/(protected)/subscribers/actions.ts", "retryNotificationJob"],
    ["app/admin/(protected)/templates/actions.ts", "deleteTemplate"],
    ["app/admin/(protected)/templates/actions.ts", "updateTemplate"],
    ["app/admin/(protected)/monitors/actions.ts", "toggleMonitorEnabled"],
    ["app/admin/(protected)/monitors/actions.ts", "runMonitorNow"],
    ["app/admin/(protected)/monitors/actions.ts", "updateMonitor"],
  ] as const)(
    "%s:%s rechecks and mutates behind the same lifecycle fence",
    (path, name) => {
      const contents = exportedFunctionSource(path, name);
      expect(contents).toContain("withTransaction(");
      expect(contents).toContain("fenceActiveOrganizationMutation(");
      expect(contents).toMatch(/findOne\([\s\S]*session:\s*(databaseSession|dbSession)/);
      expect(contents).toMatch(/(matchedCount|modifiedCount|deletedCount)/);
    }
  );

  it("keeps cascade deletes fenced, tenant-scoped, and count checked", () => {
    const callers = [
      exportedFunctionSource("app/admin/(protected)/pages/actions.ts", "deletePage"),
      exportedFunctionSource(
        "app/admin/(protected)/pages/[pageId]/components-actions.ts",
        "deleteComponent"
      ),
      exportedFunctionSource("app/admin/(protected)/metrics/actions.ts", "deleteMetric"),
      exportedFunctionSource("app/admin/(protected)/monitors/actions.ts", "deleteMonitor"),
    ];
    for (const contents of callers) {
      expect(contents).toMatch(
        /delete(?:Page|Component|Metric|Monitor)Cascade\([^;]*session\.orgId/
      );
    }

    const cascadeSource = source("lib/cascade.ts");
    for (const name of [
      "deletePageCascade",
      "deleteComponentCascade",
      "deleteMetricCascade",
      "deleteMonitorCascade",
    ]) {
      const contents = exportedFunctionSource("lib/cascade.ts", name);
      expect(contents).toContain("fenceActiveOrganizationMutation(");
      expect(contents).toContain("orgId: oid(organizationId)");
      expect(contents).toContain("deletedCount");
    }
    expect(cascadeSource).toContain("return true");
  });

  it("holds the page lifecycle fence while deleting recorded asset objects", () => {
    const contents = exportedFunctionSource("lib/cascade.ts", "deletePageCascade");
    const fence = contents.indexOf("fenceActiveOrganizationMutation(");
    const storageDelete = contents.indexOf("recordedAssetStorage(");
    const pageDelete = contents.indexOf("collections.pages().deleteOne(");
    expect(fence).toBeGreaterThanOrEqual(0);
    expect(storageDelete).toBeGreaterThan(fence);
    expect(pageDelete).toBeGreaterThan(storageDelete);
  });

  it("rechecks component group selections in the fenced create transaction", () => {
    const contents = exportedFunctionSource(
      "app/admin/(protected)/pages/[pageId]/components-actions.ts",
      "createComponent"
    );
    const fence = contents.indexOf("fenceActiveOrganizationMutation(");
    expect(contents.indexOf("componentGroups().findOne(", fence)).toBeGreaterThan(fence);
  });

  it("fences and count-checks asset removal in its database transaction", () => {
    const contents = exportedFunctionSource(
      "app/api/admin/pages/[pageId]/assets/route.ts",
      "DELETE"
    );
    expect(contents).toContain("withTransaction(");
    expect(contents).toContain("fenceActiveOrganizationMutation(");
    expect(contents).toContain("changedPage.matchedCount");
    expect(contents).toContain("changedAsset.matchedCount");
  });
});
