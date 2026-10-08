import { expect, test, type Page } from "@playwright/test";
import {
  caseStudies,
  highlightAnchor,
  highlights,
  nav,
  notFound,
  person,
  resume,
} from "../src/content/site";
import type { Place } from "../src/components/world-places";
import { TRANSIT_MAX_SECONDS } from "../src/components/world/rigs";
import {
  heroRoot,
  openHome,
  SCENE_TIMEOUT,
  watched,
  watchHero,
  withoutWorld,
} from "./hero";

const routes = [
  { name: "home", path: "/" },
  { name: "Juice Bros case study", path: `/work/${caseStudies[0].slug}` },
  { name: "Resume page", path: "/resume" },
  { name: "404", path: "/this-page-does-not-exist" },
];

const caseStudyPath = routes[1].path;

/**
 * The routes that stand on the quieter backdrop of the valley, and a heading
 * on each (the Resume page's first paint, under the outpost's world).
 */
const backdropRoutes = [
  { name: "Resume page", path: "/resume", heading: resume.heading },
  { name: "404", path: routes[3].path, heading: notFound.heading },
];

const metaContent = (html: string, key: string) =>
  html.match(
    new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`),
  )?.[1];

test.describe("link previews", () => {
  for (const route of routes) {
    test(`${route.name} carries og:title, og:description and an og:image that loads`, async ({
      request,
    }) => {
      const html = await (await request.get(route.path)).text();
      expect(metaContent(html, "og:title")).toBeTruthy();
      expect(metaContent(html, "og:description")).toBeTruthy();
      expect(metaContent(html, "twitter:card")).toBe("summary_large_image");
      const image = metaContent(html, "og:image");
      expect(image).toMatch(/^https:\/\/adrianluk\.com\/share\/.+\.png$/);
      expect(metaContent(html, "og:image:width")).toBe("1200");
      expect(metaContent(html, "og:image:height")).toBe("630");
      expect(metaContent(html, "twitter:image")).toBe(image);
      // The live domain's path, served by this build.
      const response = await request.get(new URL(image!).pathname);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toMatch(/^image\//);
    });
  }
});

/** The backdrop as it stands: where it is, what it shows, and its motes. */
const backdropState = (page: Page, heading: string) =>
  page.evaluate((heading) => {
    const el = document.querySelector<HTMLElement>("[data-backdrop]")!;
    const box = el.getBoundingClientRect();
    const img = el.querySelector("img")!;
    const title = Array.from(document.querySelectorAll("h2")).find(
      (h) => h.textContent?.trim().toLowerCase() === heading.toLowerCase(),
    )!;
    const at = title.getBoundingClientRect();
    const hit = document.elementFromPoint(at.left + 4, at.top + at.height / 2);
    return {
      name: el.getAttribute("data-backdrop"),
      hidden: el.getAttribute("aria-hidden"),
      fixed: getComputedStyle(el).position,
      covers:
        box.left <= 0 &&
        box.top <= 0 &&
        box.right >= window.innerWidth &&
        box.bottom >= window.innerHeight,
      loaded: img.complete && img.naturalWidth > 0,
      // The page reads over it.
      behind: !!hit && title.contains(hit),
      // Anything laid over the still: a dimming layer, the motes.
      over: el.querySelectorAll(":scope > :not(picture)").length,
      motes: Array.from(el.querySelectorAll(".mote")).filter((m) =>
        (m as HTMLElement).checkVisibility(),
      ).length,
      drifting: document
        .getAnimations()
        .filter(
          (a) =>
            a instanceof CSSAnimation && a.animationName === "mote-drift",
        ).length,
    };
  }, heading);

test.describe("the night backdrop", () => {
  for (const route of backdropRoutes) {
    test(`stands behind the ${route.name}, its motes drifting`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await page.locator("[data-backdrop] img").evaluate(
        (img: HTMLImageElement) => img.decode(),
      );
      const state = await backdropState(page, route.heading);
      expect(state).toMatchObject({
        name: "valley",
        hidden: "true",
        fixed: "fixed",
        covers: true,
        loaded: true,
        behind: true,
      });
      expect(state.motes).toBeGreaterThan(10);
      expect(state.drifting).toBe(state.motes);
    });
  }

  test("the Case study stands on the court's still instead: never dimmed, no motes", async ({
    page,
  }) => {
    // The still alone, as the page first paints it.
    await withoutWorld(page);
    await page.goto(caseStudyPath);
    await page.locator("[data-backdrop] img").evaluate(
      (img: HTMLImageElement) => img.decode(),
    );
    expect(await backdropState(page, caseStudies[0].title)).toEqual({
      name: "court",
      hidden: "true",
      fixed: "fixed",
      covers: true,
      loaded: true,
      behind: true,
      over: 0,
      motes: 0,
      drifting: 0,
    });
  });

  test("under reduced motion it is the still alone: no motes, nothing animates", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/resume");
    expect(await backdropState(page, resume.heading)).toMatchObject({
      covers: true,
      behind: true,
      motes: 0,
      drifting: 0,
    });
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test("home has the world itself, not the backdrop", async ({ page }) => {
    await withoutWorld(page);
    await page.goto("/");
    await expect(page.locator("[data-backdrop]")).toHaveCount(0);
  });
});

/**
 * Records each view transition the page starts and, once it is ready, the
 * length of every animation it runs.
 */
async function watchTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __transitions: number[][] };
    w.__transitions = [];
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((update: never) => {
      const transition = start(update);
      const durations: number[] = [];
      w.__transitions.push(durations);
      transition.ready
        .then(() => {
          for (const a of document.getAnimations()) {
            const effect = a.effect as KeyframeEffect | null;
            if (!effect?.pseudoElement?.startsWith("::view-transition")) continue;
            durations.push(Number(effect.getComputedTiming().duration));
          }
        })
        .catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __transitions: number[][] }).__transitions,
    );
}

/**
 * Waits for a short crossfade among the transitions recorded: one over
 * before it gets in the way. (On a loaded machine React can start a second
 * transition and pin its groups with zero-length animations of its own.)
 */
async function crossfaded(transitions: () => Promise<number[][]>) {
  await expect
    .poll(async () =>
      (await transitions()).flat().some((d) => d > 100 && d <= 400),
    )
    .toBe(true);
  expect((await transitions()).flat().filter((d) => d > 400)).toEqual([]);
}

const resumeLink = (page: Page) =>
  page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: nav[1].label });

test.describe("between routes", () => {
  // Navigation only: the Resume page's world would share the CPU with it.
  test.beforeEach(({ page }) => withoutWorld(page));

  test("a short crossfade carries the page across", async ({ page }) => {
    const transitions = await watchTransitions(page);
    await page.goto(routes[1].path);
    await resumeLink(page).click();
    await expect(page).toHaveURL(/\/resume$/);
    await expect(
      page.getByRole("heading", { level: 2, name: resume.heading }),
    ).toBeVisible();
    await expect.poll(async () => (await transitions()).at(-1)?.length ?? 0)
      .toBeGreaterThan(0);
    const durations = (await transitions()).at(-1)!;
    // Short: over before it gets in the way.
    for (const d of durations) {
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThanOrEqual(400);
    }
  });

  test("under reduced motion the swap is instant", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const transitions = await watchTransitions(page);
    await page.goto(routes[1].path);
    await resumeLink(page).click();
    await expect(page).toHaveURL(/\/resume$/);
    await expect(
      page.getByRole("heading", { level: 2, name: resume.heading }),
    ).toBeVisible();
    // Nothing takes any time, transition or not. (On a loaded machine React
    // can start a second transition and pin its groups with zero-length
    // animations of its own: instant, so they pass.)
    for (const durations of await transitions()) {
      expect(durations.filter((d) => d > 0)).toEqual([]);
    }
  });

  test("without WebGL, home → Resume page still crossfades, and nothing flies", async ({
    page,
  }) => {
    const transitions = await watchTransitions(page);
    const transit = await watchTransit(page);
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-world", "unavailable");
    // By keyboard: the link keeps focus once the page has changed (the
    // transit's own test holds it to the same).
    await resumeLink(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/resume$/);
    await crossfaded(transitions);
    await expect(resumeLink(page)).toBeFocused();
    const seen = await transit();
    expect(seen.seen).toEqual([]);
    expect(seen.arriving).toEqual([]);
  });
});

type TransitWatch = {
  seen: (string | null)[];
  /**
   * Each value data-arriving takes (null as it clears), and when, in ms. A
   * clearing also carries the longest the page's main thread went without a
   * frame while the hold was on, up to that moment: how late a timer could
   * have fired.
   */
  arriving: { value: string | null; at: number; stall?: number }[];
  frames: number;
  bare: number;
};

const noTransits: TransitWatch = { seen: [], arriving: [], frames: 0, bare: 0 };

/**
 * Records, from the first byte, every value the world's root takes for
 * `data-transit` and `data-arriving` (null as they clear) and, on every
 * frame from the first transit on, whether the still backdrop showed bare:
 * in the page with no drawn world over it.
 */
async function watchTransit(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __transit: TransitWatch };
    w.__transit = { seen: [], arriving: [], frames: 0, bare: 0 };
    let lastFrame = performance.now();
    let stall = 0;
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as Element;
        if (!el.hasAttribute("data-world-root")) continue;
        const value = el.getAttribute(r.attributeName!);
        const at = performance.now();
        if (r.attributeName === "data-transit") w.__transit.seen.push(value);
        else if (value) {
          stall = 0;
          w.__transit.arriving.push({ value, at });
        } else {
          stall = Math.max(stall, at - lastFrame);
          w.__transit.arriving.push({ value, at, stall });
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-transit", "data-arriving"],
    });
    const frame = () => {
      const now = performance.now();
      if (document.querySelector("[data-arriving]")) {
        stall = Math.max(stall, now - lastFrame);
      }
      lastFrame = now;
      if (w.__transit.seen.length > 0) {
        w.__transit.frames++;
        const backdrop = document.querySelector("[data-backdrop]");
        const canvas = document.querySelector<HTMLCanvasElement>(
          "[data-world] canvas",
        );
        const drawn =
          !!canvas &&
          (canvas as unknown as { __tag?: string }).__tag === "the world" &&
          getComputedStyle(canvas).opacity === "1";
        if (backdrop && !drawn) w.__transit.bare++;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __transit: TransitWatch }).__transit,
    );
}

/**
 * How late a hold's release may run past the cap, on top of the longest the
 * main thread was blocked during it (CI's software renderer stalls it for
 * whole frames, and a timer can't fire until it frees): about a frame.
 */
const HOLD_GRACE = 50;

/** The world's root, which carries data-transit while the camera flies. */
const worldRoot = (page: Page) => page.locator("[data-world-root]");

/**
 * Each hold on the copy: how long it lasted, in ms, from data-arriving being
 * set (as the navigation starts) to its clearing, and the longest the main
 * thread was blocked meanwhile.
 */
function holds({ arriving }: TransitWatch) {
  return arriving.flatMap(({ value, at }, i) =>
    value && i + 1 < arriving.length
      ? [{ ms: arriving[i + 1].at - at, stall: arriving[i + 1].stall ?? 0 }]
      : [],
  );
}

/**
 * Once the page headed `heading` is in under a transit and its copy is held:
 * whether a link in that copy could take focus, and whether it shows. Null if
 * the copy was never seen held.
 */
const heldCopy = (page: Page, heading: string) =>
  page.evaluate(async (heading) => {
    const root = document.querySelector("[data-world-root]")!;
    // Bounded by time, not frames: a software renderer's frames can be slow.
    const until = performance.now() + 5000;
    while (performance.now() < until) {
      const header = Array.from(document.querySelectorAll("h2"))
        .find((h) => h.textContent === heading)
        ?.closest("header");
      if (header && root.hasAttribute("data-arriving")) {
        const link = header.querySelector("a")!;
        link.focus();
        return {
          focusable: document.activeElement === link,
          visible: link.checkVisibility({ visibilityProperty: true }),
        };
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return null;
  }, heading);

/** Waits for a flight to `to` to have run and landed. */
async function flown(
  transit: Awaited<ReturnType<typeof watchTransit>>,
  page: Page,
  to: Place,
) {
  await expect.poll(async () => (await transit()).seen).toContain(to);
  await expect(worldRoot(page)).not.toHaveAttribute("data-transit", /.*/, {
    timeout: SCENE_TIMEOUT,
  });
}

test.describe("camera flights between Places", () => {
  test.describe.configure({ timeout: 90_000 });

  test("the camera flies home → Resume page, Back home, Forward again, and a click mid-flight turns it round", async ({
    browser,
  }, testInfo) => {
    let transit: Awaited<ReturnType<typeof watchTransit>> = async () =>
      noTransits;
    let transitions: Awaited<ReturnType<typeof watchTransitions>> =
      async () => [];
    const page = await openHome(browser, testInfo, {
      viewport: { width: 960, height: 600 },
      skip: true,
      until: "settled",
      prepare: async (page) => {
        transit = await watchTransit(page);
        transitions = await watchTransitions(page);
      },
    });
    await tagCanvas(heroRoot(page).locator("canvas"));
    const crossfades = async () =>
      (await transitions()).flat().filter((d) => d > 0).length;

    // Home → Resume page, by keyboard: a flight, not a crossfade, over the
    // world drawn throughout. The page's copy, held unseen and out of reach
    // of focus until then, arrives as it lands.
    await resumeLink(page).focus();
    await page.keyboard.press("Enter");
    expect(await heldCopy(page, resume.heading)).toEqual({ focusable: false, visible: false });
    await expect(page).toHaveURL(/\/resume$/);
    await flown(transit, page, "outpost");
    // Focus stays where the router leaves it, as without a transit.
    await expect(resumeLink(page)).toBeFocused();
    const outpost = page.locator("[data-world]");
    await expect(outpost).toHaveAttribute("data-world", "drawn");
    expect(await canvasTag(outpost.locator("canvas"))).toBe("the world");
    const heading = page.getByRole("heading", { level: 2, name: resume.heading });
    await expect(heading).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("header", { has: heading })
          .evaluate((el) => getComputedStyle(el).opacity),
      )
      .toBe("1");
    let seen = await transit();
    expect(seen.frames).toBeGreaterThan(0);
    expect(seen.bare).toBe(0);
    expect(await crossfades()).toBe(0);

    // Back: the flight home, landing settled, without the opening's credits.
    await page.evaluate(() => {
      const w = window as unknown as {
        __hero: { seen: string[]; cardPeaks: number[] };
      };
      w.__hero.seen = [];
      w.__hero.cardPeaks = [];
    });
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await flown(transit, page, "hero");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled");
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn");
    const hero = await watched(page);
    expect(hero.seen).not.toContain("flight");
    expect(hero.cardPeaks.filter((peak) => peak > 0)).toEqual([]);
    expect(await crossfades()).toBe(0);

    // Forward: down the valley again.
    const before = (await transit()).seen.length;
    await page.goForward();
    await expect(page).toHaveURL(/\/resume$/);
    await expect
      .poll(async () => (await transit()).seen.slice(before))
      .toContain("outpost");
    await expect(worldRoot(page)).not.toHaveAttribute("data-transit", /.*/, {
      timeout: SCENE_TIMEOUT,
    });

    // Home, then the Resume page again before the camera gets there: the
    // newer navigation wins, and the camera lands at the Outpost.
    // (In the page, so a busy machine can't let the first flight land.)
    const midFlight = await page.evaluate(
      async ([home, resume]) => {
        const link = (label: string) =>
          Array.from(
            document.querySelectorAll<HTMLAnchorElement>(
              'nav[aria-label="Main"] a',
            ),
          ).find((a) => a.textContent === label)!;
        link(home).click();
        await new Promise((resolve) => setTimeout(resolve, 300));
        const transit = document
          .querySelector("[data-world-root]")!
          .getAttribute("data-transit");
        link(resume).click();
        return transit;
      },
      [person.name, nav[1].label],
    );
    expect(midFlight).toBe("hero");
    await expect(page).toHaveURL(/\/resume$/);
    await expect(worldRoot(page)).not.toHaveAttribute("data-transit", /.*/, {
      timeout: SCENE_TIMEOUT,
    });
    await expect(outpost).toHaveAttribute("data-world", "drawn");
    seen = await transit();
    expect(seen.seen.at(-1)).toBeNull();
    expect(seen.bare).toBe(0);
    expect(await crossfades()).toBe(0);
    // Every hold on the copy ended within the cap of its navigation's start
    // (late only by as long as the main thread was blocked).
    expect(seen.arriving.at(-1)?.value).toBeNull();
    expect(holds(seen).length).toBeGreaterThan(0);
    for (const { ms, stall } of holds(seen)) {
      expect(ms).toBeLessThanOrEqual(
        TRANSIT_MAX_SECONDS * 1000 + stall + HOLD_GRACE,
      );
    }
    await page.context().close();
  });

  test("Resume clicked during the opening flies from where the opening has got to, and lands at the Outpost", async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 960, height: 600 },
    });
    const page = await context.newPage();
    await watchHero(page);
    const transit = await watchTransit(page);
    // The click goes in from the page itself, the moment the opening is under
    // way with the world drawn: on CI's software renderer, stalled frames can
    // carry the opening to its end before a click sent from the test arrives.
    await page.addInitScript((label) => {
      const w = window as unknown as {
        __clicked?: { state: string | null; transit: string | null };
      };
      new MutationObserver((records, observer) => {
        for (const r of records) {
          const hero = r.target as Element;
          if (
            hero.getAttribute("data-state") !== "flight" ||
            hero.getAttribute("data-world") !== "drawn"
          ) {
            continue;
          }
          observer.disconnect();
          const canvas = hero.querySelector("canvas");
          if (canvas) (canvas as unknown as { __tag: string }).__tag = "the world";
          Array.from(
            document.querySelectorAll<HTMLAnchorElement>(
              'nav[aria-label="Main"] a',
            ),
          )
            .find((a) => a.textContent === label)!
            .click();
          w.__clicked = {
            state: hero.getAttribute("data-state"),
            transit: document
              .querySelector("[data-world-root]")!
              .getAttribute("data-transit"),
          };
          return;
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "data-world"],
      });
    }, nav[1].label);
    await page.goto("/");
    const flying = await page
      .waitForFunction(
        () => (window as unknown as { __clicked?: object }).__clicked,
        undefined,
        { timeout: SCENE_TIMEOUT },
      )
      .then((handle) => handle.jsonValue());
    expect(flying).toEqual({ state: "flight", transit: "outpost" });
    await expect(page).toHaveURL(/\/resume$/);
    await flown(transit, page, "outpost");
    await expect(page.locator("[data-world]")).toHaveAttribute(
      "data-world",
      "drawn",
    );
    const seen = await transit();
    expect(seen.bare).toBe(0);
    for (const { ms, stall } of holds(seen)) {
      expect(ms).toBeLessThanOrEqual(
        TRANSIT_MAX_SECONDS * 1000 + stall + HOLD_GRACE,
      );
    }
    await page.context().close();
  });

  test("under reduced motion the swap is instant and nothing flies", async ({
    browser,
  }, testInfo) => {
    let transit: Awaited<ReturnType<typeof watchTransit>> = async () =>
      noTransits;
    let transitions: Awaited<ReturnType<typeof watchTransitions>> =
      async () => [];
    const page = await openHome(browser, testInfo, {
      viewport: { width: 960, height: 600 },
      reducedMotion: "reduce",
      until: "reduced",
      prepare: async (page) => {
        transit = await watchTransit(page);
        transitions = await watchTransitions(page);
      },
    });
    await resumeLink(page).click();
    await expect(page).toHaveURL(/\/resume$/);
    await homeLink(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced");
    await caseStudyLink(page).click();
    await expect(page).toHaveURL(new RegExp(`${caseStudyPath}$`));
    await expect(
      page.getByRole("heading", { level: 2, name: caseStudies[0].title }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced");
    expect((await transit()).seen).toEqual([]);
    expect((await transit()).arriving).toEqual([]);
    for (const durations of await transitions()) {
      expect(durations.filter((d) => d > 0)).toEqual([]);
    }

    // The preference is read at each navigation: allowed again, it flies.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await resumeLink(page).click();
    await expect(page).toHaveURL(/\/resume$/);
    await flown(transit, page, "outpost");
    await page.context().close();
  });

  test("a GPU context lost mid-flight lands at once on the still, and the navigation completes", async ({
    browser,
  }, testInfo) => {
    const page = await openHome(browser, testInfo, {
      viewport: { width: 960, height: 600 },
      skip: true,
      until: "settled",
    });
    // In one task, so a busy machine can't let the flight land first.
    const flying = await page.evaluate((label) => {
      const link = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a'),
      ).find((a) => a.textContent === label)!;
      link.click();
      const transit = document
        .querySelector("[data-world-root]")!
        .getAttribute("data-transit");
      document
        .querySelector<HTMLCanvasElement>("[data-world] canvas")!
        .getContext("webgl2")!
        .getExtension("WEBGL_lose_context")!
        .loseContext();
      return transit;
    }, nav[1].label);
    expect(flying).toBe("outpost");
    await expect(page).toHaveURL(/\/resume$/);
    await expect(worldRoot(page)).not.toHaveAttribute("data-transit", /.*/);
    const outpost = page.locator("[data-world]");
    await expect(outpost).toHaveAttribute("data-world", "pending");
    await expect(page.locator("[data-backdrop] img")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: resume.heading }),
    ).toBeVisible();
    await page.context().close();
  });

  test("the camera flies home → Case study to the court, its copy arriving as it lands, and Back flies home", async ({
    browser,
  }, testInfo) => {
    let transit: Awaited<ReturnType<typeof watchTransit>> = async () =>
      noTransits;
    let transitions: Awaited<ReturnType<typeof watchTransitions>> =
      async () => [];
    const page = await openHome(browser, testInfo, {
      viewport: { width: 960, height: 600 },
      skip: true,
      until: "settled",
      prepare: async (page) => {
        transit = await watchTransit(page);
        transitions = await watchTransitions(page);
      },
    });
    await tagCanvas(heroRoot(page).locator("canvas"));
    const crossfades = async () =>
      (await transitions()).flat().filter((d) => d > 0).length;

    // From the Juice Bros Highlight, by keyboard: a flight down the valley,
    // not a crossfade, over the world drawn throughout. The Case study's
    // copy, held unseen and out of reach of focus until then, arrives as the
    // camera lands at the court.
    await caseStudyLink(page).focus();
    await page.keyboard.press("Enter");
    expect(await heldCopy(page, caseStudies[0].title)).toEqual({
      focusable: false,
      visible: false,
    });
    await expect(page).toHaveURL(new RegExp(`${caseStudyPath}$`));
    await flown(transit, page, "court");
    const court = page.locator("[data-world]");
    await expect(court).toHaveAttribute("data-world", "drawn");
    expect(await canvasTag(court.locator("canvas"))).toBe("the world");
    await expect(page.locator('[data-backdrop="court"]')).toHaveCount(1);
    const heading = page.getByRole("heading", {
      level: 2,
      name: caseStudies[0].title,
    });
    await expect(heading).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("header", { has: heading })
          .evaluate((el) => getComputedStyle(el).opacity),
      )
      .toBe("1");
    // Where focus is: the router's to say (checked against a plain
    // navigation below).
    const focused = await focusedElement(page);
    let seen = await transit();
    expect(seen.seen.slice(0, 2)).toEqual(["court", null]);
    expect(seen.frames).toBeGreaterThan(0);
    expect(seen.bare).toBe(0);
    expect(await crossfades()).toBe(0);

    // Back: the flight home, landing settled, without the opening's credits.
    await page.evaluate(() => {
      const w = window as unknown as {
        __hero: { seen: string[]; cardPeaks: number[] };
      };
      w.__hero.seen = [];
      w.__hero.cardPeaks = [];
    });
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await flown(transit, page, "hero");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled");
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn");
    expect(await canvasTag(heroRoot(page).locator("canvas"))).toBe("the world");
    const hero = await watched(page);
    expect(hero.seen).not.toContain("flight");
    expect(hero.cardPeaks.filter((peak) => peak > 0)).toEqual([]);
    expect(await crossfades()).toBe(0);

    // Every hold on the copy ended within the cap of its navigation's start
    // (late only by as long as the main thread was blocked).
    seen = await transit();
    expect(seen.seen.at(-1)).toBeNull();
    expect(seen.arriving.at(-1)?.value).toBeNull();
    expect(holds(seen).length).toBeGreaterThan(0);
    for (const { ms, stall } of holds(seen)) {
      expect(ms).toBeLessThanOrEqual(
        TRANSIT_MAX_SECONDS * 1000 + stall + HOLD_GRACE,
      );
    }
    await page.context().close();

    // The same navigation with no world to fly through leaves focus in the
    // same place.
    const plain = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 960, height: 600 },
    });
    const still = await plain.newPage();
    await withoutWorld(still);
    await still.goto("/");
    await caseStudyLink(still).focus();
    await still.keyboard.press("Enter");
    await expect(still).toHaveURL(new RegExp(`${caseStudyPath}$`));
    await expect(
      still.getByRole("heading", { level: 2, name: caseStudies[0].title }),
    ).toBeVisible();
    expect(await focusedElement(still)).toEqual(focused);
    await plain.close();
  });

  test("the camera flies Case study → Resume page on down the valley, and Back to the court", async ({
    browser,
  }, testInfo) => {
    // A visit that starts at the Case study: home is never laid out.
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 960, height: 600 },
    });
    const page = await context.newPage();
    const transit = await watchTransit(page);
    const transitions = await watchTransitions(page);
    await page.goto(caseStudyPath);
    const world = page.locator("[data-world]");
    await expect(world).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
    // Faded in over the still (a direct load's), before the camera leaves.
    await expect(world.locator("canvas")).toHaveCSS("opacity", "1");
    await tagCanvas(world.locator("canvas"));

    await resumeLink(page).focus();
    await page.keyboard.press("Enter");
    expect(await heldCopy(page, resume.heading)).toEqual({
      focusable: false,
      visible: false,
    });
    await expect(page).toHaveURL(/\/resume$/);
    await flown(transit, page, "outpost");
    // Focus stays where the router leaves it, as without a transit.
    await expect(resumeLink(page)).toBeFocused();
    await expect(world).toHaveAttribute("data-world", "drawn");
    expect(await canvasTag(world.locator("canvas"))).toBe("the world");

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${caseStudyPath}$`));
    await flown(transit, page, "court");
    await expect(world).toHaveAttribute("data-world", "drawn");
    await expect(
      page.getByRole("heading", { level: 2, name: caseStudies[0].title }),
    ).toBeVisible();

    const seen = await transit();
    expect(seen.seen).toEqual(["outpost", null, "court", null]);
    expect(seen.bare).toBe(0);
    expect((await transitions()).flat().filter((d) => d > 0)).toEqual([]);
    expect(holds(seen)).toHaveLength(2);
    for (const { ms, stall } of holds(seen)) {
      expect(ms).toBeLessThanOrEqual(
        TRANSIT_MAX_SECONDS * 1000 + stall + HOLD_GRACE,
      );
    }
    await context.close();
  });
});

