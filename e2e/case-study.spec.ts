import { expect, test, type Page } from "@playwright/test";
import {
  playerToolsSelector,
  SCENE,
  SCENE_STATES,
  stageToolNamed,
  toolCopySelector,
  toolStageSelector,
} from "../src/components/player-tools-markup";
import {
  caseStudies,
  hrefFor,
  nav,
  rally,
  rallyLink,
  type PlayerTool,
} from "../src/content/site";

const study = caseStudies[0];
const path = hrefFor({ kind: "case-study", slug: study.slug });

test("sets its title and description from the content module", async ({
  page,
}) => {
  await page.goto(path);
  await expect(page).toHaveTitle(study.metaTitle);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    study.metaDescription,
  );
});

test("the main heading names the project and the four sections follow", async ({
  page,
}) => {
  await page.goto(path);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 2 })).toHaveText(
    study.title,
  );
  await expect(main.getByRole("heading", { level: 3 })).toHaveText(
    study.sections.map((s) => s.heading),
  );
});

/**
 * The Player tools' two modes: pinned on a wide screen with motion allowed,
 * stacked otherwise. What a reader gets from the page is the same in both.
 */
const modes = [
  { name: "pinned", use: { viewport: { width: 1280, height: 720 } } },
  {
    name: "stacked",
    use: {
      viewport: { width: 1280, height: 720 },
      reducedMotion: "reduce" as const,
    },
  },
];

for (const mode of modes) {
  test.describe(`with the Player tools ${mode.name}`, () => {
    test.use(mode.use);

    test("every screenshot loads, and nothing is embedded live", async ({
      page,
    }) => {
      await page.goto(path);
      const images = page.getByRole("main").getByRole("img");
      await expect(images).toHaveCount(2 * (1 + study.tools.length));
      // next/image lazy-loads; load them all so a bad path shows up as a broken image.
      await page.evaluate(() =>
        Promise.all(
          [...document.images].map((i) => {
            i.loading = "eager";
            return i.decode().catch(() => undefined);
          }),
        ),
      );
      const broken = await page.evaluate(() =>
        [...document.images]
          .filter((i) => i.naturalWidth === 0)
          .map((i) => i.src),
      );
      expect(broken).toEqual([]);
      await expect(page.locator("iframe, embed, object")).toHaveCount(0);
    });

    test("every outbound link has an accessible name", async ({ page }) => {
      await page.goto(path);
      const main = page.getByRole("main");
      for (const link of study.links) {
        await expect(
          main.getByRole("link", { name: link.label, exact: true }),
        ).toHaveAttribute("href", link.href);
      }
      const names = await main
        .locator("a[href^='http']")
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim()),
        );
      expect(names).toHaveLength(
        study.links.filter((l) => l.href.startsWith("http")).length,
      );
      expect(names.every((n) => n && n.length > 0)).toBe(true);
    });

    test("each tool's screenshots are announced with that tool", async ({
      page,
    }) => {
      await page.goto(path);
      for (const tool of study.tools) {
        const block = page
          .getByRole("main")
          .getByRole("region", { name: tool.name, exact: true });
        await expect(block.getByRole("img")).toHaveCount(2);
        await expect(block.getByRole("img").first()).toHaveAccessibleName(
          tool.screenshots.desktop.alt,
        );
      }
    });
  });
}

const stage = (page: Page) => page.locator(toolStageSelector);
const frame = (page: Page, name: string) =>
  page.locator(`${toolStageSelector} ${stageToolNamed(name)}`);

/** Scrolls so a tool's copy starts just above the middle of the screen. */
async function readTool(page: Page, name: string) {
  const heading = page
    .getByRole("main")
    .getByRole("heading", { level: 5, name, exact: true });
  await heading.evaluate((el) => {
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top - window.innerHeight * 0.4);
  });
}

const toolLink = (page: Page, name: string) => {
  const url = study.tools.find((t) => t.name === name)!.url;
  return page.getByRole("link", {
    name: study.links.find((l) => l.href === url)!.label,
    exact: true,
  });
};

