// Records the Shootout's clip (`shootoutClip` in src/content/site.ts): a
// short round from the Arena's stage roof, training bots popping up round
// Victoria Harbour and the six-shooter dropping them, the crosshair over the
// world. 720 by 540, silent, WebM and MP4, plus a WebP poster. It loops: its
// last moments fade into its first frame, facing Hong Kong before Start.
//
// The page's clock is Playwright's fake one, stepped a frame at a time, so
// every frame is drawn on time however slow the GPU. The game's seed is
// fixed (ShootoutGame's createGame), so every run pops the same bots up; the
// visitor's part is N (aim at the next bot in view) and Space (shoot).
//
// Run against the production build, on a machine with a GPU and ffmpeg on
// the PATH:
//
//   npm run build && npm run start -- --port 3300
//   node scripts/shootout-clip.mjs http://localhost:3300
//
// Re-run it whenever the Shootout or the Arena changes how it looks.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { shootout, shootoutClip } from "../src/content/site.ts";
import { WORLD_ONLY } from "./world-frame.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const FPS = 25;
const FRAME_MS = 1000 / FPS;
/** How long the clip faces Hong Kong before Start, in ms: the loop's first and last view. */
const READY_MS = 600;
/** When the visitor starts shooting, and how often: aim at the next bot, shoot (a second shot downs a body-shot bot). */
const FIRST_SHOT_MS = 1800;
const SHOT_EVERY_MS = 560;
/** How long the clip runs, in ms. */
const LENGTH_MS = 7600;
/**
 * The poster: the frame before the first bot goes down, N having aimed at it,
 * standing under the crosshair in its red outline.
 */
/** The clip's last moments fade into its first frame, so it loops without a jump. */
const LOOP_FADE = 0.4;
const { width, height } = shootoutClip;
const SCENE_TIMEOUT = 60_000;

const out = (src) => path.join("public", src);
const sourceOf = (type) => shootoutClip.sources.find((s) => s.type === type).src;

mkdirSync(path.dirname(out(shootoutClip.poster)), { recursive: true });
// Frames, poster and videos are made here; only a finished clip reaches public/.
const frames = mkdtempSync(path.join(tmpdir(), "shootout-clip-"));
const made = (src) => path.join(frames, path.basename(src));
const browser = await chromium.launch({
  // The GPU, where there is one.
  args: ["--enable-gpu", "--use-angle=default", "--ignore-gpu-blocklist"],
});
try {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1.5,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(`${base}/shootout?weather=clear`);
  await page
    .locator('[data-phase][data-world="drawn"]')
    .waitFor({ timeout: SCENE_TIMEOUT });
  await page.evaluate(() => document.fonts.ready);
  // The canvas's fade in.
  await page.waitForTimeout(1500);
  // The fake clock only now: under it from the start, the world never draws.
  await context.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  // The world's canvas and the crosshair over it, nothing else.
  await page.addStyleTag({
    content: `${WORLD_ONLY}
      [data-phase] svg, [data-phase] svg * { visibility: visible !important; }`,
  });

  /** Sends a key to the view: hidden, it can't take focus, but the game hears it. */
  const press = (key) =>
    page.evaluate((k) => {
      document
        .querySelector('[role="application"]')
        .dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    }, key);
  const kills = () => page.evaluate(() => Number(document.querySelector("[data-phase]").dataset.kills));

  let elapsed = 0;
  let started = false;
  let nextShot = FIRST_SHOT_MS;
  let posterFrame = null;
  let count = 0;
  for (let k = 0; k * FRAME_MS < LENGTH_MS; k++) {
    const target = k * FRAME_MS;
    await page.clock.runFor(target - elapsed);
    elapsed = target;
    if (!started && elapsed >= READY_MS) {
      started = true;
      await page.evaluate((label) => {
        [...document.querySelectorAll("button")].find((b) => b.textContent === label).click();
      }, shootout.game.start.action);
    }
    if (started && elapsed >= nextShot) {
      nextShot += SHOT_EVERY_MS;
      await press("n");
      await press(" ");
    }
    if (posterFrame === null && started && (await kills()) > 0) posterFrame = k - 1;
    const frame = sharp(await page.screenshot()).resize(width, height);
    await frame.clone().png().toFile(path.join(frames, `f${String(k).padStart(4, "0")}.png`));
    count = k + 1;
  }
  if (posterFrame === null) throw new Error("No bot went down in the clip");
  await sharp(path.join(frames, `f${String(posterFrame).padStart(4, "0")}.png`))
    .webp({ quality: 80 })
    .toFile(made(shootoutClip.poster));
  await context.close();

  const input = [
    "-y", "-v", "error",
    "-framerate", String(FPS), "-i", path.join(frames, "f%04d.png"),
    "-loop", "1", "-framerate", String(FPS), "-t", String(LOOP_FADE), "-i", path.join(frames, "f0000.png"),
    "-filter_complex", `[0][1]xfade=transition=fade:duration=${LOOP_FADE}:offset=${count / FPS - LOOP_FADE},format=yuv420p`,
    "-an",
  ];
  const encode = (type, codec) =>
    execFileSync("ffmpeg", [...input, ...codec, made(sourceOf(type))]);
  encode("video/webm", ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1"]);
  encode("video/mp4", ["-c:v", "libx264", "-preset", "slow", "-crf", "22", "-movflags", "+faststart"]);
  for (const src of [shootoutClip.poster, ...shootoutClip.sources.map((s) => s.src)]) {
    copyFileSync(made(src), out(src));
    console.log("wrote", out(src));
  }
} finally {
  await browser.close();
  rmSync(frames, { recursive: true, force: true });
}
