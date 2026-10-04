import { expect, test, type Page } from "@playwright/test";
import { credits, highlightAnchor, highlights, person } from "../src/content/site";
import { countFrames, heroRoot, openHome, watched } from "./hero";

test("the H1 and the hero's root are in the initial HTML, before any script", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(new RegExp(`<h1[^>]*>.*${person.name}.*</h1>`));
  expect(html).toContain('data-state="loading"');
  expect(html).toContain('data-world="pending"');
  expect(html).toMatch(/<canvas[^>]*aria-hidden="true"/);
});

// One visit, checked in turn, in order (the world compiles once for all of
// them). A 2x screen 2560px wide: under reduced motion the world renders only
// on a resize, so even a 3840px canvas doesn't starve the parallel tests.
test.describe("under prefers-reduced-motion, on a 2x screen 2560px wide", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  let page: Page;
  let frames: () => Promise<number>;

  test.beforeAll(async ({ browser }, testInfo) => {
    page = await openHome(browser, testInfo, {
      viewport: { width: 2560, height: 1300 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      until: "reduced",
      prepare: async (page) => {
        frames = await countFrames(page);
      },
    });
  });
  test.afterAll(() => page.context().close());

  const panel = (i: number) =>
    page.locator(`#${highlightAnchor(highlights[i].id)}`);

  test("never flies: the credits stay as static captions, Skip among them", async () => {
    await expect(
      page.locator(`ul[aria-label="${credits.label}"] > li`),
    ).toHaveText([...credits.lines, credits.skip]);
    const shown = await page
      .locator(`ul[aria-label="${credits.label}"] > li`)
      .evaluateAll((els) => els.every((el) => el.checkVisibility()));
    expect(shown).toBe(true);
    expect((await watched(page)).seen).not.toContain("flight");
  });

  test("the world renders once and nothing animates", async () => {
    const before = await frames();
    // Any render loop or drifting mote asks for a frame every few ms.
    await page.waitForTimeout(500);
    expect(await frames()).toBe(before);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("the camera never scrubs: panels sit in the flow over the still backdrop", async () => {
    // The still frame scrolls away with the hero; the page's backdrop is behind the rest.
    await expect(heroRoot(page).locator("canvas")).not.toHaveCSS(
      "position",
      "fixed",
    );
    const before = await frames();
    for (let i = 0; i < highlights.length; i++) {
      const seen = await panel(i).evaluate((el) => {
        el.scrollIntoView({ block: "center" });
        const box = el.getBoundingClientRect();
        return {
          inView: box.bottom > 0 && box.top < window.innerHeight,
          transform: getComputedStyle(el).transform,
          lit: el.hasAttribute("data-lit"),
        };
      });
      expect(seen).toEqual({ inView: true, transform: "none", lit: false });
    }
    // Long enough for a scrubbed camera to have asked for frames.
    await page.waitForTimeout(300);
    expect(await frames()).toBe(before);
  });

  test("the canvas resizes with the viewport at no more than 1.5x", async () => {
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
