import { expect, test, type Page } from "@playwright/test";
import {
  caseStudies,
  contact,
  credits,
  derbyLink,
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
import { litSite } from "../src/components/lit-sites";
import { heroRoot, watchHero, withoutWorld } from "./hero";

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

  test("home is one path: the Highlights, then Contact, with nothing between them or after", async ({
    page,
  }) => {
    await page.goto("/");
    const order = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main section[id]:not(section section)"), (el) => el.id),
    );
    expect(order).toEqual(["work", "contact"]);
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

type Stop = { href: string | null; tag?: string; focusVisible: boolean };

async function tabTo(page: Page): Promise<Stop> {
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { href: null, focusVisible: false };
    const style = getComputedStyle(el);
    const outline =
      style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow !== "none";
    return {
      href: el.getAttribute("href"),
      tag: el.tagName.toLowerCase(),
      focusVisible: outline || shadow,
    };
  });
}

test.describe("a keyboard walk", () => {
  // The credits are static captions here: nothing flies, so there is no Skip
  // to stop at.
  test("reaches every stop in order with visible focus", async ({ page }) => {
    await page.goto("/");

    const expected = [
      "/",
      ...nav.map((n) => n.href),
      hero.primaryAction.href,
      ...highlights.flatMap((h: Highlight) =>
        h.secondLink ? [hrefFor(h.link), h.secondLink.href] : [hrefFor(h.link)],
      ),
      contact.resume.href,
      ...contact.channels.map((c) => c.href),
    ];

    // The Rally game's and the Derby's clips are a stop per built-in control,
    // drawn by the browser (its ring with them), as the Case study's
    // recordings are.
    const stops: Stop[] = [];
    for (let i = 0; i < 80 && stops.length < expected.length; i++) {
      const stop = await tabTo(page);
      if (stop.tag !== "video") stops.push(stop);
    }

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

const lights = { cyan: "rgb(61, 242, 230)", violet: "rgb(155, 108, 255)" };

test("without WebGL and under reduced motion, each panel keeps its hologram surface in its site's light, behind the copy, lit and steady", async ({
  page,
}) => {
  await page.goto("/");
  for (const highlight of highlights) {
    const surface = await page
      .locator(`#${highlightAnchor(highlight.id)}`)
      .evaluate((el) => {
        // Even marked as having lit, it never flickers.
        el.toggleAttribute("data-lit-once", true);
        const s = getComputedStyle(el, "::before");
        return {
          scanlines: s.backgroundImage.startsWith("repeating-linear-gradient"),
          // Under the copy, yet above the panel's own fill.
          behind: [s.zIndex, getComputedStyle(el).isolation],
          edge: s.borderTopColor,
          flicker: s.animationName,
        };
      });
    expect(surface, highlight.id).toEqual({
      scanlines: true,
      behind: ["-1", "isolate"],
      edge: lights[litSite(highlight.id).light],
      flicker: "none",
    });
  }
});

test.describe("with motion allowed", () => {
  test.use({ reducedMotion: "no-preference" });

  test("without WebGL each panel keeps its hologram surface: scanlines, and an edge that lights in its site's light, behind the copy", async ({
    page,
  }) => {
    await page.goto("/");
    for (const highlight of highlights) {
      const surface = await page
        .locator(`#${highlightAnchor(highlight.id)}`)
        .evaluate((el) => {
          // Lit as the scroll route would, its edge's ease-up and flicker played out.
          el.toggleAttribute("data-lit", true);
          el.toggleAttribute("data-lit-once", true);
          void getComputedStyle(el, "::before").borderTopColor;
          for (const a of el.getAnimations({ subtree: true })) a.finish();
          const s = getComputedStyle(el, "::before");
          return {
            scanlines: s.backgroundImage.startsWith("repeating-linear-gradient"),
            behind: [s.zIndex, getComputedStyle(el).isolation],
            edge: s.borderTopColor,
          };
        });
      expect(surface, highlight.id).toEqual({
        scanlines: true,
        behind: ["-1", "isolate"],
        edge: lights[litSite(highlight.id).light],
      });
    }
  });

  test("the route's stills stand aside, never loaded", async ({
    page,
  }) => {
    await page.goto("/");
    const stills = page.locator('[data-backdrop^="route-"]');
    await expect(stills).toHaveCount(routeStops.length + 1);
    for (const still of await stills.all()) await expect(still).toBeHidden();
    await page.locator("#contact").scrollIntoViewIfNeeded();
    for (const img of await stills.locator("img").all()) {
      expect(await img.evaluate((el: HTMLImageElement) => el.currentSrc)).toBe("");
    }
  });
});

/** Home's route stops after the settled view, each with its still under reduced motion. */
const routeStops = [
  ...highlights.map((h) => ({ still: `route-${h.id}`, at: `#${highlightAnchor(h.id)}` })),
  { still: "route-hong-kong", at: "#contact" },
];

test("under reduced motion each route stop stands behind its stretch of the page as a still, and the bookend simply follows the copy", async ({
  page,
}) => {
  await page.goto("/");
  for (const { still, at } of routeStops) {
    await page.locator(at).scrollIntoViewIfNeeded();
    // The first site's still also stands behind the Work label: the last is its panel's.
    const img = page.locator(`[data-backdrop="${still}"] img`).last();
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), {
        message: still,
      })
      .toBeGreaterThan(0);
    // Held over the screen, shown only through its stretch.
    expect(
      await img.evaluate((el) => {
        const backdrop = el.closest("[data-backdrop]")!;
        return [getComputedStyle(backdrop).position, getComputedStyle(backdrop.parentElement!).clipPath];
      }),
    ).toEqual(["fixed", expect.stringMatching(/^inset\(/)]);
  }
  const bookend = page.getByText(contact.bookend.text);
  const box = (await bookend.locator("..").boundingBox())!;
  expect(box.height).toBeLessThan(page.viewportSize()!.height / 4);
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
          page.getByRole("main").getByRole("heading", { level: 1 }),
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
      page.getByRole("main").getByRole("heading", { level: 1 }),
    ).toHaveText(rally.heading);
  });
});

