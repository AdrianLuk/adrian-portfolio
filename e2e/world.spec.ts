import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { person } from "../src/content/site";
import { heroRoot, settledWorld, watchHero } from "./hero";

// The WebGL world is checked once, on desktop; flight.spec covers 390px.
test.skip(({ isMobile }) => isMobile, "covered on desktop and at 390px");

test("the H1 and the hero's root are in the initial HTML, before any script", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(new RegExp(`<h1[^>]*>.*${person.name}.*</h1>`));
  expect(html).toContain('data-state="loading"');
  expect(html).toContain('data-world="pending"');
  expect(html).toMatch(/<canvas[^>]*aria-hidden="true"/);
});

test("once settled, the world shows, hidden from assistive tech, and home is axe-clean", async ({
  page,
}) => {
  // Skipped the moment it starts: the settled page is the same either way.
  await watchHero(page, { skip: true });
  await page.goto("/");
  await settledWorld(page, "settled");
  await expect(heroRoot(page).locator("canvas")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test.describe("under prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the world renders once, nothing animates, and home is axe-clean", async ({
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
    await settledWorld(page, "reduced");

    const frames = () =>
      page.evaluate(() => (window as unknown as { __frames: number }).__frames);
    const before = await frames();
    await page.waitForTimeout(1000);
    expect(await frames()).toBe(before);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

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
  }) => {
    await page.goto("/");
    await settledWorld(page, "reduced");
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
