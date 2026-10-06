import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { highlightAnchor, hrefFor, rally, rallyLink } from "../src/content/site";
import { heroRoot, SCENE_TIMEOUT } from "./hero";

const { game: copy } = rally;

/** The game's root: it carries the phase, pause and slow mode as data attributes. */
const gameRoot = (page: Page) => page.locator("[data-phase]");
const court = (page: Page) => page.getByRole("application", { name: copy.label });
const announcer = (page: Page) => page.locator('[aria-live="polite"]');

/** Opens /play and waits for the court to be drawn. */
async function openPlay(page: Page) {
  await page.goto("/play");
  await expect(gameRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
}

/** Whether the focused element shows the focus ring. */
const focusRing = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return getComputedStyle(el).outlineStyle !== "none" && el.matches(":focus-visible");
  });

test("sets its title and description from the content module", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page).toHaveTitle(rally.metaTitle);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    rally.metaDescription,
  );
  await expect(
    page.getByRole("main").getByRole("heading", { level: 2 }),
  ).toHaveText(rally.heading);
  await expect(
    page.getByRole("link", { name: rally.caseStudyLink.label }),
  ).toHaveAttribute("href", rally.caseStudyLink.href);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  for (const line of Object.values(rally.hint)) {
    await expect(page.getByText(line)).toBeVisible();
  }
});

test("shows the focus ring on every control, from the nav to the Case study link", async ({
  page,
}) => {
  await openPlay(page);
  const reached: string[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    // A control's visible name: its label's text for the switch.
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement;
      return (el.labels?.[0] ?? el).textContent?.trim() ?? "";
    });
    expect(await focusRing(page), `focus ring on "${name}"`).toBe(true);
    reached.push(name);
    if (name === rally.caseStudyLink.label) break;
  }
  expect(reached).toEqual(
    expect.arrayContaining([
      expect.stringContaining(copy.slowMode.label),
      copy.start.action,
      rally.caseStudyLink.label,
    ]),
  );
});

test("is played with the keyboard alone, and pauses and resumes on Escape and P", async ({
  page,
}) => {
  await openPlay(page);

  // Tab to Start, as a keyboard user would.
  const start = page.getByRole("button", { name: copy.start.action });
  for (let i = 0; i < 20; i++) {
    if (await start.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(start).toBeFocused();
  expect(await focusRing(page)).toBe(true);
  await page.keyboard.press("Enter");

  // The court takes the keys: Space serves, the arrows move.
  await expect(court(page)).toBeFocused();
  expect(await focusRing(page)).toBe(true);
  await expect(gameRoot(page)).toHaveAttribute("data-phase", "serving");
  await page.keyboard.press("Space");
  await expect(gameRoot(page)).toHaveAttribute("data-phase", "rally");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowLeft");

  await page.keyboard.press("Escape");
  await expect(gameRoot(page)).toHaveAttribute("data-paused", "true");
  await expect(
    page.getByRole("heading", { name: copy.paused.title }),
  ).toBeVisible();
  const resume = page.getByRole("main").getByRole("button", { name: copy.resume }).last();
  await expect(resume).toBeFocused();
  expect(await focusRing(page)).toBe(true);

  await page.keyboard.press("p");
  await expect(gameRoot(page)).toHaveAttribute("data-paused", "false");
  await expect(court(page)).toBeFocused();

  // And the Pause button, reached by Tab, pauses it too.
  await page.keyboard.press("Shift+Tab");
  const pause = page.getByRole("button", { name: copy.pause });
  await expect(pause).toBeFocused();
  expect(await focusRing(page)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(gameRoot(page)).toHaveAttribute("data-paused", "true");
});

test("has no axe violations mid-game, playing and paused", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPlay(page);
  await page.getByRole("button", { name: copy.start.action }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(gameRoot(page)).toHaveAttribute("data-paused", "true");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("announces the score after a point, politely", async ({ page }) => {
  await openPlay(page);
  await page.getByRole("button", { name: copy.start.action }).click();
  await expect(announcer(page)).toHaveText(/0–0, you serve/);
  await page.keyboard.press("Space");
  // The player stands still: sooner or later a point is decided.
  await expect(announcer(page)).toHaveText(
    new RegExp(`(${copy.point.won}|${copy.point.lost}).*\\d–\\d`),
    { timeout: 60_000 },
  );
});

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("starts in slow mode, and nothing moves before Start", async ({
    page,
  }) => {
    await openPlay(page);
    const slow = page.getByRole("switch", { name: copy.slowMode.label });
    await expect(slow).toBeChecked();
    await expect(gameRoot(page)).toHaveAttribute("data-slow", "true");

    const box = page.locator("canvas").locator("..");
    const first = await box.screenshot();
    await page.waitForTimeout(1500);
    const second = await box.screenshot();
    expect(second.equals(first)).toBe(true);
  });

  test("lets slow mode be switched off", async ({ page }) => {
    await openPlay(page);
    await page.getByRole("switch", { name: copy.slowMode.label }).uncheck();
    await expect(gameRoot(page)).toHaveAttribute("data-slow", "false");
  });
});

/**
 * Fails if `page` has asked for any of the Rally game's code. Told apart by
 * what's inside, not by name: the rules' point reasons and the game's
 * announcer survive minification.
 */
async function expectNoGameCode(page: Page, request: APIRequestContext) {
  // A link in view is prefetched, code and all, unless it opts out; Next
  // starts it a beat after the page goes quiet.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);
  const scripts = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .filter((url) => new URL(url).pathname.endsWith(".js")),
  );
  for (const url of scripts) {
    const body = await (await request.get(url)).text();
    expect(body, url).not.toMatch(/double-bounce|createRallyView/);
  }
}

test("the home page never asks for the game's code, even with its link on screen", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  await page
    .locator(`#${highlightAnchor("juice-bros")}`)
    .getByRole("link", { name: rallyLink.label })
    .scrollIntoViewIfNeeded();
  await expectNoGameCode(page, request);
});

test("the Case study never asks for the game's code, though its link is on screen", async ({
  page,
  request,
}) => {
  await page.goto(hrefFor({ kind: "case-study", slug: "juice-bros" }));
  await expect(
    page.getByRole("main").getByRole("link", { name: rallyLink.label }),
  ).toBeInViewport();
  await expectNoGameCode(page, request);
});
