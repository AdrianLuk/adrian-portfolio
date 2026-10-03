import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { highlightAnchor, highlights, hrefFor } from "../src/content/site";
import { heroRoot, SCENE_TIMEOUT, settledWorld, watchHero } from "./hero";

// The route runs on desktop; the last tests cover a 390px phone.
test.skip(({ isMobile }) => isMobile, "covered on desktop and at 390px");

const panel = (page: Page, i: number) =>
  page.locator(`#${highlightAnchor(highlights[i].id)}`);

/** Scrolls so panel `i` is centred, as a reader would stop to read it. */
async function scrollToPanel(page: Page, i: number) {
  const y = await panel(page, i).evaluate((el) => {
    const box = el.getBoundingClientRect();
    return Math.round(
      window.scrollY + box.top + box.height / 2 - window.innerHeight / 2,
    );
  });
  await page.evaluate((y) => window.scrollTo(0, y), y);
  return y;
}

/**
 * Everything that scroll-jacking would change: snapping on any element, the
 * scroll's behaviour, and pinning (which pads the page out).
 */
const scrollTerms = (page: Page) =>
  page.evaluate(() => ({
    snapping: Array.from(document.querySelectorAll("*"))
      .map((el) => getComputedStyle(el).scrollSnapType)
      .filter((type) => type !== "none"),
    behaviour: [document.documentElement, document.body].map(
      (el) => getComputedStyle(el).scrollBehavior,
    ),
    height: document.documentElement.scrollHeight,
    pinned: document.querySelectorAll(".pin-spacer").length,
  }));

/** Counts animation frames, which a scrubbed camera would need. */
async function countFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const request = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      w.__frames++;
      return request(callback);
    };
  });
  return () =>
    page.evaluate(() => (window as unknown as { __frames: number }).__frames);
}

test.describe("with motion allowed", () => {
  // Small enough to render quickly in software WebGL; behaviour, not looks.
  test.use({ viewport: { width: 960, height: 600 } });

  test.beforeEach(async ({ page }) => {
    await watchHero(page, { skip: true });
    await page.goto("/");
    await settledWorld(page, "settled");
  });

  test("each site lights as its panel enters, at native scroll, nothing pinned or snapped", async ({
    page,
  }) => {
    const before = await scrollTerms(page);
    expect(before.snapping).toEqual([]);
    expect(before.pinned).toBe(0);
    // Behind the whole page now, not just the hero.
    await expect(heroRoot(page).locator("canvas")).toHaveCSS(
      "position",
      "fixed",
    );

    // At the top, the sites of the panels still below the fold are dark.
    for (let i = 1; i < highlights.length; i++) {
      await expect(panel(page, i)).not.toBeInViewport();
      await expect(panel(page, i)).not.toHaveAttribute("data-lit");
    }

    for (let i = 0; i < highlights.length; i++) {
      const y = await scrollToPanel(page, i);
      await expect(panel(page, i)).toHaveAttribute("data-lit", "");
      // The page went exactly where it was sent and stays there.
      expect(await page.evaluate(() => window.scrollY)).toBe(y);
      expect(await scrollTerms(page)).toEqual(before);
    }

    // A wheel turn scrolls the page by itself, at its own pace.
    const y = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y + 300);
    expect(await scrollTerms(page)).toEqual(before);
  });

  test("every panel link is reached by keyboard mid-route, in view and on top", async ({
    page,
  }) => {
    for (const highlight of highlights) {
      const link = panel(page, highlights.indexOf(highlight)).getByRole(
        "link",
      );
      // Tab on until the panel's link has focus.
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        if (await link.evaluate((el) => el === document.activeElement)) break;
      }
      await expect(link).toBeFocused();
      await expect(link).toHaveAttribute("href", hrefFor(highlight.link));
      await expect(link).toBeInViewport();
      const onTop = await link.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return !!hit && el.contains(hit);
      });
      expect(onTop).toBe(true);
    }
  });

  test("home stays axe-clean mid-route", async ({ page }) => {
    await scrollToPanel(page, 2);
    await expect(panel(page, 2)).toHaveAttribute("data-lit", "");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("under prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the camera never scrubs: panels sit in the flow over the still backdrop", async ({
    page,
  }) => {
    const frames = await countFrames(page);
    await page.goto("/");
    await settledWorld(page, "reduced");
    // The still frame scrolls away with the hero; the page's backdrop is behind the rest.
    await expect(heroRoot(page).locator("canvas")).not.toHaveCSS(
      "position",
      "fixed",
    );

    const before = await frames();
    for (let i = 0; i < highlights.length; i++) {
      await scrollToPanel(page, i);
      await expect(panel(page, i)).toBeInViewport();
      await expect(panel(page, i)).toHaveCSS("transform", "none");
      await expect(panel(page, i)).not.toHaveAttribute("data-lit");
    }
    await page.waitForTimeout(500);
    expect(await frames()).toBe(before);
  });
});

test.describe("on a 390px phone, portrait", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("every panel stays inside the screen, with the world behind it", async ({
    page,
  }) => {
    await watchHero(page, { skip: true });
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
    const canvas = heroRoot(page).locator("canvas");

    for (let i = 0; i < highlights.length; i++) {
      await scrollToPanel(page, i);
      await expect(panel(page, i)).toHaveAttribute("data-lit", "");
      const box = (await panel(page, i).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      await expect(canvas).toHaveCSS("position", "fixed");
      await expect(canvas).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      ).toBeLessThanOrEqual(0);
    }
  });
});
