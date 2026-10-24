import { expect, test, type Page } from "@playwright/test";

/** Phones in portrait, a phone in landscape, and a tablet. */
const VIEWPORTS = [
  { name: "320 portrait", width: 320, height: 640 },
  { name: "375 portrait", width: 375, height: 812 },
  { name: "812 landscape", width: 812, height: 375 },
  { name: "768 tablet", width: 768, height: 1024 },
];

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/forgot-password", "/organization/login", "/platform/login"];

const ADMIN_ROUTES = [
  "/organization",
  "/organization/pages",
  "/organization/pages/new",
  "/organization/events",
  "/organization/incidents/new",
  "/organization/maintenance/new",
  "/organization/monitors",
  "/organization/monitors/new",
  "/organization/metrics",
  "/organization/metrics/new",
  "/organization/notifications",
  "/organization/subscribers",
  "/organization/analytics",
  "/organization/embed",
  "/organization/api-keys",
  "/organization/security",
  "/organization/settings",
  "/organization/team",
  "/organization/help",
  "/organization/platform",
  "/organization/platform/configuration",
  "/organization/platform/orgs",
  "/organization/platform/users",
];

async function expectNoHorizontalScroll(page: Page, route: string, { signedIn = false } = {}) {
  // A route that redirects aborts the first navigation; the page still lands on its target.
  await page.goto(route, { waitUntil: "load" }).catch((error: Error) => {
    // Chromium reports a redirect as ERR_ABORTED, WebKit as an interrupted navigation.
    if (!/ERR_ABORTED|interrupted by another navigation/.test(error.message)) throw error;
  });
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
  // A dropped session cookie would land on the login page, which would pass vacuously.
  if (signedIn) expect(page.url(), `${route} bounced to login`).not.toMatch(/\/login/);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${route} scrolls sideways`).toBeLessThanOrEqual(clientWidth);
}

for (const viewport of VIEWPORTS) {
  test.describe(`responsive ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("public and auth pages do not scroll sideways", async ({ page }) => {
      test.setTimeout(120_000);
      for (const route of PUBLIC_ROUTES) await expectNoHorizontalScroll(page, route);
    });

    test("admin and platform pages do not scroll sideways", async ({ page, request }) => {
      test.setTimeout(240_000);
      // The development quick-login endpoint only exists locally; skip anywhere else.
      const accounts = await request.get("/api/auth/dev-login");
      test.skip(!accounts.ok() || !((await accounts.json()).accounts ?? []).length, "dev quick login unavailable");
      const login = await page.request.post("/api/auth/dev-login", { data: { key: "tenant-admin" } });
      test.skip(!login.ok(), "dev quick login rejected");
      for (const route of ADMIN_ROUTES) await expectNoHorizontalScroll(page, route, { signedIn: true });
    });
  });
}
