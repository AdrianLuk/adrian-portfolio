import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { highlightAnchor, hrefFor, rally, rallyLink } from "../src/content/site";
import { heroRoot, SCENE_TIMEOUT, withoutWorld } from "./hero";
import { placeIn } from "./place";

const { game: copy } = rally;

/** The game's root: it carries the phase, pause and slow mode as data attributes. */
const gameRoot = (page: Page) => page.locator("[data-phase]");
const court = (page: Page) => page.getByRole("application", { name: copy.label });
const announcer = (page: Page) => page.getByRole("main").locator('[aria-live="polite"]');

/** Opens /rally and waits for the court to be drawn. */
async function openPlay(page: Page) {
  await page.goto("/rally");
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
  await page.goto("/rally");
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

test("holding Space on the court, or the Dink pad, holds a dink until it's let go", async ({
  page,
}) => {
  await openPlay(page);
  const pad = page.locator("[data-dink-pad]");
  await expect(pad).toBeHidden();
  await page.getByRole("button", { name: copy.start.action }).click();
  await expect(pad).toBeVisible();

  await expect(court(page)).toBeFocused();
  await page.keyboard.down("Space");
  await expect(pad).toHaveAttribute("data-held", "true");
  await page.keyboard.up("Space");
  await expect(pad).toHaveAttribute("data-held", "false");

  // Under the court: it may be below the fold.
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(pad).toHaveAttribute("data-held", "true");
  await page.mouse.up();
  await expect(pad).toHaveAttribute("data-held", "false");
});

test("is played on the world's own court: the page's one canvas", async ({
  page,
}) => {
  await openPlay(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  // The world's, standing over the court's still that painted first.
  const world = page.locator("[data-world]:has(> canvas)");
  await expect(world).toHaveAttribute("data-world", "drawn");
  await expect(page.locator('[data-backdrop="court"]')).toHaveCount(1);
  expect(
    await world
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => !!(c.getContext("webgl2") ?? c.getContext("webgl"))),
  ).toBe(true);
});

test("?weather=snow lies on the ground at the court on /rally too, and nothing falls", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  // The page's copy, all of it the game's.
  const at = { path: "/rally", copy: "[data-phase] > *" };
  const clear = await placeIn(browser, testInfo, { ...at, weather: "clear" });
  const snow = await placeIn(browser, testInfo, { ...at, weather: "snow" });
  expect(clear.perFrame).toBeGreaterThan(0);
  expect(snow.perFrame).toBe(clear.perFrame);
  expect(snow.ground).toBeGreaterThan(clear.ground + 2);
});

test("without WebGL the court's still stays, and the game says it can't run here", async ({
  page,
}) => {
  await withoutWorld(page);
  await page.goto("/rally");
  await expect(gameRoot(page)).toHaveAttribute("data-world", "unavailable");
  await expect(page.locator('[data-backdrop="court"] img')).toBeVisible();
  await expect(page.getByText(copy.unavailable)).toBeVisible();
  await expect(page.getByRole("button", { name: copy.start.action })).toHaveCount(0);
});

