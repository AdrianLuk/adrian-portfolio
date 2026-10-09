import { expect, test, type Page } from "@playwright/test";
import {
  caseStudies,
  contact,
  credits,
  footer,
  hero,
  highlightAnchor,
  highlights,
  hrefFor,
  linkLabelFor,
  nav,
  person,
  rally,
  rallyLink,
  roles,
  type Highlight,
} from "../src/content/site";
import { withoutWorld } from "./hero";

// Content and navigation, not the opening or the world (flight, world and
// route specs cover those): the still hero, without WebGL, loads at once,
// and nothing moves or competes for the CPU under the tests.
test.use({ reducedMotion: "reduce" });
test.beforeEach(({ page }) => withoutWorld(page));

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

  test("Juice Bros' panel alone has a second link, to the Rally game", async ({
    page,
  }) => {
    await page.goto("/");
    for (const highlight of highlights) {
      const links = page
        .locator(`#${highlightAnchor(highlight.id)}`)
        .getByRole("link");
      if (highlight.id !== "juice-bros") {
        await expect(links).toHaveCount(1);
        continue;
      }
      await expect(links).toHaveCount(2);
      await expect(links.nth(1)).toHaveText(rallyLink.label);
      await expect(links.nth(1)).toHaveAttribute("href", rallyLink.href);
    }
  });

  test("every panel carries its text, its key numbers and its link", async ({
    page,
  }) => {
    await page.goto("/");
    for (const highlight of highlights) {
      const panel = page.locator(`#${highlightAnchor(highlight.id)}`);
      for (const line of [highlight.paragraph].flat()) {
        await expect(panel).toContainText(line);
      }
      for (const n of highlight.keyNumbers) {
        await expect(panel).toContainText(n.value);
        await expect(panel).toContainText(n.label);
      }
      await expect(
        panel.getByRole("link", { name: linkLabelFor(highlight) }),
      ).toHaveAttribute("href", hrefFor(highlight.link));
    }
  });

  test("the opening credits, the Contact section and its resume link are in the markup", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("list", { name: credits.label }).getByRole("listitem"),
    ).toHaveCount(5);
    await expect(
      page.locator("#contact").getByRole("link", { name: contact.resume.label }),
    ).toHaveAttribute("href", contact.resume.href);
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

test.describe("a keyboard walk", () => {
  // The credits are static captions here, so Skip is a stop however long the
  // walk takes.
  test("reaches every stop in order with visible focus", async ({ page }) => {
    await page.goto("/");

    const expected = [
      "/",
      ...nav.map((n) => n.href),
      null, // the Skip control: a button, so no href
      hero.primaryAction.href,
      ...highlights.flatMap((h: Highlight) =>
        h.secondLink ? [hrefFor(h.link), h.secondLink.href] : [hrefFor(h.link)],
      ),
      contact.resume.href,
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
});

test("'See the work' goes to the first panel and moves focus there", async ({
  page,
}) => {
  await page.goto("/");
  const first = highlights[0];
  await page.getByRole("link", { name: hero.primaryAction.label }).click();
  await expect(page).toHaveURL(new RegExp(`#${highlightAnchor(first.id)}$`));
  await expect(
    page.getByRole("heading", { name: first.title }),
  ).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe(highlightAnchor(first.id));
});

test("each panel shows its two key numbers, and Juice Bros none", async ({
  page,
}) => {
  await page.goto("/");
  for (const highlight of highlights) {
    const numbers = page
      .locator(`#${highlightAnchor(highlight.id)}`)
      .getByRole("list", { name: "Key numbers" })
      .getByRole("listitem");
    await expect(numbers).toHaveCount(highlight.id === "juice-bros" ? 0 : 2);
  }
});

test.describe("every Highlight link", () => {
  for (const highlight of highlights) {
    test(`${highlight.title} responds 200 and lands on a heading that names it`, async ({
      page,
      request,
    }) => {
      const href = hrefFor(highlight.link);
      expect((await request.get(href)).status()).toBe(200);

      await page.goto("/");
      await page
        .locator(`#${highlightAnchor(highlight.id)}`)
        .getByRole("link", { name: linkLabelFor(highlight) })
        .click();
      await expect(page).toHaveURL(href);

      if (highlight.link.kind === "case-study") {
        const { slug } = highlight.link;
        const study = caseStudies.find((c) => c.slug === slug)!;
        await expect(
          page.getByRole("main").getByRole("heading", { level: 2 }),
        ).toHaveText(study.title);
      } else {
        const { roleId } = highlight.link;
        const role = roles.find((r) => r.id === roleId)!;
        await expect(
          page.locator(`#${role.id}`).getByRole("heading"),
        ).toHaveText(`${role.title}, ${role.company}`);
      }
    });
  }

  test("Juice Bros' Rally game link responds 200 and lands on the game's heading", async ({
    page,
    request,
  }) => {
    expect((await request.get(rallyLink.href)).status()).toBe(200);

    await page.goto("/");
    await page
      .locator(`#${highlightAnchor("juice-bros")}`)
      .getByRole("link", { name: rallyLink.label })
      .click();
    await expect(page).toHaveURL(rallyLink.href);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 2 }),
    ).toHaveText(rally.heading);
  });
});

