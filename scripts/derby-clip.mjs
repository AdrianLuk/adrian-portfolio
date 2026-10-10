// Records the Home Run Derby's clip (`derbyClip` in src/content/site.ts):
// one pitch from Curvebot, a home run, the ball flying out, and Curvebot's
// line, from the Derby's own camera behind home plate. 720 by 540, silent,
// WebM and MP4, plus a WebP poster. It loops: it starts and ends with
// Curvebot standing ready to pitch.
//
// The page's clock is Playwright's fake one, stepped a frame at a time, so
// every frame is drawn on time however slow the GPU, and the swing lands
// to the millisecond: the game's own rules say when a pitch arrives, and
// the seed (the Start press's time) picks which pitch it is.
//
// Run against the production build, on a machine with a GPU and ffmpeg on
// the PATH:
//
//   npm run build && npm run start -- --port 3300
//   node scripts/derby-clip.mjs http://localhost:3300
//
// Re-run it whenever the Derby or the Diamond changes how it looks.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { derby, derbyClip } from "../src/content/site.ts";
import {
  createGame,
  PITCH_TIME,
  startGame,
  step,
  WINDUP,
} from "../src/components/derby/rules.ts";
import { WORLD_ONLY } from "./world-frame.mjs";

const base = process.argv[2] ?? "http://localhost:3000";
const FPS = 25;
const FRAME_MS = 1000 / FPS;
/** Curvebot's pitch: the curveball, the one that breaks. */
const KIND = "curveball";
/** The swing a touch early (seconds), so the home run is pulled toward left field rather than dead centre. */
const SWING_ERROR = -0.025;
/** How long the clip stands ready before Start, in ms: the loop's first and last pose. */
const READY_MS = 1000;
/** The poster: the ball rising toward the fence, the bat through, the line up. */
const POSTER_AFTER_SWING_MS = 280;
/** The clip's last moments fade into its first frame, so it loops without a jump. */
const LOOP_FADE = 0.4;
const { width, height } = derbyClip;
const SCENE_TIMEOUT = 60_000;

/** The pitch Curvebot throws first in a game seeded `seed`. */
const firstPitch = (seed) => step(startGame(createGame({ seed })), WINDUP).pitch;

/**
 * How long a pitch's result stands, in ms, by the rules: from the swing to
 * Curvebot's next windup (the page doesn't show that moment).
 */
function resultMs() {
  let game = step(step(startGame(createGame()), WINDUP), 0.01, { swing: true });
  let ms = 0;
  for (; game.phase === "result"; ms++) game = step(game, 0.001);
  return ms;
}

const out = (src) => path.join("public", src);
const sourceOf = (type) => derbyClip.sources.find((s) => s.type === type).src;

mkdirSync(path.dirname(out(derbyClip.poster)), { recursive: true });
const frames = mkdtempSync(path.join(tmpdir(), "derby-clip-"));
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
  await page.goto(`${base}/derby?weather=clear`);
  await page
    .locator('[data-phase][data-world="drawn"]')
    .waitFor({ timeout: SCENE_TIMEOUT });
  await page.evaluate(() => document.fonts.ready);
  // The canvas's fade in.
  await page.waitForTimeout(1500);
  // The fake clock only now: under it from the start, the world never draws.
  await context.clock.install();
  // The world's canvas and Curvebot's line on it, nothing else.
  await page.addStyleTag({
    content: `${WORLD_ONLY}
      [data-phase] > p[aria-hidden] { visibility: visible !important; }`,
  });

  // The game seeds itself from Date.now() at Start (HomeRunDerby's begin):
  // stop the clock where Start, READY_MS on, throws a curveball first.
  const now = await page.evaluate(() => Date.now());
  let t0 = now + 1000;
  while (firstPitch((t0 + READY_MS) % 100_000) !== KIND) t0++;
  await page.clock.pauseAt(t0);

  const read = () =>
    page.evaluate(() => {
      const game = document.querySelector("[data-phase]");
      return {
        phase: game.dataset.phase,
        pitches: Number(game.dataset.pitches),
        line: game.querySelector(":scope > p[aria-hidden]")?.textContent ?? "",
      };
    });

  let elapsed = 0;
  let pitchedAt = null;
  let swingAt = null;
  let swung = false;
  let end = null;
  let posterFrame = null;
  const advance = async (to) => {
    await page.clock.runFor(to - elapsed);
    elapsed = to;
  };

  for (let k = 0; end === null || k * FRAME_MS < end; k++) {
    const target = k * FRAME_MS;
    while (elapsed < target) {
      let next = target;
      // The pitch leaves Curvebot's hand on the frame the windup ends:
      // found to the millisecond, which times the swing.
      const windupEnds = READY_MS + WINDUP * 1000 - 20;
      if (pitchedAt === null && target > windupEnds) {
        next = Math.max(elapsed + 1, Math.min(target, windupEnds));
      }
      if (swingAt !== null && !swung) next = Math.min(next, swingAt);
      await advance(next);

      if (elapsed === READY_MS) {
        await page.evaluate((label) => {
          [...document.querySelectorAll("button")]
            .find((b) => b.textContent === label)
            .click();
        }, derby.game.start.action);
      }
      if (pitchedAt === null && elapsed > READY_MS && (await read()).pitches > 0) {
        pitchedAt = elapsed;
        swingAt = Math.round(pitchedAt + (PITCH_TIME[KIND] + SWING_ERROR) * 1000);
      }
      if (swingAt !== null && !swung && elapsed >= swingAt) {
        // Space, sent to the field: hidden, it can't take focus.
        await page.evaluate(() =>
          document
            .querySelector('[role="application"]')
            .dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })),
        );
        swung = true;
        // The loop ends where it began: Curvebot about to wind up.
        end = swingAt + resultMs();
        posterFrame = Math.ceil((swingAt + POSTER_AFTER_SWING_MS) / FRAME_MS);
      }
    }
    const shot = await page.screenshot();
    const frame = sharp(shot).resize(width, height);
    await frame.clone().png().toFile(path.join(frames, `f${String(k).padStart(4, "0")}.png`));
    if (k === posterFrame) {
      await frame.clone().webp({ quality: 80 }).toFile(out(derbyClip.poster));
      console.log("wrote", out(derbyClip.poster));
      const { line } = await read();
      if (!line.startsWith(derby.game.outcomes["home-run"])) {
        throw new Error(`Not a home run: "${line}"`);
      }
    }
  }
  await context.close();

  const count = readdirSync(frames).length;
  const input = [
    "-y", "-v", "error",
    "-framerate", String(FPS), "-i", path.join(frames, "f%04d.png"),
    "-loop", "1", "-framerate", String(FPS), "-t", String(LOOP_FADE), "-i", path.join(frames, "f0000.png"),
    "-filter_complex", `[0][1]xfade=transition=fade:duration=${LOOP_FADE}:offset=${count / FPS - LOOP_FADE},format=yuv420p`,
    "-an",
  ];
  const encode = (type, codec) => {
    execFileSync("ffmpeg", [...input, ...codec, out(sourceOf(type))]);
    console.log("wrote", out(sourceOf(type)));
  };
  encode("video/webm", ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1"]);
  encode("video/mp4", ["-c:v", "libx264", "-preset", "slow", "-crf", "22", "-movflags", "+faststart"]);
} finally {
  await browser.close();
  rmSync(frames, { recursive: true, force: true });
}
