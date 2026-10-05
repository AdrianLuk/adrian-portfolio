import { expect, test } from "@playwright/test";
import { heroRoot, openHome, SCENE_TIMEOUT } from "./hero";

// The world's libraries are the page's heaviest code: none of it may hold up
// the first paint. Told apart by what's inside each script, not by its name
// (the bundler's chunk names change with every build).
const LIBRARIES = {
  three: /REVISION\s*=\s*"\d+"|WebGLRenderer/,
  gsap: /GreenSock|_gsap/,
};

test("home's first paint comes before any of Three.js or GSAP is asked for", async ({
  page,
  request,
}) => {
  // Small enough to render quickly in software WebGL.
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/");
  // Both are in by then: the world draws, and the opening has its timeline.
  await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  const { paint, scripts } = await page.evaluate(() => ({
    paint:
      performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
      null,
    scripts: performance
      .getEntriesByType("resource")
      .filter((r) => r.name.endsWith(".js"))
      .map((r) => ({ url: r.name, start: r.startTime })),
  }));
  expect(paint).not.toBeNull();

  const found: Record<string, number[]> = { three: [], gsap: [] };
  for (const script of scripts) {
    const body = await (await request.get(script.url)).text();
    for (const [name, marker] of Object.entries(LIBRARIES)) {
      if (marker.test(body)) found[name].push(script.start);
    }
  }
  for (const [name, starts] of Object.entries(found)) {
    expect(starts.length, `${name} was loaded at all`).toBeGreaterThan(0);
    for (const start of starts) {
      expect(start, `${name} asked for before first paint`).toBeGreaterThan(
        paint!,
      );
    }
  }
});

test("the world stops drawing while the tab is hidden, and starts again when it's back", async ({
  browser,
}, testInfo) => {
  const page = await openHome(browser, testInfo, {
    viewport: { width: 960, height: 600 },
    skip: true,
    until: "settled",
    // Counts the world's draw calls (frames alone would count GSAP's ticker too).
    prepare: (page) =>
      page.addInitScript(() => {
        const w = window as unknown as { __draws: number };
        w.__draws = 0;
        for (const proto of [
          WebGL2RenderingContext.prototype,
          WebGLRenderingContext.prototype,
        ]) {
          const draw = proto.drawElements;
          proto.drawElements = function (this: WebGLRenderingContext, ...args) {
            w.__draws++;
            return draw.apply(this, args);
          } as typeof draw;
        }
      }),
  });
  /** Draw calls the world makes over half a second. */
  const drawsOver = () =>
    page.evaluate(async () => {
      const w = window as unknown as { __draws: number };
      const before = w.__draws;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return w.__draws - before;
    });
  /** Shows or hides the tab, as switching away from it would. */
  const setHidden = (hidden: boolean) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => hidden,
      });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (hidden ? "hidden" : "visible"),
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

  expect(await drawsOver()).toBeGreaterThan(0);
  await setHidden(true);
  // A frame already asked for may still land.
  await page.waitForTimeout(100);
  expect(await drawsOver()).toBe(0);
  await setHidden(false);
  expect(await drawsOver()).toBeGreaterThan(0);
  await page.context().close();
});
