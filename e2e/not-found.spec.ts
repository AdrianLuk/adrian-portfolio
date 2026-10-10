import { expect, test, type Page } from "@playwright/test";
import { achievements, notFound } from "../src/content/site";

const missing = "/this-page-does-not-exist";
const { variants } = notFound;

const heading = (page: Page, i: number) =>
  page.getByRole("heading", { name: variants[i].heading });
const another = (page: Page) => page.getByRole("button", { name: notFound.next });
const home = (page: Page) =>
  page.getByRole("main").getByRole("link", { name: notFound.homeLink });
/** The announcement the button leaves in the polite live region. */
const announced = (page: Page) => page.locator("p[aria-live=polite]");
const counter = (page: Page, n: number) =>
  page
    .getByRole("contentinfo")
    .getByRole("button", { name: `${achievements.label}: ${n} ${achievements.of} 6` });

test("opens on the first variant, and the button takes the next, round to the first", async ({
  page,
}) => {
  await page.goto(missing);
  await expect(heading(page, 0)).toBeVisible();
  await expect(page.getByText(variants[0].line, { exact: true })).toBeVisible();
  for (const i of [1, 2, 3, 4, 0]) {
    await another(page).click();
    await expect(heading(page, i)).toBeVisible();
    await expect(page.getByText(variants[i].line, { exact: true })).toBeVisible();
    // The others are out of sight and out of the accessibility tree.
    await expect(page.getByRole("main").getByRole("heading")).toHaveCount(1);
  }
});

test("the button works by keyboard, announces the change and keeps focus", async ({ page }) => {
  await page.goto(missing);
  await expect(heading(page, 0)).toBeVisible();
  await expect(announced(page)).toBeEmpty();
  await another(page).focus();
  await page.keyboard.press("Enter");
  await expect(heading(page, 1)).toBeVisible();
  await expect(announced(page)).toHaveText(`${variants[1].heading}. ${variants[1].line}`);
  await expect(another(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText(`${variants[2].heading}. ${variants[2].line}`);
  await expect(another(page)).toBeFocused();
});

test("each visit opens on the next variant in this browser's order", async ({ page }) => {
  await page.goto(missing);
  await expect(heading(page, 0)).toBeVisible();
  await page.goto(missing);
  await expect(heading(page, 1)).toBeVisible();
  // The button counts as a showing too.
  await another(page).click();
  await expect(heading(page, 2)).toBeVisible();
  await page.goto(missing);
  await expect(heading(page, 3)).toBeVisible();
});

test("the home link sits in the same place on every variant and goes home", async ({
  page,
}) => {
  await page.goto(missing);
  await expect(heading(page, 0)).toBeVisible();
  const where = await home(page).boundingBox();
  for (const i of [1, 2, 3, 4]) {
    await another(page).click();
    await expect(heading(page, i)).toBeVisible();
    expect(await home(page).boundingBox()).toEqual(where);
  }
  await home(page).click();
  await expect(page).toHaveURL("/");
});

test("with storage unavailable, it still renders a variant and the button still cycles", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
  await page.goto(missing);
  await expect(heading(page, 0)).toBeVisible();
  await another(page).click();
  await expect(heading(page, 1)).toBeVisible();
});

test("seeing all five earns Full rotation, with First Blood, once", async ({ page }) => {
  await page.goto(missing);
  await expect(heading(page, 0)).toBeVisible();
  for (const i of [1, 2, 3]) {
    await another(page).click();
    await expect(heading(page, i)).toBeVisible();
  }
  await expect(counter(page, 0)).toBeVisible();
  await another(page).click();
  await expect(heading(page, 4)).toBeVisible();
  await expect(page.getByRole("status")).toContainText(achievements.names["full-rotation"]);
  await expect(counter(page, 2)).toBeVisible();
});

test("arriving as the fifth showing earns Full rotation too", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("not-found-variants", JSON.stringify({ shown: 4, seen: [0, 1, 2, 3] })));
  await page.goto(missing);
  await expect(heading(page, 4)).toBeVisible();
  await expect(page.getByRole("status")).toContainText(achievements.names["full-rotation"]);
  await expect(counter(page, 2)).toBeVisible();
});

