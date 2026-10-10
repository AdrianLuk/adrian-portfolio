import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  createGame,
  PITCH_TIME,
  PITCHES,
  SLOW_SPEED,
  startGame,
  step,
  WINDUP,
} from "../src/components/derby/rules";
import {
  contact,
  derby,
  derbyLink,
  diamondPanel,
  hrefFor,
  rallyLink,
} from "../src/content/site";
import { heroRoot, SCENE_TIMEOUT, withoutWorld } from "./hero";
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

/**
 * Swings once at every pitch, by `swing`, until the game is over. Swung as
 * the pitch leaves Curvebot's hand, far too early for a home run: the Play
 * of the Game has its own tests.
 */
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
    await page.keyboard.press("Space");
    await expect(announcer(page)).toHaveText(outcomeLine, { timeout: 5_000 });
  });

  // Curvebot's line by the home-run count, announced; Play again has focus.
  await expect(page.getByRole("heading", { name: copy.over.title })).toBeVisible();
  await expect(page.getByText(overLine).first()).toBeVisible();
  await expect(announcer(page)).toHaveText(overLine);
  const again = page.getByRole("button", { name: copy.over.action });
  await expect(again).toBeFocused();
  // No home run, so no Play of the Game.
  await expect(gameRoot(page)).not.toHaveAttribute("data-play-of-the-game");
  await expect(page.getByText(copy.play.title)).toHaveCount(0);
  await expect(page.getByRole("button", { name: copy.play.again })).toHaveCount(0);
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
    await playOut(page, () => page.touchscreen.tap(width / 2, height / 2));
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

/**
 * Starts a game and hits its first pitch for a home run, swung within 8ms of
 * the pitch's arrival: the page's clock is held still from Start and stepped
 * by the test, so the seed (from the time) and the swing's timing are known.
 * Then the clock runs on, and the rest of the game is strikes.
 */
async function homeRunFirst(page: Page, { slow }: { slow: boolean }) {
  const now = Date.now() + 60_000;
  await page.clock.pauseAt(now);
  // The first pitch, as the game seeded at that time throws it.
  let game = startGame(createGame({ seed: now % 100_000 }));
  while (game.phase !== "pitch") game = step(game, 1 / 60);
  const speed = slow ? SLOW_SPEED : 1;
  await page.getByRole("button", { name: copy.start.action }).focus();
  await page.keyboard.press("Enter");
  // The pitch is thrown at the first frame (16ms apart) past the windup.
  const arrives = (WINDUP + PITCH_TIME[game.pitch]) * 1000 + 8;
  await page.clock.runFor(Math.round(arrives / speed));
  await page.keyboard.press("Space");
  await page.clock.resume();
  const homeRun = copy.outcomes["home-run"].replace(/[.]/g, "\\.");
  await expect(announcer(page)).toHaveText(
    new RegExp(`^${copy.pitch} 1\\. ${homeRun} \\d+ ${copy.feet}\\.$`),
    { timeout: 10_000 },
  );
}

/** The Play of the Game's banner. */
const banner = (page: Page) => page.getByText(copy.play.title, { exact: true });

test.describe("the Play of the Game", () => {
  test.use({ hasTouch: true });

  test("replays the longest home run after the game, under its banner, with Watch again by keyboard and touch", async ({
    page,
  }) => {
    test.setTimeout(GAME_MS * 2);
    await openDerby(page);
    // Faked once the Diamond is drawn: installed before, it holds the world back.
    await page.clock.install();
    await homeRunFirst(page, { slow: false });
    const distance = (await announcer(page).textContent())!.match(/(\d+) feet/)![1];

    // At the game's end: the banner and the distance, the copy aside, Done focused.
    await expect(gameRoot(page)).toHaveAttribute("data-play-of-the-game", "true", {
      timeout: GAME_MS,
    });
    await expect(banner(page)).toBeVisible();
    await expect(page.getByText(`${distance} ${copy.feet}`, { exact: true })).toBeVisible();
    // Curvebot's line on the game first, then the Play of the Game.
    const announced = (await announcer(page).textContent())!;
    expect(announced.endsWith(` ${copy.play.title}. ${distance} ${copy.feet}.`)).toBe(true);
    expect(announced.slice(0, -` ${copy.play.title}. ${distance} ${copy.feet}.`.length)).toMatch(overLine);
    await expect(page.getByRole("button", { name: copy.play.done })).toBeFocused();
    await expect(page.getByRole("heading", { level: 2, name: derby.heading })).toBeHidden();
    // The camera moves.
    const canvas = page.locator("canvas");
    const first = await canvas.screenshot();
    await page.waitForTimeout(500);
    expect((await canvas.screenshot()).equals(first)).toBe(false);
    await expectAxeClean(page);

    // It ends by itself; then Play again, with Watch again beside it.
    await expect(banner(page)).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: copy.over.title })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.over.action })).toBeFocused();
    const watch = page.getByRole("button", { name: copy.play.again });
    await expect(watch).toBeVisible();
    await expectAxeClean(page);

    // Watch again by keyboard; Esc ends it, focus back on Watch again.
    await page.keyboard.press("Tab");
    await expect(watch).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(banner(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(banner(page)).toBeHidden();
    await expect(watch).toBeFocused();

    // And by touch; Done ends it.
    await watch.tap();
    await expect(banner(page)).toBeVisible();
    await page.getByRole("button", { name: copy.play.done }).tap();
    await expect(banner(page)).toBeHidden();
    await expect(gameRoot(page)).toHaveAttribute("data-phase", "over");
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

  test("shows a still of the Play of the Game and its distance, the camera still, until Done", async ({
    page,
  }) => {
    test.setTimeout(GAME_MS * 2);
    await openDerby(page);
    // Faked once the Diamond is drawn: installed before, it holds the world back.
    await page.clock.install();
    // Full speed, for a shorter game.
    await page.getByRole("switch", { name: copy.slowMode.label }).uncheck();
    await homeRunFirst(page, { slow: false });
    await expect(gameRoot(page)).toHaveAttribute("data-play-of-the-game", "true", {
      timeout: GAME_MS,
    });
    await expect(banner(page)).toBeVisible();
    await expect(page.getByText(new RegExp(`^\\d+ ${copy.feet}$`))).toBeVisible();

    // Nothing moves, and it stays until Done.
    const canvas = page.locator("canvas");
    await page.waitForTimeout(600);
    const first = await canvas.screenshot();
    await page.waitForTimeout(1500);
    expect((await canvas.screenshot()).equals(first)).toBe(true);
    await expectAxeClean(page);
    await page.waitForTimeout(8_000);
    await expect(banner(page)).toBeVisible();
    await page.getByRole("button", { name: copy.play.done }).click();
    await expect(banner(page)).toBeHidden();
    await expect(page.getByRole("button", { name: copy.play.again })).toBeVisible();
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

test("the home page never asks for the Derby's code, even with the Diamond panel's link and Off the clock's on screen", async ({
  page,
  request,
}) => {
  // The world compiles in software on CI, then the scrolls to the Diamond
  // and Contact and every script's fetch: more than the default 30s on a
  // loaded runner.
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  const play = page
    .locator(`#${diamondPanel.id}`)
    .getByRole("link", { name: derbyLink.label });
  await play.scrollIntoViewIfNeeded();
  await expect(play).toBeInViewport();
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
