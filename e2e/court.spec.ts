import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  playerToolsSelector,
  SCENE,
  SCENE_STATES,
  stageToolNamed,
  toolStageSelector,
} from "../src/components/player-tools-markup";
import {
  caseStudies,
  credits,
  type PlayerTool,
} from "../src/content/site";
import { countFrames, SCENE_TIMEOUT, withoutWorld } from "./hero";

// The Juice Bros Case study stands at the court: the world, live, from low
// behind the court's baseline, over the court's still that paints first.

const study = caseStudies[0];
const path = `/work/${study.slug}`;

const world = (page: Page) => page.locator("[data-world]");
const still = (page: Page) => page.locator('[data-backdrop="court"] img');

const drawn = (page: Page) =>
  expect(world(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });

/** Uncaught errors and console errors, bar the expected ones. */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // Vercel's analytics script exists only once deployed.
    if (message.text().startsWith("Failed to load resource")) return;
    // Three.js reporting the context it couldn't create: the page carries on.
    if (message.text().includes("Error creating WebGL context")) return;
    errors.push(message.text());
  });
  return errors;
}

/** Where the canvas stands, and whether it shows. */
const canvasState = (page: Page) =>
  world(page)
    .locator("canvas")
    .evaluate((canvas) => {
      const box = canvas.getBoundingClientRect();
      return {
        hidden: canvas.getAttribute("aria-hidden"),
        position: getComputedStyle(canvas).position,
        top: box.top,
        covers:
          box.left <= 0 &&
          box.right >= window.innerWidth &&
          box.bottom >= window.innerHeight,
        opacity: getComputedStyle(canvas).opacity,
      };
    });

/** The court's still, decoded: which file it shows. */
const stillShown = (page: Page) =>
  still(page).evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return {
      src: new URL(img.currentSrc).pathname,
      loaded: img.naturalWidth > 0,
    };
  });

test("the court is drawn live over its still, held fixed as the page scrolls", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Small enough to render quickly in software WebGL.
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto(path);
  // The court's still is the first paint, and stays underneath.
  expect(await stillShown(page)).toMatchObject({
    src: expect.stringMatching(/^\/world\/court-/),
    loaded: true,
  });
  await drawn(page);
  await expect.poll(async () => (await canvasState(page)).opacity).toBe("1");
  expect(await canvasState(page)).toMatchObject({
    hidden: "true",
    position: "fixed",
    top: 0,
    covers: true,
  });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await canvasState(page)).toMatchObject({ top: 0, covers: true });
  // The hero's alone: no title cards, no headline for a plate to stand on.
  await expect(page.locator(`ul[aria-label="${credits.label}"]`)).toHaveCount(0);
  await expect(page.locator("[data-plate-word]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("without WebGL the court's still stays, and nothing errors", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await withoutWorld(page);
  await page.goto(path);
  await expect(world(page)).toHaveAttribute("data-world", "unavailable");
  expect((await canvasState(page)).opacity).toBe("0");
  expect((await stillShown(page)).loaded).toBe(true);
  await expect(still(page)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: study.title }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a lost GPU context falls back to the court's still, and a restored one draws again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto(path);
  await drawn(page);
  /**
   * Loses or restores the canvas's context, as a GPU reset would. The
   * extension is kept from before the loss: a lost context hands out none.
   */
  const context = (action: "loseContext" | "restoreContext") =>
    world(page)
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement, action) => {
        const w = window as unknown as { __lose?: WEBGL_lose_context | null };
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        w.__lose ??= gl?.getExtension("WEBGL_lose_context");
        w.__lose?.[action]();
      }, action);

  await context("loseContext");
  await expect(world(page)).toHaveAttribute("data-world", "pending");
  await expect.poll(async () => (await canvasState(page)).opacity).toBe("0");
  await expect(still(page)).toBeVisible();
  await context("restoreContext");
  await drawn(page);
});

