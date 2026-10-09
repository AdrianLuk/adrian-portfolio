import { Color } from "three";
import { palette } from "./palette";
import type { Box, Ring } from "./skyline";

/**
 * The Diamond, a baseball diamond built from light, as boxes (unit tested
 * without WebGL); its own module, as the court's is, for the Home Run
 * Derby to lay out its field on.
 */

/**
 * A diamond, in feet: 90 between the bases, the mound's rubber 60 feet 6
 * inches from home and the mound 18 across. The foul lines run 180 to the
 * poles, about half a real park's, so the field fits the valley's floor.
 */
export const DIAMOND = {
  base: 90,
  mound: 60.5,
  moundRadius: 9,
  foulLine: 180,
  poleHeight: 60,
  /** The plinth's lip round the field. */
  lip: 5,
} as const;

/** How wide the lines are drawn, and the bases, in world units: wider than life, to read. */
const LINE = 0.35;
const BASE = 1.1;

/** How far the plinth reaches below the field, to meet uneven ground. */
const PLINTH_DEPTH = 6;

export type DiamondOptions = {
  /** Home plate. */
  x: number;
  z: number;
  /** The height of the field. */
  level: number;
  /** World units to the foot. */
  scale: number;
  color: Color;
};

/**
 * The diamond as boxes, its foul lines square to the valley: first base
 * down it from home, third across it, so centre field faces down the
 * valley, toward its wall. A dark plinth under the field, the outfield and the
 * infield in faint light, the lines and bases in bright light, the mound a
 * ring of light, and the foul poles standing at the lines' ends.
 */
export function layoutDiamond({ x, z, level, scale, color }: DiamondOptions) {
  const B = DIAMOND.base * scale;
  const F = DIAMOND.foulLine * scale;
  const lip = DIAMOND.lip * scale;
  const chalk = color.clone().lerp(palette.ink, 0.35);
  const flat = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    y: number,
    c: Color,
  ): Box => ({ x: cx, y: level + y, z: cz, w, h: 0.04, d, color: c });

  const plinth: Box = {
    x: x - F / 2,
    y: level - PLINTH_DEPTH / 2,
    z: z - F / 2,
    w: F + 2 * lip,
    h: PLINTH_DEPTH,
    d: F + 2 * lip,
    // Unlit: its top is the field's ground, not a light.
    color: new Color(0, 0, 0),
  };

  const surfaces = [
    flat(x - F / 2, z - F / 2, F, F, 0.02, color.clone().multiplyScalar(0.1)),
    flat(x - B / 2, z - B / 2, B, B, 0.03, color.clone().multiplyScalar(0.24)),
  ];

  const lines = [
    // The foul lines, through first and third to the poles.
    flat(x, z - F / 2, LINE, F + LINE, 0.05, chalk),
    flat(x - F / 2, z, F + LINE, LINE, 0.05, chalk),
    // First to second, and second to third.
    flat(x - B / 2, z - B, B + LINE, LINE, 0.05, chalk),
    flat(x - B, z - B / 2, LINE, B + LINE, 0.05, chalk),
  ];

  // Home plate, first, second and third.
  const bases = [
    [x, z],
    [x, z - B],
    [x - B, z - B],
    [x - B, z],
  ].map(([bx, bz]) => flat(bx, bz, BASE, BASE, 0.07, palette.ink));

  const along = (DIAMOND.mound * scale) / Math.SQRT2;
  const mound: Ring = {
    x: x - along,
    y: level + 0.15,
    z: z - along,
    r: DIAMOND.moundRadius * scale,
    h: 0.3,
    color: chalk,
  };

  const poleHeight = DIAMOND.poleHeight * scale;
  const poles: Box[] = [
    [x, z - F],
    [x - F, z],
  ].map(([px, pz]) => ({
    x: px,
    y: level + (poleHeight - PLINTH_DEPTH) / 2,
    z: pz,
    w: 0.35,
    h: poleHeight + PLINTH_DEPTH,
    d: 0.35,
    color,
  }));

  return { plinth, surfaces, lines, bases, mound, poles, top: level };
}
