// Records the Shootout's clip (`shootoutClip` in src/content/site.ts): a
// short round from the Arena's stage roof, the visitor turning from bot to
// bot round Victoria Harbour and dropping each with the six-shooter, the
// crosshair over the world. 720 by 540, silent, WebM and MP4, plus a WebP
// poster. It loops: its last moments fade into its first frame.
//
// The page's clock is Playwright's fake one, stepped a frame at a time, so
// every frame is drawn on time however slow the GPU. The game's seed is
// fixed (ShootoutGame's createGame), so every run pops the same bots up.
// The visitor plays as on a phone: a thumb drags the aim onto a bot, found
// on screen by its red outline, and lifts to shoot. With none in view, it
// turns the way the last "Bot up" line said.
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
/** How long the clip runs, in ms, from the first bot in view. */
const LENGTH_MS = 9000;
/**
 * The thumb: each frame it drags a share of the way to the bot's head, at
 * most `most` CSS pixels (about 80 degrees a second, under the Transits'
 * 150), and lifts once within `lift` of it; with no bot in view it turns
 * `pan` a frame. After a shot it rests `rest` ms, as a player does.
 */
const THUMB = { share: 0.3, most: 26, lift: 1, pan: 10, rest: 280 };
/**
 * How far the aim may turn left or right of facing Hong Kong, in CSS pixels
 * of drag (about a tenth of a degree each): the clip stays on the harbour,
 * its bots round the rim behind the visitor left out. (The game keeps the
 * aim's pitch in reach.)
 */
