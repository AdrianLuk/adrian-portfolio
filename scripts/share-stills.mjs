// Photographs the world, once, for the stills the site serves:
//
// - public/share/*.png: each route's 1200 by 630 link preview. Home's is the
//   settled hero frame (the name plate in the valley); the other routes add
//   their own title to the same frame.
// - public/world/valley-*.webp: the quieter night behind every route but
//   home, the valley as the scroll route sees it past the plate. Landscape up
//   to 3840 wide (2560 at 1.5x, a 4K screen at 1x) and portrait for phones
//   and tablets (2048 wide, a portrait iPad at 2x).
// - public/world/court-*.webp: the Juice Bros Case study's first paint, the
//   court as the camera holds it there, in the clear, on the live world's
//   first frame (the rally ball in), at the backdrop's shapes and sizes.
// - public/world/skyline-*.webp: the Resume page's first paint, likewise:
//   the Skyline as the camera holds it there.
// - public/world/diamond-*.webp: the Home Run Derby's first paint, likewise:
//   the Diamond as the camera holds it behind home plate.
// - public/world/arena-*.webp: the Encore's backdrop where the world isn't
//   live behind it: home scrolled to the Encore, the camera landed in the
//   Arena and its floor filled.
//
// Run against the production build, on a machine with a GPU:
//
//   npm run build && npm run start -- --port 3300
//   node scripts/share-stills.mjs http://localhost:3300
//
// Re-run it whenever the world or the share cards change. Name sets to draw
// only those: `--share`, `--valley`, `--court`, `--skyline`, `--diamond`,
// `--arena` (for example
// `node scripts/share-stills.mjs http://localhost:3300 --court`).
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import {
  arenaStills,
  courtStills,
  diamondStills,
  credits,
  highlightAnchor,
  highlights,
  shareCards,
  skylineStills,
  valleyStills,
} from "../src/content/site.ts";
import {
  ENCORE_FILL_SECONDS,
  ENCORE_SECONDS,
} from "../src/components/world/rigs.ts";
import { openOnFirstFrame, skipOpening, WORLD_ONLY } from "./world-frame.mjs";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000";
const SETS = ["share", "valley", "court", "skyline", "diamond", "arena"];
const named = SETS.filter((set) => args.includes(`--${set}`));
const unknown = args.filter(
  (a) => a.startsWith("--") && !SETS.includes(a.slice(2)),
);
if (unknown.length) {
  console.error(`Unknown ${unknown.join(", ")}: the sets are --${SETS.join(", --")}`);
  process.exit(1);
}
const sets = new Set(named.length ? named : SETS);
const SCENE_TIMEOUT = 60_000;

/**
 * How far the valley's camera has flown from the settled view toward the
 * first Lit site's stop, 0 to 1, for each still shape: a stop on the scroll
 * route, so the page's layout can't move it. Portrait stops short, where the
 * site still stands back from the camera.
 */
const VALLEY_STOP = { landscape: 1, portrait: 0.6 };

/** The pages whose Places have stills of their own: the court, the Skyline, the Diamond. */
const COURT_PAGE = "/work/juice-bros";
const SKYLINE_PAGE = "/resume";
const DIAMOND_PAGE = "/derby";

/** The world's two still shapes: wide, and a tall phone or tablet. */
function stillShots(stills) {
  return [
    { shape: "landscape", viewport: { width: 2560, height: 1440 }, sizes: stills.landscape },
    { shape: "portrait", viewport: { width: 1366, height: 2960 }, sizes: stills.portrait },
  ];
}

/** Writes one screenshot at each of a still's widths. */
async function writeStills(png, sizes) {
  for (const { src, width } of sizes) {
    const file = `public${src}`;
    await sharp(png).resize({ width }).webp({ quality: 80 }).toFile(file);
    console.log("wrote", file);
  }
}

async function openHome(browser, { viewport, motion, query = "" }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1.5,
    reducedMotion: motion ? "no-preference" : "reduce",
  });
  const page = await context.newPage();
  if (motion) await page.addInitScript(skipOpening, credits.skip);
  await page.goto(`${base}/${query}`);
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

/** The valley past the plate, wide and tall: the night backdrop. */
async function drawValley(browser) {
  mkdirSync("public/world", { recursive: true });
  for (const { shape, viewport, sizes } of stillShots(valleyStills)) {
    const page = await openHome(browser, { viewport, motion: true });
    // The camera reaches the first site's stop as its panel is centred in
    // the viewport (routeAnchors in route-anchors.ts).
    await page.evaluate(
      ([at, id]) => {
        const panel = document.getElementById(id);
        if (!panel) throw new Error(`No panel #${id} on home`);
        const top = panel.getBoundingClientRect().top + window.scrollY;
        const centred = top + panel.offsetHeight / 2 - window.innerHeight / 2;
        window.scrollTo(0, Math.round(Math.max(0, centred) * at));
      },
      [VALLEY_STOP[shape], highlightAnchor(highlights[0].id)],
    );
    // The camera eases on after the scroll stops.
    await page.waitForTimeout(4000);
    await page.addStyleTag({ content: WORLD_ONLY });
    await page.waitForTimeout(300);
    await writeStills(await page.screenshot(), sizes);
    await page.context().close();
  }
}

/**
 * The Arena as the Encore shows it: home scrolled to its foot, the camera
 * flown in and the lightsticks filled, the weather held clear.
 */
async function drawArena(browser) {
  mkdirSync("public/world", { recursive: true });
  for (const { viewport, sizes } of stillShots(arenaStills)) {
    const page = await openHome(browser, { viewport, motion: true, query: "?weather=clear" });
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    // The way in, then the floor filling, and a moment for the scroll's ease.
    await page.waitForTimeout((ENCORE_SECONDS + ENCORE_FILL_SECONDS + 2) * 1000);
    await page.addStyleTag({ content: WORLD_ONLY });
    await page.waitForTimeout(300);
    await writeStills(await page.screenshot(), sizes);
    await page.context().close();
  }
}

/**
 * A Place's still: its page's world on its first frame, with motion (so at
 * the court the rally ball is in, where the live world starts it) and the
 * weather held clear.
 */
async function drawPlace(browser, path, stills) {
  mkdirSync("public/world", { recursive: true });
  for (const { viewport, sizes } of stillShots(stills)) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1.5,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    const drawn = await openOnFirstFrame(page, `${base}${path}?weather=clear`, {
      timeout: SCENE_TIMEOUT,
    });
    if (!drawn) throw new Error(`The world never drew at ${path}`);
    await page.addStyleTag({ content: WORLD_ONLY });
    await page.waitForTimeout(300);
    await writeStills(await page.screenshot(), sizes);
    await context.close();
  }
}

const browser = await chromium.launch({
  // The GPU, where there is one: software WebGL at 4K takes minutes a frame.
  args: ["--enable-gpu", "--use-angle=default", "--ignore-gpu-blocklist"],
});
try {
  if (sets.has("share")) await shareStills(browser);
  if (sets.has("valley")) await drawValley(browser);
  if (sets.has("court")) await drawPlace(browser, COURT_PAGE, courtStills);
  if (sets.has("skyline"))
    await drawPlace(browser, SKYLINE_PAGE, skylineStills);
  if (sets.has("diamond"))
    await drawPlace(browser, DIAMOND_PAGE, diamondStills);
  if (sets.has("arena")) await drawArena(browser);
} finally {
  await browser.close();
}
