// Photographs the world, once, for the stills the site serves:
//
// - public/share/*.png: each route's 1200 by 630 link preview. Home's is the
//   settled hero frame (the name plate in the valley); the other routes add
//   their own title to the same frame.
// - public/world/backdrop-*.webp: the quieter night behind every route but
//   home, the valley as the scroll route sees it past the plate. Landscape up
//   to 3840 wide (2560 at 1.5x, a 4K screen at 1x) and portrait for phones.
//
// Run against the production build, on a machine with a GPU:
//
//   npm run build && npm run start -- --port 3300
//   node scripts/share-stills.mjs http://localhost:3300
//
// Re-run it whenever the world or the share cards change.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { backdrop, credits, shareCards } from "../src/content/site.ts";

const base = process.argv[2] ?? "http://localhost:3000";
const SCENE_TIMEOUT = 60_000;

/** How far down the home page the backdrop's camera has flown, 0 to 1. */
const BACKDROP_SCROLL = 0.32;

/** Everything but the world's canvas, hidden without moving anything. */
const WORLD_ONLY = `
  body * { visibility: hidden !important; }
  canvas { visibility: visible !important; }
`;

/** Clicks Skip the moment the flight starts, so the camera lands at once. */
function skipOpening(name) {
  new MutationObserver(() => {
    const hero = document.querySelector("[data-state]");
    if (hero?.getAttribute("data-state") !== "flight") return;
    Array.from(document.querySelectorAll("button"))
      .find((b) => b.textContent === name)
      ?.click();
  }).observe(document, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state"],
  });
}

async function openHome(browser, { viewport, motion }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1.5,
    reducedMotion: motion ? "no-preference" : "reduce",
  });
  const page = await context.newPage();
  if (motion) await page.addInitScript(skipOpening, credits.skip);
  await page.goto(`${base}/`);
  // The faces are "optional": one that misses first paint is never swapped
  // in, so load the page again with them cached.
  await page.evaluate(() => document.fonts.ready);
  await page.reload();
  await page
    .locator('[data-world="drawn"]')
    .waitFor({ timeout: SCENE_TIMEOUT });
  const state = motion ? "settled" : "reduced";
  await page
    .locator(`[data-state="${state}"]`)
    .waitFor({ timeout: SCENE_TIMEOUT });
  return page;
}

/** The share cards: the settled frame, then each captioned route's title on it. */
async function shareStills(browser) {
  mkdirSync("public/share", { recursive: true });
  const page = await openHome(browser, {
    viewport: { width: 1200, height: 630 },
    motion: false,
  });
  // The canvas fills the card edge to edge, still lined up with the headline.
  await page.addStyleTag({
    content: `${WORLD_ONLY}
      canvas { position: fixed !important; inset: 0 !important;
        height: 100vh !important; mask-image: none !important; }
      #share-caption { position: fixed; inset: auto 0 0 0; z-index: 1;
        visibility: visible; padding: 120px 48px 44px;
        background: linear-gradient(to bottom, transparent,
          color-mix(in srgb, var(--color-night) 85%, transparent));
        font-family: var(--font-anybody); color: var(--color-ink);
        text-transform: uppercase; }
      #share-caption span { display: block; font-size: 22px;
        letter-spacing: 0.3em; color: var(--color-cyan);
        font-stretch: 75%; }
      #share-caption strong { display: block; margin-top: 6px;
        font-size: 76px; line-height: 0.95; font-weight: 800;
        font-stretch: 140%; }`,
  });
  // Under reduced motion the world draws again only on a resize.
  await page.waitForTimeout(1500);

  for (const card of Object.values(shareCards)) {
    await page.evaluate((caption) => {
      document.getElementById("share-caption")?.remove();
      if (!caption) return;
      const el = document.createElement("div");
      el.id = "share-caption";
      el.innerHTML = `<span></span><strong></strong>`;
      el.children[0].textContent = caption.eyebrow ?? "";
      el.children[1].textContent = caption.title;
      document.documentElement.append(el);
    }, card.caption ?? null);
    await page.evaluate(() => document.fonts.ready);
    const file = `public${card.image}`;
    await page.screenshot({ path: file, scale: "css" });
    console.log("wrote", file);
  }
  await page.context().close();
}

/** The backdrop: the valley past the plate, wide and tall. */
async function backdropStills(browser) {
  mkdirSync("public/world", { recursive: true });
  const shots = [
    { viewport: { width: 2560, height: 1440 }, sizes: backdrop.landscape },
    { viewport: { width: 860, height: 1864 }, sizes: backdrop.portrait },
  ];
  for (const { viewport, sizes } of shots) {
    const page = await openHome(browser, { viewport, motion: true });
    await page.evaluate((at) => {
      const end = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.round(end * at));
    }, BACKDROP_SCROLL);
    // The camera eases on after the scroll stops.
    await page.waitForTimeout(4000);
    await page.addStyleTag({ content: WORLD_ONLY });
    await page.waitForTimeout(300);
    const png = await page.screenshot();
    for (const { src, width } of sizes) {
      const file = `public${src}`;
      await sharp(png).resize({ width }).webp({ quality: 80 }).toFile(file);
      console.log("wrote", file);
    }
    await page.context().close();
  }
}

const browser = await chromium.launch({
  // The GPU, where there is one: software WebGL at 4K takes minutes a frame.
  args: ["--enable-gpu", "--use-angle=default", "--ignore-gpu-blocklist"],
});
try {
  await shareStills(browser);
  await backdropStills(browser);
} finally {
  await browser.close();
}