test.describe("under prefers-reduced-motion", () => {
  test.describe.configure({ timeout: 60_000 });

  test("one still frame: no render loop, nothing animates, until the preference changes", async ({
    page,
  }) => {
    const frames = await countFrames(page);
    await page.setViewportSize({ width: 960, height: 600 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await drawn(page);

    /** Animation frames asked for over half a second. */
    const framesOver = async () => {
      const before = await frames();
      await page.waitForTimeout(500);
      return (await frames()) - before;
    };
    expect(await framesOver()).toBe(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    // Allowing motion brings the scene alive (the rally ball); reducing it
    // again stills it.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await framesOver()).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    // A frame already asked for may still land.
    await page.waitForTimeout(100);
    expect(await framesOver()).toBe(0);
  });
});

/**
 * Counts every WebGL draw call from the first byte. Returns a reader for the
 * number of draws the world makes in a frame: the commonest count over a run
 * of frames (the rally ball can leave the frustum for a frame or two).
 */
async function watchDraws(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    for (const proto of [
      WebGL2RenderingContext.prototype,
      WebGLRenderingContext.prototype,
    ] as unknown as Record<string, (...args: unknown[]) => unknown>[]) {
      for (const name of [
        "drawElements",
        "drawArrays",
        "drawElementsInstanced",
        "drawArraysInstanced",
      ]) {
        const draw = proto[name];
        if (!draw) continue;
        proto[name] = function (this: unknown, ...args: unknown[]) {
          w.__draws++;
          return draw.apply(this, args);
        };
      }
    }
  });
  return () =>
    page.evaluate(async () => {
      const w = window as unknown as { __draws: number };
      const counts = new Map<number, number>();
      let last = w.__draws;
      for (let i = 0; i < 40; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const made = w.__draws - last;
        last = w.__draws;
        if (made > 0) counts.set(made, (counts.get(made) ?? 0) + 1);
      }
      return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    });
}

/**
 * The court in `weather`, drawn and landed with motion allowed: the draws
 * it makes a frame, and how bright the ground at the foot of the screen is
 * (0 to 255).
 */
async function courtIn(
  browser: Browser,
  testInfo: TestInfo,
  weather: "snow" | "clear",
) {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 960, height: 600 },
  });
  const page = await context.newPage();
  const draws = await watchDraws(page);
  await page.goto(`${path}?weather=${weather}`);
  await drawn(page);
  await expect.poll(async () => (await canvasState(page)).opacity).toBe("1");
  const perFrame = await draws();
  // The canvas alone: the page's copy hidden over it.
  await page.addStyleTag({
    content: "main article > :not([data-world]) { visibility: hidden }",
  });
  const shot = await page.screenshot({
    clip: { x: 0, y: 450, width: 960, height: 150 },
  });
  const ground = await page.evaluate(async (png) => {
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${png}`)).blob(),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context2d = canvas.getContext("2d")!;
    context2d.drawImage(bitmap, 0, 0);
    const { data } = context2d.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return sum / (data.length / 4);
  }, shot.toString("base64"));
  await context.close();
  return { perFrame, ground };
}

test("?weather=snow lies on the ground at the court, and nothing falls", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const clear = await courtIn(browser, testInfo, "clear");
  const snow = await courtIn(browser, testInfo, "snow");
  // Falling snow is one more thing drawn every frame: there is none.
  expect(clear.perFrame).toBeGreaterThan(0);
  expect(snow.perFrame).toBe(clear.perFrame);
  // The snow lies on the ground: the court's floor and the valley lighter.
  expect(snow.ground).toBeGreaterThan(clear.ground + 2);
});

// The Player tools scene pins on a wide screen with motion allowed, its
// recordings playing on the stage, while the world draws behind the page.

const frameOf = (page: Page, name: string) =>
  page.locator(`${toolStageSelector} ${stageToolNamed(name)}`);

/**
 * The Case study at 1280 by 720, the Player tools pinned, walked through by
 * scroll in steps while a recording plays on the stage: every frame's length,
 * in ms.
 */
async function walkPlayerTools(
  browser: Browser,
  testInfo: TestInfo,
  { live }: { live: boolean },
) {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  if (!live) await withoutWorld(page);
  await page.goto(path);
  const scene = page.locator(playerToolsSelector);
  await expect(scene).toHaveAttribute(SCENE, SCENE_STATES.pinned);
  if (live) await drawn(page);
  else await expect(world(page)).toHaveAttribute("data-world", "unavailable");

  const tools: readonly PlayerTool[] = study.tools;
  const recorded = tools.find((t) => t.recording)!;
  const { top, bottom } = await scene.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return {
      top: box.top + window.scrollY - window.innerHeight,
      bottom: box.bottom + window.scrollY,
    };
  });

  // Every frame from here on, timed in the page.
  await page.evaluate(() => {
    const w = window as unknown as { __deltas: number[]; __timing: boolean };
    w.__deltas = [];
    w.__timing = true;
    let last = performance.now();
    const frame = (now: number) => {
      if (!w.__timing) return;
      w.__deltas.push(now - last);
      last = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame((now) => {
      last = now;
      requestAnimationFrame(frame);
    });
  });
  let playing = false;
  for (let y = top; y <= bottom; y += 80) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(50);
    playing ||= await frameOf(page, recorded.name)
      .locator("video")
      .evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= 3);
  }
  const deltas = await page.evaluate(() => {
    const w = window as unknown as { __deltas: number[]; __timing: boolean };
    w.__timing = false;
    return w.__deltas;
  });
  await context.close();
  return { deltas, playing };
}

/** The `p`th percentile (0 to 1) of `values`. */
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};

test("the pinned Player tools scene keeps its frame rate with the world live behind it", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  // The same walk, without the world and then with it, on the same machine.
  const without = await walkPlayerTools(browser, testInfo, { live: false });
  const live = await walkPlayerTools(browser, testInfo, { live: true });
  const summary = (deltas: number[]) => ({
    frames: deltas.length,
    median: percentile(deltas, 0.5),
    p95: percentile(deltas, 0.95),
    longest: Math.max(...deltas),
  });
  const before = summary(without.deltas);
  const after = summary(live.deltas);
  testInfo.annotations.push({
    type: "frame times (ms)",
    description: JSON.stringify({ without: before, live: after }),
  });
  console.log("frame times (ms)", { without: before, live: after });
  // A recording played on the stage through both walks.
  expect(without.playing).toBe(true);
  expect(live.playing).toBe(true);
  expect(after.frames).toBeGreaterThan(30);
  // Near parity. CI has no GPU: there the world renders in software WebGL,
  // which would slow every frame of the page about four times over, so it
  // holds its last frame while the scene is in view (with a GPU it draws on,
  // and the two walks run alike, at 60fps). The headroom is for a busy
  // machine: a dropped frame or two, never a world drawing behind the scene
  // (which here runs the median and p95 to 50 and 67ms against 17).
  expect(after.median).toBeLessThanOrEqual(before.median * 1.5);
  expect(after.p95).toBeLessThanOrEqual(before.p95 * 2.5);
  expect(after.longest).toBeLessThanOrEqual(
    Math.max(before.longest * 2, 100),
  );
});
