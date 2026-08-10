import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(file, "utf8");
}

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const file = path.join(directory, entry);
    return statSync(file).isDirectory() ? filesBelow(file) : [file];
  });
}

describe("PostgreSQL lifecycle contracts", () => {
  it("serializes tenant mutations on the organization row", () => {
    const contents = source("lib/organization-mutation.ts");
    expect(contents).toContain('.updateTable("organizations")');
    expect(contents).toContain('.where("id", "=", organizationId)');
    expect(contents).toContain('.where("status", "=", "ACTIVE")');
    expect(contents).toContain('mutationRevision: expression("mutationRevision", "+", 1)');
  });

  it("serializes installation Admin changes with a transaction advisory lock", () => {
    const contents = source("lib/team-owner-safety.ts");
    expect(contents).toContain("pg_advisory_xact_lock");
    expect(contents).toContain("signalhub:active-admin");
  });

  it("claims queue work with row locking and skip-locked semantics", () => {
    for (const file of [
      "worker/notifications.ts",
      "worker/exports.ts",
      "worker/audit-delivery.ts",
      "worker/platform-jobs.ts",
    ]) {
      const contents = source(file);
      expect(contents, file).toContain(".forUpdate()");
      expect(contents, file).toContain(".skipLocked()");
    }
  });

  it("uses Graphile Worker for distributed scheduling and atomic queue wake-ups", () => {
    const worker = source("worker/index.ts");
    const jobs = source("lib/jobs.ts");
    expect(worker).toContain("await run({");
    expect(worker).toContain("parseCronItems");
    expect(worker).toContain("seedContinuousTasks");
    expect(worker).not.toContain("while (!state.stopping)");
    expect(jobs).toContain("graphile_worker.add_job");
    expect(jobs).toContain("job_key_mode := 'replace'");
  });

  it("does not compile empty PostgreSQL IN lists", () => {
    const dashboard = source("app/admin/(protected)/page.tsx");
    const publicData = source("lib/public-data.ts");
    expect(dashboard).toContain("if (!pageIds.length)");
    expect(publicData).toContain("safeVisibleIds.length === 0");
    expect(publicData).toContain("scopedIds.length === 0");
    expect(publicData).toContain('incidentQuery.where("pageWide", "=", true)');
  });

  it("writes authentication audit entries in the fenced transaction", () => {
    const contents = source("lib/tenant-audit.ts");
    const fence = contents.indexOf("fenceActiveOrganizationMutation");
    const verify = contents.indexOf("await verify(transaction)", fence);
    const insert = contents.indexOf('insertInto("auditLogs")', verify);
    expect(fence).toBeGreaterThanOrEqual(0);
    expect(verify).toBeGreaterThan(fence);
    expect(insert).toBeGreaterThan(verify);
  });

  it("uses foreign-key cascades for owned page data", () => {
    const migration = source("db/migrations/001_initial_postgresql.sql");
    for (const table of [
      "components",
      "incidents",
      "subscribers",
      "metrics",
      "monitors",
      "assets",
    ]) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE ${table}[\\s\\S]*?page_id uuid NOT NULL REFERENCES pages\\(id\\) ON DELETE CASCADE`));
    }
  });

  it("contains no legacy database driver references in runtime, scripts, or tests", () => {
    const legacyDriver = new RegExp(["mon", "go"].join(""), "i");
    const legacyIdentifier = new RegExp(["Object", "Id"].join(""));
    const files = ["app", "components", "lib", "worker", "scripts", "tests"]
      .flatMap(filesBelow)
      .filter((file) => /\.(ts|tsx|js|mjs|cjs)$/.test(file));
    for (const file of files) {
      const contents = source(file);
      expect(legacyDriver.test(contents), file).toBe(false);
      expect(legacyIdentifier.test(contents), file).toBe(false);
    }
  });
});
