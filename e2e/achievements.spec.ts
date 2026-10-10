import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { EARN_EVENT, type AchievementId } from "../src/components/achievements";
import { achievements as copy } from "../src/content/site";

const counter = (page: Page, n: number) =>
  page.getByRole("contentinfo").getByRole("button", { name: `${copy.label}: ${n} ${copy.of} 6` });
const toast = (page: Page) => page.getByRole("status");
const dialog = (page: Page) => page.getByRole("dialog", { name: copy.label });

/**
 * Raises EARN_EVENT for `id`, as an Easter egg does (the Rally game, on
 * beating Dinkbot), and returns the toast's text, read in the page the moment
 * it shows: on a loaded machine one Playwright round trip can outlast the
 * toast's 5s. Raised again every 250ms until the footer hears it (hydrated);
 * empty if no toast shows within `ms`.
 */
const toastFor = (page: Page, id: AchievementId, ms = 15_000) =>
  page.evaluate(
    ([type, detail, ms]) =>
      new Promise<string>((resolve) => {
        const text = () => document.querySelector('[role="status"]')?.textContent ?? "";
        const raise = () => window.dispatchEvent(new CustomEvent(type, { detail }));
        const done = (shown: string) => {
          observer.disconnect();
          clearInterval(again);
          clearTimeout(stop);
          resolve(shown);
        };
        const observer = new MutationObserver(() => text() && done(text()));
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        const again = setInterval(raise, 250);
        const stop = setTimeout(() => done(""), ms);
        raise();
      }),
    [EARN_EVENT, id, ms] as const,
  );

test("earning Dinkbot down toasts it and First Blood together, counted in the footer and remembered", async ({
  page,
}) => {
  await page.goto("/rally");
  await expect(counter(page, 0)).toBeVisible();
  const focused = await page.evaluate(() => document.activeElement?.tagName);

  const shown = await toastFor(page, "dinkbot-down");
  expect(shown).toContain(copy.toast.many);
  expect(shown).toContain(copy.names["dinkbot-down"]);
  expect(shown).toContain(copy.names["first-blood"]);
  await expect(counter(page, 2)).toBeVisible();
  // Announced politely, and focus stays where it was.
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(focused);

  // It dismisses itself after a few seconds.
  await expect(toast(page)).toBeEmpty({ timeout: 10_000 });

  // Replaying never toasts again.
  expect(await toastFor(page, "dinkbot-down", 1_000)).toBe("");

  // Remembered on the next visit, on every page.
  await page.goto("/resume");
  await expect(counter(page, 2)).toBeVisible();
});

test("a toast holds while hovered", async ({ page }) => {
  // The page's clock, held still: the toast's 5s run out only when the test
  // steps it, so a loaded runner can't outrun the hover (or the 30s limit).
  await page.clock.install();
  await page.goto("/");
  await page.clock.pauseAt(new Date(Date.now() + 1_000));
  // Raised until the footer has hydrated and hears it.
  await expect
    .poll(() =>
      page.evaluate(([type, detail]) => {
        window.dispatchEvent(new CustomEvent(type, { detail }));
        return document.querySelector('[role="status"]')?.textContent ?? "";
      }, [EARN_EVENT, "dinkbot-down"] as const),
    )
    .toContain(copy.names["dinkbot-down"]);
  await toast(page).locator("p").hover();
  await page.clock.fastForward(7_000);
  await expect(toast(page)).toContainText(copy.names["dinkbot-down"]);
  await page.mouse.move(0, 0);
  // Its timer starts once the pointer has left: step the clock until it runs out.
  await expect(async () => {
    await page.clock.fastForward(1_000);
    await expect(toast(page)).toBeEmpty({ timeout: 200 });
  }).toPass({ timeout: 10_000 });
});

test("the counter opens the list by keyboard: unearned as ???, Esc closes it, focus back on the counter", async ({
  page,
}) => {
  await page.goto("/resume");
  await toastFor(page, "dinkbot-down");
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
  expect(await toastFor(page, "dinkbot-down")).toContain(copy.names["dinkbot-down"]);
  await expect(counter(page, 2)).toBeVisible();
});
