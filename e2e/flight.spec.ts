import { expect, test, type Page } from "@playwright/test";
import { credits, hero } from "../src/content/site";
import { heroRoot, SCENE_TIMEOUT, watched, watchHero } from "./hero";

// The opening runs once, on desktop; the last test covers a 390px phone.
test.skip(({ isMobile }) => isMobile, "covered on desktop and at 390px");

const creditList = (page: Page) =>
  page.locator(`ul[aria-label="${credits.label}"]`);

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

  test("Skip settles it at once, hands focus on, and the credits go", async ({
    page,
  }) => {
    await watchHero(page, { skip: true });
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    const { at } = await watched(page);
    expect(at.settled - at.flight).toBeLessThan(250);
    await expect(
      page.getByRole("link", { name: hero.primaryAction.label }),
    ).toBeFocused();

    // Still in the DOM, but hidden: never along the scroll, nor tabbable.
    await expect(creditList(page).locator("> li")).toHaveText([
      ...credits.lines,
      credits.skip,
    ]);
    await expect(page.getByRole("list", { name: credits.label })).toBeHidden();
  });

  test("the settled frame never shows before the flight: the copy is held back from the first paint", async ({
    page,
  }) => {
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

test.describe("under prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("never flies: the credits stay as static captions, Skip among them", async ({
    page,
  }) => {
    await watchHero(page);
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced");
    for (const line of await creditList(page).locator("> li").all()) {
      await expect(line).toBeVisible();
    }
    expect((await watched(page)).seen).not.toContain("flight");
  });
});

test.describe("on a 390px phone, portrait", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the flight lands on the stacked plate without scrolling sideways", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
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
});
