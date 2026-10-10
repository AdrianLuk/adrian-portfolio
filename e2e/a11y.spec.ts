import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  playerToolsSelector,
  SCENE,
  SCENE_STATES,
} from "../src/components/player-tools-markup";
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

test("a Recall channeling has no axe violations", async ({ page }) => {
  await page.goto("/resume");
  // Held until the page has hydrated and the ring is up.
  const ring = page.locator("[data-recall-ring]");
  await expect(async () => {
    await page.keyboard.up("b");
    await page.keyboard.down("b");
    await expect(ring).toBeVisible({ timeout: 500 });
  }).toPass();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.up("b");
});

test("Juice Bros case study has no axe violations with motion allowed", async ({
  page,
}) => {
  // Desktop: the Player tools pinned, scrolled into the scene. Phone: the
  // stacked list, with its recordings free to play.
  await page.goto("/work/juice-bros");
  const scene = page.locator(playerToolsSelector);
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(scene).toHaveAttribute(SCENE, SCENE_STATES.pinned);
  }
  await scene.evaluate((el) =>
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY),
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

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