test("a lost GPU context holds the game on the court's still, and a restored one draws it again", async ({
  page,
}) => {
  await openPlay(page);
  /** Loses or restores the world's context, as a GPU reset would. */
  const context = (action: "loseContext" | "restoreContext") =>
    page.locator("canvas").evaluate((canvas: HTMLCanvasElement, action) => {
      const w = window as unknown as { __lose?: WEBGL_lose_context | null };
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      w.__lose ??= gl?.getExtension("WEBGL_lose_context");
      w.__lose?.[action]();
    }, action);
  await context("loseContext");
  await expect(gameRoot(page)).toHaveAttribute("data-world", "pending");
  await expect(page.getByRole("button", { name: copy.start.action })).toBeDisabled();
  await expect(page.locator('[data-backdrop="court"] img')).toBeVisible();
  await context("restoreContext");
  await expect(gameRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  await expect(page.getByRole("button", { name: copy.start.action })).toBeEnabled();
});

for (const [width, viewport] of Object.entries({
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 720 },
})) {
  test(`at ${width} width, the copy stands over the court before Start, steps aside in play, the court filling the screen, and returns at a pause`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openPlay(page);
    const heading = page.getByRole("heading", { level: 2, name: rally.heading });
    const caseStudy = page.getByRole("link", { name: rally.caseStudyLink.label });
    const nav = page.getByRole("navigation", { name: "Main" });
    const footer = page.getByRole("contentinfo");
    const pauseButton = page.getByRole("button", { name: copy.pause });
    const score = page.locator("dl", { hasText: copy.score.player });
    const pad = page.locator("[data-dink-pad]");

    // Before Start: the copy over the live court, nothing of play's own.
    for (const shown of [heading, caseStudy, nav, footer]) await expect(shown).toBeVisible();
    await expect(page.getByRole("switch", { name: copy.slowMode.label })).toBeVisible();
    for (const hidden of [pauseButton, score, pad]) await expect(hidden).toBeHidden();

    // In play: the court fills the screen, with only the score, Pause and
    // the Dink pad over it, the score and Pause in the top corners and the
    // pad at the foot.
    await page.getByRole("button", { name: copy.start.action }).click();
    await expect(court(page)).toBeFocused();
    for (const gone of [heading, caseStudy, nav, footer]) await expect(gone).toBeHidden();
    for (const shown of [pauseButton, score, pad]) await expect(shown).toBeVisible();
    expect(await court(page).boundingBox()).toEqual({
      x: 0,
      y: 0,
      ...viewport,
    });
    const [scoreBox, pauseBox, padBox] = await Promise.all(
      [score, pauseButton, pad].map(async (l) => (await l.boundingBox())!),
    );
    expect(scoreBox.y).toBeLessThan(40);
    expect(scoreBox.x).toBeLessThan(40);
    expect(pauseBox.y).toBeLessThan(40);
    expect(pauseBox.x + pauseBox.width).toBeGreaterThan(viewport.width - 40);
    expect(padBox.y + padBox.height).toBeGreaterThan(viewport.height - 40);

    // Paused: the copy and the Case study link return over the court.
    await page.keyboard.press("Escape");
    await expect(gameRoot(page)).toHaveAttribute("data-paused", "true");
    for (const shown of [heading, caseStudy, nav, footer]) await expect(shown).toBeVisible();
    await expect(page.getByRole("heading", { name: copy.paused.title })).toBeVisible();
    await expect(pad).toBeHidden();
    // Clicks reach the copy again, through the court.
    await caseStudy.hover({ trial: true });
  });
}

test("keeps its frame rate mid-game, the world drawing the game on its court", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 960, height: 600 });
  await openPlay(page);
  await page.getByRole("button", { name: copy.start.action }).click();
  await page.keyboard.press("Space");
  await expect(gameRoot(page)).toHaveAttribute("data-phase", /rally|point|serving/);
  const deltas = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = performance.now();
        const until = last + 3000;
        const frame = (now: number) => {
          out.push(now - last);
          last = now;
          if (now < until) requestAnimationFrame(frame);
          else resolve(out);
        };
        requestAnimationFrame((now) => {
          last = now;
          requestAnimationFrame(frame);
        });
      }),
  );
  const sorted = [...deltas].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const summary = { frames: deltas.length, median: at(0.5), p95: at(0.95), longest: sorted.at(-1)! };
  testInfo.annotations.push({ type: "frame times (ms)", description: JSON.stringify(summary) });
  console.log("frame times mid-game (ms)", summary);
  // The Player tools scene's budget with the world live behind it (see
  // court.spec.ts): at 60fps with a GPU, and with CI's software renderer
  // still a frame every 100ms at the 95th percentile, 250ms at worst.
  expect(summary.frames).toBeGreaterThan(10);
  expect(summary.p95).toBeLessThanOrEqual(100);
  expect(summary.longest).toBeLessThanOrEqual(250);
});

test("has no axe violations before Start, with motion allowed", async ({ page }) => {
  await openPlay(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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
  // Up to a minute of rallies, on a loaded machine.
  test.setTimeout(90_000);
  await openPlay(page);
  await page.getByRole("button", { name: copy.start.action }).click();
  await expect(announcer(page)).toHaveText(/0–0, you serve/);
  // The player stands still, serving whenever the serve comes back (a side
  // out hands it back without a point): sooner or later a point is decided.
  await expect(async () => {
    await page.keyboard.press("Space");
    await expect(announcer(page)).toHaveText(
      new RegExp(`(${copy.point.won}|${copy.point.lost}).*\\d–\\d`),
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 60_000 });
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

    // The world's canvas, the page's only one: the court the game is played on.
    const box = page.locator("canvas");
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
