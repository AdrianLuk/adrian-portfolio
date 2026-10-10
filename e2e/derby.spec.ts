import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { PITCHES } from "../src/components/derby/rules";
import {
  contact,
  derby,
  derbyLink,
  hrefFor,
  rallyLink,
} from "../src/content/site";
import { heroRoot, openHome, SCENE_TIMEOUT, withoutWorld } from "./hero";
import { placeIn } from "./place";

const { game: copy } = derby;

/** The game's root: it carries the phase, pause, slow mode and pitch count as data attributes. */
const gameRoot = (page: Page) => page.locator("[data-phase]");
const field = (page: Page) => page.getByRole("application", { name: copy.label });
const announcer = (page: Page) => page.getByRole("main").locator('[aria-live="polite"]');

/** A whole game is ten pitches of a windup, the pitch and a beat to watch it: about 45 seconds. */
const GAME_MS = 90_000;

/** Curvebot's game-over line, for any home-run count. */
const overLine = new RegExp(
  `^\\d+ (${copy.over.count.one}|${copy.over.count.other})\\. (${copy.over.bands
    .map((b) => b.line.replace(/[.]/g, "\\."))
    .join("|")})$`,
);

/** Any of Curvebot's lines on a pitch. */
const outcomeLine = new RegExp(
  Object.values(copy.outcomes)
    .map((line) => line.replace(/[.]/g, "\\."))
    .join("|"),
);

/** Opens the Derby and waits for the Diamond to be drawn, the game on it. */
async function openDerby(page: Page) {
  await page.goto("/derby");
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

/** No axe violations, once the copy has finished fading in or out (500ms). */
async function expectAxeClean(page: Page) {
  await page.waitForTimeout(600);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

/** Swings once at every pitch, by `swing`, until the game is over. */
async function playOut(page: Page, swing: () => Promise<void>) {
  for (let pitch = 1; pitch <= PITCHES; pitch++) {
    await expect(gameRoot(page)).toHaveAttribute("data-pitches", String(pitch), {
      timeout: 15_000,
    });
    await swing();
  }
  await expect(gameRoot(page)).toHaveAttribute("data-phase", "over", {
    timeout: 15_000,
  });
}

test("sets its title and description from the content module", async ({
  page,
}) => {
  await page.goto("/derby");
  await expect(page).toHaveTitle(derby.metaTitle);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    derby.metaDescription,
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(derby.heading);
  for (const line of Object.values(derby.hint)) {
    await expect(page.getByText(line)).toBeVisible();
  }
  // The start screen: Curvebot's line.
  await expect(page.getByRole("heading", { name: copy.start.title })).toBeVisible();
  await expect(page.getByText(copy.start.line)).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: rallyLink.label }),
  ).toHaveAttribute("href", rallyLink.href);
});

