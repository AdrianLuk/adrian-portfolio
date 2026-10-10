import { expect, test, type Page } from "@playwright/test";
import { achievements, nav, person, rally, recall } from "../src/content/site";
import { SCENE_TIMEOUT, withoutWorld } from "./hero";

const CHANNEL_MS = recall.channelMs;

const nameLink = (page: Page) =>
  page.getByRole("banner").getByRole("link", { name: person.name, exact: true });
// By CSS: the header steps aside (hidden) while a game is in play.
const announcer = (page: Page) => page.locator('header [aria-live="polite"]');
const ring = (page: Page) => nameLink(page).locator("[data-recall-ring]");

/**
 * Keeps every toast the page shows, from the next navigation on: on a loaded
 * runner a Transit can outlast the toast's 5s, so it may be gone by the time
 * the test looks. Read them back with `toasts`.
 */
const recordToasts = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    new MutationObserver(() => {
      const text = document.querySelector('[role="status"]')?.textContent;
      if (text) w.__toasts.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
const toasts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.join("\n"));

/**
 * Starts a channel with `press`, again after `release` until the page has
 * hydrated and announces it. Returns when it started (Date.now()).
 */
async function channel(page: Page, press: () => Promise<void>, release: () => Promise<void>) {
  await expect(async () => {
    await release();
    await press();
    await expect(announcer(page)).toHaveText(recall.started, { timeout: 500 });
  }).toPass();
  return Date.now();
}

/** The glow animations on the ring. */
const glows = (page: Page) =>
  nameLink(page).evaluate((el) =>
    el
      .getAnimations({ subtree: true })
      .map((a) => (a as CSSAnimation).animationName)
      .filter((name) => /glow/.test(name)),
  );

const holdB = (page: Page) =>
  channel(
    page,
    () => page.keyboard.down("b"),
    () => page.keyboard.up("b"),
  );

/** Waits for the page to hydrate: a channel by `B` starts, and is let go. */
async function hydrated(page: Page) {
  await holdB(page);
  await page.keyboard.up("b");
  await expect(announcer(page)).toHaveText(recall.cancelled);
}

/** Holds the mouse down on the header's name, on a hydrated page. */
async function holdMouse(page: Page) {
  const box = (await nameLink(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(announcer(page)).toHaveText(recall.started);
}

test.describe("holding B", () => {
  test("on a Place, channels for about three seconds, then flies the camera home, announced and earning Back to base", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __transits: (string | null)[] };
      w.__transits = [];
      new MutationObserver(() => {
        const root = document.querySelector("[data-world-root]");
        w.__transits.push(root?.getAttribute("data-transit") ?? null);
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-transit"] });
    });
    await recordToasts(page);
    await page.goto("/resume");
    await expect(page.locator("[data-world]")).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });

    const started = await holdB(page);
    await expect(ring(page)).toBeVisible();
    await expect(page).toHaveURL(/\/$/, { timeout: CHANNEL_MS + 3000 });
    expect(Date.now() - started).toBeGreaterThan(CHANNEL_MS - 500);
    await page.keyboard.up("b");

    await expect(announcer(page)).toHaveText(recall.done);
    expect(
      await page.evaluate(() => (window as unknown as { __transits: string[] }).__transits),
    ).toContain("hero");
    await expect.poll(() => toasts(page)).toContain(achievements.names["back-to-base"]);
    await expect(ring(page)).toBeHidden();
  });

  test("let go early, cancels: announced, and the visitor stays where they are", async ({
    page,
  }) => {
    await withoutWorld(page);
    await page.goto("/resume");
    await holdB(page);
    // With motion allowed, the ring's glow pulses.
    expect(await glows(page)).toEqual(["recall-name-glow"]);
    await page.waitForTimeout(1000);
    await page.keyboard.up("b");
    await expect(announcer(page)).toHaveText(recall.cancelled);
    await expect(ring(page)).toBeHidden();
    await page.waitForTimeout(CHANNEL_MS);
    await expect(page).toHaveURL(/\/resume$/);
  });

  test("does nothing with a modifier, on key repeat, or typing in a field", async ({ page }) => {
    await withoutWorld(page);
    await page.goto("/resume");
    await hydrated(page);

    const ignored = async (press: () => Promise<unknown>) => {
      await press();
      await page.waitForTimeout(400);
      await expect(announcer(page)).toHaveText(recall.cancelled);
      await expect(ring(page)).toBeHidden();
      await page.keyboard.up("b");
    };
    for (const modifier of ["Shift", "Control", "Alt", "Meta"]) {
      await ignored(async () => {
        await page.keyboard.down(modifier);
        await page.keyboard.down("b");
        await page.keyboard.up(modifier);
      });
    }
    await ignored(() =>
      page.evaluate(() =>
        document.body.dispatchEvent(
          new KeyboardEvent("keydown", { key: "b", code: "KeyB", repeat: true, bubbles: true }),
        ),
      ),
    );
    await page.evaluate(() => {
      const field = document.createElement("input");
      field.setAttribute("aria-label", "A field");
      document.querySelector("main")!.prepend(field);
    });
    await page.getByRole("textbox", { name: "A field" }).focus();
    await ignored(() => page.keyboard.down("b"));
    await expect(page.getByRole("textbox", { name: "A field" })).toHaveValue("b");
    await page.waitForTimeout(CHANNEL_MS);
    await expect(page).toHaveURL(/\/resume$/);
  });

  test("does nothing while the Rally game is in play", async ({ page }) => {
    await page.goto("/play");
    const game = page.locator("[data-phase]");
    await expect(game).toHaveAttribute("data-world", "drawn", { timeout: SCENE_TIMEOUT });
    await page.getByRole("button", { name: rally.game.start.action }).click();
    await expect(game).toHaveAttribute("data-phase", "serving");
    await page.keyboard.down("b");
    await page.waitForTimeout(CHANNEL_MS + 500);
    await page.keyboard.up("b");
    await expect(announcer(page)).toBeEmpty();
    await expect(page).toHaveURL(/\/play$/);
  });

  test("on home, takes the visitor back to the top", async ({ page }) => {
    await withoutWorld(page);
    await page.goto("/#contact");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    const entries = await page.evaluate(() => history.length);
    await holdB(page);
    await expect(announcer(page)).toHaveText(recall.done, { timeout: CHANNEL_MS + 2000 });
    await page.keyboard.up("b");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    // The hash is dropped, in place: Back still leaves the site.
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });

  test("a press on the name doesn't cancel it", async ({ page }) => {
    await withoutWorld(page);
    await page.goto("/resume");
    await holdB(page);
    // Pressed, then slid off the name before it's a hold: no click.
    const box = (await nameLink(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 100);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$/, { timeout: CHANNEL_MS + 3000 });
    await page.keyboard.up("b");
    await expect(announcer(page)).toHaveText(recall.done);
  });
});

