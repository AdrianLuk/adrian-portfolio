import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { hero, person } from "../src/content/site";

// Software WebGL on CI is slow to compile the scene's shaders.
const SCENE_TIMEOUT = 20_000;

const heroRoot = (page: Page) => page.getByRole("region", { name: hero.label });

test("the H1 and the hero's root are in the initial HTML, before any script", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(new RegExp(`<h1[^>]*>.*${person.name}.*</h1>`));
  expect(html).toContain('data-state="loading"');
  expect(html).toMatch(/<canvas[^>]*aria-hidden="true"/);
});

test.describe("with motion allowed", () => {
  test("the world reaches 'settled' and the canvas stays hidden from assistive tech", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    await expect(heroRoot(page).locator("canvas")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("home stays axe-clean once the world has settled", async ({ page }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("under prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the world is 'reduced': rendered once, with nothing animating", async ({
    page,
  }) => {
    // Count animation frames, which any render loop or drifting mote would need.
    await page.addInitScript(() => {
      const w = window as unknown as { __frames: number };
      w.__frames = 0;
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        w.__frames++;
        return request(callback);
      };
    });
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced", {
      timeout: SCENE_TIMEOUT,
    });

    const frames = () =>
      page.evaluate(() => (window as unknown as { __frames: number }).__frames);
    const before = await frames();
    await page.waitForTimeout(1500);
    expect(await frames()).toBe(before);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("home stays axe-clean", async ({ page }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced", {
      timeout: SCENE_TIMEOUT,
    });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("on a 2x screen up to 2560px wide", () => {
  // Sizing doesn't depend on motion, and a 3840px canvas animating in software
  // WebGL starves the parallel tests on CI: render once per resize instead.
  test.use({
    viewport: { width: 2560, height: 1300 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });

  test("the canvas resizes with the viewport at no more than 1.5x", async ({
    page,
  }, testInfo) => {
    // The viewport is overridden, so the phone project would only repeat it.
    test.skip(testInfo.project.name === "phone", "same viewport as desktop");
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced", {
      timeout: SCENE_TIMEOUT,
    });
    const size = () =>
      page.locator("canvas").evaluate((c: HTMLCanvasElement) => ({
        width: c.width,
        expected: Math.floor(c.clientWidth * 1.5),
      }));

    expect(await size()).toEqual({ width: 3840, expected: 3840 });

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(size).toEqual({ width: 1920, expected: 1920 });
  });
});
