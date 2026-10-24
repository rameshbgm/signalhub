import { test, expect } from "@playwright/test";

// Only a separately launched disposable setup server may run this suite.
const base = process.env.SETUP_E2E_URL;
const token = process.env.SETUP_E2E_TOKEN;
test.skip(!base || !token, "Requires a disposable setup server and its synthetic operator token");

test("setup denies unauthenticated APIs and unlocks only for the operator", async ({ page, request }) => {
  for (const route of ["status", "database/test", "database/create", "database"]) {
    const response = route === "status"
      ? await request.get(`${base}/api/setup/${route}`)
      : await request.post(`${base}/api/setup/${route}`, { data: {} });
    expect(response.status()).toBe(401);
  }
  await page.goto(`${base}/setup`);
  await expect(page.getByRole("heading", { name: "Unlock SignalHub setup" })).toBeVisible();
  if (process.env.SETUP_E2E_SCREENSHOT) {
    await page.screenshot({ path: process.env.SETUP_E2E_SCREENSHOT, fullPage: true });
  }
  await page.getByLabel("Setup token").fill("wrong-token-that-is-at-least-32-characters");
  await page.getByRole("button", { name: "Unlock setup" }).click();
  await expect(page.getByText("Invalid setup token", { exact: true })).toBeVisible();
  await page.getByLabel("Setup token").fill(token!);
  await page.getByRole("button", { name: "Unlock setup" }).click();
  await expect(page.getByRole("heading", { name: "Connect your database" })).toBeVisible();
  const cookie = (await page.context().cookies()).find(item => item.name === "signalhub_setup");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect((await page.request.get(`${base}/api/setup/status`)).status()).toBe(200);
  // No database configuration or administrator creation is submitted by this test.
});
