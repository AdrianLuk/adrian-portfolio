// Grades Adrian's photo into the night, once, for the Contact section:
// public/contact/adrian-luk-*.webp at the widths in `contact.portrait`.
//
// Head and shoulders from the upper part of the photo (the shirt's print stays
// out of frame), on a canvas widened with night so there is dark space around
// him. The background (court, turf, scoreboard) is cut away by a hand-traced
// matte and sunk into the night, the overhead lights' shine on his forehead is
// tamed, his shadows go indigo, and a cyan rim of light catches his right
// edge, as if from the Outpost's towers, with a fainter violet one on his left.
//
//   node scripts/portrait.mjs
//
// Re-run it whenever the photo, the matte or the grade changes.
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { contact } from "../src/content/site.ts";

const SOURCE = "src/assets/adrian-luk.jpg";

/** The part of the photo used (its pixels): above the shirt's print. */
const CROP = { left: 0, top: 470, width: 1440, height: 2000 };

/** The canvas, in the portrait's 4:5, with the crop placed on it. */
const W = 1760;
const H = (W * contact.portrait.height) / contact.portrait.width;
const AT = { x: 160, y: H - CROP.height };

/**
 * His silhouette on the photo, traced by hand (photo pixels, clockwise from
 * the bottom left): shoulder, hand, jaw, the glasses' left lens, hair, ear,
 * neck and the other shoulder.
 */
const SILHOUETTE = [
  [0, 2470], [0, 2248], [58, 2220], [144, 2176], [245, 2133], [346, 2104],
  [418, 2083], [435, 2050], [461, 2030], [418, 1982], [374, 1925],
  [338, 1853], [312, 1766], [303, 1700], [300, 1640], [295, 1625],
  [240, 1590], [190, 1520], [173, 1428], [220, 1410], [300, 1400],
  [300, 1150], [290, 1090],
  [250, 1010], [215, 950], [202, 888], [216, 830], [259, 780], [331, 751],
  [403, 700], [490, 672], [576, 650], [677, 628], [778, 621], [864, 628],
  [950, 650], [1037, 686], [1123, 722], [1195, 780], [1224, 859],
  [1260, 916], [1282, 1003], [1289, 1089], [1274, 1190], [1253, 1276],
  [1238, 1305], [1267, 1334], [1296, 1406], [1299, 1492], [1274, 1579],
  [1238, 1644], [1195, 1694], [1181, 1737], [1188, 1852], [1202, 1953],
  [1253, 1982], [1354, 2018], [1440, 2047], [1440, 2470],
];

/** The world's palette (src/components/world/palette.ts), 0 to 1. */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const NIGHT = hex("#0b1026");
const FOG = hex("#1e2b5c");
const CYAN = hex("#3df2e6");
const VIOLET = hex("#9b6cff");
const INK = hex("#eaf2ff");

