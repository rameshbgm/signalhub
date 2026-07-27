import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("unified page creation workflow", () => {
  it("offers one page-list entry point and no setup wizard", () => {
    const pageList = source("app/admin/(protected)/pages/page.tsx");
    expect(pageList).toContain('href="/organization/pages/new"');
    expect(pageList).toContain("Continue setup");
    expect(pageList).not.toContain("Setup wizard");
    expect(pageList).not.toContain("Create a status page");
  });

  it("creates hidden drafts and only publishes through setup completion", () => {
    const actions = source("app/admin/(protected)/pages/actions.ts");
    expect(actions).toContain("setupCompletedAt: null");
    expect(actions).toContain("publicVisible: false");
    expect(actions).toContain("export async function finishPageSetup");
    expect(actions).toContain("Add at least one visible component");
    expect(actions).toContain("at least one child status page");
  });

  it("keeps hub content and status-page components mutually exclusive", () => {
    const basics = source("components/admin/NewPageBasicsForm.tsx");
    const detail = source("app/admin/(protected)/pages/[pageId]/page.tsx");
    const componentActions = source("app/admin/(protected)/pages/[pageId]/components-actions.ts");
    expect(basics).toContain('value: "STATUS"');
    expect(basics).toContain('value: "HUB"');
    expect(detail).toContain("Child status pages");
    expect(detail).toContain("Components belong to those child pages");
    expect(componentActions).toContain("Components belong to child status pages, not hubs");
  });

  it("redirects legacy wizard URLs and noncanonical hub URLs", () => {
    const legacy = source("app/admin/(protected)/pages/[pageId]/setup/[step]/page.tsx");
    const publicPage = source("app/(public)/[slug]/page.tsx");
    expect(legacy).toContain("LegacySetupRedirect");
    expect(legacy).toContain("redirect(`/organization/pages/${pageId}`)");
    expect(publicPage).toContain("if (pageDoc.isHub) redirect(`/hub/${encodeURIComponent(pageDoc.slug)}`)");
  });

  it("includes all setup essentials on the configuration screen", () => {
    const detail = source("app/admin/(protected)/pages/[pageId]/page.tsx");
    const notifications = source("components/admin/PageNotificationsSection.tsx");
    for (const label of ["Branding & Settings", "Audience Access", "Review & publish", "Incident readiness"]) {
      expect(detail).toContain(label);
    }
    expect(detail).toContain("PageNotificationsSection");
    expect(notifications).toContain("Subscriber channels");
    expect(notifications).toContain("Team and on-call destinations");
    expect(notifications).toContain("Signed status-event webhooks");
  });
});
