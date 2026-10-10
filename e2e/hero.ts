import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { credits, hero } from "../src/content/site";

// Software WebGL on CI is slow to compile the scene's shaders.
export const SCENE_TIMEOUT = 20_000;

/**
 * Marks a frame-rate test: run on its own, after every other test (see
 * playwright.config.ts), so CI's other worker drawing a world in software
 * never eats into its frames.
 */
export const FRAME_RATE = { tag: "@frame-rate" };

/**
 * How many animations run on the clock. The header's fade to glass moves only
 * with the scroll (a scroll timeline), so it never counts.
 */
export const timedAnimations = (page: Page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => a.timeline instanceof DocumentTimeline).length,
  );

export const heroRoot = (page: Page) =>
  page.getByRole("region", { name: hero.label });

type Watch = {
  at: Record<string, number>;
  seen: string[];
  /** The fullest opacity each title card reached, by its index. */
  cardPeaks: number[];
};

/**
 * Records, from the first byte, every state the hero passes through and when,
 * and how fully each title card showed (in the page, so a slow machine's
 * round trips can't miss a card's moment). With `skip`, presses Skip the
 * instant the flight begins, so a test reaches the settled page at once and
 * a slow machine can't let the opening run out first.
 */
export async function watchHero(page: Page, { skip = false } = {}) {
  await page.addInitScript(
    ({ skip, name }) => {
      const w = window as unknown as { __hero: Watch };
      w.__hero = { at: {}, seen: [], cardPeaks: [] };
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as HTMLElement;
          if (r.attributeName === "style") {
            if (!el.hasAttribute("data-credit-card")) continue;
            const i = Array.from(
              document.querySelectorAll("[data-credit-card]"),
            ).indexOf(el);
            const opacity = parseFloat(el.style.opacity);
            if (opacity >= 0) {
              w.__hero.cardPeaks[i] = Math.max(
                w.__hero.cardPeaks[i] ?? 0,
                opacity,
              );
            }
            continue;
          }
          const state = el.getAttribute("data-state");
          if (!state) continue;
          w.__hero.seen.push(state);
          w.__hero.at[state] ??= performance.now();
          if (skip && state === "flight") {
            const button = Array.from(document.querySelectorAll("button")).find(
              (b) => b.textContent === name,
            );
            button?.focus();
            button?.click();
          }
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "style"],
      });
    },
    { skip, name: credits.skip },
  );
}

export const watched = (page: Page) =>
  page.evaluate(() => (window as unknown as { __hero: Watch }).__hero);

/**
 * Counts animation frames from the first byte, which any render loop, drifting
 * mote or scrubbed camera would need. Returns a reader for the count.
 */
export async function countFrames(page: Page) {
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

/**
 * Counts the world's WebGL draw calls from the first byte (animation frames
 * alone would count GSAP's ticker too). Returns a reader for the count.
 */
export async function countDraws(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    for (const proto of [
      WebGL2RenderingContext.prototype,
      WebGLRenderingContext.prototype,
    ]) {
      const draw = proto.drawElements;
      proto.drawElements = function (this: WebGLRenderingContext, ...args) {
        w.__draws++;
        return draw.apply(this, args);
      } as typeof draw;
    }
  });
  return () =>
    page.evaluate(() => (window as unknown as { __draws: number }).__draws);
}

/**
 * Opens the page as a machine without WebGL would: the world gives up at once
 * and the DOM headline stays. For tests of the page's content and navigation,
 * which shouldn't wait on the world compiling and drawing in software WebGL,
 * nor share the CPU with it (a starved main thread delays client navigation).
 */
export async function withoutWorld(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return (getContext as (...args: unknown[]) => unknown).call(
        this,
        type,
        ...rest,
      );
    } as typeof getContext;
  });
}

/**
 * Opens home in a page of its own, for a serial group of tests to share (so
 * the world compiles once for all of them): watched from the first byte, with
 * any other init scripts from `prepare`, and waited on `until` the world has
 * drawn, or has settled into `settled` or `reduced`.
 */
export async function openHome(
  browser: Browser,
  testInfo: TestInfo,
  {
    skip = false,
    until,
    prepare,
    ...options
  }: Pick<
    BrowserContextOptions,
    "viewport" | "deviceScaleFactor" | "hasTouch" | "reducedMotion"
  > & {
    skip?: boolean;
    until: "drawn" | "settled" | "reduced";
    prepare?: (page: Page) => Promise<unknown>;
  },
) {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    ...options,
  });
  const page = await context.newPage();
  await watchHero(page, { skip });
  await prepare?.(page);
  await page.goto("/");
  if (until === "drawn") {
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
  } else {
    await settledWorld(page, until);
  }
  return page;
}

/** The world has drawn, the hero is in `state`, and nothing is still landing. */
export async function settledWorld(page: Page, state: "settled" | "reduced") {
  await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  await expect(heroRoot(page)).toHaveAttribute("data-state", state, {
    timeout: SCENE_TIMEOUT,
  });
  // A half-faded button fails contrast, so wait for the copy to land (which
  // a busy machine's slow frames can stretch out).
  await expect
    .poll(() => timedAnimations(page), {
      timeout: SCENE_TIMEOUT,
    })
    .toBe(0);
}