/** Sums the page's layout shifts not caused by input into `window.__shift`. */
function observeShifts() {
  const w = window as unknown as { __shift: number };
  w.__shift = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as unknown as {
      value: number;
      hadRecentInput: boolean;
    }[]) {
      if (!entry.hadRecentInput) w.__shift += entry.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
}

/** Counts layout shifts from the next page load on. */
const countShifts = (page: Page) => page.addInitScript(observeShifts);

const shifted = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shift: number }).__shift);

/** Waits for two frames, by when a scroll has been read and drawn. */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );

test.describe("the Player tools scene on a wide screen with motion allowed", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(path);
    await expect(page.locator(playerToolsSelector)).toHaveAttribute(
      SCENE,
      SCENE_STATES.pinned,
    );
  });

  // The Stage director's unit tests hold the rules; these check its wiring to
  // the page (scroll, focus, the toggles, the stage going off screen) and what
  // only a browser lays out: the stage pinned, and each frame's images.

  test("holds the stage still and shows each tool as its text arrives, then lets it go", async ({
    page,
  }) => {
    const tops: number[] = [];
    for (const [i, tool] of study.tools.entries()) {
      await readTool(page, tool.name);
      await expect(frame(page, tool.name)).toBeVisible();
      if (i > 0) await expect(frame(page, study.tools[i - 1].name)).toBeHidden();
      await expect
        .poll(() =>
          frame(page, tool.name)
            .locator("img")
            .evaluateAll((imgs) =>
              (imgs as HTMLImageElement[]).every(
                (img) => img.complete && img.naturalWidth > 0,
              ),
            ),
        )
        .toBe(true);
      await frames(page);
      tops.push((await stage(page).boundingBox())!.y);
    }
    // The first tool is up as the scene scrolls in; from then on the stage
    // holds the same place on screen for every tool.
    const pinned = tops[1];
    for (const top of tops.slice(1)) expect(Math.abs(top - pinned)).toBeLessThan(1);
    expect(tops[0]).toBeGreaterThanOrEqual(pinned);

    // Past the last tool, it scrolls away with the page.
    await page
      .getByRole("heading", { level: 3, name: study.sections.at(-1)!.heading })
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await frames(page);
    expect((await stage(page).boundingBox())!.y).toBeLessThan(pinned - 50);
  });

  test("the stage is a visual layer, hidden from assistive technology", async ({
    page,
  }) => {
    await expect(stage(page)).toHaveAttribute("aria-hidden", "true");
    await expect(stage(page).locator("a, button, [controls], [tabindex]")).toHaveCount(0);
  });

  test("keyboard focus on a tool's link brings that tool onto the stage", async ({
    page,
  }) => {
    const first = study.tools[0];
    const last = study.tools.at(-1)!;
    await readTool(page, first.name);
    await expect(frame(page, first.name)).toBeVisible();
    // A key press first, so the focus that follows is keyboard focus.
    await page.keyboard.press("Shift");
    await toolLink(page, last.name).evaluate((el: HTMLElement) =>
      el.focus({ preventScroll: true }),
    );
    await expect(frame(page, last.name)).toBeVisible();
    await expect(frame(page, first.name)).toBeHidden();
  });

  test("keyboard focus moving from one tool's link to another's never hands the stage back to the scroll's tool on the way", async ({
    page,
  }) => {
    const tools: readonly PlayerTool[] = study.tools;
    // The scroll's tool has a recording: handed the stage, even for a moment,
    // it would be told to play.
    const byScroll = tools.find((t) => t.recording)!;
    const [from, to] = tools.filter((t) => !t.recording).slice(-2);
    const video = frame(page, byScroll.name).locator("video");
    await readTool(page, byScroll.name);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused))
      .toBe(true);
    // A key press first, so the focus that follows is keyboard focus.
    await page.keyboard.press("Shift");
    await toolLink(page, from.name).evaluate((el: HTMLElement) =>
      el.focus({ preventScroll: true }),
    );
    await expect(frame(page, from.name)).toBeVisible();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);

    await video.evaluate((v: HTMLVideoElement) => {
      v.addEventListener("play", () => v.setAttribute("data-played", ""));
    });
    await toolLink(page, to.name).evaluate((el: HTMLElement) =>
      el.focus({ preventScroll: true }),
    );
    await expect(frame(page, to.name)).toBeVisible();
    await expect(frame(page, from.name)).toBeHidden();
    await frames(page);
    await expect(video).not.toHaveAttribute("data-played");
    await expect(frame(page, byScroll.name)).toBeHidden();
  });

  test("a link the mouse has focused doesn't hold the stage", async ({
    page,
  }) => {
    const [first, second] = study.tools;
    await readTool(page, first.name);
    // Pressed but not released: focused by the mouse, not yet followed.
    await toolLink(page, first.name).hover();
    await page.mouse.down();
    await expect(toolLink(page, first.name)).toBeFocused();
    await readTool(page, second.name);
    await expect(frame(page, second.name)).toBeVisible();
    await expect(frame(page, first.name)).toBeHidden();
  });

  test("arriving mid-section shows the right tool at once, and shifts no layout", async ({
    page,
  }) => {
    const tool = study.tools.at(-2)!;
    await readTool(page, tool.name);
    await countShifts(page);
    // A refresh lands back where the reader was.
    await page.reload();
    await expect(page.locator(playerToolsSelector)).toHaveAttribute(
      SCENE,
      SCENE_STATES.pinned,
    );
    await expect(frame(page, tool.name)).toBeVisible();
    await frames(page);
    expect(await shifted(page)).toBe(0);
  });

  test("a playing recording on the stage can be paused and played from its tool's copy", async ({
    page,
  }) => {
    const tools: readonly PlayerTool[] = study.tools;
    const tool = tools.find((t) => t.recording)!;
    const video = frame(page, tool.name).locator("video");
    await readTool(page, tool.name);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused))
      .toBe(true);

    const block = page
      .getByRole("main")
      .getByRole("region", { name: tool.name, exact: true });
    const pause = block.getByRole("button", {
      name: `Pause recording of ${tool.name}`,
    });
    await expect(pause).toBeVisible();
    await pause.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);
    const play = block.getByRole("button", {
      name: `Play recording of ${tool.name}`,
    });
    await expect(play).toBeFocused();
    await expect(frame(page, tool.name)).toBeVisible();
    // It stays paused while the reader stays on the tool.
    await page.mouse.wheel(0, 40);
    await frames(page);
    expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

    await page.keyboard.press("Enter");
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused))
      .toBe(true);
  });

  test("a tool's recording plays on the stage while it is on screen, and pauses when it goes off", async ({
    page,
  }) => {
    const tools: readonly PlayerTool[] = study.tools;
    const tool = tools.find((t) => t.recording)!;
    const video = frame(page, tool.name).locator("video");
    await readTool(page, tool.name);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused))
      .toBe(true);
    // Nothing else plays meanwhile: the recordings in the copy are out of sight.
    expect(
      await page.evaluate(
        (frame) =>
          [...document.querySelectorAll("video")].filter(
            (v) => !v.paused && !v.closest(frame),
          ).length,
        stageToolNamed(tool.name),
      ),
    ).toBe(0);
    // Back at the top of the page, the stage is far below the screen.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
      .toBe(true);
  });

  test("scrolling through the scene shifts no layout", async ({ page }) => {
    await page.evaluate(observeShifts);
    const end = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    for (let y = 0; y <= end; y += 120) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await frames(page);
    }
    for (let y = end; y >= 0; y -= 360) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await frames(page);
    }
    expect(await shifted(page)).toBe(0);
  });
});

