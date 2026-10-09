import {
  expect,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { SCENE_TIMEOUT } from "./hero";

// What the specs of a still Place (the court, the Skyline) share: its world
// drawn live behind the page, and what it draws.

/**
 * Counts every WebGL draw call from the first byte. Returns a reader for the
 * number of draws the world makes in a frame: the commonest count over a run
 * of frames (the rally ball can leave the frustum for a frame or two). The
 * reader first nudges the canvas's size, so a Place held to one still frame
 * (on a software renderer, as CI's is) draws it again to be counted.
 */
export async function watchDraws(page: Page) {
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
      const canvas = document.querySelector<HTMLElement>("[data-world] canvas")!;
      // Two frames each way: a ResizeObserver hears only a size laid out.
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      canvas.style.width = `${canvas.clientWidth - 1}px`;
      await frame();
      await frame();
      canvas.style.width = "";
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
 * The Place at `path` in `weather`, drawn and landed with motion allowed:
 * the draws it makes a frame, and how bright the ground at the foot of the
 * screen is (0 to 255), with the page's copy (`copy`, a selector) hidden.
 */
export async function placeIn(
  browser: Browser,
  testInfo: TestInfo,
  { path, weather, copy }: { path: string; weather: "snow" | "clear"; copy: string },
) {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 960, height: 600 },
  });
  const page = await context.newPage();
  const draws = await watchDraws(page);
  await page.goto(`${path}?weather=${weather}`);
  // The world's own wrapper (on /play, the game's root carries data-world too).
  const world = page.locator("[data-world]:has(> canvas)");
  await expect(world).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  await expect
    .poll(() =>
      world.locator("canvas").evaluate((c) => getComputedStyle(c).opacity),
    )
    .toBe("1");
  const perFrame = await draws();
  // The canvas alone: the page's copy hidden over it.
  await page.addStyleTag({ content: `${copy} { visibility: hidden }` });
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
