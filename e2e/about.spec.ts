import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { about, achievements, derbyLink, nav, rallyLink } from "../src/content/site";
import { SCENE_TIMEOUT, withoutWorld } from "./hero";

// The About page: Adrian outside work, along the Hobby route (the court, the
// Diamond, the Arena), over the world live behind it.

const world = (page: Page) => page.locator("[data-world]:has(> canvas)");
const sections = [about.pickleball, about.baseball, about.kpop, about.gaming];

/**
 * Waits for the world to have drawn: it compiles on the page's main thread
 * (in software WebGL on CI), which holds up any look at the page meanwhile.
 */
const settled = (page: Page) =>
  expect(world(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });

test("the header links to the About page, which opens on the intro, then each hobby in order, its lines as bullets", async ({
  page,
}) => {
  // Home's world, then the About page's: two compiles in software on CI.
  test.setTimeout(90_000);
  await page.goto("/");
  const link = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "About" });
  await expect(link).toHaveAttribute("href", "/about");
  expect(nav.map((item) => item.href)).toContain("/about");
  await link.click();
  await expect(page).toHaveURL(/\/about$/);
  await settled(page);

  const heading = page.getByRole("heading", { level: 1, name: about.heading });
  await expect(heading).toBeVisible();
  for (const paragraph of about.intro) {
    await expect(page.getByText(paragraph)).toBeVisible();
  }
  // The intro first, then the hobbies in the route's order.
  let above = (await page.getByText(about.intro.at(-1)!).boundingBox())!.y;
  for (const section of sections) {
    const panel = page.locator(`#${section.id}`);
    await expect(
      panel.getByRole("heading", { level: 2, name: section.heading }),
    ).toBeVisible();
    for (const line of section.lines) {
      await expect(panel.getByRole("listitem").filter({ hasText: line })).toBeVisible();
    }
    const top = (await panel.boundingBox())!.y;
    expect(top).toBeGreaterThan(above);
    above = top;
  }
});

test("pickleball links into the Rally game and the Case study; baseball into the Derby; K-pop shows the ticket wall", async ({
  page,
}) => {
  await page.goto("/about");
  await settled(page);
  const pickleball = page.locator(`#${about.pickleball.id}`);
  await expect(pickleball.getByRole("link", { name: rallyLink.label })).toHaveAttribute("href", "/rally");
  await expect(
    pickleball.getByRole("link", { name: about.pickleball.caseStudy.label }),
  ).toHaveAttribute("href", about.pickleball.caseStudy.href);
  await expect(pickleball.locator("video, img").first()).toBeAttached();
  const baseball = page.locator(`#${about.baseball.id}`);
  await expect(baseball.getByRole("link", { name: derbyLink.label })).toHaveAttribute("href", "/derby");
  await expect(baseball.locator("video, img").first()).toBeAttached();
  const kpop = page.locator(`#${about.kpop.id}`);
  await expect(kpop.getByRole("list", { name: "Concert tickets" }).getByRole("listitem")).toHaveCount(10);
});

test("reaching the K-pop panel earns Encore!, without WebGL and under reduced motion too", async ({
  page,
}) => {
  await withoutWorld(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about");
  await page.locator(`#${about.kpop.id}`).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
  await expect(page.getByRole("status")).toContainText(achievements.names.encore);
});

test("the world draws live behind the page, held fixed as it scrolls, over the court's still", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/about");
  await expect(page.locator('[data-backdrop="court"]')).toHaveCount(1);
  await expect(world(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const box = await world(page).locator("canvas").boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0 });
});

test("without WebGL the court's still stays, every section reads, and the scroll still lights each panel", async ({
  page,
}) => {
  await withoutWorld(page);
  await page.goto("/about");
  await expect(world(page)).toHaveAttribute("data-world", "unavailable");
  await expect(page.locator('[data-backdrop="court"] img')).toBeVisible();
  const kpop = page.locator(`#${about.kpop.id}`);
  await kpop.scrollIntoViewIfNeeded();
  await expect(kpop).toHaveAttribute("data-lit", "", { timeout: 10_000 });
});

test("a lost GPU context falls back to the court's still, and a restored one draws again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/about");
  await expect(world(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
  /** Loses or restores the canvas's context, as a GPU reset would (as skyline.spec.ts does). */
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
  await expect
    .poll(() => world(page).locator("canvas").evaluate((c) => getComputedStyle(c).opacity))
    .toBe("0");
  await expect(page.locator('[data-backdrop="court"] img')).toBeVisible();
  await context("restoreContext");
  await expect(world(page)).toHaveAttribute("data-world", "drawn", {
    timeout: SCENE_TIMEOUT,
  });
});

test("under reduced motion the page is whole and still, and axe-clean", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/about");
  await settled(page);
  for (const section of sections) {
    await expect(page.locator(`#${section.id}`)).toBeVisible();
  }
  // The camera's gaps close up, and each stop stands behind its panel as a still.
  const stills = ["route-juice-bros", "route-diamond", "arena", "arena"];
  for (const [i, section] of sections.entries()) {
    const panel = page.locator(`#${section.id}`);
    await panel.scrollIntoViewIfNeeded();
    const img = panel.locator(`xpath=../div[@data-backdrop="${stills[i]}"]/picture/img`);
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
      .toBeGreaterThan(0);
    if (i === 0) continue;
    const [above, box] = await Promise.all([
      page.locator(`#${sections[i - 1].id}`).boundingBox(),
      panel.boundingBox(),
    ]);
    expect(box!.y - (above!.y + above!.height)).toBeLessThan(100);
  }
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await context.close();
});
