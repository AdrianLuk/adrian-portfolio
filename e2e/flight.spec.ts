import { expect, test, type Page } from "@playwright/test";
import { credits, hero } from "../src/content/site";

// Software WebGL on CI is slow to compile the scene's shaders.
const SCENE_TIMEOUT = 20_000;

const heroRoot = (page: Page) => page.getByRole("region", { name: hero.label });
const skip = (page: Page) => page.getByRole("button", { name: credits.skip });
const creditLines = (page: Page) =>
  page.locator(`ul[aria-label="${credits.label}"] > li`);

test.describe("with motion allowed", () => {
  test("the hero is in 'flight' on load and 'settled' within 7 seconds", async ({
    page,
  }) => {
    // Timed in the page, from the first 'flight' to 'settled': the opening's
    // own budget, apart from however long the server and page load take.
    await page.addInitScript(() => {
      const w = window as unknown as { __at: Record<string, number> };
      w.__at = {};
      new MutationObserver((records) => {
        for (const r of records) {
          const state = (r.target as Element).getAttribute("data-state");
          if (state) w.__at[state] ??= performance.now();
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state"],
      });
    });
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "flight", {
      timeout: SCENE_TIMEOUT,
    });
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    const at = await page.evaluate(
      () => (window as unknown as { __at: Record<string, number> }).__at,
    );
    expect(at.settled - at.flight).toBeLessThan(7_000);
  });

  test("Skip is the first stop after the nav", async ({ page }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "flight", {
      timeout: SCENE_TIMEOUT,
    });
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link")
      .last()
      .focus();
    await page.keyboard.press("Tab");
    await expect(skip(page)).toBeFocused();
  });

  test("Skip is reachable at once and settles the hero immediately", async ({
    page,
  }) => {
    // Pressed the moment the flight begins, so a busy machine can't let the
    // opening run out first; timed in the page.
    await page.addInitScript((name) => {
      const w = window as unknown as { __skip: Record<string, number> };
      w.__skip = {};
      new MutationObserver((records) => {
        for (const r of records) {
          const state = (r.target as Element).getAttribute("data-state");
          if (!state || w.__skip[state]) continue;
          w.__skip[state] = performance.now();
          if (state !== "flight") continue;
          const button = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === name,
          );
          button?.focus();
          button?.click();
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state"],
      });
    }, credits.skip);
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
    const at = await page.evaluate(
      () => (window as unknown as { __skip: Record<string, number> }).__skip,
    );
    expect(at.settled - at.flight).toBeLessThan(250);
    // The control fades with the credits, so focus moves on to the action.
    await expect(
      page.getByRole("link", { name: hero.primaryAction.label }),
    ).toBeFocused();
  });

  test("Skip works from the keyboard", async ({ page }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "flight", {
      timeout: SCENE_TIMEOUT,
    });
    await skip(page).press("Enter");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: 500,
    });
  });

  test("the five credit lines are in the DOM, and gone from view once settled", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(creditLines(page)).toHaveText([
      ...credits.lines,
      credits.skip,
    ]);
    await expect(heroRoot(page)).toHaveAttribute("data-state", "flight", {
      timeout: SCENE_TIMEOUT,
    });
    await skip(page).click();
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled");
    await expect(creditLines(page)).toHaveCount(5);
    // Hidden, so they never come along the scroll (or into the tab order).
    await expect(page.getByRole("list", { name: credits.label })).toBeHidden();
    await page.mouse.wheel(0, 1200);
    for (const line of await creditLines(page).all()) {
      await expect(line).not.toBeInViewport();
    }
  });

  test("the world draws during the flight and keeps it to the end", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled", {
      timeout: SCENE_TIMEOUT,
    });
  });
});

test.describe("under prefers-reduced-motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the hero never enters 'flight'", async ({ page }) => {
    // Record every state the hero passes through, from the first byte.
    await page.addInitScript(() => {
      const w = window as unknown as { __states: string[] };
      w.__states = [];
      new MutationObserver((records) => {
        for (const r of records) {
          const state = (r.target as Element).getAttribute("data-state");
          if (state) w.__states.push(state);
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state"],
      });
    });
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced");
    const states = await page.evaluate(
      () => (window as unknown as { __states: string[] }).__states,
    );
    expect(states).not.toContain("flight");
  });

  test("the credits stay as static captions, Skip among them", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced");
    for (const line of await creditLines(page).all()) {
      await expect(line).toBeVisible();
    }
  });
});

test.describe("on a 390px phone, portrait", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the flight lands on the stacked plate without scrolling sideways", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "flight", {
      timeout: SCENE_TIMEOUT,
    });
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
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