test("the opening has five credit lines, the last Skip's joke as a caption: never flying, there's no button", async ({
  page,
}) => {
  await page.goto("/");
  const items = page
    .getByRole("list", { name: credits.label })
    .getByRole("listitem");
  // As read: the Skip control, though in the markup, is not shown.
  await expect(items).toHaveText([...credits.lines, credits.skip], {
    useInnerText: true, // (as shown: uppercase)
    ignoreCase: true,
  });
  await expect(items.last().getByRole("button")).toHaveCount(0);
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
  await expect(page.getByText(contact.bookend.text)).toHaveCount(1);
  await expect(section.getByText(contact.bookend.text)).toBeVisible();
  // Its "Hire me" writes, as the Email channel does.
  await expect(
    section.getByRole("link", { name: contact.bookend.link.label, exact: true }),
  ).toHaveAttribute(
    "href",
    contact.channels.find((channel) => channel.id === "email")!.href,
  );
  await expect(page.getByText("Fin.", { exact: false })).toHaveCount(0);
});

test("the Off the clock block links to the About page, where its lines now live, and into the Derby", async ({
  page,
}) => {
  await page.goto("/");
  const section = page.locator("#contact");
  await expect(
    section.getByRole("heading", { level: 3, name: contact.offClock.heading }),
  ).toBeVisible();
  await expect(section.getByText(contact.offClock.text)).toBeVisible();
  await expect(
    section.getByRole("link", { name: contact.offClock.link.label }),
  ).toHaveAttribute("href", "/about");
  // The Derby's clip, holding on its poster and loading nothing until it plays.
  const clip = section.locator(`#${contact.offClock.id} video`);
  await expect(clip).toHaveAttribute("aria-label", contact.offClock.clip.label);
  await expect(clip).toHaveAttribute("poster", contact.offClock.clip.poster);
  await expect(clip).toHaveAttribute("preload", "none");
  // Home's one way into the Derby; the scroll route's stop at the Diamond.
  await expect(
    section.locator(`#${contact.offClock.id}`).getByRole("link", { name: contact.offClock.derby.label }),
  ).toHaveAttribute("href", derbyLink.href);
  // Ahead of the built block, which keeps its place before the bookend.
  const [offBox, builtBox] = await Promise.all([
    section.getByRole("heading", { level: 3, name: contact.offClock.heading }).boundingBox(),
    section.getByRole("heading", { level: 3, name: contact.built.heading }).boundingBox(),
  ]);
  expect(offBox!.y).toBeLessThan(builtBox!.y);
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
    section.getByText(contact.bookend.text).boundingBox(),
  ]);
  expect(sourceBox!.y).toBeLessThan(bookendBox!.y);
});

