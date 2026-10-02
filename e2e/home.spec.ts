import { expect, test, type Page } from "@playwright/test";
import {
  contact,
  hero,
  highlights,
  hrefFor,
  nav,
  person,
} from "../src/content/site";

test.describe("before any script runs", () => {
  test.use({ javaScriptEnabled: false });

  test("the H1 is the full name", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      person.name,
    );
  });

  test("the hero and every Highlight heading are server-rendered", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(hero.titleLine)).toBeVisible();
    await expect(page.getByText(hero.backendLine)).toBeVisible();
    const headings = page.locator("#work").getByRole("heading", { level: 3 });
    await expect(headings).toHaveText(highlights.map((h) => h.title));
  });
});

type Stop = { href: string | null; focusVisible: boolean };

async function tabTo(page: Page): Promise<Stop> {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { href: null, focusVisible: false };
    const style = getComputedStyle(el);
    const outline =
      style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow !== "none";
    return { href: el.getAttribute("href"), focusVisible: outline || shadow };
  });
}

test("a keyboard walk reaches every stop in order with visible focus", async ({
  page,
}) => {
  await page.goto("/");

  const expected = [
    "/",
    ...nav.map((n) => n.href),
    hero.primaryAction.href,
    ...highlights.map((h) => hrefFor(h.link)),
    ...contact.channels.map((c) => c.href),
  ];

  const stops: Stop[] = [];
  for (let i = 0; i < expected.length; i++) stops.push(await tabTo(page));

  expect(stops.map((s) => s.href)).toEqual(expected);
  for (const stop of stops) {
    expect(stop, `focus visible on ${stop.href}`).toMatchObject({
      focusVisible: true,
    });
  }
});

test("'See the work' takes the visitor to the Highlights", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: hero.primaryAction.label }).click();
  await expect(page).toHaveURL(/#work$/);
  await expect(
    page.getByRole("heading", { name: highlights[0].title }),
  ).toBeInViewport();
});

test("the outpost closes on the bookend line", async ({ page }) => {
  await page.goto("/");
  const outpost = page.locator("#contact");
  await expect(outpost.getByText(contact.bookend)).toBeVisible();
  await expect(page.getByText("Fin.", { exact: false })).toHaveCount(0);
});
