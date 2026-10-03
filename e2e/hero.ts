import { expect, type Page } from "@playwright/test";
import { credits, hero } from "../src/content/site";

// Software WebGL on CI is slow to compile the scene's shaders.
export const SCENE_TIMEOUT = 20_000;

export const heroRoot = (page: Page) =>
  page.getByRole("region", { name: hero.label });

type Watch = { at: Record<string, number>; seen: string[] };

/**
 * Records, from the first byte, every state the hero passes through and when.
 * With `skip`, presses Skip the instant the flight begins, so a test reaches
 * the settled page at once and a slow machine can't let the opening run out
 * first.
 */
export async function watchHero(page: Page, { skip = false } = {}) {
  await page.addInitScript(
    ({ skip, name }) => {
      const w = window as unknown as { __hero: Watch };
      w.__hero = { at: {}, seen: [] };
      new MutationObserver((records) => {
        for (const r of records) {
          const state = (r.target as Element).getAttribute("data-state");
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
        attributeFilter: ["data-state"],
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

/** The world has drawn, the hero is in `state`, and nothing is still landing. */
export async function settledWorld(page: Page, state: "settled" | "reduced") {
  await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  await expect(heroRoot(page)).toHaveAttribute("data-state", state, {
    timeout: SCENE_TIMEOUT,
  });
  // A half-faded button fails contrast, so wait for the copy to land.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
}
