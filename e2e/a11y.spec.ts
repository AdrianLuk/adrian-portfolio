import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { credits, hero, notFound } from "../src/content/site";

const missingPath = "/this-page-does-not-exist";

const routes = [
  { name: "home", path: "/" },
  { name: "Juice Bros case study", path: "/work/juice-bros" },
  { name: "404", path: missingPath },
];

for (const route of routes) {
  test(`${route.name} has no axe violations`, async ({ page }) => {
    await page.goto(route.path);
    if (route.path === "/") {
      // Audit the settled page, not a frame of the opening's fades. (The
      // opening's own end is audited in world.spec.ts.)
      const root = page.getByRole("region", { name: hero.label });
      await expect(root).toHaveAttribute("data-state", "flight");
      await page.getByRole("button", { name: credits.skip }).click();
      await expect(root).toHaveAttribute("data-state", "settled");
      await expect
        .poll(() => page.evaluate(() => document.getAnimations().length))
        .toBe(0);
    }
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("404 answers with a 404 status and links home", async ({ page }) => {
  const response = await page.goto(missingPath);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: notFound.heading }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: notFound.homeLink }),
  ).toHaveAttribute("href", "/");
});
