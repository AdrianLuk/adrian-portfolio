// Draws the site icons from the hero's own "A": the first glyph of ADRIAN in
// src/components/world/name-glyphs.ts (Anybody, wdth 150, wght 800), extruded
// as a block the way the name plate renders it: a lavender-to-violet face with
// a cyan rim, and walls receding up and right into the dark.
//
//   node scripts/favicon.mjs
//
// Writes src/app/icon.svg, src/app/favicon.ico (16, 32, 48) and
// src/app/apple-icon.png (180). Re-run it if the glyphs are regenerated.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

// Sampled from the hero's first A.
const TILE_FILL = "#121b3a";
const FACE = ["#c3c8d4", "#7a62c2"];
const RIM = "#4ff0f2";
const WALL_NEAR = "#6f4dba";
const WALL_FAR = "#141432";

const glyphs = readFileSync("src/components/world/name-glyphs.ts", "utf8");
const outline = glyphs.match(/ADRIAN:[\s\S]*?outline:\s*"([^"]+)"/)[1];

// The A is the first two subpaths, the outer shape and its counter, all
// straight lines. Flip to y-down with the cap top at 0.
const CAP = 1353;
const loops = outline
  .split(/(?=m )/)
  .slice(0, 2)
  .map((sub) => {
    const n = sub.match(/-?\d+/g).map(Number);
    const pts = [];
    for (let i = 0; i < n.length; i += 2) pts.push([n[i], CAP - n[i + 1]]);
    return pts;
  });

// The hero's camera looks at the plate from the middle of the name, so the
// A's back face shrinks towards a vanishing point up and to its right. The
// block is drawn as slices of the face, back to front, each a step nearer.
const VP = [8240, -1345];
const RECEDE = 0.072;
const SLICES = 48;
const back = ([x, y]) => [x + (VP[0] - x) * RECEDE, y + (VP[1] - y) * RECEDE];

const corners = [...loops[0], ...loops[0].map(back)];
const minX = Math.min(...corners.map((p) => p[0]));
const maxX = Math.max(...corners.map((p) => p[0]));
const minY = Math.min(...corners.map((p) => p[1]));
const maxY = CAP;

function mix(a, b, t) {
  const c = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

const r = (n) => Math.round(n);
const poly = (pts) => "M" + pts.map((p) => p.map(r).join(" ")).join("L") + "Z";
const glyphPath = loops.map(poly).join("");

function svg({ radius }) {
  const PAD = 0.06;
  const span = maxX - minX;
  const tile = span / (1 - 2 * PAD);
  const left = (tile - span) / 2 - minX;
  const top = (tile - (maxY - minY)) / 2 - minY;
  const rim = 45;

  const defs = [
    `<linearGradient id="face" x1="0" y1="0" x2="0" y2="${CAP}" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0.1" stop-color="${FACE[0]}"/><stop offset="1" stop-color="${FACE[1]}"/></linearGradient>`,
    `<path id="g" fill-rule="evenodd" clip-rule="evenodd" d="${glyphPath}"/>`,
    `<clipPath id="a"><use href="#g"/></clipPath>`,
  ];
  const slices = [];
  for (let i = SLICES; i >= 1; i--) {
    const t = i / SLICES;
    const k = 1 - RECEDE * t;
    const [vx, vy] = VP.map((v) => r(v * RECEDE * t));
    slices.push(
      `<use href="#g" fill="${mix(WALL_NEAR, WALL_FAR, t ** 0.7)}" transform="translate(${vx} ${vy}) scale(${k.toFixed(5)})"/>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(tile)} ${r(tile)}">`,
    `<defs>${defs.join("")}</defs>`,
    `<rect width="${r(tile)}" height="${r(tile)}" rx="${r(tile * radius)}" fill="${TILE_FILL}"/>`,
    `<g transform="translate(${r(left)} ${r(top)})">`,
    ...slices,
    `<path fill="url(#face)" fill-rule="evenodd" d="${glyphPath}"/>`,
    `<path fill="none" stroke="${RIM}" stroke-width="${rim * 2}" stroke-linejoin="round" clip-path="url(#a)" d="${glyphPath}"/>`,
    `</g>`,
    `</svg>`,
    "",
  ].join("\n");
}

const tile = svg({ radius: 0.18 });
const size = +tile.match(/viewBox="0 0 (\d+)/)[1];
writeFileSync("src/app/icon.svg", tile);

const render = (source, s) =>
  sharp(Buffer.from(source), { density: (72 * s * 4) / size })
    .resize(s, s)
    .png();

// iOS rounds the corners itself, so the touch icon is full bleed.
await render(svg({ radius: 0 }), 180).toFile("src/app/apple-icon.png");

// An .ico of PNG frames, for browsers that ask for /favicon.ico.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((s) => render(tile, s).toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(s, at);
  header.writeUInt8(s, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(frames[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += frames[i].length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...frames]));
