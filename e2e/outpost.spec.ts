import { expect, test, type Page } from "@playwright/test";
import { credits, resume, roles } from "../src/content/site";
import { countFrames, SCENE_TIMEOUT, withoutWorld } from "./hero";

// The Resume page stands at the outpost: the world, live, from the scroll
// route's last stop, over the still backdrop that paints first.

const world = (page: Page) => page.locator("[data-world]");

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

test("the outpost is drawn live over the still, held fixed as the page scrolls", async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Small enough to render quickly in software WebGL.
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/resume");
  // The still is the first paint, and stays underneath.
  await expect(page.locator("[data-backdrop]")).toHaveCount(1);
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

test("without WebGL the still backdrop stays, and nothing errors", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await withoutWorld(page);
  await page.goto("/resume");
  await expect(world(page)).toHaveAttribute("data-world", "unavailable");
  expect((await canvasState(page)).opacity).toBe("0");
  const still = page.locator("[data-backdrop] img");
  await still.evaluate((img: HTMLImageElement) => img.decode());
  await expect(still).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: resume.heading }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a lost GPU context falls back to the still, and a restored one draws again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/resume");
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
  await expect(page.locator("[data-backdrop] img")).toBeVisible();
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
    await page.goto("/resume");
    await drawn(page);

    /** Animation frames asked for over half a second. */
    const framesOver = async () => {
      const before = await frames();
      await page.waitForTimeout(500);
      return (await frames()) - before;
    };
    expect(await framesOver()).toBe(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    // Allowing motion brings the scene alive; reducing it again stills it.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await framesOver()).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    // A frame already asked for may still land.
    await page.waitForTimeout(100);
    expect(await framesOver()).toBe(0);
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`at ${viewport.width}px the header and every Role stand on a panel`, async ({
    page,
  }) => {
    await withoutWorld(page);
    await page.setViewportSize(viewport);
    await page.goto("/resume");
    const items = page
      .getByRole("region", { name: resume.rolesHeading })
      .locator("ol > li");
    await expect(items).toHaveCount(roles.length);
    const header = page.locator("main header");
    await expect(header).toContainText(resume.intro);
    const backgrounds = await items
      .or(header)
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).backgroundColor),
      );
    expect(backgrounds).toHaveLength(roles.length + 1);
    for (const background of backgrounds) {
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
    }
  });
}
