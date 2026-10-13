import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { about, shootout, shootoutLink } from "../src/content/site";
import { countFrames, FRAME_RATE, SCENE_TIMEOUT, withoutWorld } from "./hero";

const { game: copy } = shootout;

/** The game's root: it carries the phase, pause, slow mode, score, kills and the ultimate as data attributes. */
const gameRoot = (page: Page) => page.locator("[data-phase]");
const view = (page: Page) => page.getByRole("application", { name: copy.label });
const announcer = (page: Page) => page.getByRole("main").locator('[aria-live="polite"]');
const ring = (page: Page) => page.getByRole("button", { name: new RegExp(`^${copy.ultimate.label}|${copy.ultimate.runningLine.replace(/[.]/g, "\\.")}`) });

/** Opens the Shootout and waits for the stage roof to be drawn, the game on it. */
async function openShootout(page: Page) {
  await page.goto("/shootout");
  await expect(gameRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
}

/** Switches slow mode on (no strafing: a bot stays under the crosshair) and starts. */
async function startSlow(page: Page) {
  const slow = page.getByRole("switch", { name: copy.slowMode.label });
  if (!(await slow.isChecked())) await slow.check();
  await page.getByRole("button", { name: copy.start.action }).click();
  await expect(view(page)).toBeFocused();
  await expect(gameRoot(page)).toHaveAttribute("data-phase", "playing");
}

const kills = async (page: Page) => Number(await gameRoot(page).getAttribute("data-kills"));

/**
 * Aims at the next bot in view (N) and fires by `fire`, twice, a shot's gap
 * apart, until `done`; now and then turning to find bots elsewhere.
 */
async function hunt(page: Page, fire: () => Promise<void>, done: () => Promise<boolean>, tries = 60) {
  for (let i = 0; i < tries && !(await done()); i++) {
    await page.keyboard.press("n");
    await fire();
    await page.waitForTimeout(560);
    await fire();
    await page.waitForTimeout(560);
    if (i % 3 === 2) {
      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(400);
      await page.keyboard.up("ArrowLeft");
    }
  }
  expect(await done()).toBe(true);
}

/** Every line the live region says from now on, kept as it's said: the next one replaces it. */
async function hearAll(page: Page) {
  await announcer(page).evaluate((el) => {
    const w = window as unknown as { __said: string[] };
    w.__said = [];
    new MutationObserver(() => w.__said.push(el.textContent ?? "")).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  return () => page.evaluate(() => (window as unknown as { __said: string[] }).__said);
}

/** No axe violations, once the copy has finished fading in or out (500ms). */
async function expectAxeClean(page: Page) {
  await page.waitForTimeout(600);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test("sets its title and description from the content module, and links back to the About page", async ({
  page,
}) => {
  await page.goto("/shootout");
  await expect(page).toHaveTitle(shootout.metaTitle);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    shootout.metaDescription,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(shootout.heading);
  for (const line of Object.values(shootout.hint)) {
    await expect(page.getByText(line)).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: copy.start.title })).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: shootout.aboutLink.label }),
  ).toHaveAttribute("href", "/about");
});

