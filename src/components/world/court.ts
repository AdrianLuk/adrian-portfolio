import { Color } from "three";
import { COURT } from "./court-size";
import { palette } from "./palette";
import type { Box } from "./skyline";
import type { Veil } from "./veil";

/**
 * Juice Bros' landmark, a pickleball court (sized in `court-size`); its own
 * module, so another scene (the Rally game's) can lay the same court out.
 */

/** How wide the court's lines are drawn, in world units: wider than life, to read. */
const LINE = 0.35;

/** How far the plinth reaches below the court, to meet uneven ground. */
const PLINTH_DEPTH = 6;

/** The plinth's footprint, the court and its lip, in world units. */
export function courtFootprint(scale: number) {
  return {
    w: (COURT.width + 2 * COURT.side) * scale,
    d: (COURT.length + 2 * COURT.back) * scale,
  };
}

export type CourtOptions = {
  /** The court's centre, where the net crosses its centre line. */
  x: number;
  z: number;
  /** The height of the court's surface. */
  level: number;
  /** World units to the foot. */
  scale: number;
  color: Color;
};

/**
 * The court as boxes, its length along z: a dark plinth under it, the court
 * and its kitchen in faint light, the lines in bright light, the net (a veil)
 * on its posts, and the net's white tape.
 */
export function layoutCourt({ x, z, level, scale, color }: CourtOptions) {
  const W = COURT.width * scale;
  const L = COURT.length * scale;
  const K = COURT.kitchen * scale;
  const half = L / 2;
  const line = (b: Omit<Box, "y" | "h" | "color">): Box => ({
    ...b,
    y: level + 0.05,
    h: 0.04,
    color: color.clone().lerp(palette.ink, 0.35),
  });

  const plinth: Box = {
    x,
    y: level - PLINTH_DEPTH / 2,
    z,
    ...courtFootprint(scale),
    h: PLINTH_DEPTH,
    // Unlit: its top is the court's ground, not a light.
    color: new Color(0, 0, 0),
  };

  const surfaces: Box[] = [
    {
      x,
      y: level + 0.01,
      z,
      w: W,
      h: 0.02,
      d: L,
      color: color.clone().multiplyScalar(0.14),
    },
    {
      x,
      y: level + 0.025,
      z,
      w: W,
      h: 0.02,
      d: 2 * K,
      color: color.clone().multiplyScalar(0.3),
    },
  ];

  const lines: Box[] = [];
  for (const end of [-1, 1]) {
    // Sideline, baseline, kitchen line, and the centre line from the kitchen
    // line back to the baseline.
    lines.push(
      line({ x: x + end * (W / 2 - LINE / 2), z, w: LINE, d: L }),
      line({ x, z: z + end * (half - LINE / 2), w: W, d: LINE }),
      line({ x, z: z + end * (K - LINE / 2), w: W, d: LINE }),
      line({ x, z: z + end * (K + (half - K) / 2), w: LINE, d: half - K }),
    );
  }

  const netHeight = COURT.netHeight * scale;
  const postOff = W / 2 + COURT.postOut * scale;
  const net: Veil = {
    x,
    y: level + netHeight / 2,
    z,
    w: 2 * postOff,
    h: netHeight,
    color: palette.ink,
  };
  const postHeight = COURT.postHeight * scale;
  const posts: Box[] = [-1, 1].map((end) => ({
    x: x + end * postOff,
    y: level + postHeight / 2,
    z,
    w: 0.3,
    h: postHeight,
    d: 0.3,
    color,
  }));
  const tape: Box = {
    x,
    y: level + netHeight - 0.06,
    z,
    w: 2 * postOff,
    h: 0.12,
    d: 0.08,
    color: palette.ink,
  };

  return { plinth, surfaces, lines, net, posts, tape, top: level };
}
