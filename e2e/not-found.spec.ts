import { expect, test, type Page } from "@playwright/test";
import { HOLD_MS } from "../src/components/recall-hold";
import { achievements, notFound } from "../src/content/site";

const missing = "/this-page-does-not-exist";
const { variants } = notFound;

const heading = (page: Page, i: number) =>
  page.getByRole("heading", { name: variants[i].heading });
const another = (page: Page) => page.getByRole("button", { name: notFound.next });
const home = (page: Page) =>
  page.getByRole("main").getByRole("link", { name: notFound.homeLink });
/** The announcement the button leaves in the polite live region. */
const announced = (page: Page) => page.getByRole("main").locator("p[aria-live=polite]");
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

test("the content is centred, the home link first, and both are filled buttons at least 44px high", async ({
  page,
}) => {
  await page.goto(missing);
  await expect(heading(page, 0)).toBeVisible();
  const box = async (locator: ReturnType<typeof home>) => (await locator.boundingBox())!;
  const middle = (b: { x: number; width: number }) => b.x + b.width / 2;
  const screen = await page.evaluate(() => document.documentElement.clientWidth / 2);
  const [title, homeBox, anotherBox] = [
    await box(heading(page, 0)),
    await box(home(page)),
    await box(another(page)),
  ];
  expect(Math.abs(middle(title) - screen)).toBeLessThan(3);
  // The pair together: side by side on a wide screen, one above the other on a phone.
  const left = Math.min(homeBox.x, anotherBox.x);
  const right = Math.max(homeBox.x + homeBox.width, anotherBox.x + anotherBox.width);
  expect(Math.abs((left + right) / 2 - screen)).toBeLessThan(3);
  expect(homeBox.x < anotherBox.x || homeBox.y < anotherBox.y).toBe(true);
  for (const button of [home(page), another(page)]) {
    expect((await box(button)).height).toBeGreaterThanOrEqual(44);
    await expect(button).toHaveCSS("background-color", "rgb(61, 242, 230)");
    await expect(button).toHaveCSS("color", "rgb(11, 16, 38)");
  }
});

/** Opens the 404 on League of Legends' variant, whose line and Recall button can be held. */
const openOnLeague = async (page: Page) => {
  await page.addInitScript(() =>
    localStorage.setItem("not-found-variants", JSON.stringify({ shown: 2, seen: [0, 1] })),
  );
  await page.goto(missing);
  await expect(heading(page, 2)).toBeVisible();
  return page.getByRole("button", { name: notFound.recall.label, exact: true });
};
const line = (page: Page) => page.getByText(variants[2].line, { exact: true });
const ring = (page: Page) => page.getByRole("progressbar", { name: notFound.recall.label });
/** How far the lit arc has swept, 0 to 1. */
const swept = (page: Page) =>
  page
    .locator("[data-recall-fill]")
    .evaluate((el) => 1 - parseFloat(getComputedStyle(el).strokeDashoffset) / 100);

