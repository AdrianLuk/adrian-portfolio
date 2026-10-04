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
