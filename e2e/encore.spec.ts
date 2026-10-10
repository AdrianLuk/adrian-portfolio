import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { achievements, contact, encore } from "../src/content/site";
import { openHome, withoutWorld } from "./hero";

// The camera's way into the Arena, the show's timing and the lightsticks are
// held by unit tests (camera-director.test.ts, arena.test.ts); these check
// the page: the stretch past the bookend, the ticket wall, "One more song",
// the Achievement, and how it stands under reduced motion and without WebGL.

const section = (page: Page) =>
  page.getByRole("region", { name: encore.heading });
const wall = (page: Page) => page.getByRole("list", { name: encore.wallLabel });
const replay = (page: Page) => page.getByRole("button", { name: encore.replay });
const still = (page: Page) => section(page).locator('[data-backdrop="arena"] img');

/** Scrolls to the foot of home, the Encore, as a reader keeps going past the end. */
const reach = (page: Page) =>
  page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

/** How the wall's last ticket lights: its animation and how long it waits its turn. */
const lastLight = (page: Page) =>
  wall(page)
    .getByRole("listitem")
    .last()
    .evaluate((li) => {
      const style = getComputedStyle(li);
      return { name: style.animationName, delay: style.animationDelay };
    });

/**
 * Presses "One more song" by `press` and waits for the wall to light again:
 * its tickets afresh (the list is drawn anew, so their light runs again from
 * the first), the last waiting its turn. Read off the page as it stands, not
 * the animations' two seconds, which a starved runner's round trips outlast.
 */
async function replays(page: Page, press: () => Promise<void>) {
  await wall(page).getByRole("listitem").first().evaluate((li) => li.setAttribute("data-sung", ""));
  await press();
  await expect(wall(page).locator("li[data-sung]")).toHaveCount(0);
  await expect(wall(page).getByRole("listitem")).toHaveCount(encore.tickets.length);
  expect((await lastLight(page)).name).toBe("ticket-on");
}

/** How many of the wall's tickets are lighting up on the clock now. */
const lighting = (page: Page) =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => a instanceof CSSAnimation && a.animationName === "ticket-on")
        .length,
  );

test.describe("with motion allowed, the world live", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    page = await openHome(browser, testInfo, {
      viewport: { width: 960, height: 600 },
      skip: true,
      until: "settled",
    });
  });
  test.afterAll(() => page?.context().close());

  test("past the closing bookend, the Contact section's last word, home keeps going into the Encore", async () => {
    const order = await page.evaluate((id) => {
      const contactSection = document.getElementById("contact")!;
      const last = contactSection.lastElementChild?.textContent?.trim();
      const next = contactSection.nextElementSibling?.id;
      return { last, next: next === id };
    }, encore.id);
    expect(order).toEqual({ last: contact.bookend, next: true });
    // The wall reads from the first paint, before it's reached.
    await expect(wall(page).getByRole("listitem")).toHaveText(
      encore.tickets.map((t) => new RegExp(`${t.group}\\s*${t.year}`)),
    );
    await expect(section(page)).not.toHaveAttribute("data-reached");
  });

  test("reaching it earns Encore!, lights the tickets one after another over the live world, and is axe-clean", async () => {
    await reach(page);
    await expect(page.getByRole("status")).toContainText(achievements.names.encore);
    await expect(section(page)).toHaveAttribute("data-reached", "true");
    // The live world stands behind it: no still.
    await expect(still(page)).toBeHidden();
    // One after another: the last waits its turn behind the other nine.
    expect(await lastLight(page)).toEqual({
      name: "ticket-on",
      delay: `${((encore.tickets.length - 1) * 150) / 1000}s`,
    });
    const results = await new AxeBuilder({ page }).include(`#${encore.id}`).analyze();
    expect(results.violations).toEqual([]);
  });

  test('"One more song" replays it by keyboard', async () => {
    await replays(page, async () => {
      await replay(page).focus();
      await page.keyboard.press("Enter");
    });
  });
});

test('"One more song" replays it by touch, without WebGL, the wall over the Arena\'s still', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await withoutWorld(page);
  await page.goto("/");
  await reach(page);
  await expect(section(page)).toHaveAttribute("data-reached", "true");
  await expect(still(page)).toBeVisible();
  await expect.poll(() => still(page).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(wall(page)).toBeVisible();
  await replays(page, () => replay(page).tap());
  await context.close();
});

test("under reduced motion the tickets light at once, with nothing to replay, over the still; axe-clean", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await reach(page);
  await expect(section(page)).toHaveAttribute("data-reached", "true");
  await expect(page.getByRole("status")).toContainText(achievements.names.encore);
  expect(await lighting(page)).toBe(0);
  expect((await lastLight(page)).name).toBe("none");
  await expect(replay(page)).toBeHidden();
  await expect(still(page)).toBeVisible();
  const shadow = await wall(page)
    .getByRole("listitem")
    .first()
    .evaluate((li) => getComputedStyle(li).boxShadow);
  expect(shadow).not.toBe("none");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
