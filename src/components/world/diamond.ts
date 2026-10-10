import { Color } from "three";
import { palette } from "./palette";
import type { Box, Outline, Ring, Solid } from "./skyline";

/**
 * The Diamond, a baseball diamond built from light, as boxes, rings and
 * solids (unit tested without WebGL); its own module, as the court's is, for
 * the Home Run Derby to lay out the Diamond on.
 */

/**
 * A diamond, in feet: 90 between the bases, the mound's rubber 60 feet 6
 * inches from home and the mound 18 across, the infield's dirt 95 out from
 * the rubber. The foul lines run 180 to the poles and the fence bows out to
 * 225 in centre field, about half a real park's, so the park fits the
 * valley's floor.
 */
export const DIAMOND = {
  base: 90,
  mound: 60.5,
  moundRadius: 9,
  skin: 95,
  foulLine: 180,
  centreField: 225,
  poleHeight: 60,
  /** The plinth's lip round the park. */
  lip: 5,
} as const;

/** How wide the lines are drawn, and the bases, in world units: wider than life, to read. */
const LINE = 0.35;
const BASE = 1.1;

/** How high the mound stands, in world units: far higher than life, to read as a hill. */
const MOUND_RISE = 0.8;

/** How high the fence stands, in world units. */
const FENCE = 0.9;

/** How far the plinth reaches below the field, to meet uneven ground. */
const PLINTH_DEPTH = 6;

/** Points round an arc about (ca, cc), radius r, from angle a0 to a1. */
function arc(ca: number, cc: number, r: number, a0: number, a1: number) {
  const steps = 24;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / steps;
    return [ca + r * Math.cos(t), cc + r * Math.sin(t)] as const;
  });
}

/** The plinth's footprint: the foul lines' square and a lip round it. */
export function diamondFootprint(scale: number) {
  const span = (DIAMOND.foulLine + 2 * DIAMOND.lip) * scale;
  return { w: span, d: span };
}

export type DiamondOptions = {
  /** The plinth's centre; home plate is its corner nearest home and the route's line, a lip in. */
  x: number;
  z: number;
  /** Which side of the valley it stands: -1 left, 1 right. */
  side: 1 | -1;
  /** The height of the field. */
  level: number;
  /** World units to the foot. */
  scale: number;
  color: Color;
};

/**
 * The diamond, its foul lines square to the valley: one down it from home,
 * the other across it toward the wall, so centre field faces down the
 * valley, toward its wall. A dark plinth under the park; the outfield in
 * faint light out to a curved fence of light from pole to pole; the
 * infield's dirt an arc of violet behind the bases, round its grass; the
 * lines and bases in bright light, home plate a pentagon; the mound a low
 * violet hill in a ring of light; and the foul poles standing at the
 * lines' ends.
 */