test.describe("the Player tools scene when its scripts fail", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("falls back to the stacked list if the motion code never loads", async ({
    page,
  }) => {
    // GSAP's chunk, told apart by what's inside it.
    await page.route("**/_next/static/**/*.js", async (route) => {
      const response = await route.fetch();
      if (/GreenSock|_gsap/.test(await response.text())) await route.abort();
      else await route.fulfill({ response });
    });
    await page.goto(path);
    // The court's world starts behind the page meanwhile: in software WebGL,
    // as on CI, its first frame holds the main thread for seconds.
    await expectStacked(page, 15_000);
  });

  test("falls back to the stacked list if the page never hydrates, with no unseen keyboard stop meanwhile", async ({
    page,
  }) => {
    await page.route("**/_next/static/**/*.js", (route) => route.abort());
    await page.goto(path);
    // Laid out pinned from the first paint, the copy's recordings out of
    // sight and out of the tab order.
    await expect(page.locator(playerToolsSelector)).toHaveAttribute(
      SCENE,
      /.+/,
    );
    await expect(stage(page)).toBeVisible();
    expect(
      await page
        .locator(`${toolCopySelector} video`)
        .evaluateAll((vs) =>
          (vs as HTMLVideoElement[]).some((v) => v.controls),
        ),
    ).toBe(false);
    // Then, with nothing to run it, the stacked list.
    await expectStacked(page, 15_000);
  });
});