test("is played by keyboard through to Play again: Space swings, Escape and P pause, and every screen is axe-clean", async ({
  page,
}) => {
  test.setTimeout(GAME_MS * 2);
  await openDerby(page);
  await expectAxeClean(page);

  // Tab to Start, as a keyboard user would.
  const start = page.getByRole("button", { name: copy.start.action });
  for (let i = 0; i < 20; i++) {
    if (await start.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(start).toBeFocused();
  expect(await focusRing(page)).toBe(true);
  await page.keyboard.press("Enter");

  // The field takes the keys, filling the screen: the copy steps aside.
  await expect(field(page)).toBeFocused();
  expect(await focusRing(page)).toBe(true);
  await expect(gameRoot(page)).toHaveAttribute("data-phase", /windup|pitch/);
  await expect(page.getByRole("heading", { level: 2, name: derby.heading })).toBeHidden();
  await expectAxeClean(page);

  // Paused: the copy returns, focus on Resume; P plays on.
  await page.keyboard.press("Escape");
  await expect(gameRoot(page)).toHaveAttribute("data-paused", "true");
  await expect(page.getByRole("heading", { name: copy.paused.title })).toBeVisible();
  await expect(page.getByText(copy.paused.line, { exact: true })).toBeVisible();
  await expect(announcer(page)).toHaveText(`${copy.paused.title}. ${copy.paused.line}`);
  await expect(page.getByRole("heading", { level: 2, name: derby.heading })).toBeVisible();
  const resume = page.getByRole("main").getByRole("button", { name: copy.resume }).last();
  await expect(resume).toBeFocused();
  await expectAxeClean(page);
  await page.keyboard.press("p");
  await expect(gameRoot(page)).toHaveAttribute("data-paused", "false");
  await expect(field(page)).toBeFocused();

  // A swing at every pitch, each outcome announced, to the game's end.
  await playOut(page, async () => {
    await page.waitForTimeout(900);
    await page.keyboard.press("Space");
    await expect(announcer(page)).toHaveText(outcomeLine, { timeout: 5_000 });
  });

  // Curvebot's line by the home-run count, announced; Play again has focus.
  await expect(page.getByRole("heading", { name: copy.over.title })).toBeVisible();
  await expect(page.getByText(overLine).first()).toBeVisible();
  await expect(announcer(page)).toHaveText(overLine);
  const again = page.getByRole("button", { name: copy.over.action });
  await expect(again).toBeFocused();
  await expectAxeClean(page);

  await page.keyboard.press("Enter");
  await expect(gameRoot(page)).toHaveAttribute("data-phase", /windup|pitch/);
  await expect(field(page)).toBeFocused();
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("is played by tapping the field through to Play again", async ({ page }) => {
    test.setTimeout(GAME_MS * 2);
    await openDerby(page);
    await page.getByRole("button", { name: copy.start.action }).tap();
    const { width, height } = page.viewportSize()!;
    await playOut(page, async () => {
      await page.waitForTimeout(900);
      await page.touchscreen.tap(width / 2, height / 2);
    });
    await expect(page.getByText(overLine).first()).toBeVisible();
    await page.getByRole("button", { name: copy.over.action }).tap();
    await expect(gameRoot(page)).toHaveAttribute("data-phase", /windup|pitch/);
  });
});

test("announces a pitch nobody swung at as a strike, with Curvebot's line, politely", async ({
  page,
}) => {
  await openDerby(page);
  await page.getByRole("button", { name: copy.start.action }).click();
  await expect(announcer(page)).toHaveText(`${copy.pitch} 1. ${copy.outcomes.strike}`, {
    timeout: 10_000,
  });
});

test("is played on the world's own Diamond: the page's one canvas, over the Diamond's still", async ({
  page,
}) => {
  await openDerby(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  const world = page.locator("[data-world]:has(> canvas)");
  await expect(world).toHaveAttribute("data-world", "drawn");
  await expect(page.locator('[data-backdrop="diamond"]')).toHaveCount(1);
});

test("?weather=snow lies on the ground at the Diamond, and nothing falls", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  // The page's copy, all of it the game's.
  const at = { path: "/derby", copy: "[data-phase] > *" };
  const clear = await placeIn(browser, testInfo, { ...at, weather: "clear" });
  const snow = await placeIn(browser, testInfo, { ...at, weather: "snow" });
  expect(clear.perFrame).toBeGreaterThan(0);
  expect(snow.perFrame).toBe(clear.perFrame);
  expect(snow.ground).toBeGreaterThan(clear.ground + 2);
});

test("without WebGL the Diamond's still stays, and the game says it can't run here", async ({
  page,
}) => {
  await withoutWorld(page);
  await page.goto("/derby");
  await expect(gameRoot(page)).toHaveAttribute("data-world", "unavailable");
  await expect(page.locator('[data-backdrop="diamond"] img')).toBeVisible();
  await expect(page.getByText(copy.unavailable)).toBeVisible();
  await expect(page.getByRole("button", { name: copy.start.action })).toHaveCount(0);
});

test("crossfades in from home's Off the clock link, flying nowhere: no Transit to the Diamond yet", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  // Settled first: in software (CI), the opening would still be flying.
  const page = await openHome(browser, testInfo, { skip: true, until: "settled" });
  await page.locator("#contact").getByRole("link", { name: derbyLink.label }).click();
  await expect(page).toHaveURL(/\/derby$/, { timeout: SCENE_TIMEOUT });
  await expect(page.locator("[data-world-root]")).not.toHaveAttribute("data-transit", /.+/);
  await expect(gameRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
});

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("starts in slow mode, nothing moves before Start, and slow mode can be switched off", async ({
    page,
  }) => {
    await openDerby(page);
    const slow = page.getByRole("switch", { name: copy.slowMode.label });
    await expect(slow).toBeChecked();
    await expect(gameRoot(page)).toHaveAttribute("data-slow", "true");

    const box = page.locator("canvas");
    const first = await box.screenshot();
    await page.waitForTimeout(1500);
    expect((await box.screenshot()).equals(first)).toBe(true);

    await slow.uncheck();
    await expect(gameRoot(page)).toHaveAttribute("data-slow", "false");
  });

  test("is played by keyboard, a swing still deciding the pitch", async ({ page }) => {
    await openDerby(page);
    await page.getByRole("button", { name: copy.start.action }).click();
    await expect(gameRoot(page)).toHaveAttribute("data-pitches", "1", {
      timeout: 10_000,
    });
    await page.keyboard.press("Space");
    await expect(announcer(page)).toHaveText(outcomeLine, { timeout: 10_000 });
  });
});

/**
 * Fails if `page` has asked for any of the Derby's code. Told apart by
 * what's inside, not by name: the rules' event type and the scene's builder
 * survive minification.
 */
async function expectNoDerbyCode(page: Page, request: APIRequestContext) {
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
    expect(body, url).not.toMatch(/three-in-a-row|createDerbyView/);
  }
}

test("the home page never asks for the Derby's code, even with Off the clock's link on screen", async ({
  page,
  request,
}) => {
  // The world compiles in software on CI, then the scroll to Contact and
  // every script's fetch: more than the default 30s on a loaded runner.
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  await page
    .locator("#contact")
    .getByRole("heading", { level: 3, name: contact.offClock.heading })
    .scrollIntoViewIfNeeded();
  await expect(
    page.locator("#contact").getByRole("link", { name: derbyLink.label }),
  ).toBeInViewport();
  await expectNoDerbyCode(page, request);
});

test("neither the Case study nor the Rally game asks for the Derby's code", async ({
  page,
  request,
}) => {
  await page.goto(hrefFor({ kind: "case-study", slug: "juice-bros" }));
  await expectNoDerbyCode(page, request);
  await page.goto("/rally");
  await expectNoDerbyCode(page, request);
});
