import { expect, test, type Page } from "@playwright/test";

// Over a page with a Place the header lets the world show through at the top,
// and turns to glass once the page scrolls past it. The 404, with no Place,
// keeps the bar.

/** The header background's alpha: 0 is clear, 0.9 the bar. */
const background = (page: Page) =>
  page.getByRole("banner").evaluate((el) => {
    // rgba(r, g, b, a), or a colour space's form, oklab(l a b / a) say.
    const alpha =
      getComputedStyle(el).backgroundColor.match(/[,/]\s*([\d.]+)\)$/);
    return alpha ? Number(alpha[1]) : 1;
  });

// The world compiles on the page's main thread (in software WebGL on CI), which
// can hold up a look at the page for a few seconds.
const expectSoon = expect.configure({ timeout: 15_000 });

const scrollTo = (page: Page, y: number) =>
  page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);

test("over a Place, the header is clear at the top and glass once scrolled", async ({
  page,
}) => {
  await page.goto("/resume");
  await expectSoon.poll(() => background(page)).toBe(0);
  await scrollTo(page, 400);
  await expectSoon.poll(() => background(page)).toBeCloseTo(0.9);
  await scrollTo(page, 0);
  await expectSoon.poll(() => background(page)).toBe(0);
});

test("under reduced motion, the glass comes back at once past the header", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await expectSoon.poll(() => background(page)).toBe(0);
  // Partway past: still clear, not half-faded.
  await scrollTo(page, 24);
  await expectSoon.poll(() => background(page)).toBe(0);
  await scrollTo(page, 400);
  await expectSoon.poll(() => background(page)).toBeCloseTo(0.9);
  await context.close();
});

test("without a Place (the 404), the header keeps its bar", async ({
  page,
}) => {
  await page.goto("/no-such-page");
  await expectSoon.poll(() => background(page)).toBeCloseTo(0.9);
});