/** The stacked list: no stage, each tool's screenshots and recording in its copy. */
async function expectStacked(page: Page, timeout?: number) {
  await expect(page.locator(playerToolsSelector)).not.toHaveAttribute(SCENE, {
    timeout,
  });
  await expect(stage(page)).toBeHidden();
  for (const tool of study.tools) {
    const block = page
      .getByRole("main")
      .getByRole("region", { name: tool.name, exact: true });
    for (const img of await block.getByRole("img").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect(img).toBeVisible();
    }
  }
  expect(
    await page
      .locator(`${toolCopySelector} video`)
      .evaluateAll((vs) => (vs as HTMLVideoElement[]).every((v) => v.controls)),
  ).toBe(true);
}

for (const mode of [
  {
    name: "under prefers-reduced-motion",
    use: {
      viewport: { width: 1280, height: 720 },
      reducedMotion: "reduce" as const,
    },
  },
  { name: "at phone width", use: { viewport: { width: 390, height: 844 } } },
  {
    name: "with scripting off",
    use: { viewport: { width: 1280, height: 720 }, javaScriptEnabled: false },
  },
]) {
  test.describe(`the Player tools ${mode.name}`, () => {
    test.use(mode.use);

    test("are the stacked list: no stage, and every tool's screenshots in the copy", async ({
      page,
    }) => {
      await page.goto(path);
      await expect(stage(page)).toBeHidden();
      for (const tool of study.tools) {
        const block = page
          .getByRole("main")
          .getByRole("region", { name: tool.name, exact: true });
        await block.scrollIntoViewIfNeeded();
        for (const img of await block.getByRole("img").all()) {
          await img.scrollIntoViewIfNeeded();
          await expect(img).toBeVisible();
          await expect
            .poll(() =>
              img.evaluate(
                (i: HTMLImageElement) => i.complete && i.naturalWidth > 0,
              ),
            )
            .toBe(true);
        }
      }
    });
  });
}

test.describe("with scripting off", () => {
  test.use({ javaScriptEnabled: false });

  test("its Rally game link lands on the game's heading", async ({ page }) => {
    await page.goto(path);
    await page
      .getByRole("main")
      .getByRole("link", { name: rallyLink.label, exact: true })
      .click();
    await expect(page).toHaveURL(rallyLink.href);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 2 }),
    ).toHaveText(rally.heading);
  });
});

type Stop = { href: string | null; tag: string; focusVisible: boolean };

async function tab(page: Page): Promise<Stop> {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return { href: null, tag: "body", focusVisible: false };
    }
    const style = getComputedStyle(el);
    return {
      href: el.getAttribute("href"),
      tag: el.tagName.toLowerCase(),
      focusVisible:
        (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
        style.boxShadow !== "none",
    };
  });
}

