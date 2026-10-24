import { expect, test, type Cookie, type Page } from "@playwright/test";

/**
 * Drives the monitor screens against a running install with real data.
 * Set E2E_ADMIN_USER and E2E_ADMIN_PASSWORD (an Admin with at least one page), and
 * optionally E2E_MONITOR_TARGET (a public URL; defaults to https://example.com/).
 * Every test removes what it creates.
 */
const user = process.env.E2E_ADMIN_USER;
const password = process.env.E2E_ADMIN_PASSWORD;
const target = process.env.E2E_MONITOR_TARGET ?? "https://example.com/";

test.skip(!user || !password, "E2E_ADMIN_USER and E2E_ADMIN_PASSWORD are required");
// Generous limits: a dev server compiles each screen on first visit.
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("User ID").fill(user!);
  await page.getByPlaceholder("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/organization/, { timeout: 90_000 });
}

async function openNewMonitor(page: Page) {
  await page.goto("/organization/monitors/new");
  await expect(page.locator("#monitor-name")).toBeVisible();
}

async function deleteMonitor(page: Page, name: string) {
  await page.goto("/organization/monitors");
  await page.getByRole("searchbox", { name: "Search monitors" }).fill(name);
  await page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click({ force: true });
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
}

// Sign in once: the login endpoint is rate limited, and one session serves every test.
let sessionCookies: Cookie[] = [];

test.beforeAll(async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  await signIn(await context.newPage());
  sessionCookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ page }) => {
  await page.context().addCookies(sessionCookies);
});

