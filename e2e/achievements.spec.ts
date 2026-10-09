import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { EARN_EVENT, type AchievementId } from "../src/components/achievements";
import { achievements as copy } from "../src/content/site";

const counter = (page: Page, n: number) =>
  page.getByRole("contentinfo").getByRole("button", { name: `${copy.label}: ${n} ${copy.of} 6` });
const toast = (page: Page) => page.getByRole("status");
const dialog = (page: Page) => page.getByRole("dialog", { name: copy.label });

/** Raises EARN_EVENT for `id`, as an Easter egg does (the Rally game, on beating Dinkbot). */
const raise = (page: Page, id: AchievementId) =>
  page.evaluate(
    ([type, detail]) => window.dispatchEvent(new CustomEvent(type, { detail })),
    [EARN_EVENT, id],
  );

/** Earns `id`, retrying until the footer is listening and counts `n`. */
async function earn(page: Page, id: AchievementId, n: number) {
  await expect(async () => {
    await raise(page, id);
    await expect(counter(page, n)).toBeVisible({ timeout: 500 });
  }).toPass();
}

test("earning Dinkbot down toasts it and First Blood together, counted in the footer and remembered", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(counter(page, 0)).toBeVisible();
  const focused = await page.evaluate(() => document.activeElement?.tagName);

  await earn(page, "dinkbot-down", 2);
  await expect(toast(page)).toContainText(copy.toast.many);
  await expect(toast(page)).toContainText(copy.names["dinkbot-down"]);
  await expect(toast(page)).toContainText(copy.names["first-blood"]);
  // Announced politely, and focus stays where it was.
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(focused);

  // It dismisses itself after a few seconds.
  await expect(toast(page)).toBeEmpty({ timeout: 10_000 });

  // Replaying never toasts again.
  await raise(page, "dinkbot-down");
  await page.waitForTimeout(500);
  await expect(toast(page)).toBeEmpty();

  // Remembered on the next visit, on every page.
  await page.goto("/resume");
  await expect(counter(page, 2)).toBeVisible();
});

test("a toast holds while hovered", async ({ page }) => {
  await page.goto("/");
  await earn(page, "dinkbot-down", 2);
  await toast(page).hover();
  await page.waitForTimeout(7_000);
  await expect(toast(page)).toContainText(copy.names["dinkbot-down"]);
  await page.mouse.move(0, 0);
  await expect(toast(page)).toBeEmpty({ timeout: 10_000 });
});

test("the counter opens the list by keyboard: unearned as ???, Esc closes it, focus back on the counter", async ({
  page,
}) => {
  await page.goto("/resume");
  await earn(page, "dinkbot-down", 2);
  const button = counter(page, 2);
  await button.focus();
  await page.keyboard.press("Enter");

  await expect(dialog(page)).toBeVisible();
  expect(await dialog(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
  // Unearned entries read "???" (and "not earned yet" to a screen reader).
  const unearned = /^\?\?\?/;
  await expect(dialog(page).getByRole("listitem")).toHaveText([
    copy.names["first-blood"],
    unearned,
    unearned,
    unearned,
    unearned,
    copy.names["dinkbot-down"],
  ]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(button).toBeFocused();
});

test.describe("on touch", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("tapping the counter opens the list, and Close closes it", async ({ page }) => {
    await page.goto("/resume");
    await expect(async () => {
      await counter(page, 0).tap();
      await expect(dialog(page)).toBeVisible({ timeout: 500 });
    }).toPass();
    await expect(dialog(page).getByRole("listitem")).toHaveCount(6);
    await dialog(page).getByRole("button", { name: copy.close }).tap();
    await expect(dialog(page)).toBeHidden();
  });
});

test("with storage unavailable, the site still works and the visit's progress counts", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await earn(page, "dinkbot-down", 2);
  await expect(toast(page)).toContainText(copy.names["dinkbot-down"]);
});