test.describe("the scroll cue", () => {
  for (const { onScreen, ...viewport } of [
    { width: 412, height: 915, onScreen: true },
    { width: 360, height: 740 },
    // An Android phone with Chrome's address bar showing.
    { width: 377, height: 706 },
    // An iPhone in Safari, where See the work reaches the screen's foot.
    { width: 390, height: 664 },
  ]) {
    test(`on a settled phone hero, ${viewport.width} by ${viewport.height}, stands whole on screen clear of See the work, or wholly out of sight`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize(viewport);
      await watchHero(page, { skip: true });
      await page.goto("/");
      await expect(heroRoot(page)).toHaveAttribute("data-state", "settled");
      // The word and its arrow, once landed.
      const cue = page.getByText(hero.scrollHint, { exact: true }).locator("..");
      await cue.evaluate((el) =>
        Promise.all(el.getAnimations().map((a) => a.finished)),
      );
      const action = page.getByRole("link", { name: hero.primaryAction.label });
      const [cueBox, actionBox] = await Promise.all([
        cue.boundingBox(),
        action.boundingBox(),
      ]);
      const whole = cueBox!.y + cueBox!.height <= viewport.height;
      if (onScreen) expect(whole).toBe(true);
      if (whole) {
        await expect(cue).toBeVisible();
        expect(cueBox!.y).toBeGreaterThan(actionBox!.y + actionBox!.height);
      } else {
        expect(cueBox!.y).toBeGreaterThanOrEqual(viewport.height);
      }
    });
  }

  test("stays out where the static credits fill the foot, under reduced motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "reduced");
    await expect(page.getByText(hero.scrollHint, { exact: true })).toBeHidden();
  });

  test("is left out wider, where the first Highlight is the cue", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await watchHero(page, { skip: true });
    await page.goto("/");
    await expect(heroRoot(page)).toHaveAttribute("data-state", "settled");
    await expect(page.getByText(hero.scrollHint, { exact: true })).toBeHidden();
  });
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
        // Nothing in the section follows the bookend: its last block holds
        // the bookend alone (its "Hire me" link inside it).
        const last = await section.evaluate((root) =>
          root.lastElementChild?.textContent?.trim(),
        );
        expect(last).toBe(contact.bookend.text);
      });

      test("is the screen the route ends on, the page's foot: clear of copy but the bookend over its lower half", async ({
        page,
      }) => {
        // The camera's screen: under reduced motion the bookend simply follows the copy.
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.goto("/");
        // The bookend at the foot of the screen, the page's last.
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        const section = page.locator("#contact");
        const bookend = section.getByText(contact.bookend.text, { exact: true });
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
  for (const path of ["/", "/resume", "/work/juice-bros", "/rally"]) {
    await page.goto(path);
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: footer.source.label }),
    ).toHaveAttribute("href", footer.source.href);
  }
});