test("is played by keyboard: N aims at a bot, Space shoots it down, Reset clears the score and keeps the best, Escape and P pause, and every screen is axe-clean", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openShootout(page);
  await expectAxeClean(page);
  const said = await hearAll(page);
  await startSlow(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeHidden();
  await expectAxeClean(page);

  await hunt(page, () => page.keyboard.press("Space"), async () => (await kills(page)) > 0);
  const score = Number(await gameRoot(page).getAttribute("data-score"));
  expect(score).toBeGreaterThanOrEqual(100);
  await expect(gameRoot(page)).toHaveAttribute("data-best", String(score));
  // Each bot up, where it stands and which way, and the score after a kill.
  const lines = await said();
  expect(lines.some((line) => line.includes(`${copy.scoreLine} `))).toBe(true);
  expect(lines.some((line) => new RegExp(`^${copy.up} (${Object.values(copy.where).join("|")}), (${Object.values(copy.direction).join("|")})\.`).test(line))).toBe(true);

  // Paused: the copy returns, focus on Resume; P plays on.
  await page.keyboard.press("Escape");
  await expect(gameRoot(page)).toHaveAttribute("data-paused", "true");
  await expect(page.getByRole("button", { name: copy.resume })).toBeFocused();
  await expect(announcer(page)).toHaveText(`${copy.paused.title}. ${copy.paused.line}`);
  await expectAxeClean(page);
  await page.keyboard.press("p");
  await expect(gameRoot(page)).toHaveAttribute("data-paused", "false");

  // Reset: the score and the bots go, the best stays (and stays for the next visit).
  await page.getByRole("button", { name: copy.reset }).click();
  await expect(gameRoot(page)).toHaveAttribute("data-score", "0");
  await expect(gameRoot(page)).toHaveAttribute("data-kills", "0");
  await expect(gameRoot(page)).toHaveAttribute("data-best", String(score));
  await page.reload();
  await expect(gameRoot(page)).toHaveAttribute("data-best", String(score));
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

  /** A thumb on the view: down, moved by `dx`, `dy` pixels, then lifted. */
  const thumb = (page: Page, dx = 0, dy = 0) =>
    view(page).evaluate(
      (el, [dx, dy]) => {
        const at = { x: innerWidth / 2, y: innerHeight * 0.7 };
        const fire = (type: string, x: number, y: number) =>
          el.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 7,
              pointerType: "touch",
              isPrimary: true,
              clientX: x,
              clientY: y,
              bubbles: true,
            }),
          );
        fire("pointerdown", at.x, at.y);
        if (dx || dy) fire("pointermove", at.x + dx, at.y + dy);
        fire("pointerup", at.x + dx, at.y + dy);
      },
      [dx, dy],
    );

  test("lifting the thumb shoots, and a lift in the gap between shots fires as it ends", async ({ page }) => {
    test.setTimeout(150_000);
    await openShootout(page);
    await startSlow(page);
    // Two lifts at once: the second waits out the gap, then fires, and the bot goes down.
    await hunt(
      page,
      async () => {
        await thumb(page);
        await thumb(page);
        await page.waitForTimeout(600);
      },
      async () => (await kills(page)) > 0,
    );
  });

  test("a drag doesn't break play, and the score, Reset, Pause and the ultimate's ring fit across the screen", async ({ page }) => {
    await openShootout(page);
    await startSlow(page);
    await thumb(page, 120, 0);
    for (const control of [
      page.getByRole("button", { name: copy.reset }),
      page.getByRole("button", { name: copy.pause }),
      ring(page),
    ]) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }
    // Pressing the ring before it's charged keeps the game going.
    await ring(page).click({ force: true });
    await expect(gameRoot(page)).toHaveAttribute("data-paused", "false");
    await expectAxeClean(page);
  });
});

test("the ultimate charges from shots, starts on Q with its 12:00, and fires on Q again", async ({ page }) => {
  test.setTimeout(300_000);
  await openShootout(page);
  const said = await hearAll(page);
  await startSlow(page);
  await expect(ring(page)).toBeDisabled();
  await hunt(
    page,
    () => page.keyboard.press("Space"),
    async () => (await gameRoot(page).getAttribute("data-ult")) === "ready",
    200,
  );
  expect((await said()).some((line) => line.includes(copy.ultimate.readyLine))).toBe(true);
  await page.keyboard.press("q");
  await expect(gameRoot(page)).toHaveAttribute("data-ult", "running");
  await expect(page.getByText(copy.ultimate.clock, { exact: true })).toBeVisible();
  await expect(announcer(page)).toContainText(copy.ultimate.runningLine);
  // A pull while it runs fires nothing; Q fires it.
  await page.keyboard.press("Space");
  await expect(gameRoot(page)).toHaveAttribute("data-ult", "running");
  await page.keyboard.press("q");
  await expect(gameRoot(page)).toHaveAttribute("data-ult", "charging");
  await expect(page.getByText(copy.ultimate.clock, { exact: true })).toBeHidden();
});

test("under reduced motion slow mode starts on, and nothing moves before Start", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frames = await countFrames(page);
  await openShootout(page);
  await expect(page.getByRole("switch", { name: copy.slowMode.label })).toBeChecked();
  await expect(gameRoot(page)).toHaveAttribute("data-slow", "true");
  await page.waitForTimeout(500);
  const before = await frames();
  await page.waitForTimeout(500);
  expect(await frames()).toBe(before);
});

