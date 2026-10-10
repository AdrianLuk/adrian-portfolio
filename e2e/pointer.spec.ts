import { expect, test, type Page } from "@playwright/test";
import { contact, highlightAnchor, highlights } from "../src/content/site";
import { openHome } from "./hero";

// Each group visits home once: the world compiles in software WebGL, the
// slow part.
test.describe.configure({ mode: "serial", timeout: 60_000 });

const firstPanel = (page: Page) =>
  page.locator(`#${highlightAnchor(highlights[0].id)}`);

/** Scrolls the first panel into view and puts the mouse near its right edge. */
async function hoverPanelEdge(page: Page) {
  const panel = firstPanel(page);
  await panel.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await panel.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.5, {
    steps: 4,
  });
  return panel;
}

const inlineTransform = (page: Page) =>
  firstPanel(page).evaluate((el) => el.style.transform);

// Home's world is live under these tests: on CI's software WebGL one look at
// the page can take about 3s, so the default 5s gets a single, early look.
const expectLive = expect.configure({ timeout: 15_000 });

test.describe("with motion allowed and a mouse", () => {
  let page: Page;
  test.beforeAll(async ({ browser }, testInfo) => {
    page = await openHome(browser, testInfo, {
      viewport: { width: 1280, height: 800 },
      skip: true,
      until: "settled",
    });
  });
  test.afterAll(() => page?.context().close());

  test("a Highlight's panel tilts toward the pointer, a few degrees, and levels as it leaves", async () => {
    await hoverPanelEdge(page);
    await expectLive.poll(() => inlineTransform(page)).toMatch(
      // Near the right edge, half way down: turned about y by most of the
      // five degrees, and hardly at all about x.
      /^perspective\(1200px\) rotateX\(-?0(\.\d+)?deg\) rotateY\(4(\.\d+)?deg\)$/,
    );
    // Off the panels (onto the nav bar): level again.
    await page.mouse.move(8, 8, { steps: 2 });
    await expectLive.poll(() => inlineTransform(page)).toBe("");
    await expectLive(firstPanel(page)).toHaveCSS("transform", "none");
  });

  test("the scroll route's sideways shift and the tilt keep to their own properties", async () => {
    await hoverPanelEdge(page);
    await expectLive.poll(() => inlineTransform(page)).not.toBe("");
    const translate = await firstPanel(page).evaluate((el) => el.style.translate);
    expect(translate).not.toContain("rotate");
    await page.mouse.move(8, 8);
  });

  test("a link glows as the pointer comes onto it", async () => {
    const link = page
      .locator("#contact")
      .getByRole("link", { name: contact.built.source.label });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toHaveCSS("text-shadow", "none");
    await link.hover();
    await expect
      .poll(() => link.evaluate((el) => getComputedStyle(el).textShadow))
      .toMatch(/14px/);
  });
});

test.describe("under reduced motion", () => {
  let page: Page;
  test.beforeAll(async ({ browser }, testInfo) => {
    page = await openHome(browser, testInfo, {
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
      until: "reduced",
    });
  });
  test.afterAll(() => page?.context().close());

  test("the panels never tilt", async () => {
    await hoverPanelEdge(page);
    // Long enough for a frame's tilt to have been written.
    await page.waitForTimeout(300);
    expect(await inlineTransform(page)).toBe("");
    await expect(firstPanel(page)).toHaveCSS("transform", "none");
  });

  test("a link still brightens on hover, at once", async () => {
    const link = page
      .locator("#contact")
      .getByRole("link", { name: contact.built.source.label });
    await link.hover();
    await expect(link).toHaveCSS("text-shadow", /14px/);
  });
});