test.describe("under reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the button cycles, announces and keeps the home link in place", async ({ page }) => {
    await page.goto(missing);
    await expect(heading(page, 0)).toBeVisible();
    const where = await home(page).boundingBox();
    for (const i of [1, 2, 3, 4]) {
      await another(page).click();
      await expect(heading(page, i)).toBeVisible();
      await expect(announced(page)).toHaveText(`${variants[i].heading}. ${variants[i].line}`);
      await expect(another(page)).toBeFocused();
      expect(await home(page).boundingBox()).toEqual(where);
    }
  });
});

test.describe("without scripts", () => {
  test.use({ javaScriptEnabled: false });

  test("the first variant and the home link are there, and the dead button is not", async ({
    page,
  }) => {
    await page.goto(missing);
    await expect(heading(page, 0)).toBeVisible();
    await expect(page.getByText(variants[0].line, { exact: true })).toBeVisible();
    await expect(home(page)).toBeVisible();
    await expect(another(page)).toBeHidden();
  });
});

test.describe("on touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("tapping the button shows the next variant", async ({ page }) => {
    await page.goto(missing);
    await expect(heading(page, 0)).toBeVisible();
    await another(page).tap();
    await expect(heading(page, 1)).toBeVisible();
  });
});

/** The backdrop's still and its motes' layer: how far each is shifted (px), none if not at all. */
const shifts = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-backdrop] > *")).map((el) => {
      const { translate, scale } = getComputedStyle(el);
      return { translate: translate === "none" ? [] : translate.split(" ").map(parseFloat), scale };
    }),
  );

/** A pointer move of `pointerType` to the screen's bottom right, as the page hears it. */
const move = (page: Page, pointerType: string) =>
  page.evaluate(
    (pointerType) =>
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerType,
          clientX: innerWidth - 4,
          clientY: innerHeight - 4,
        }),
      ),
    pointerType,
  );

test.describe("the backdrop's parallax", () => {
  test("shifts the still and its motes toward a mouse, and back to the middle", async ({ page }) => {
    await page.goto(missing);
    await expect(heading(page, 0)).toBeVisible();
    const at = (x: number) => page.mouse.move(x * page.viewportSize()!.width, x * page.viewportSize()!.height, { steps: 3 });
    expect((await shifts(page)).every((s) => s.translate.every((v) => v === 0))).toBe(true);
    await at(0.99);
    await expect
      .poll(async () => (await shifts(page)).filter((s) => s.translate.every((v) => v > 0)).length)
      .toBe(3); // the still, the dimming layer and the motes
    await at(0.5);
    await expect
      .poll(async () => (await shifts(page)).every((s) => s.translate.every((v) => Math.abs(v) < 0.5)))
      .toBe(true);
  });

  test("a pen leans it, a touch does not", async ({ page }) => {
    await page.goto(missing);
    await expect(heading(page, 0)).toBeVisible();
    await move(page, "touch");
    await page.waitForTimeout(500);
    expect((await shifts(page)).every((s) => s.translate.every((v) => v === 0))).toBe(true);
    await move(page, "pen");
    await expect
      .poll(async () => (await shifts(page)).some((s) => s.translate.some((v) => v > 0)))
      .toBe(true);
  });

  test("is off under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(missing);
    await expect(heading(page, 0)).toBeVisible();
    await move(page, "mouse");
    await page.waitForTimeout(500);
    // Neither shifted nor scaled up.
    expect(
      (await shifts(page)).every((s) => s.translate.length === 0 && s.scale === "none"),
    ).toBe(true);
  });

  test("does not apply to the Rally game's page", async ({ page }) => {
    await page.goto("/play");
    await move(page, "mouse");
    await page.waitForTimeout(500);
    await expect(page.locator("[data-parallax]")).toHaveCount(0);
    expect((await shifts(page)).every((s) => s.translate.length === 0 && s.scale === "none")).toBe(true);
  });
});