test("without WebGL the stage roof's still stays, and the game says it needs WebGL, with the way back", async ({
  page,
}) => {
  await withoutWorld(page);
  await page.goto("/shootout");
  await expect(gameRoot(page)).toHaveAttribute("data-world", "unavailable");
  await expect(page.locator('[data-backdrop="shootout"] img')).toBeVisible();
  await expect(page.getByText(copy.unavailable)).toBeVisible();
  await expect(page.getByRole("button", { name: copy.start.action })).toHaveCount(0);
  await expect(page.getByRole("link", { name: shootout.aboutLink.label })).toBeVisible();
  // The About page's gaming clip stays on its poster: it shows a game that can't run here.
  await page.goto("/about");
  const clip = page.locator(`#${about.gaming.id} video`);
  await clip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  expect(await clip.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test("the About page's gaming panel has the clip, then the play button, and the camera flies from the Arena up onto the stage roof", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/about");
  await expect(page.locator("[data-world]:has(> canvas)")).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  const gaming = page.locator(`#${about.gaming.id}`);
  const play = gaming.getByRole("link", { name: shootoutLink.label });
  await play.scrollIntoViewIfNeeded();
  // The clip first, then the button.
  const video = gaming.locator("video");
  await expect(video).toHaveAttribute("poster", about.gaming.clip.poster);
  const [clipBox, playBox] = [await video.boundingBox(), await play.boundingBox()];
  expect(playBox!.y).toBeGreaterThan(clipBox!.y + clipBox!.height - 1);
  await expect(play).toHaveAttribute("href", "/shootout");
  // Watched from the click: the world's root names where the camera flies.
  const flew = page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const root = document.querySelector("[data-world-root]")!;
        new MutationObserver(() => {
          const to = root.getAttribute("data-transit");
          if (to) resolve(to);
        }).observe(root, { attributes: true, attributeFilter: ["data-transit"] });
        setTimeout(() => resolve(null), 10_000);
      }),
  );
  await play.click();
  expect(await flew).toBe("shootout");
  await expect(page).toHaveURL(/\/shootout$/);
  await expect(gameRoot(page)).toHaveAttribute("data-world", "drawn", { timeout: SCENE_TIMEOUT });
});

async function expectNoShootoutCode(page: Page, request: APIRequestContext) {
  // A link in view is prefetched unless it opts out; Next starts it a beat after the page goes quiet.
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
    expect(body, url).not.toMatch(/createShootoutView/);
  }
}

test("the About page never asks for the Shootout's code, even with its play button on screen", async ({
  page,
  request,
}) => {
  await page.goto("/about");
  const play = page.locator(`#${about.gaming.id}`).getByRole("link", { name: shootoutLink.label });
  await play.scrollIntoViewIfNeeded();
  await expect(play).toBeInViewport();
  await expectNoShootoutCode(page, request);
});

test("keeps its frame rate with bots up", FRAME_RATE, async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openShootout(page);
  /** Every frame's length over `ms`, timed in the page. */
  const time = (ms: number) =>
    page.evaluate(
      (ms) =>
        new Promise<number[]>((resolve) => {
          const deltas: number[] = [];
          let last = performance.now();
          const end = last + ms;
          const frame = (now: number) => {
            deltas.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(frame);
            else resolve(deltas);
          };
          requestAnimationFrame((now) => {
            last = now;
            requestAnimationFrame(frame);
          });
        }),
      ms,
    );
  const percentile = (values: number[], p: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  };
  const summary = (deltas: number[]) => ({
    frames: deltas.length,
    median: percentile(deltas, 0.5),
    p95: percentile(deltas, 0.95),
  });
  const before = summary(await time(4000));
  await page.getByRole("button", { name: copy.start.action }).click();
  // Bots up: about four, once the first few seconds have popped them.
  await page.waitForTimeout(3000);
  const playing = summary(await time(4000));
  testInfo.annotations.push({
    type: "frame times (ms)",
    description: JSON.stringify({ before, playing }),
  });
  console.log("frame times (ms)", { before, playing });
  expect(playing.frames).toBeGreaterThan(30);
  // Near parity with a GPU: the game's frames are the world's (one scene),
  // its bots a dozen draws each. On CI's software renderer the world holds
  // its landed frame before Start but draws every frame in play (50ms), so
  // play keeps Rally's budget there: a frame every 100ms at the 95th percentile.
  expect(playing.p95).toBeLessThanOrEqual(Math.max(before.p95 * 4, 100));
});