async function walk(page: Page) {
  await page.goto(path);
  const siteLinks = study.links.filter(
    (l) => !study.tools.some((t) => t.url === l.href),
  );
  const expected = [
    "/",
    ...nav.map((n) => n.href),
    ...siteLinks.map((l) => l.href),
    ...study.tools.map((t) => t.url),
  ];

  const stops: Stop[] = [];
  const reached: string[] = [];
  for (let i = 0; i < 80 && reached.length < expected.length; i++) {
    const stop = await tab(page);
    stops.push(stop);
    if (stop.href) reached.push(stop.href);
  }

  expect(reached).toEqual(expected);
  for (const stop of stops.filter((s) => s.tag !== "video")) {
    expect(stop, `focus visible on ${stop.href}`).toMatchObject({
      focusVisible: true,
    });
  }
  return stops.filter((s) => s.tag === "video");
}

test("a keyboard walk reaches every link in order with visible focus", async ({
  page,
}) => {
  // The recordings stay paused: a playing video hides its controls after a
  // few seconds, taking the focus with them should a slow step let it.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videoStops = await walk(page);
  // A video is a stop, then each of its built-in controls (drawn by the browser,
  // so the video element itself only shows the ring on the first of them).
  expect(videoStops.length).toBeGreaterThan(0);
  expect(videoStops.some((s) => s.focusVisible)).toBe(true);
});

test("with the Player tools pinned, a keyboard walk reaches every link in order, never an unseen stop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(path);
  await expect(page.locator(playerToolsSelector)).toHaveAttribute(
    SCENE,
    SCENE_STATES.pinned,
  );
  // The recordings in the copy are out of sight while the stage shows them.
  expect(await walk(page)).toEqual([]);
});

test.describe("recordings", () => {
  test("never autoplay with sound, and carry a poster and a name", async ({
    page,
  }) => {
    await page.goto(path);
    const videos = await page.locator("video").evaluateAll((els) =>
      (els as HTMLVideoElement[]).map((v) => ({
        muted: v.muted,
        poster: v.poster,
        label: v.getAttribute("aria-label"),
      })),
    );
    expect(videos.length).toBeGreaterThanOrEqual(1);
    for (const v of videos) {
      expect(v.muted).toBe(true);
      expect(v.poster).not.toBe("");
      expect(v.label).toBeTruthy();
    }
  });

  test("play in the stacked list when motion is allowed", async ({ page }) => {
    // Phone width: stacked with motion allowed. The pinned stage's own
    // recordings are tested with the scene.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const video = page.locator("video").first();
    await video.scrollIntoViewIfNeeded();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused))
      .toBe(true);
  });

  test.describe("under prefers-reduced-motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("no video element is playing", async ({ page }) => {
      // Every play, from the first byte.
      await page.addInitScript(() => {
        const w = window as unknown as { __played: number };
        w.__played = 0;
        document.addEventListener("play", () => w.__played++, true);
      });
      await page.goto(path);
      const videos = page.locator("video");
      const count = await videos.count();
      expect(count).toBeGreaterThanOrEqual(1);
      // Wait for React to take the recordings over (it tags their elements),
      // so their effects are what is under test, not the server HTML.
      await expect
        .poll(() =>
          videos.evaluateAll((els) =>
            els.every((el) =>
              Object.keys(el).some((k) => k.startsWith("__reactFiber")),
            ),
          ),
        )
        .toBe(true);
      // Each on screen in turn (the stage's are not shown: nothing pins).
      const shown = page.locator("video:visible");
      for (let i = 0; i < (await shown.count()); i++) {
        await shown.nth(i).scrollIntoViewIfNeeded();
        // Visibility is reported with the next frames' rendering.
        await page.evaluate(
          () =>
            new Promise((done) =>
              requestAnimationFrame(() => requestAnimationFrame(done)),
            ),
        );
      }
      expect(
        await page.evaluate(() => ({
          played: (window as unknown as { __played: number }).__played,
          playing: Array.from(document.querySelectorAll("video")).filter(
            (v) => !v.paused,
          ).length,
        })),
      ).toEqual({ played: 0, playing: 0 });
    });
  });
});
