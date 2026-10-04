import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  credits,
  hero,
  highlightAnchor,
  highlights,
  hrefFor,
} from "../src/content/site";
import { heroRoot, openHome, SCENE_TIMEOUT, watched } from "./hero";

// Each group visits home once and checks it in turn, in order: the world
// compiles and draws in software WebGL (as on CI), which is the slow part,
// and every round trip to the page waits on one of its frames, so each
// check is made in as few round trips as it can be.
test.describe.configure({ mode: "serial", timeout: 60_000 });

const panel = (page: Page, i: number) =>
  page.locator(`#${highlightAnchor(highlights[i].id)}`);

/**
 * Scrolls so panel `i` is centred, as a reader would stop to read it, and
 * waits in the page (one round trip, not a poll of several) for its site to
 * light. Returns where it scrolled to, and whether the site lit.
 */
const visitPanel = (page: Page, i: number) =>
  panel(page, i).evaluate(async (el) => {
    const box = el.getBoundingClientRect();
    const y = Math.round(
      window.scrollY + box.top + box.height / 2 - window.innerHeight / 2,
    );
    window.scrollTo(0, y);
    const lit = await new Promise<boolean>((resolve) => {
      const done = () => {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el.hasAttribute("data-lit"));
      };
      const observer = new MutationObserver(() => {
        if (el.hasAttribute("data-lit")) done();
      });
      observer.observe(el, { attributeFilter: ["data-lit"] });
      const timer = setTimeout(done, 10_000);
      if (el.hasAttribute("data-lit")) done();
    });
    return { y, lit };
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

test.describe("with motion allowed, the opening skipped", () => {
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // Small enough to render quickly in software WebGL; behaviour, not looks.
    page = await openHome(browser, testInfo, {
      viewport: { width: 960, height: 600 },
      skip: true,
      until: "settled",
    });
  });
  test.afterAll(() => page?.context().close());

  test("Skip settles it at once, hands focus on, and the credits go", async () => {
    const { at } = await watched(page);
    expect(at.settled - at.flight).toBeLessThan(250);
    await expect(
      page.getByRole("link", { name: hero.primaryAction.label }),
    ).toBeFocused();
    // Still in the DOM, but hidden: never along the scroll, nor tabbable.
    await expect(
      page.locator(`ul[aria-label="${credits.label}"] > li`),
    ).toHaveText([...credits.lines, credits.skip]);
    await expect(page.getByRole("list", { name: credits.label })).toBeHidden();
  });

  test("settled, the world stands behind the whole page, hidden from assistive tech, and home is axe-clean", async () => {
    const canvas = heroRoot(page).locator("canvas");
    await expect(canvas).toHaveAttribute("aria-hidden", "true");
    await expect(canvas).toHaveCSS("position", "fixed");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("each site lights as its panel enters, at native scroll, nothing pinned or snapped", async () => {
    const { terms: before } = await scrollState(page);
    expect(before.snapping).toEqual([]);
    expect(before.pinned).toBe(0);

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
      const { y, lit } = await visitPanel(page, i);
      expect(lit, highlights[i].title).toBe(true);
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

  test("home stays axe-clean mid-route", async () => {
    expect((await visitPanel(page, 2)).lit).toBe(true);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("every panel link is reached by keyboard mid-route, in view and on top", async () => {
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

    // Focus is still on "See the work", where Skip handed it: Tab on from
    // there, wherever the page has scrolled to.
    for (const highlight of highlights) {
      const anchor = highlightAnchor(highlight.id);
      let stop = null;
      for (let i = 0; i < 20 && stop?.panel !== anchor; i++) {
        await page.keyboard.press("Tab");
        stop = await focused();
      }
      expect(stop?.panel).toBe(anchor);
      // In view and on top: usually at once, else once the page has settled
      // round it.
      const want = {
        href: hrefFor(highlight.link),
        panel: anchor,
        inView: true,
        onTop: true,
      };
      if (JSON.stringify(stop) !== JSON.stringify(want)) {
        await expect.poll(focused).toEqual(want);
      }
    }
  });
});

test.describe("on a 390px phone, portrait", () => {
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    // The opening plays out here, so it lands on the phone's own layout.
    page = await openHome(browser, testInfo, {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      until: "drawn",
    });
  });
  test.afterAll(() => page?.context().close());

  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );

  test("the flight lands on the stacked plate without scrolling sideways", async () => {
    expect(await overflow()).toBeLessThanOrEqual(0);
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    expect(await overflow()).toBeLessThanOrEqual(0);
    // Stacked: LUK sits on its own line below ADRIAN.
    const [adrian, luk] = await page
      .locator("[data-plate-word]")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(luk).toBeGreaterThan(adrian);
  });

  test("every panel stays inside the screen, with the world behind it", async () => {
    for (let i = 0; i < highlights.length; i++) {
      expect((await visitPanel(page, i)).lit, highlights[i].title).toBe(true);
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
