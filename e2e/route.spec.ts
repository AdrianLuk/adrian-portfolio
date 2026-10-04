import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { highlightAnchor, highlights, hrefFor } from "../src/content/site";
import {
  countFrames,
  heroRoot,
  SCENE_TIMEOUT,
  settledWorld,
  watchHero,
} from "./hero";

// The route runs on desktop; the last tests cover a 390px phone.
test.skip(({ isMobile }) => isMobile, "covered on desktop and at 390px");

const panel = (page: Page, i: number) =>
  page.locator(`#${highlightAnchor(highlights[i].id)}`);

// With the world rendering every frame in software WebGL (as on CI), each
// round trip to the page waits on a slow frame: these tests are slow, and
// each check is made in as few round trips as it can be.

/** Scrolls so panel `i` is centred, as a reader would stop to read it. */
const scrollToPanel = (page: Page, i: number) =>
  panel(page, i).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const y = Math.round(
      window.scrollY + box.top + box.height / 2 - window.innerHeight / 2,
    );
    window.scrollTo(0, y);
    return y;
  });

/**
 * Where the page has scrolled to, and everything that scroll-jacking would
 * change: snapping on any element, the scroll's behaviour, and pinning
 * (which pads the page out).
 */
const scrollState = (page: Page) =>
  page.evaluate(() => ({
    y: window.scrollY,
    terms: {
      snapping: Array.from(document.querySelectorAll("*"))
        .map((el) => getComputedStyle(el).scrollSnapType)
        .filter((type) => type !== "none"),
      behaviour: [document.documentElement, document.body].map(
        (el) => getComputedStyle(el).scrollBehavior,
      ),
      height: document.documentElement.scrollHeight,
      pinned: document.querySelectorAll(".pin-spacer").length,
    },
  }));

test.describe("with motion allowed", () => {
  test.slow();
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
    const { terms: before } = await scrollState(page);
    expect(before.snapping).toEqual([]);
    expect(before.pinned).toBe(0);
    // Behind the whole page now, not just the hero.
    await expect(heroRoot(page).locator("canvas")).toHaveCSS(
      "position",
      "fixed",
    );

    // At the top, the sites of the panels still below the fold are dark.
    const atTop = await page.evaluate(
      (ids) =>
        ids.map((id) => {
          const el = document.getElementById(id)!;
          return {
            below: el.getBoundingClientRect().top >= window.innerHeight,
            lit: el.hasAttribute("data-lit"),
          };
        }),
      highlights.slice(1).map((h) => highlightAnchor(h.id)),
    );
    expect(atTop).toEqual(atTop.map(() => ({ below: true, lit: false })));

    for (let i = 0; i < highlights.length; i++) {
      const y = await scrollToPanel(page, i);
      await expect(panel(page, i)).toHaveAttribute("data-lit", "");
      // The page went exactly where it was sent and stays there.
      expect(await scrollState(page)).toEqual({ y, terms: before });
    }

    // A wheel turn scrolls the page by itself, at its own pace.
    const { y } = await scrollState(page);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => scrollState(page))
      .toEqual({ y: y + 300, terms: before });
  });

  test("every panel link is reached by keyboard mid-route, in view and on top", async ({
    page,
  }) => {
    /** The focused element: its link, whether it is in view, and on top. */
    const focused = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return {
          href: el.getAttribute("href"),
          panel: el.closest("section")?.id ?? null,
          inView:
            box.top >= 0 &&
            box.bottom <= window.innerHeight &&
            box.left >= 0 &&
            box.right <= window.innerWidth,
          onTop: !!hit && el.contains(hit),
        };
      });

    for (const highlight of highlights) {
      const anchor = highlightAnchor(highlight.id);
      // Tab on until the panel's link has focus.
      let stop = null;
      for (let i = 0; i < 20 && stop?.panel !== anchor; i++) {
        await page.keyboard.press("Tab");
        stop = await focused();
      }
      expect(stop?.panel).toBe(anchor);
      // In view and on top once the page has settled round it.
      await expect.poll(focused).toEqual({
        href: hrefFor(highlight.link),
        panel: anchor,
        inView: true,
        onTop: true,
      });
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
  test.slow();
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
    for (let i = 0; i < highlights.length; i++) {
      await scrollToPanel(page, i);
      await expect(panel(page, i)).toHaveAttribute("data-lit", "");
      const seen = await panel(page, i).evaluate((el) => {
        const box = el.getBoundingClientRect();
        const canvas = document.querySelector("canvas")!;
        const world = canvas.getBoundingClientRect();
        return {
          inside: box.left >= 0 && box.right <= window.innerWidth,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          // The world fills the screen behind the panel.
          world:
            getComputedStyle(canvas).position === "fixed" &&
            world.top <= 0 &&
            world.bottom >= window.innerHeight,
        };
      });
      expect(seen).toEqual({ inside: true, overflow: false, world: true });
    }
  });
});
