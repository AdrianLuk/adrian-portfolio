import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { notFound } from "../src/content/site";

const missingPath = "/this-page-does-not-exist";

// Every route, at desktop and phone widths: this is the spec the phone
// project runs.
const routes = [
  { name: "home", path: "/" },
  { name: "Juice Bros case study", path: "/work/juice-bros" },
  { name: "Resume page", path: "/resume" },
  { name: "Rally game", path: "/play" },
  { name: "404", path: missingPath },
];

for (const route of routes) {
  test(`${route.name} has no axe violations`, async ({ page }) => {
    // The page as it stands, not a frame of the opening's fades (route.spec.ts
    // audits home once the opening has settled, and mid-route).
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route.path);
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
