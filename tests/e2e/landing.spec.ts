import { expect, test } from "@playwright/test";

const REPOSITORY_URL = "https://github.com/rameshbgm/signalhub";
const DEPLOYMENT_GUIDE_URL =
  "https://github.com/rameshbgm/signalhub/blob/main/docs/OPEN_SOURCE_SETUP_GUIDE.md";

test.describe("SignalHub landing page", () => {
  test("exposes the marketing story and primary navigation", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Stop renting your status page.",
      })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Get SignalHub on GitHub" })
    ).toHaveAttribute("href", REPOSITORY_URL);
    await expect(
      page.getByRole("link", { name: "Read the deployment guide" })
    ).toHaveAttribute("href", DEPLOYMENT_GUIDE_URL);

    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Why SignalHub" })
    ).toHaveAttribute("href", "#why");
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Capabilities" })
    ).toHaveAttribute("href", "#capabilities");
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Deploy" })
    ).toHaveAttribute("href", "#deploy");
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Log in" })
    ).toHaveAttribute("href", "/login");

    await expect(page.locator("#why")).toBeVisible();
    await expect(page.locator("#capabilities")).toBeVisible();
    await expect(page.locator("#deploy")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Own the signal. Own the data. Own the response.",
      })
    ).toBeVisible();
    await expect(page.getByText("48 checks passing", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Update delivered", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Your network. Your data.", { exact: true })
    ).toBeVisible();
  });

  test("remains complete without canvas and with reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Stop renting your status page.",
      })
    ).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator("#capabilities")).toBeVisible();
  });

  test("has no horizontal overflow at a mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test("application content is not obscured by tooltip portals", async ({ page }) => {
  await page.goto("/");

  const heading = page.getByRole("heading", { level: 1, name: "Stop renting your status page." });
  await expect(heading).toBeVisible();
  await expect.poll(() => heading.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const paintedElement = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return paintedElement === element || element.contains(paintedElement);
  })).toBe(true);
});