test.describe("holding the name with the mouse", () => {
  test.beforeEach(({ page }) => withoutWorld(page));

  test("a plain click still goes home, with no Recall", async ({ page }) => {
    await page.goto("/resume");
    await nameLink(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(announcer(page)).toBeEmpty();
  });

  test("a slow click still goes home, with no Recall", async ({ page }) => {
    await page.goto("/resume");
    await hydrated(page);
    const box = (await nameLink(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$/);
    await expect(announcer(page)).toHaveText(recall.cancelled);
  });

  test("tapping B doesn't cancel a hold on the name", async ({ page }) => {
    await page.goto("/resume");
    await hydrated(page);
    await holdMouse(page);
    await page.keyboard.press("b");
    await expect(page).toHaveURL(/\/$/, { timeout: CHANNEL_MS + 3000 });
    await page.mouse.up();
    await expect(announcer(page)).toHaveText(recall.done);
  });

  test("held, channels and goes home; let go early, stays put", async ({ page }) => {
    await recordToasts(page);
    await page.goto("/resume");
    await hydrated(page);
    await holdMouse(page);
    await page.waitForTimeout(1000);
    await page.mouse.up();
    await expect(announcer(page)).toHaveText(recall.cancelled);
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/resume$/);

    await holdMouse(page);
    await expect(page).toHaveURL(/\/$/, { timeout: CHANNEL_MS + 3000 });
    await page.mouse.up();
    await expect(announcer(page)).toHaveText(recall.done);
    await expect.poll(() => toasts(page)).toContain(achievements.names["back-to-base"]);
  });
});

test.describe("holding the name on touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test.beforeEach(({ page }) => withoutWorld(page));

  /** Puts a finger down on the header's name, on a hydrated page (CDP: Playwright can only tap). Returns the lift. */
  async function touch(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    const box = (await nameLink(page).boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await expect(announcer(page)).toHaveText(recall.started);
    return () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  test("held on a page without a Place, channels and goes home; let go early, stays put", async ({
    page,
  }) => {
    await page.goto("/this-page-does-not-exist");
    await hydrated(page);
    let lift = await touch(page);
    await page.waitForTimeout(1000);
    await lift();
    await expect(announcer(page)).toHaveText(recall.cancelled);
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/this-page-does-not-exist$/);

    lift = await touch(page);
    await expect(page).toHaveURL(/\/$/, { timeout: CHANNEL_MS + 3000 });
    await lift();
    await expect(announcer(page)).toHaveText(recall.done);
  });

  test("a second finger doesn't start a hold of its own", async ({ page }) => {
    await page.goto("/resume");
    await hydrated(page);
    const cdp = await page.context().newCDPSession(page);
    const box = (await nameLink(page).boundingBox())!;
    const finger = (id: number) => ({ id, x: box.x + box.width / 2 + id, y: box.y + box.height / 2 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger(0)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [finger(0), finger(1)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(1000);
    await expect(announcer(page)).toHaveText(recall.cancelled);
    await expect(ring(page)).toBeHidden();
  });

  test("a tap still goes home", async ({ page }) => {
    await page.goto("/resume");
    await nameLink(page).tap();
    await expect(page).toHaveURL(/\/$/);
    await expect(announcer(page)).toBeEmpty();
  });

  test("the name alone has no link callout", async ({ page }) => {
    await page.goto("/resume");
    // Chromium drops -webkit-touch-callout from the CSSOM: read the
    // stylesheets' own text for the selectors that turn it off.
    const selectors = await page.evaluate(async () => {
      const sheets = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
      const css = (await Promise.all(sheets.map(async (l) => (await fetch(l.href)).text()))).join("");
      return Array.from(css.matchAll(/([^{}]+)\{[^}]*-webkit-touch-callout:\s*none/g), (m) => m[1].trim());
    });
    const calloutOff = (link: ReturnType<Page["locator"]>) =>
      link.evaluate((el, selectors) => selectors.some((s) => el.matches(s)), selectors);
    expect(await calloutOff(nameLink(page))).toBe(true);
    for (const item of nav) {
      expect(await calloutOff(page.getByRole("banner").getByRole("link", { name: item.label }))).toBe(false);
    }
  });
});

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test.beforeEach(({ page }) => withoutWorld(page));

  test("the ring still fills, without a glow pulse", async ({ page }) => {
    await page.goto("/resume");
    await holdB(page);
    const filled = () =>
      ring(page).evaluate((el) => 1 - parseFloat(getComputedStyle(el).strokeDashoffset));
    const early = await filled();
    await page.waitForTimeout(1000);
    const later = await filled();
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThan(1);
    expect(await glows(page)).toEqual([]);
    await page.keyboard.up("b");
  });

  test("on home, the jump back to the top is instant", async ({ page }) => {
    await page.goto("/#contact");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    // Read in the page, the moment the Recall completes.
    const atDone = announcer(page).evaluate(
      (live, done) =>
        new Promise<number>((resolve) => {
          new MutationObserver(() => {
            if (live.textContent === done) resolve(window.scrollY);
          }).observe(live, { subtree: true, childList: true, characterData: true });
        }),
      recall.done,
    );
    await holdB(page);
    expect(await atDone).toBe(0);
    await page.keyboard.up("b");
  });
});
