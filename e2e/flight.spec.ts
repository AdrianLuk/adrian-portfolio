import { expect, test } from "@playwright/test";
import { credits, hero } from "../src/content/site";
import { heroRoot, SCENE_TIMEOUT, watched, watchHero, withoutWorld } from "./hero";

// The opening as it plays. Skip is checked in route.spec.ts (which skips it
// on its way down the route), reduced motion in world.spec.ts, and the
// opening at 390px in route.spec.ts.
test.describe("with motion allowed", () => {
  // Small enough to render quickly in software WebGL; behaviour, not looks.
  test.use({ viewport: { width: 960, height: 600 } });

  test("flies in: 'flight' on load, big title cards, 'settled' within 7 seconds", async ({
    page,
  }) => {
    await watchHero(page);
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "flight", {
      timeout: SCENE_TIMEOUT,
    });

    // The credits play as title cards in the scene, hidden from assistive
    // tech (the list is what it reads), one in full view, its name big.
    const cards = page.locator("[data-credit-card]");
    await expect(cards).toHaveCount(credits.lines.length);
    await expect(cards.first().locator("xpath=..")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const nameSizes = await cards.evaluateAll((els) =>
      els.map((el) =>
        parseFloat(getComputedStyle(el.lastElementChild!).fontSize),
      ),
    );
    for (const size of nameSizes) expect(size).toBeGreaterThanOrEqual(32);

    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    // Timed in the page: the opening's own budget, apart from page load.
    const { at, cardPeaks } = await watched(page);
    expect(at.settled - at.flight).toBeLessThan(7_000);
    // Recorded in the page as they played: a card came into full view.
    expect(Math.max(0, ...cardPeaks)).toBe(1);
  });

  test("the settled frame never shows before the flight: the copy is held back from the first paint", async ({
    page,
  }) => {
    // The first paint is all that's read: the world needn't compile behind it.
    await withoutWorld(page);
    // Read as the page first parses, styled, before the timeline has loaded.
    await page.addInitScript(
      ({ titleLine, lines }) => {
        document.addEventListener("DOMContentLoaded", () => {
          const shown = (el: Element | null | undefined) =>
            el ? getComputedStyle(el).opacity !== "0" : null;
          const byText = (text: string) =>
            Array.from(document.querySelectorAll("p, a, li")).find(
              (el) => el.textContent === text,
            );
          (window as unknown as { __firstPaint: object }).__firstPaint = {
            state: document
              .querySelector("[data-state]")
              ?.getAttribute("data-state"),
            echo: shown(document.querySelector("[data-plate-echo]")),
            title: shown(byText(titleLine)?.parentElement),
            action: shown(
              document.querySelector("[data-hero-action]")?.parentElement,
            ),
            credits: lines.map((line) => shown(byText(line))),
          };
        });
      },
      {
        titleLine: hero.titleLine,
        lines: credits.lines,
      },
    );
    await page.goto("/");
    expect(
      await page.evaluate(
        () => (window as unknown as { __firstPaint: object }).__firstPaint,
      ),
    ).toEqual({
      state: "loading",
      echo: false,
      title: false,
      action: false,
      credits: credits.lines.map(() => false),
    });
  });
});

// A phone with its browser's toolbars showing: shorter than the hero, which
// grows past its 88svh to fit the stacked name and copy.
test.describe("with motion allowed, on a short phone", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test("the credit lines never show, even as it settles; Skip stands at the foot of the screen", async ({
    page,
  }) => {
    // Layout and fades only: the world needn't compile behind them.
    await withoutWorld(page);
    await page.addInitScript((label) => {
      const w = window as unknown as {
        __credits: { peak: Record<string, number>; skip: DOMRect | null };
      };
      w.__credits = { peak: {}, skip: null };
      // Every frame, how visible the credit lines are (the list fades as a
      // whole), and where Skip stands while the opening plays.
      const tick = () => {
        const hero = document.querySelector("[data-state]");
        const list = document.querySelector(`ul[aria-label="${label}"]`);
        if (hero && list) {
          const state = hero.getAttribute("data-state")!;
          const items = Array.from(list.children);
          const shown = (el: Element) => {
            const style = getComputedStyle(el);
            return style.visibility === "visible" ? +style.opacity : 0;
          };
          const lines = items
            .slice(0, -1)
            .map((li) => shown(list) * shown(li));
          w.__credits.peak[state] = Math.max(
            w.__credits.peak[state] ?? 0,
            ...lines,
          );
          if (state !== "settled") {
            w.__credits.skip = items.at(-1)!.getBoundingClientRect();
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, credits.label);
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    // Long enough for the list's fade to have run out.
    await page.waitForTimeout(1000);
    const { peak, skip } = await page.evaluate(
      () =>
        (
          window as unknown as {
            __credits: { peak: Record<string, number>; skip: DOMRect };
          }
        ).__credits,
    );
    expect(peak).toMatchObject({ settled: 0 });
    // In full view, its foot within the bottom 48px of the screen.
    expect(skip.top).toBeGreaterThanOrEqual(0);
    expect(skip.bottom).toBeLessThanOrEqual(667);
    expect(skip.bottom).toBeGreaterThanOrEqual(667 - 48);
  });

  test("once it settles, the foot of the screen takes taps again", async ({
    page,
  }) => {
    await withoutWorld(page);
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    await page.waitForTimeout(1000);
    // Whatever is at the foot of the screen is the page's own, not the
    // hidden credits standing over it.
    const hit = await page.evaluate(() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight - 20);
      return !!el?.closest('ul[aria-label="Opening credits"]');
    });
    expect(hit).toBe(false);
  });
});