const homeLink = (page: Page) =>
  page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: person.name });

/** The Juice Bros Highlight's link to its Case study, on home. */
const caseStudyLink = (page: Page) =>
  page.locator(`main a[href="${caseStudyPath}"]`).first();

/** What has focus: its tag, and its text or name. */
const focusedElement = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      tag: el?.tagName.toLowerCase() ?? null,
      text: el?.textContent?.trim().slice(0, 40) ?? null,
      href: el?.getAttribute("href") ?? null,
    };
  });

/**
 * Counts the WebGL contexts the page creates from the first byte, and records
 * the state each hero enters the page in (watchHero sees only changes).
 */
async function watchWorld(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __contexts: number; __entered: string[] };
    w.__contexts = 0;
    w.__entered = [];
    const withContext = new WeakSet<HTMLCanvasElement>();
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      const context = (getContext as (...args: unknown[]) => unknown).call(
        this,
        type,
        ...rest,
      );
      if (context && type.includes("webgl") && !withContext.has(this)) {
        withContext.add(this);
        w.__contexts++;
      }
      return context;
    } as typeof getContext;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (!(node instanceof Element)) continue;
          const hero = node.matches("[data-state]")
            ? node
            : node.querySelector("[data-state]");
          const state = hero?.getAttribute("data-state");
          if (state) w.__entered.push(state);
        }
      }
    }).observe(document, { subtree: true, childList: true });
  });
  return () =>
    page.evaluate(() => {
      const w = window as unknown as { __contexts: number; __entered: string[] };
      return { contexts: w.__contexts, entered: w.__entered };
    });
}

