// Draws the site icons from the hero's own "A": the first glyph of ADRIAN in
// src/components/world/name-glyphs.ts (Anybody, wdth 150, wght 800), set as an
// ink face over a violet extrusion on a night tile.
//
//   node scripts/favicon.mjs
//
// Writes src/app/icon.svg, src/app/favicon.ico (16, 32, 48) and
// src/app/apple-icon.png (180). Re-run it if the glyphs are regenerated.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const NIGHT = "#0b1026";
const VIOLET = "#9b6cff";
const INK = "#eaf2ff";

const glyphs = readFileSync("src/components/world/name-glyphs.ts", "utf8");
const outline = glyphs.match(/ADRIAN:[\s\S]*?outline:\s*"([^"]+)"/)[1];
// The A is the first two subpaths: the outer shape and its counter.
const a = outline
  .split(/(?=m )/)
  .slice(0, 2)
  .join("")
  .trim()
  .toUpperCase();

const points = a.match(/-?\d+/g).map(Number);
const xs = points.filter((_, i) => i % 2 === 0);
const ys = points.filter((_, i) => i % 2 === 1);
const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
const height = Math.max(...ys) - Math.min(...ys);

// In font units. DEPTH is how far the extrusion shows below the face.
const TILE = 2600;
const DEPTH = 170;
const left = (TILE - (maxX - minX)) / 2 - minX;
const top = (TILE - height - DEPTH) / 2 + height; // the baseline, y-down

function svg({ radius }) {
  const glyph = (dy, fill) =>
    `<path transform="translate(${left} ${top + dy}) scale(1 -1)" fill="${fill}" fill-rule="evenodd" d="${a}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}">`,
    `<rect width="${TILE}" height="${TILE}" rx="${radius}" fill="${NIGHT}"/>`,
    glyph(DEPTH, VIOLET),
    glyph(0, INK),
    `</svg>`,
    "",
  ].join("\n");
}

const tile = svg({ radius: 460 });
writeFileSync("src/app/icon.svg", tile);

// iOS rounds the corners itself, so the touch icon is full bleed.
await sharp(Buffer.from(svg({ radius: 0 })))
  .resize(180, 180)
  .png()
  .toFile("src/app/apple-icon.png");

// An .ico of PNG frames, for browsers that ask for /favicon.ico.
const sizes = [16, 32, 48];
const frames = await Promise.all(
  sizes.map((s) =>
    sharp(Buffer.from(tile), { density: (72 * s * 4) / TILE })
      .resize(s, s)
      .png()
      .toBuffer(),
  ),
);
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