const clamp = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** One channel, blurred, as 0 to 1 floats. */
async function blurred(channel, sigma) {
  const out = await sharp(channel, { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma)
    .extractChannel(0)
    .raw()
    .toBuffer();
  return Float32Array.from(out, (v) => v / 255);
}

/** The silhouette on the canvas: white where he is, black around him. */
async function matte() {
  const d =
    SILHOUETTE.map(
      ([x, y], i) => `${i ? "L" : "M"}${x - CROP.left + AT.x} ${y - CROP.top + AT.y}`,
    ).join(" ") + "Z";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="black"/><path d="${d}" fill="white"/></svg>`;
  return sharp(Buffer.from(svg)).extractChannel(0).raw().toBuffer();
}

/** The photo's crop on the canvas, the rest of it black (the matte hides it). */
async function photo() {
  const right = W - AT.x - CROP.width;
  return sharp(SOURCE)
    .extract(CROP)
    .extend({ left: AT.x, right, top: AT.y, bottom: 0, background: "#000" })
    .removeAlpha()
    .raw()
    .toBuffer();
}

const [rgb, hard] = await Promise.all([photo(), matte()]);
const lum = Buffer.alloc(W * H);
for (let i = 0; i < W * H; i++) {
  lum[i] = Math.round(luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]));
}
const [soft, rim, wide, halo, lumBlur] = await Promise.all([
  blurred(hard, 4), // the matte's own edge
  blurred(hard, 10), // just inside the edge, for the rim light
  blurred(hard, 36), // further in, for the rim's spill and the edge's direction
  blurred(hard, 160), // a glow of fog behind him
  blurred(lum, 40), // his skin's broad shading, to tame the shine against
]);

/** Below this (on the canvas) the matte is his face and shoulders, not hair. */
const HAIRLINE = AT.y + 1300 - CROP.top;

const out = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let r = rgb[i * 3] / 255;
    let g = rgb[i * 3 + 1] / 255;
    let b = rgb[i * 3 + 2] / 255;
    const Y = luma(r, g, b);

    // Background: the night, a glow of fog behind him and the faintest trace
    // of the hall, falling off to the frame's edges.
    const edge =
      smooth(0, 0.18, x / W) * smooth(0, 0.18, 1 - x / W) * smooth(0, 0.12, y / H);
    const lift = (0.45 * halo[i] + 0.1 * Y) * edge;
    const bg = NIGHT.map((n, c) => n + (FOG[c] - n) * lift);

    // Him: the shine pressed back toward his skin's broad shading, then the
    // highlights rolled off.
    let Yt = Y;
    const shine = Y - lumBlur[i];
    if (shine > 0) Yt -= 0.5 * shine * smooth(0.6, 0.8, Y);
    if (Yt > 0.6) Yt = 0.6 + (Yt - 0.6) / (1 + (Yt - 0.6) * 3);
    const k = Y > 0.004 ? Yt / Y : 1;
    r *= k;
    g *= k;
    b *= k;
    // Calmer colour, a touch darker for the night, and cooler.
    const Yd = luma(r, g, b);
    const sat = 0.72;
    r = (Yd + (r - Yd) * sat) * 0.88 * 0.97;
    g = (Yd + (g - Yd) * sat) * 0.88 * 0.99;
    b = (Yd + (b - Yd) * sat) * 0.88 * 1.05;
    // Shadows into indigo, highlights toward the world's ink.
    const Yn = luma(r, g, b);
    const shade = 0.55 * (1 - Yn) ** 2;
    const cool = 0.15 * Yn ** 3;
    const him = [r, g, b].map(
      (v, c) => v + (FOG[c] - v) * shade + (INK[c] - v) * cool,
    );

    // His edges fade into the dark at the photo's sides and the frame's foot.
    const fade =
      smooth(AT.x, AT.x + 220, x) *
      smooth(AT.x + CROP.width, AT.x + CROP.width - 220, x) *
      smooth(H, H * 0.82, y);
    // The traced outline; around his hair, its last stretch either side is
    // left to the light, as his hair is darker than the wall behind it.
    const hair = Math.max(
      clamp((wide[i] - 0.5) * 4),
      clamp(wide[i] * 6) * (1 - smooth(0.18, 0.3, Y)),
    );
    const m =
      (soft[i] + (hair - soft[i]) * smooth(HAIRLINE, HAIRLINE - 100, y)) *
      fade;

    // The rim: on him, along his outline, cyan from his right (the frame's
    // right) with a softer spill further in, violet from the left, by the way
    // the outline faces. Around his hair it catches only the hair itself.
    const gx = wide[i + (x < W - 1 ? 1 : 0)] - wide[i - (x > 0 ? 1 : 0)];
    const gy = wide[i + (y < H - 1 ? W : 0)] - wide[i - (y > 0 ? W : 0)];
    const len = Math.hypot(gx, gy) || 1;
    const nx = -gx / len;
    const ny = -gy / len;
    const band = clamp(Math.abs(soft[i] - rim[i]) * 4) * m;
    const spill = clamp((soft[i] - wide[i]) * 1.6) * m;
    const fromRight = clamp(nx * 0.85 - ny * 0.5) ** 1.5;
    const fromLeft = clamp(-nx * 0.85 - ny * 0.3) ** 2;
    const cyanRim = (band * 0.95 + spill * 0.4) * fromRight;
    const violetRim = band * fromLeft * 0.4;

    for (let c = 0; c < 3; c++) {
      let v = bg[c] + (him[c] - bg[c]) * m;
      v = 1 - (1 - v) * (1 - CYAN[c] * cyanRim);
      v = 1 - (1 - v) * (1 - VIOLET[c] * violetRim);
      out[i * 3 + c] = Math.round(clamp(v) * 255);
    }
  }
}

mkdirSync("public/contact", { recursive: true });
const graded = sharp(out, { raw: { width: W, height: H, channels: 3 } });
for (const { src, width } of contact.portrait.stills) {
  const file = `public${src}`;
  await graded.clone().resize({ width }).webp({ quality: 80 }).toFile(file);
  console.log("wrote", file);
}