/** Tags the world's canvas, to tell later whether it is the same element. */
const tagCanvas = (canvas: ReturnType<Page["locator"]>) =>
  canvas.evaluate((c) => {
    (c as unknown as { __tag: string }).__tag = "the world";
  });
const canvasTag = (canvas: ReturnType<Page["locator"]>) =>
  canvas.evaluate((c) => (c as unknown as { __tag?: string }).__tag ?? null);

test.describe("one world across home and the Resume page", () => {
  test.describe.configure({ timeout: 60_000 });

  test("the canvas and its scene survive home → Resume page → home, and home comes back settled", async ({
    browser,
  }, testInfo) => {
    let world: Awaited<ReturnType<typeof watchWorld>> = async () => ({
      contexts: 0,
      entered: [],
    });
    const page = await openHome(browser, testInfo, {
      viewport: { width: 960, height: 600 },
      skip: true,
      until: "settled",
      prepare: async (page) => {
        world = await watchWorld(page);
      },
    });
    await tagCanvas(heroRoot(page).locator("canvas"));
    expect((await world()).contexts).toBe(1);

    await resumeLink(page).click();
    await expect(page).toHaveURL(/\/resume$/);
    const outpost = page.locator("[data-world]");
    // Already drawn: the world was live when the page arrived.
    await expect(outpost).toHaveAttribute("data-world", "drawn");
    await expect(outpost.locator("canvas")).toHaveCSS("position", "fixed");
    expect(await canvasTag(outpost.locator("canvas"))).toBe("the world");
    await expect(page.locator("[data-backdrop]")).toHaveCount(1);

    await page.evaluate(() => {
      (window as unknown as { __hero: { seen: string[] } }).__hero.seen = [];
    });
    await homeLink(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled");
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn");
    expect(await canvasTag(heroRoot(page).locator("canvas"))).toBe("the world");
    // The opening never replays: home arrives settled, with no flight after.
    const { contexts, entered } = await world();
    expect(contexts).toBe(1);
    expect(entered.at(-1)).toBe("settled");
    expect((await watched(page)).seen).not.toContain("flight");
    await page.context().close();
  });

  test("home reached from the Resume page joins its live world settled, and the scroll route carries the camera on", async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 960, height: 600 },
    });
    const page = await context.newPage();
    await watchHero(page);
    const world = await watchWorld(page);
    await page.goto("/resume");
    const outpost = page.locator("[data-world]");
    await expect(outpost).toHaveAttribute("data-world", "drawn", {
      timeout: SCENE_TIMEOUT,
    });
    await tagCanvas(outpost.locator("canvas"));

    await homeLink(page).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled");
    await expect(heroRoot(page)).toHaveAttribute("data-world", "drawn");
    expect(await canvasTag(heroRoot(page).locator("canvas"))).toBe("the world");
    const { contexts, entered } = await world();
    expect(contexts).toBe(1);
    expect(entered.at(-1)).toBe("settled");
    expect((await watched(page)).seen).not.toContain("flight");

    // The scroll route runs again: the first Highlight's site lights.
    const first = page.locator(`#${highlightAnchor(highlights[0].id)}`);
    await first.evaluate((el) =>
      el.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await expect(first).toHaveAttribute("data-lit", /.*/, {
      timeout: SCENE_TIMEOUT,
    });
    await context.close();
  });
});

