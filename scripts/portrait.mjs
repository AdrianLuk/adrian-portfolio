// Grades Adrian's photo into the night, once, for the Contact section:
// public/contact/adrian-luk-*.webp at the sizes in `contact.portrait`.
//
// Head and shoulders from the upper part of the photo (the shirt's print stays
// out of frame). Nothing is cut out: the photo is kept whole, wall, hair and
// all, and the night is graded into it. Its greys are pressed down into the
// dark while his skin keeps its light, the court's blue, the turf's green, the
// scoreboard's glow and the floor's white are drained and sunk, the overhead
// lights' shine on his forehead is tamed, his shadows go indigo, and a cyan
// rim of light catches his right edge, as if from the Outpost's towers. A
// wide, heavily feathered vignette centred on his head and shoulders lets the
// frame's edges fall into the night.
//
//   node scripts/portrait.mjs
//
// Re-run it whenever the photo or the grade changes.
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { contact } from "../src/content/site.ts";

const SOURCE = "src/assets/adrian-luk.jpg";

/** The part of the photo used (its pixels): above the shirt's print. */
const CROP = { left: 0, top: 470, width: 1440, height: 2000 };
/**
 * The canvas, in the stills' 4:5: the crop, widened either side with its own
 * reflection, which the vignette sinks into the night.
 */
const SIDE = 80;
const W = CROP.width + 2 * SIDE;
const H = CROP.height;

/**
 * The vignette's ellipse, on the canvas: centred on his head and shoulders,
 * reaching further up than down, so his hair stays clear of it.
 */
const CENTRE = { x: 850, y: 1080 };
const RADII = { x: 750, up: 1250, down: 950 };

/**
 * His eyes, on the canvas: kept as photographed. Their whites and irises are
 * neither warm nor dark, so the grade that sinks the hall's greys would take
 * them too; inside these (feathered out to `feather` times their size) it
 * leaves them alone.
 */
const EYES = [
  { x: 465, y: 990 },
  { x: 770, y: 975 },
];
const EYE = { x: 120, y: 65, feather: 1.6 };
/** How much of an eye a canvas pixel is, 0 to 1. */
const eyeAt = (x, y) =>
  Math.max(
    ...EYES.map((e) =>
      smooth(EYE.feather, 1, Math.hypot((x - e.x) / EYE.x, (y - e.y) / EYE.y)),
    ),
  );

/** The world's palette (src/components/world/palette.ts), 0 to 1. */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const NIGHT = hex("#0b1026");
const FOG = hex("#1e2b5c");
const CYAN = hex("#3df2e6");
const INK = hex("#eaf2ff");

const clamp = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** The fog's hue at unit brightness: a shadow times this is that shadow, indigo. */
const INDIGO = FOG.map((v) => v / luma(...FOG));
/**
 * How warm a colour is (his skin, lit or in shadow), 0 (grey, the floor's
 * off-white, blue or green) to 1.
 */
const warmth = (r, g, b) =>
  smooth(0.12, 0.3, (r - b) / (r + 0.02)) * smooth(-0.03, 0.02, r - g);