test("the opening has five credit lines, the last being the Skip control", async ({
  page,
}) => {
  await page.goto("/");
  // (Hidden once the opening settles, but still in the DOM.)
  const items = page
    .getByRole("list", { name: credits.label, includeHidden: true })
    .getByRole("listitem", { includeHidden: true });
  await expect(items).toHaveText([...credits.lines, credits.skip]);
  await expect(
    items.last().getByRole("button", { includeHidden: true }),
  ).toHaveText(credits.skip);
});

test("the Contact section has a lead, the resume link, the contact channels and one bookend", async ({
  page,
}) => {
  await page.goto("/");
  const section = page.locator("#contact");
  await expect(section.getByText(contact.lead)).toBeVisible();
  await expect(
    section.getByRole("link", { name: contact.resume.label }),
  ).toHaveAttribute("href", contact.resume.href);
  for (const channel of contact.channels) {
    await expect(
      section.getByRole("link", { name: channel.text }),
    ).toHaveAttribute("href", channel.href);
  }
  await expect(page.getByText(contact.bookend)).toHaveCount(1);
  await expect(section.getByText(contact.bookend)).toBeVisible();
  await expect(page.getByText("Fin.", { exact: false })).toHaveCount(0);
});

test.describe("Adrian's portrait in the Contact section", () => {
  const { portrait } = contact;

  test("is a WebP, named for him, sized before it loads", async ({ page }) => {
    await page.goto("/");
    const photo = page.locator("#contact").getByRole("img", { name: portrait.alt });
    await expect(photo).toBeVisible();
    // Its box is reserved from the markup, so loading it shifts nothing.
    const largest = portrait.stills[portrait.stills.length - 1];
    await expect(photo).toHaveAttribute("width", String(largest.width));
    await expect(photo).toHaveAttribute("height", String(largest.height));
    for (const still of portrait.stills) {
      await expect(photo).toHaveAttribute(
        "srcset",
        new RegExp(`${still.src} ${still.width}w`),
      );
    }
    // Loaded lazily, as it comes near.
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    expect(
      await photo.evaluate((img: HTMLImageElement) => img.currentSrc),
    ).toMatch(/\/contact\/[\w-]+\.webp$/);
  });

  test("leaves the channels in the first view of the section on a phone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#contact");
    const section = page.locator("#contact");
    await expect(section.getByRole("img", { name: portrait.alt })).toBeInViewport();
    for (const channel of contact.channels) {
      await expect(
        section.getByRole("link", { name: channel.text }),
      ).toBeInViewport({ ratio: 1 });
    }
  });
});

test("the Contact section says how the site is built and links its source, before the bookend", async ({
  page,
}) => {
  await page.goto("/");
  const section = page.locator("#contact");
  const heading = section.getByRole("heading", {
    level: 3,
    name: contact.built.heading,
  });
  await expect(heading).toBeVisible();
  for (const fact of contact.built.facts) {
    await expect(section.getByRole("listitem").filter({ hasText: fact })).toBeVisible();
  }
  const source = section.getByRole("link", { name: contact.built.source.label });
  await expect(source).toHaveAttribute("href", contact.built.source.href);
  // The bookend stays the last word.
  const [sourceBox, bookendBox] = await Promise.all([
    source.boundingBox(),
    section.getByText(contact.bookend).boundingBox(),
  ]);
  expect(sourceBox!.y).toBeLessThan(bookendBox!.y);
});

test.describe("the closing view", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test.describe(`at ${viewport.width} by ${viewport.height}`, () => {
      test.use({ viewport });

      test("ends the Contact section with the bookend, the last word", async ({
        page,
      }) => {
        await page.goto("/");
        const section = page.locator("#contact");
        // Nothing in the section follows the bookend.
        const last = await section.evaluate((root) => {
          let el: Element = root;
          while (el.lastElementChild) el = el.lastElementChild;
          return el.textContent?.trim();
        });
        expect(last).toBe(contact.bookend);
      });

      test("is the page's last screen, clear of copy but the bookend over its lower half", async ({
        page,
      }) => {
        await page.goto("/");
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        const section = page.locator("#contact");
        const bookend = section.getByText(contact.bookend, { exact: true });
        await expect(bookend).toBeInViewport({ ratio: 1 });
        const box = (await bookend.boundingBox())!;
        expect(box.y).toBeGreaterThan(viewport.height / 2);
        // The panels above it are scrolled away.
        await expect(
          section.getByRole("link", { name: contact.built.source.label }),
        ).not.toBeInViewport();
      });
    });
  }
});

test("every page's footer links the site's source", async ({ page }) => {
  for (const path of ["/", "/resume", "/work/juice-bros", "/play"]) {
    await page.goto(path);
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: footer.source.label }),
    ).toHaveAttribute("href", footer.source.href);
  }
});