test.describe("large screens", () => {
  const screens = [
    { name: "2560px wide at 1.5x", width: 2560, height: 1440, scale: 1.5 },
    { name: "a 4K TV at 1x", width: 3840, height: 2160, scale: 1 },
    { name: "an ultrawide 2560 by 1080", width: 2560, height: 1080, scale: 1 },
  ];

  for (const screen of screens) {
    test(`on ${screen.name}, the backdrop fills it from a still wide enough`, async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: screen.width, height: screen.height },
        deviceScaleFactor: screen.scale,
      });
      const page = await context.newPage();
      await page.goto("/resume");
      const img = page.locator("[data-backdrop] img");
      await img.evaluate((el: HTMLImageElement) => el.decode());
      const seen = await img.evaluate(async (el: HTMLImageElement) => {
        const box = el.getBoundingClientRect();
        // The still the browser chose, at its own size (an srcset image's
        // naturalWidth is divided by the density it was chosen for).
        const still = new Image();
        still.src = el.currentSrc;
        await still.decode();
        // object-fit: cover scales the still by the larger of the two ratios.
        const cover = Math.max(
          box.width / still.naturalWidth,
          box.height / still.naturalHeight,
        );
        return {
          covers: box.width >= window.innerWidth && box.height >= window.innerHeight,
          // Device pixels per still pixel: above 1 is upscaled.
          upscale: cover * window.devicePixelRatio,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(seen.covers).toBe(true);
      expect(seen.upscale).toBeLessThanOrEqual(1.01);
      expect(seen.overflow).toBeLessThanOrEqual(0);
      await context.close();
    });

    test(`on ${screen.name}, the hero's world spans it and the name holds the frame`, async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: screen.width, height: screen.height },
        deviceScaleFactor: screen.scale,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      // Layout only: the world's own sizing is world.spec.ts's.
      await withoutWorld(page);
      await page.goto("/");
      const seen = await heroRoot(page).evaluate((hero) => {
        const canvas = hero.querySelector("canvas")!.getBoundingClientRect();
        const name = hero.querySelector("[data-plate-echo]")!;
        const range = document.createRange();
        range.selectNodeContents(name);
        return {
          spans: canvas.left <= 0 && canvas.right >= window.innerWidth,
          tall: canvas.height >= window.innerHeight * 0.8,
          nameShare: range.getBoundingClientRect().width / window.innerWidth,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(seen).toMatchObject({ spans: true, tall: true });
      expect(seen.nameShare).toBeGreaterThan(0.3);
      expect(seen.overflow).toBeLessThanOrEqual(0);
      await context.close();
    });
  }
});
