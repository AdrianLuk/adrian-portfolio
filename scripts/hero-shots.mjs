// Photographs the home page's hero, to check a change to the world by eye and
// for a pull request's before and after:
//
// - <prefix>-desktop.webp and <prefix>-phone.webp: the settled frame (reduced
//   motion lands on it at once), 1440 by 900 and 412 by 915.
// - <prefix>-phone-flight.webp: a phone frame `seconds` into the opening
//   (default 2.6, as the first credit shows).
//
// The weather is held clear, so two runs differ only by the change. Run it
// against a production build or the live site:
//
//   npm run build && npm run start -- --port 3300
//   node scripts/hero-shots.mjs http://localhost:3300 shots/after
//   node scripts/hero-shots.mjs https://adrianluk.com shots/before
//
// Browser automation through a visible Chrome window can't stand in for it:
// a window that isn't frontmost gets no animation frames, and the canvas holds
// its first frame.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const [base, prefix, seconds = "2.6"] = process.argv.slice(2);
if (!base || !prefix) {
  console.error("Usage: node scripts/hero-shots.mjs <base-url> <out-prefix> [seconds]");
  process.exit(1);
}
const SCENE_TIMEOUT = 90_000;
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 412, height: 915 };

async function shoot(browser, { viewport, scale, motion }, file) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    reducedMotion: motion ? "no-preference" : "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${base}/?weather=clear`);
  if (motion) {
    await page
      .locator('[data-state="flight"]')
      .waitFor({ timeout: SCENE_TIMEOUT });
  }
  await page
    .locator('[data-world="drawn"]')
    .waitFor({ timeout: SCENE_TIMEOUT });
  if (motion) {
    await page.waitForTimeout(Number(seconds) * 1000);
  } else {
    await page
      .locator('[data-state="reduced"]')
      .waitFor({ timeout: SCENE_TIMEOUT });
    // A beat for the fonts and the first frame to settle.
    await page.waitForTimeout(1500);
  }
  await sharp(await page.screenshot())
    .webp({ quality: 80 })
    .toFile(file);
  console.log("wrote", file);
  await context.close();
}

mkdirSync(dirname(prefix), { recursive: true });
const browser = await chromium.launch({
  // Software WebGL: slow, but it draws in any environment, GPU or not.
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  await shoot(
    browser,
    { viewport: DESKTOP, scale: 1, motion: false },
    `${prefix}-desktop.webp`,
  );
  await shoot(
    browser,
    { viewport: PHONE, scale: 2, motion: false },
    `${prefix}-phone.webp`,
  );
  await shoot(
    browser,
    { viewport: PHONE, scale: 2, motion: true },
    `${prefix}-phone-flight.webp`,
  );
} finally {
  await browser.close();
}
