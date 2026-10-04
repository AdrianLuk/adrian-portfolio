import { expect, test, type Page } from "@playwright/test";
import { caseStudies, hrefFor, nav } from "../src/content/site";

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
    [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.src),
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
  expect(names).toHaveLength(study.links.length);
  expect(names.every((n) => n && n.length > 0)).toBe(true);
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

test("a keyboard walk reaches every link in order with visible focus", async ({
  page,
}) => {
  // The recordings stay paused: a playing video hides its controls after a
  // few seconds, taking the focus with them should a slow step let it.
  await page.emulateMedia({ reducedMotion: "reduce" });
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
  // A video is a stop, then each of its built-in controls (drawn by the browser,
  // so the video element itself only shows the ring on the first of them).
  const videoStops = stops.filter((s) => s.tag === "video");
  expect(videoStops.length).toBeGreaterThan(0);
  expect(videoStops.some((s) => s.focusVisible)).toBe(true);
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

  test("play when motion is allowed", async ({ page }) => {
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
      for (let i = 0; i < count; i++) {
        await videos.nth(i).scrollIntoViewIfNeeded();
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