test.describe("holding Recall", () => {
  test("only that variant has the button, with its hint", async ({ page }) => {
    await page.goto(missing);
    await expect(heading(page, 0)).toBeVisible();
    await expect(page.getByRole("button", { name: notFound.recall.label })).toHaveCount(0);
    const recall = await openOnLeague(page);
    await expect(recall).toHaveAccessibleDescription(notFound.recall.hint);
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "0");
  });

  test("a mouse held on the button for the whole time goes home; the ring sweeps and glows, with motes", async ({
    page,
  }) => {
    const recall = await openOnLeague(page);
    expect(await swept(page)).toBe(0);
    await recall.hover();
    await page.mouse.down();
    await expect(announced(page)).toHaveText(notFound.recall.start);
    await page.waitForTimeout(HOLD_MS / 2);
    const half = await swept(page);
    expect(half).toBeGreaterThan(0.1);
    expect(half).toBeLessThan(0.9);
    await expect(page.locator(".recall-ring")).toHaveCSS("animation-name", "recall-glow");
    expect(await page.locator(".recall-mote:visible").count()).toBeGreaterThan(0);
    // The value is told in steps, not every frame.
    expect(Number(await ring(page).getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    await expect(page).toHaveURL("/", { timeout: HOLD_MS + 8000 });
    await page.mouse.up();
  });

  test("holding the line itself does the same", async ({ page }) => {
    await openOnLeague(page);
    await line(page).hover();
    await page.mouse.down();
    await expect(announced(page)).toHaveText(notFound.recall.start);
    await expect(page).toHaveURL("/", { timeout: HOLD_MS + 10_000 });
    await page.mouse.up();
  });

  test("letting go early cancels it, drains the ring and leaves the visitor on the 404", async ({
    page,
  }) => {
    const recall = await openOnLeague(page);
    await recall.hover();
    await page.mouse.down();
    await page.waitForTimeout(1000);
    expect(await swept(page)).toBeGreaterThan(0);
    await page.mouse.up();
    await expect(announced(page)).toHaveText(notFound.recall.cancel);
    await expect.poll(() => swept(page)).toBe(0);
    await expect(ring(page)).toHaveAttribute("aria-valuenow", "0");
    await page.waitForTimeout(HOLD_MS);
    await expect(page).toHaveURL(missing);
    await expect(heading(page, 2)).toBeVisible();
  });

  test("Space held on the button goes home, and let go early cancels", async ({ page }) => {
    const recall = await openOnLeague(page);
    await recall.focus();
    await page.keyboard.down("Space");
    await page.waitForTimeout(500);
    await page.keyboard.up("Space");
    await expect(announced(page)).toHaveText(notFound.recall.cancel);
    await page.keyboard.down("Enter");
    await expect(page).toHaveURL("/", { timeout: HOLD_MS + 10_000 });
    await page.keyboard.up("Enter");
  });

  test("a touch held on it goes home", async ({ page }) => {
    const recall = await openOnLeague(page);
    await recall.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, isPrimary: true });
    await expect(announced(page)).toHaveText(notFound.recall.start);
    await expect(page).toHaveURL("/", { timeout: HOLD_MS + 10_000 });
  });

  test("earns no achievement", async ({ page }) => {
    const recall = await openOnLeague(page);
    await recall.hover();
    await page.mouse.down();
    await expect(page).toHaveURL("/", { timeout: HOLD_MS + 10_000 });
    await page.mouse.up();
    await expect(counter(page, 0)).toBeVisible();
  });

  test("the home link stays where it is on every variant, Recall button or not", async ({
    page,
  }) => {
    const recall = await openOnLeague(page);
    await expect(recall).toBeVisible();
    const where = await home(page).boundingBox();
    for (const i of [3, 4, 0]) {
      await another(page).click();
      await expect(heading(page, i)).toBeVisible();
      expect(await home(page).boundingBox()).toEqual(where);
    }
  });

  test.describe("under reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the ring still sweeps as it is held, with no glow pulse and no motes, and it goes home", async ({
      page,
    }) => {
      const recall = await openOnLeague(page);
      await recall.hover();
      await page.mouse.down();
      await page.waitForTimeout(HOLD_MS / 2);
      const half = await swept(page);
      expect(half).toBeGreaterThan(0.1);
      expect(half).toBeLessThan(0.9);
      await expect(page.locator(".recall-ring")).toHaveCSS("animation-name", "none");
      expect(await page.locator(".recall-mote:visible").count()).toBe(0);
      await expect(page).toHaveURL("/", { timeout: HOLD_MS + 8000 });
      await page.mouse.up();
    });
  });
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
    await page.goto("/rally");
    await move(page, "mouse");
    await page.waitForTimeout(500);
    await expect(page.locator("[data-parallax]")).toHaveCount(0);
    expect((await shifts(page)).every((s) => s.translate.length === 0 && s.scale === "none")).toBe(true);
  });
});