/** One channel (0 to 255 bytes), blurred, as 0 to 1 floats. */
async function blurred(channel, sigma) {
  const out = await sharp(channel, { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma)
    .extractChannel(0)
    .raw()
    .toBuffer();
  return Float32Array.from(out, (v) => v / 255);
}

const rgb = await sharp(SOURCE)
  .extract(CROP)
  .extend({ left: SIDE, right: SIDE, extendWith: "mirror" })
  .removeAlpha()
  .raw()
  .toBuffer();
const lum = Buffer.alloc(W * H);
const warm = Buffer.alloc(W * H);
for (let i = 0; i < W * H; i++) {
  const [r, g, b] = [0, 1, 2].map((c) => rgb[i * 3 + c] / 255);
  lum[i] = Math.round(255 * luma(r, g, b));
  warm[i] = Math.round(255 * warmth(r, g, b));
}
const [lumBroad, warmSoft] = await Promise.all([
  blurred(lum, 40), // his skin's broad shading, to tame the shine against
  blurred(warm, 6), // his skin, softened, for where the rim falls
]);

// The rim: along his skin's outermost edge on the right (his ear, jaw and
// neck against the wall and his shirt), where there is no more of him further
// right, softened so it draws no line.
const RIM = { width: 22, clear: 260 };
/** Above this (on the canvas) his skin's right edge is his temple, under his hair. */
const HAIRLINE = 1300 - CROP.top;
/** Below this (on the canvas) it is his neck. */
const JAW = 1650 - CROP.top;
const rimEdge = Buffer.alloc(W * H);
const row = new Float32Array(W + 1);
for (let y = 0; y < H; y++) {
  // His skin's running total along the row, to ask how much lies to the right.
  for (let x = 0; x < W; x++) row[x + 1] = row[x] + warmSoft[y * W + x];
  const skinBetween = (a, b) => {
    const [from, to] = [Math.min(W, Math.max(0, a)), Math.min(W, Math.max(0, b))];
    return to > from ? (row[to] - row[from]) / (to - from) : 0;
  };
  for (let x = 0; x < W; x++) {
    const here = skinBetween(x - RIM.width, x);
    const beyond = skinBetween(x + 6, x + RIM.clear);
    const edge = smooth(0.35, 0.75, here) * smooth(0.18, 0.04, beyond);
    // Brightest at his ear and jaw, fading down his neck to his collar.
    const reach =
      smooth(HAIRLINE, HAIRLINE + 140, y) * (1 - 0.65 * smooth(JAW, JAW + 450, y));
    const side = smooth(CENTRE.x, CENTRE.x + 300, x) * reach;
    rimEdge[y * W + x] = Math.round(255 * edge * side);
  }
}
const rim = await blurred(rimEdge, 14);

const out = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let r = rgb[i * 3] / 255;
    let g = rgb[i * 3 + 1] / 255;
    let b = rgb[i * 3 + 2] / 255;
    const Y = luma(r, g, b);
    const skin = warmth(r, g, b);
    const eye = eyeAt(x, y);

    // The shine pressed back toward his skin's broad shading and the
    // highlights rolled off.
    let Yt = Y;
    const shine = Y - lumBroad[i];
    if (shine > 0) Yt -= 0.5 * shine * smooth(0.55, 0.8, Y);
    if (Yt > 0.6) Yt = 0.6 + (Yt - 0.6) / (1 + (Yt - 0.6) * 3);
    // The hall's greys sunk: the wall is lighter than his hair and greyer
    // than his skin, so lit grey goes down by half (the wall stays a wall,
    // his hair still dark against it), and the floor's white nearly all the
    // way. Then a gentle toe deepens what is left.
    const grey = 0.5 * smooth(0.24, 0.42, Y) + 0.4 * smooth(0.5, 0.75, Y);
    Yt *= 1 - (1 - skin) * grey;
    Yt *= 0.45 + 0.55 * smooth(0.04, 0.5, Yt);
    // His eyes keep their own light.
    Yt += (Y - Yt) * eye;
    const k = Y > 0.004 ? Yt / Y : 1;
    r *= k;
    g *= k;
    b *= k;

    // The hall's colours drained: the court's blue, the turf's green and the
    // scoreboard's glow (his skin leans red, his shirt and hair are near
    // grey, so they keep theirs).
    const blue = clamp((b - Math.max(r, g * 0.85)) * 5);
    const green = clamp((g - Math.max(r, b) * 1.05) * 6);
    const hall = Math.max(blue, green);

    // Calmer colour, a touch darker for the night, and cooler.
    const Yd = luma(r, g, b);
    const sat = 0.72 * (1 - hall);
    const dim = 0.92 * (1 - 0.85 * hall);
    r = (Yd + (r - Yd) * sat) * dim * 0.96;
    g = (Yd + (g - Yd) * sat) * dim * 0.99;
    b = (Yd + (b - Yd) * sat) * dim * 1.06;

    // Shadows into indigo (tinted, not lifted, so his hair stays dark),
    // highlights toward the world's ink, and a faint cyan fill on his right,
    // from the light that rims him.
    const Yn = luma(r, g, b);
    const shade = 0.8 * smooth(0.3, 0.02, Yn) * (1 - eye);
    const cool = 0.12 * Yn ** 3;
    const fill = 0.07 * skin * smooth(CENTRE.x - 100, CENTRE.x + 300, x);
    let px = [r, g, b].map(
      (v, c) =>
        v +
        (Yn * INDIGO[c] - v) * shade +
        (INK[c] - v) * cool +
        CYAN[c] * Yn * fill,
    );

    // The vignette: the frame's edges fall into the night, feathered from
    // well inside the ellipse to past it, so no edge shows.
    const dx = (x - CENTRE.x) / RADII.x;
    const dy = (y - CENTRE.y) / (y < CENTRE.y ? RADII.up : RADII.down);
    const night = smooth(0.45, 1.05, Math.hypot(dx, dy));
    px = px.map((v, c) => v + (NIGHT[c] - v) * night);

    // The rim, screened over, fading with the vignette.
    const glow = clamp(rim[i] * 0.7 * (1 - night));
    for (let c = 0; c < 3; c++) {
      const v = 1 - (1 - px[c]) * (1 - CYAN[c] * glow);
      out[i * 3 + c] = Math.round(clamp(v) * 255);
    }
  }
}

mkdirSync("public/contact", { recursive: true });
const graded = sharp(out, { raw: { width: W, height: H, channels: 3 } });
for (const { src, width, height } of contact.portrait.stills) {
  const file = `public${src}`;
  await graded
    .clone()
    .resize({ width, height, fit: "cover" })
    .webp({ quality: 80 })
    .toFile(file);
  console.log("wrote", file);
}