const REACH = 600;
/** Where a bot's head is, down from the top of its outline, as a share of its height. */
const HEAD = 0.22;
/** The bots' outline's red as drawn (palette.neonRed, unlit), apart from Hong Kong's neon. */
const isOutline = (r, g, b) => r > 170 && g < 45 && b < 55;
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

  const DPR = 1.5;
  /**
   * The bots on screen, from a screenshot: its outline's red pixels, binned
   * into cells and joined into one box a bot. Each is where its head is,
   * in CSS pixels.
   */
  const botsIn = async (png) => {
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const CELL = 6;
    const cols = Math.ceil(info.width / CELL);
    const lit = new Set();
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        if (isOutline(data[i], data[i + 1], data[i + 2])) lit.add(Math.floor(y / CELL) * cols + Math.floor(x / CELL));
      }
    }
    const bots = [];
    for (const start of lit) {
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, cells: 0 };
      const todo = [start];
      lit.delete(start);
      while (todo.length) {
        const c = todo.pop();
        const cx = c % cols;
        const cy = Math.floor(c / cols);
        box.x0 = Math.min(box.x0, cx); box.x1 = Math.max(box.x1, cx);
        box.y0 = Math.min(box.y0, cy); box.y1 = Math.max(box.y1, cy);
        box.cells++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const n = (cy + dy) * cols + cx + dx;
          if (cx + dx >= 0 && cx + dx < cols && lit.has(n)) { lit.delete(n); todo.push(n); }
        }
      }
      if (box.cells < 2) continue;
      // The outline's own pixels within its cells, to the pixel: a far bot is only a few cells tall.
      let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let y = box.y0 * CELL; y < Math.min(info.height, (box.y1 + 1) * CELL); y++) {
        for (let x = box.x0 * CELL; x < Math.min(info.width, (box.x1 + 1) * CELL); x++) {
          const i = (y * info.width + x) * info.channels;
          if (!isOutline(data[i], data[i + 1], data[i + 2])) continue;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      // The big round head is the top of the box.
      bots.push({ x: (left + right + 1) / 2 / DPR, y: (top + (bottom + 1 - top) * HEAD) / DPR });
    }
    return bots;
  };

  /** A touch on the view: down, moved to, or lifted at (x, y), in CSS pixels. */
  const touch = (type, x, y) =>
    page.evaluate(
      ([type, x, y]) =>
        document.querySelector('[role="application"]').dispatchEvent(
          new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true }),
        ),
      [type, x, y],
    );
  const kills = () => page.evaluate(() => Number(document.querySelector("[data-phase]").dataset.kills));
  /** Which way the last "Bot up" line pointed: 1 right, -1 left. */
  const heard = () =>
    page.evaluate(
      ([left, right]) => {
        const said = document.querySelector('[data-phase] [aria-live="polite"]')?.textContent ?? "";
        return said.includes(left) ? -1 : said.includes(right) ? 1 : 0;
      },
      [shootout.game.direction.left, shootout.game.direction.right],
    );

  await page.evaluate((label) => {
    [...document.querySelectorAll("button")].find((b) => b.textContent === label).click();
  }, shootout.game.start.action);

  const middle = { x: width / 2, y: height / 2 };
  /** Where the thumb is, if down: it moves by what the aim must turn. */
  let thumb = null;
  /** How far the thumb has dragged the aim from facing Hong Kong, in CSS pixels. */
  const aim = { x: 0, y: 0 };
  const within = (x) => Math.abs(x) <= REACH;
  let shots = 0;
  let target = null;
  let restUntil = 0;
  let turn = 1;
  let elapsed = 0;
  let recording = false;
  let first = 0;
  let posterFrame = null;
  let count = 0;
  for (let k = 0; ; k++) {
    await page.clock.runFor(FRAME_MS);
    elapsed += FRAME_MS;
    const png = await page.screenshot();
    // Only the bots the aim can reach without leaving the harbour.
    const bots = (await botsIn(png)).filter((b) => within(aim.x + b.x - middle.x));
    if (!recording && bots.length) {
      recording = true;
      first = k;
    }
    if (recording) {
      if (elapsed - first * FRAME_MS > LENGTH_MS) break;
      const at = k - first;
      await sharp(png).resize(width, height).png().toFile(path.join(frames, `f${String(at).padStart(4, "0")}.png`));
      count = at + 1;
      if (posterFrame === null && (await kills()) > 0) posterFrame = at - 1;
    }
    if (elapsed < restUntil || !recording) continue;

    // Keep on the bot being aimed at as it strafes; else the nearest.
    const near = (p) => (a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y);
    target = bots.sort(near(target ?? middle))[0] ?? null;
    if (!thumb) {
      thumb = { x: middle.x, y: middle.y + height * 0.2 };
      await touch("pointerdown", thumb.x, thumb.y);
    }
    /** Drags the thumb, and the aim with it; only its moves count, so it may run off the screen. */
    const drag = async (dx, dy) => {
      thumb.x += dx;
      thumb.y += dy;
      aim.x += dx;
      aim.y += dy;
      await touch("pointermove", thumb.x, thumb.y);
    };
    if (!target) {
      // The way the last bot up was said to be, as far as the harbour goes.
      turn = (await heard()) || turn;
      if (!within(aim.x + turn * THUMB.pan)) turn = -turn;
      await drag(turn * THUMB.pan, Math.sign(-aim.y) * Math.min(Math.abs(aim.y), THUMB.pan / 2));
      continue;
    }
    const off = { x: target.x - middle.x, y: target.y - middle.y };
    const far = Math.hypot(off.x, off.y);
    if (far <= THUMB.lift) {
      await touch("pointerup", thumb.x, thumb.y);
      shots++;
      thumb = null;
      target = null;
      restUntil = elapsed + THUMB.rest;
      continue;
    }
    const step = Math.min(far * THUMB.share, THUMB.most) / far;
    await drag(off.x * step, off.y * step);
  }
  console.log(`${shots} shots, ${await kills()} bots down`);
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
  encode("video/webm", ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1"]);
  encode("video/mp4", ["-c:v", "libx264", "-preset", "slow", "-crf", "27", "-movflags", "+faststart"]);
  for (const src of [shootoutClip.poster, ...shootoutClip.sources.map((s) => s.src)]) {
    copyFileSync(made(src), out(src));
    console.log("wrote", out(src));
  }
} finally {
  await browser.close();
  rmSync(frames, { recursive: true, force: true });
}