export function layoutDiamond(options: DiamondOptions) {
  const { level, scale, color, side } = options;
  const B = DIAMOND.base * scale;
  const F = DIAMOND.foulLine * scale;
  // Home plate.
  const hx = options.x - (side * F) / 2;
  const hz = options.z + F / 2;
  /** World x, z of the point `a` down the valley's foul line and `c` along the other. */
  const at = (a: number, c: number) => [hx + side * c, hz - a] as const;
  const chalk = color.clone().lerp(palette.ink, 0.35);
  const dirt = palette.violet;
  /** A flat box over `a0` to `a1` down the valley and `c0` to `c1` across. */
  const flat = (
    a0: number,
    a1: number,
    c0: number,
    c1: number,
    y: number,
    c: Color,
  ): Box => {
    const [x, z] = at((a0 + a1) / 2, (c0 + c1) / 2);
    return { x, y: level + y, z, w: c1 - c0, h: 0.04, d: a1 - a0, color: c };
  };
  /** A thin flat solid over an outline in (a, c), wound to face up. */
  const sheet = (points: readonly (readonly [number, number])[], top: number, c: Color, wash: number): Solid => {
    let outline: Outline = points.map(([a, c]) => [side * c, -a] as const);
    const area = outline.reduce((sum, [x0, z0], i) => {
      const [x1, z1] = outline[(i + 1) % outline.length];
      return sum + x0 * z1 - x1 * z0;
    }, 0);
    if (area < 0) outline = [...outline].reverse();
    return {
      shape: "loft",
      x: hx,
      y: level,
      z: hz,
      rTop: 0,
      rBottom: 0,
      h: top,
      segments: outline.length,
      color: c,
      wash,
      sections: [
        { h: 0, outline },
        { h: top, outline },
      ],
    };
  };

  const plinth: Box = {
    x: options.x,
    y: level - PLINTH_DEPTH / 2,
    z: options.z,
    ...diamondFootprint(scale),
    h: PLINTH_DEPTH,
    // Unlit: its top is the field's ground, not a light.
    color: new Color(0, 0, 0),
  };

  // The fence: a circle through both poles, out to centre field on the
  // line from home through second.
  const D = (DIAMOND.centreField * scale) / Math.SQRT2;
  const k = (2 * D * D - F * F) / (4 * D - 2 * F);
  const fenceR = Math.hypot(F - k, k);
  const fenceArc = arc(k, k, fenceR, Math.atan2(-k, F - k), Math.atan2(F - k, -k));

  // The infield's dirt: a circle round the rubber, from foul line to foul line.
  const m = (DIAMOND.mound * scale) / Math.SQRT2;
  const skinR = DIAMOND.skin * scale;
  const reach = m + Math.sqrt(skinR * skinR - m * m);
  const skinArc = arc(m, m, skinR, Math.atan2(-m, reach - m), Math.atan2(reach - m, -m));

  const outfield = sheet([[0, 0], ...fenceArc], 0.03, color, 0.35);
  const skin = sheet([[0, 0], ...skinArc], 0.06, dirt, 0.7);
  const surfaces = [flat(0, B, 0, B, 0.08, color.clone().multiplyScalar(0.24))];

  const lines = [
    // The foul lines, out past the bases to the poles.
    flat(-LINE / 2, F + LINE / 2, -LINE / 2, LINE / 2, 0.12, chalk),
    flat(-LINE / 2, LINE / 2, -LINE / 2, F + LINE / 2, 0.12, chalk),
    // The base paths' far sides, round second.
    flat(B - LINE / 2, B + LINE / 2, -LINE / 2, B + LINE / 2, 0.12, chalk),
    flat(-LINE / 2, B + LINE / 2, B - LINE / 2, B + LINE / 2, 0.12, chalk),
  ];

  // The three bases, square; home plate is the pentagon below.
  const bases = [
    [B, 0],
    [B, B],
    [0, B],
  ].map(([a, c]) =>
    flat(a - BASE / 2, a + BASE / 2, c - BASE / 2, c + BASE / 2, 0.15, palette.ink),
  );

  // Home plate, its point at the lines' corner: two sides down the lines,
  // two square to them and its front edge facing the mound.
  const P = 0.9;
  const s = P * (8.5 / 12 / Math.SQRT2);
  const pentagon = [
    [0, 0],
    [P, 0],
    [P + s, s],
    [s, P + s],
    [0, P],
  ] as const;
  const plate = sheet(pentagon, 0.17, palette.ink, 1);

  const [mx, mz] = at(m, m);
  const moundR = DIAMOND.moundRadius * scale;
  const mound: Solid = {
    shape: "frustum",
    x: mx,
    y: level + 0.08,
    z: mz,
    rTop: moundR * 0.25,
    rBottom: moundR,
    h: MOUND_RISE,
    segments: 16,
    color: dirt,
    wash: 0.8,
  };
  // The rubber, a fleck of light atop the mound.
  const rubber: Box = {
    x: mx,
    y: mound.y + MOUND_RISE + 0.03,
    z: mz,
    w: 0.3,
    h: 0.06,
    d: 0.3,
    color: palette.ink,
  };

  /** A wall of light along `points` (in a, c), as a ring round a thin loop. */
  const wall = (points: readonly (readonly [number, number])[], h: number, c: Color): Ring => {
    const there = points.map(([a, cc]) => [side * cc, -a] as const);
    const back = [...there].reverse().map(([x, z]) => {
      // A hair inward, toward home, so the loop has two faces.
      const r = Math.hypot(x, z);
      return [x * (1 - 0.06 / r), z * (1 - 0.06 / r)] as const;
    });
    return { x: hx, y: level + h / 2, z: hz, r: 0, h, color: c, outline: [...there, ...back] };
  };
  const rings: Ring[] = [
    { x: mx, y: level + 0.14, z: mz, r: moundR + 0.05, h: 0.12, color: chalk },
    wall(fenceArc, FENCE, color),
    {
      x: hx,
      y: level + 0.17,
      z: hz,
      r: 0,
      h: 0.1,
      color: palette.ink,
      outline: pentagon.map(([a, c]) => [side * c, -a] as const),
    },
  ];

  const poleHeight = DIAMOND.poleHeight * scale;
  const poles: Box[] = [
    at(F, 0),
    at(0, F),
  ].map(([px, pz]) => ({
    x: px,
    y: level + (poleHeight - PLINTH_DEPTH) / 2,
    z: pz,
    w: 0.35,
    h: poleHeight + PLINTH_DEPTH,
    d: 0.35,
    color,
  }));

  return {
    plinth,
    home: { x: hx, z: hz },
    surfaces,
    lines,
    bases,
    solids: [outfield, skin, plate, mound],
    outfield,
    skin,
    plate,
    mound,
    rubber,
    rings,
    poles,
    level,
  };
}
