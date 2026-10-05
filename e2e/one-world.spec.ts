import { expect, test, type Page } from "@playwright/test";
import { caseStudies, nav, notFound, resume } from "../src/content/site";
import { heroRoot, withoutWorld } from "./hero";

const routes = [
  { name: "home", path: "/" },
  { name: "Juice Bros case study", path: `/work/${caseStudies[0].slug}` },
  { name: "Resume page", path: "/resume" },
  { name: "404", path: "/this-page-does-not-exist" },
];

/** The routes that stand on the quieter backdrop, and a heading on each. */
const backdropRoutes = [
  { name: "Juice Bros case study", path: routes[1].path, heading: caseStudies[0].title },
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

const resumeLink = (page: Page) =>
  page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: nav[1].label });

test.describe("between routes", () => {
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
    // Nothing animates, transition or not.
    for (const durations of await transitions()) expect(durations).toEqual([]);
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
