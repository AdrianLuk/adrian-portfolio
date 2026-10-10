import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  playerToolsSelector,
  SCENE,
  SCENE_STATES,
} from "../src/components/player-tools-markup";
import { countDraws, heroRoot, openHome, SCENE_TIMEOUT } from "./hero";

// The world's libraries are the page's heaviest code: none of it may hold up
// the first paint. Told apart by what's inside each script, not by its name
// (the bundler's chunk names change with every build).
const LIBRARIES = {
  three: /REVISION\s*=\s*"\d+"|WebGLRenderer/,
  gsap: /GreenSock|_gsap/,
};

/**
 * When the page's first paint came, and which of `libraries` it asked for,
 * by when: told apart by what's inside each script.
 */
async function libraryStarts(
  page: Page,
  request: APIRequestContext,
  libraries: (keyof typeof LIBRARIES)[],
) {
  const { paint, scripts } = await page.evaluate(() => ({
    paint:
      performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
      null,
    scripts: performance
      .getEntriesByType("resource")
      .filter((r) => new URL(r.name).pathname.endsWith(".js"))
      .map((r) => ({ url: r.name, start: r.startTime })),
  }));
  expect(paint).not.toBeNull();

  const found = Object.fromEntries(
    libraries.map((name) => [name, [] as number[]]),
  );
  for (const script of scripts) {
    const body = await (await request.get(script.url)).text();
    for (const name of libraries) {
      if (LIBRARIES[name].test(body)) found[name].push(script.start);
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
}

test("home's first paint comes before any of Three.js or GSAP is asked for", async ({
  page,
  request,
}) => {
  // Small enough to render quickly in software WebGL.
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/");
  // Both are in by then: the opening runs on its timeline, and the world draws.
  await expect(heroRoot(page)).toHaveAttribute(
    "data-state",
    /^(flight|settled)$/,
    { timeout: SCENE_TIMEOUT },
  );
  await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  await libraryStarts(page, request, ["three", "gsap"]);
});

test("the Resume page's first paint comes before any of Three.js is asked for", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/resume");
  // In by then: the Skyline has drawn.
  await expect(page.locator("[data-world]")).toHaveAttribute(
    "data-world",
    "drawn",
    { timeout: SCENE_TIMEOUT },
  );
  await libraryStarts(page, request, ["three"]);
});

test("the Case study's first paint comes before any of Three.js is asked for", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/work/juice-bros");
  // In by then: the court has drawn.
  await expect(page.locator("[data-world]")).toHaveAttribute(
    "data-world",
    "drawn",
    { timeout: SCENE_TIMEOUT },
  );
  await libraryStarts(page, request, ["three"]);
});

test("the Rally game's first paint comes before any of Three.js is asked for", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/play");
  // In by then: the court has drawn.
  await expect(page.locator("[data-world]").first()).toHaveAttribute(
    "data-world",
    "drawn",
    { timeout: SCENE_TIMEOUT },
  );
  await libraryStarts(page, request, ["three"]);
});

test("the Home Run Derby's first paint comes before any of Three.js is asked for", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/play/derby");
  // In by then: the Diamond has drawn.
  await expect(page.locator("[data-world]").first()).toHaveAttribute(
    "data-world",
    "drawn",
    { timeout: SCENE_TIMEOUT },
  );
  await libraryStarts(page, request, ["three"]);
});

test("the Case study's first paint comes before any of GSAP is asked for", async ({
  page,
  request,
}) => {
  // Wide, with motion allowed: the Player tools scene loads GSAP to run.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/work/juice-bros");
  await expect(page.locator(playerToolsSelector)).toHaveAttribute(
    SCENE,
    SCENE_STATES.pinned,
  );
  await libraryStarts(page, request, ["gsap"]);
});

test("the world stops drawing while the tab is hidden, and starts again when it's back", async ({
  browser,
}, testInfo) => {
  let draws: () => Promise<number> = async () => 0;
  const page = await openHome(browser, testInfo, {
    viewport: { width: 960, height: 600 },
    skip: true,
    until: "settled",
    prepare: async (page) => {
      draws = await countDraws(page);
    },
  });
  /** Draw calls the world makes over half a second. */
  const drawsOver = async () => {
    const before = await draws();
    await page.waitForTimeout(500);
    return (await draws()) - before;
  };
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
