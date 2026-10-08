// Photographs any page, as hero-shots.mjs does home, to check a change by eye
// and for a pull request's before and after:
//
// - <prefix>-desktop.webp and <prefix>-phone.webp: the top of the page, 1440
//   by 900 and 412 by 915, once its world has drawn.
// - <prefix>-desktop-world.webp and <prefix>-phone-world.webp: the world
//   alone, as the camera holds it at the page's Place (at the Case study,
//   the landed court frame). Only for a page with a world.
//
// With motion allowed, and the world held on its first frame so two runs
// match (see ./world-frame.mjs); the weather is held clear. Run it against a
// production build or the live site:
//
//   npm run build && npm run start -- --port 3300
//   node scripts/place-shots.mjs http://localhost:3300 /work/juice-bros shots/after-court
//   node scripts/place-shots.mjs https://adrianluk.com /work/juice-bros shots/before-court
//
// The path may drop its leading slash (`work/juice-bros`): the Windows Bash
// shell rewrites an argument starting with one into a file path.
//
// Add `--gpu` to draw on the GPU, where there is one; by default it draws in
// software, as hero-shots.mjs does, so it runs anywhere.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { openOnFirstFrame, WORLD_ONLY } from "./world-frame.mjs";

const args = process.argv.slice(2);
const gpu = args.includes("--gpu");
const [base, path, prefix] = args.filter((a) => !a.startsWith("--"));
if (!base || !path || !prefix) {
  console.error(
    "Usage: node scripts/place-shots.mjs <base-url> <path> <out-prefix> [--gpu]",
  );
  process.exit(1);
}
const SCENE_TIMEOUT = 90_000;
const SHAPES = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, scale: 1 },
  { name: "phone", viewport: { width: 412, height: 915 }, scale: 2 },
];

/** The page's URL with the weather held clear. */
function clearUrl() {
  const url = new URL(path.replace(/^\/?/, "/"), base);
  url.searchParams.set("weather", "clear");
  return url.href;
}

async function shoot(browser, { name, viewport, scale }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  // The faces are "optional": one that misses first paint is never swapped
  // in, so visit once to cache them.
  await page.goto(clearUrl());
  await page.evaluate(() => document.fonts.ready);
  const drawn = await openOnFirstFrame(page, clearUrl(), {
    timeout: SCENE_TIMEOUT,
  });
  if (!drawn) console.log(`no world drew at ${path}: the page alone`);

  const file = `${prefix}-${name}.webp`;
  await sharp(await page.screenshot()).webp({ quality: 80 }).toFile(file);
  console.log("wrote", file);

  if (drawn) {
    await page.addStyleTag({ content: WORLD_ONLY });
    await page.waitForTimeout(300);
    const world = `${prefix}-${name}-world.webp`;
    await sharp(await page.screenshot()).webp({ quality: 80 }).toFile(world);
    console.log("wrote", world);
  }
  await context.close();
}

mkdirSync(dirname(prefix), { recursive: true });
const browser = await chromium.launch({
  args: gpu
    ? ["--enable-gpu", "--use-angle=default", "--ignore-gpu-blocklist"]
    : // Software WebGL: slow, but it draws in any environment, GPU or not.
      ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  for (const shape of SHAPES) await shoot(browser, shape);
} finally {
  await browser.close();
}
