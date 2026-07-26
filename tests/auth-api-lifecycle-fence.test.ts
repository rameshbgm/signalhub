import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("authentication and management API lifecycle fencing", () => {
  it.each([
    "app/api/auth/login/route.ts",
    "app/api/auth/switch-org/route.ts",
    "app/api/auth/oidc/callback/route.ts",
  ])("%s revalidates identity and active membership before issuing a cookie", (path) => {
    const contents = source(path);
    const authorization = contents.indexOf(
      "const authorized = await writeActiveTenantAudit("
    );
    const cookie = contents.indexOf("await createSession({", authorization);
    expect(authorization).toBeGreaterThan(-1);
    expect(cookie).toBeGreaterThan(authorization);

    const verificationStart = contents.indexOf(
      "async (databaseSession) => {",
      authorization
    );
    const verificationEnd = contents.indexOf(
      "return { user: currentUser, membership: currentMembership };",
      verificationStart
    );
    const verification = contents.slice(verificationStart, verificationEnd);
    expect(verification).toContain("disabled: { $ne: true }");
    expect(verification).toContain('status: "ACTIVE"');
    expect(verification).not.toContain("Promise.all(");
  });

  it("runs auth verification between the organization fence and audit insert", () => {
    const contents = source("lib/tenant-audit.ts");
    const fence = contents.indexOf("await fenceActiveOrganizationMutation(");
    const verification = contents.indexOf("await verify(databaseSession)");
    const audit = contents.indexOf(
      "await collections.auditLogs().insertOne(",
      verification
    );
    expect(fence).toBeGreaterThan(-1);
    expect(verification).toBeGreaterThan(fence);
    expect(audit).toBeGreaterThan(verification);
  });

  it.each([
    "app/api/auth/logout/route.ts",
    "app/api/auth/platform-logout/route.ts",
  ])("%s uses the unified session logout", (path) => {
    const contents = source(path);
    expect(contents).toContain("destroySession(");
    expect(contents).not.toContain("supportSessions(");
  });

  it("fences API-key usage metadata in the same transaction", () => {
    const contents = source("lib/api-auth.ts");
    expect(contents).toContain("withTransaction(async () =>");
    expect(contents).toContain("fenceActiveOrganizationMutation(");
    expect(contents).toMatch(
      /lastUsedAt: new Date\(\)[\s\S]*session: databaseSession/
    );
  });

  it("fences unsubscribe deletion and preserves one-time token matching", () => {
    const contents = source(
      "app/api/v1/subscribe/unsubscribe/[token]/route.ts"
    );
    expect(contents).toContain("fenceActiveOrganizationMutation(");
    expect(contents).toContain("{ _id: sub._id, unsubscribeToken: token }");
    expect(contents).toMatch(
      /deleteOne\([\s\S]*session: databaseSession/
    );
  });

  it("keeps management and automation mutations on fenced domain services", () => {
    expect(source("app/api/v1/manage/components/[id]/route.ts")).toContain(
      "setComponentStatus("
    );
    expect(source("app/api/v1/manage/incidents/route.ts")).toContain(
      "createIncident("
    );
    expect(
      source("app/api/v1/manage/incidents/[id]/updates/route.ts")
    ).toContain("addIncidentUpdate(");
    expect(source("app/api/v1/webhook-component/[token]/route.ts")).toContain(
      "setComponentStatus("
    );
    expect(source("lib/component-status.ts")).toContain(
      "fenceActiveOrganizationMutation(page.orgId, session)"
    );
    expect(source("lib/domain/incidents.ts")).toContain(
      "fenceActiveOrganizationMutation(orgId, session)"
    );
  });

  it("keeps unauthenticated direct destination creation disabled", () => {
    const contents = source("app/api/v1/subscribe/direct/route.ts");
    expect(contents).toContain("{ status: 410 }");
    expect(contents).not.toContain("collections.");
  });
});
