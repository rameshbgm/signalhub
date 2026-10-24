import { expect, test } from "@playwright/test";

test.describe("installed application workspace", () => {
  test("shows only workspace sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome to your workspace." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Public services", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in to workspace", exact: true }).first()).toHaveAttribute("href", "/login");
    await expect(page.getByText("Stop renting your status page")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Powered by SignalHub" })).toBeVisible();
  });

  test("fits on a compact phone screen without scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  });
});