test("adds, edits and deletes an HTTP monitor on a full page", async ({ page }) => {
  const name = `e2e http ${Date.now()}`;
  await openNewMonitor(page);
  await page.locator("#monitor-name").fill(name);
  await page.locator("#monitor-target").fill(target);
  await page.getByRole("button", { name: "Add monitor" }).click();
  await page.waitForURL(/\/organization\/monitors\?pageId=/);
  await page.getByRole("searchbox", { name: "Search monitors" }).fill(name);
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  await page.getByRole("link", { name: `Edit ${name}`, exact: true }).click();
  await page.waitForURL(/\/monitors\/[0-9a-f-]+\/edit/);
  await expect(page.locator("#monitor-name")).toHaveValue(name);
  // The kind of monitor is fixed once created.
  await expect(page.getByRole("radio", { name: "Website or API" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Server port" })).toBeDisabled();
  await page.locator("#monitor-interval").fill("120");
  await page.locator("#monitor-tags").fill("e2e, smoke");
  await page.getByRole("button", { name: "Save monitor" }).click();
  await page.waitForURL(/\/organization\/monitors\?pageId=/);

  await page.getByRole("searchbox", { name: "Search monitors" }).fill(name);
  await expect(page.getByRole("group", { name: "Filter by tag" }).getByRole("button", { name: "smoke", exact: true })).toBeVisible();
  await deleteMonitor(page, name);
});

test("keeps what was typed when the server rejects the form", async ({ page }) => {
  await openNewMonitor(page);
  await page.locator("#monitor-name").fill("e2e invalid headers");
  await page.locator("#monitor-target").fill(target);
  await page.locator("#monitor-headers").fill("not json");
  await page.getByRole("button", { name: "Add monitor" }).click();
  await expect(page.getByText(/Request headers must be valid JSON/)).toBeVisible();
  await expect(page.locator("#monitor-name")).toHaveValue("e2e invalid headers");
  await expect(page.locator("#monitor-headers")).toHaveValue("not json");
  expect(page.url()).toContain("/monitors/new");
});

test("a scheduled job accepts pings on its generated URL only, with its credentials", async ({ page, request }) => {
  const name = `e2e heartbeat ${Date.now()}`;
  await openNewMonitor(page);
  await page.locator("#monitor-name").fill(name);
  await page.getByRole("radiogroup").getByText("Scheduled job or heartbeat", { exact: true }).click();
  await page.getByRole("combobox", { name: "Require authentication" }).click();
  await page.getByRole("option", { name: "HTTP Basic: username and password" }).click();
  await page.locator("#monitor-auth-user").fill("cron");
  await page.locator("#monitor-auth-secret").fill("e2e-job-pass");
  await page.getByRole("button", { name: "Add monitor" }).click();
  await page.waitForURL(/\/organization\/monitors\?pageId=/);

  await page.getByRole("searchbox", { name: "Search monitors" }).fill(name);
  await page.getByRole("link", { name: `Edit ${name}`, exact: true }).click();
  await page.getByRole("button", { name: /Create or rotate heartbeat URL/ }).click();
  const shown = await page.getByText(/\/api\/v1\/heartbeat\/component_/).first().innerText();
  const url = shown.match(/https?:\/\/\S+\/api\/v1\/heartbeat\/\S+/)?.[0].replace(/Copy URL$/, "");
  expect(url).toBeTruthy();

  // The secret link alone is not enough: the monitor also requires Basic credentials.
  const basic = (user: string, pass: string) => ({ authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` });
  expect((await request.get(url!)).status()).toBe(401);
  expect((await request.get(url!, { headers: basic("cron", "wrong") })).status()).toBe(401);
  expect((await request.get(url!, { headers: basic("cron", "e2e-job-pass") })).status()).toBe(200);
  expect((await request.get(`${new URL(url!).origin}/api/v1/heartbeat/not-a-real-token`, { headers: basic("cron", "e2e-job-pass") })).status()).toBe(404);

  await page.getByRole("button", { name: /Create or rotate heartbeat URL/ }).waitFor({ state: "detached" }).catch(() => undefined);
  await deleteMonitor(page, name);
});

test("proxies can be added and removed from the monitor form", async ({ page }) => {
  await openNewMonitor(page);
  await page.getByRole("button", { name: "Set up proxy" }).click();
  const dialog = page.getByRole("dialog");
  // With no proxies saved yet the dialog opens on the form; otherwise it lists them first.
  if (await dialog.getByRole("button", { name: "Add proxy" }).first().isVisible() && !(await dialog.locator("#proxy-host").isVisible())) {
    await dialog.getByRole("button", { name: "Add proxy" }).click();
  }
  await dialog.locator("#proxy-host").fill("proxy.e2e.invalid");
  await dialog.locator("#proxy-port").fill("8080");
  await dialog.getByText("Enabled", { exact: true }).click(); // keep it disabled so no monitor is ever routed through it
  await dialog.getByRole("button", { name: "Add proxy" }).last().click();
  await expect(dialog.getByText("https://proxy.e2e.invalid:8080", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Delete https://proxy.e2e.invalid:8080" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click({ force: true });
  await expect(dialog.getByText("https://proxy.e2e.invalid:8080", { exact: true })).toHaveCount(0);
});

test("the add-monitor form fits a phone screen for every monitor type", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNewMonitor(page);
  for (const kind of ["Website or API", "Server port", "Ping a host", "DNS record", "Scheduled job or heartbeat"]) {
    await page.getByRole("radiogroup").getByText(kind, { exact: true }).click();
    const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scrollWidth, `${kind} overflows horizontally`).toBeLessThanOrEqual(innerWidth);
  }
  // Every card explains itself in a dialog, and opening it does not change the choice. Escape closes it.
  await page.getByRole("radiogroup").getByText("Website or API", { exact: true }).click();
  await page.getByRole("button", { name: /When and how to use it \(Scheduled job or heartbeat\)/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Cron jobs, backups, imports, report runs and queue workers")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("radio", { name: "Website or API" })).toBeChecked();
});

test("a server port can also check its TLS certificate, and a monitor can switch between the two", async ({ page }) => {
  const name = `e2e port ${Date.now()}`;
  await openNewMonitor(page);
  await page.locator("#monitor-name").fill(name);
  await page.getByRole("radiogroup").getByText("Server port", { exact: true }).click();
  await page.locator("#monitor-target").fill("example.com");
  await page.locator("#monitor-port").fill("443");
  await expect(page.locator("#monitor-ssl-warn")).toHaveCount(0);
  await page.getByText("Also check the TLS certificate", { exact: true }).click();
  await expect(page.locator("#monitor-ssl-warn")).toBeVisible();
  await page.getByRole("button", { name: "Add monitor" }).click();
  await page.waitForURL(/\/organization\/monitors\?pageId=/);
  await page.getByRole("searchbox", { name: "Search monitors" }).fill(name);
  await expect(page.getByText("Port + certificate")).toBeVisible();

  await page.getByRole("link", { name: `Edit ${name}`, exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Also check the TLS certificate/ })).toBeChecked();
  await page.getByText("Also check the TLS certificate", { exact: true }).click();
  await page.getByRole("button", { name: "Save monitor" }).click();
  await page.waitForURL(/\/organization\/monitors\?pageId=/);
  await page.getByRole("searchbox", { name: "Search monitors" }).fill(name);
  await expect(page.getByText("Port + certificate")).toHaveCount(0);
  await deleteMonitor(page, name);
});
