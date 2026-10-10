import { Color } from "three";
import { palette } from "./palette";
import type { Box, Outline, Ring, Solid, Stroke } from "./skyline";
import { valleyCentre, valleyHeight } from "./terrain";

/**
 * The Arena, a concert arena built from light, as boxes, rings, strokes and
 * a solid (unit tested without WebGL): an oval whose roof is only ribs of
 * light, a stage at its far end, down the valley, and a floor for the
 * lightstick crowd. The Encore's frame and the Hobby route's last stop.
 */

/**
 * The oval, in world units: `long` its half-length down the valley, `wide`
 * its half-width across; its wall `wall` high, and its ribs rising `crown`
 * over the wall at the middle, lower toward either end, as a dome's would.
 * `ribs` arches span it, from `ribsFrom` (as a fraction of `long`, back
 * toward home) to `ribsTo` (toward the stage), so the stage's end is open
 * to the sky and the last rib frames the stage from inside.
 */
export const ARENA = {
  long: 26,
  wide: 11,
  wall: 3,
  crown: 12,
  ribs: 8,
  ribsFrom: -0.8,
  ribsTo: 0.55,
} as const;

/**
 * Where the Arena stands: past the Diamond, on the strip of level ground
 * right of Victoria Harbour's shore, its middle `fromCentreLine` right of
 * the valley's centre line, where the valley runs straight: the only floor
 * past the Diamond inland of the water, and away from BT Cup's bowl, across
 * the valley and 125 on.
 */
export const ARENA_AT = { z: -1085, fromCentreLine: 47.5 } as const;

/**
 * The stage, in world units down the Arena's axis from its middle toward
 * its far end: its deck from `front` to `back`, `width` across and `deck`
 * high; its truss's two frames at `frames`, `span` apart across and
 * `truss` over the floor; the main screen behind the back frame, and a
 * smaller one either side of it.
 */
const STAGE = {
  front: 16,
  back: 22,
  width: 10,
  deck: 1.2,
  frames: [17, 21],
  span: 9.2,
  truss: 7,
  screen: { at: 21.5, w: 5, h: 3, lift: 1 },
  side: { at: 20.8, x: 3.6, w: 1.6, h: 2.2, lift: 1.4 },
} as const;

/** How thick the truss's bars are, and the screens. */
const BAR = 0.25;
const PANEL = 0.15;

/** How far the plinth reaches below the floor, to meet uneven ground. */
const PLINTH_DEPTH = 6;

/** Segments round the oval, and in each rib. */
const ROUND = 48;
const ARCH = 24;

export type ArenaOptions = {
  /** The oval's middle. */
  x: number;
  z: number;
  /** The height of the floor. */
  level: number;
};

/**
 * The Arena, its long axis down the valley and its stage at the far end:
 * a dark plinth under a faint violet floor; a low wall round the oval, a
 * dim panel under a bright band; ribs of violet light arching across it
 * from wall to wall, highest at the middle; and on the stage's deck a
 * truss of white light, its lamps along the front, with magenta screens
 * behind. `bounds` is the whole of it.
 */
export function layoutArena({ x, z, level }: ArenaOptions) {
  const { long: A, wide: B, wall: W } = ARENA;
  /** World z of the point `u` down the axis from the middle, toward the stage. */
  const down = (u: number) => z - u;
  /** The oval's half-width at `u` down its axis. */
  const halfWidth = (u: number) => B * Math.sqrt(Math.max(0, 1 - (u / A) ** 2));

  const oval: Outline = Array.from({ length: ROUND }, (_, i) => {
    const t = (2 * Math.PI * i) / ROUND;
    return [B * Math.cos(t), A * Math.sin(t)] as const;
  });

  /** The oval, as a slab from `bottom` to `top` about the floor. */
  const slab = (bottom: number, top: number, color: Color, wash: number): Solid => ({
    shape: "loft",
    x,
    y: level + bottom,
    z,
    rTop: 0,
    rBottom: 0,
    h: top - bottom,
    segments: ROUND,
    color,
    wash,
    sections: [
      { h: 0, outline: oval },
      { h: top - bottom, outline: oval },
    ],
  });
  // Unlit, as the Diamond's is: the plinth is ground, not a light.
  const plinth = slab(-PLINTH_DEPTH, -0.05, new Color(0, 0, 0), 0);
  const floor = slab(-0.05, 0, palette.violet, 0.25);

  const wall: Ring[] = [
    {
      x,
      y: level + W / 2,
      z,
      r: 0,
      h: W,
      color: palette.violet.clone().multiplyScalar(0.18),
      outline: oval,
    },
    { x, y: level + W - 0.15, z, r: 0, h: 0.3, color: palette.violet, outline: oval },
  ];

  const ribs: Stroke[][] = Array.from({ length: ARENA.ribs }, (_, i) => {
    const t = i / (ARENA.ribs - 1);
    const u = A * (ARENA.ribsFrom + (ARENA.ribsTo - ARENA.ribsFrom) * t);
    const b = halfWidth(u);
    const rise = ARENA.crown * (b / B);
    const point = (j: number) => {
      const a = (Math.PI * j) / ARCH;
      return [x - b * Math.cos(a), level + W + rise * Math.sin(a), down(u)] as const;
    };
    return Array.from({ length: ARCH }, (_, j) => ({
      from: point(j),
      to: point(j + 1),
      width: 0.3,
      facing: [0, 1] as const,
      color: palette.violet,
    }));
  });

  /** A box over `u0` to `u1` down the axis and `x0` to `x1` across, from `y0` to `y1` above the floor. */
  const block = (
    u0: number,
    u1: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    color = palette.ink,
  ): Box => ({
    x: x + (x0 + x1) / 2,
    y: level + (y0 + y1) / 2,
    z: down((u0 + u1) / 2),
    w: x1 - x0,
    h: y1 - y0,
    d: u1 - u0,
    color,
  });

  const s = STAGE;
  const deck = block(s.front, s.back, -s.width / 2, s.width / 2, 0, s.deck, palette.night);
  const edge = block(s.front - 0.05, s.front + 0.05, -s.width / 2, s.width / 2, s.deck - 0.2, s.deck);
  const half = s.span / 2;
  const truss: Box[] = [];
  for (const u of s.frames) {
    for (const side of [-1, 1]) {
      const at = side * half;
      truss.push(block(u - BAR / 2, u + BAR / 2, at - BAR / 2, at + BAR / 2, s.deck, s.truss));
    }
    truss.push(block(u - BAR / 2, u + BAR / 2, -half - BAR / 2, half + BAR / 2, s.truss - BAR, s.truss));
  }
  for (const side of [-1, 1]) {
    const at = side * half;
    truss.push(
      block(s.frames[0], s.frames[1], at - BAR / 2, at + BAR / 2, s.truss - BAR, s.truss),
    );
  }
  const { screen, side } = s;
  const screens: Box[] = [
    block(
      screen.at - PANEL / 2,
      screen.at + PANEL / 2,
      -screen.w / 2,
      screen.w / 2,
      s.deck + screen.lift,
      s.deck + screen.lift + screen.h,
      palette.magenta,
    ),
    ...[-1, 1].map((sign) =>
      block(
        side.at - PANEL / 2,
        side.at + PANEL / 2,
        sign * side.x - side.w / 2,
        sign * side.x + side.w / 2,
        s.deck + side.lift,
        s.deck + side.lift + side.h,
        palette.magenta,
      ),
    ),
  ];
  // The truss's lamps, along its front beam.
  const lights = [-3, -1, 1, 3].map((across) => ({
    x: x + across,
    y: level + s.truss + 0.4,
    z: down(s.frames[0]),
  }));

  const crown = Math.max(...ribs.flat().map((r) => r.from[1]));
  return {
    floor,
    solids: [plinth, floor],
    wall,
    ribs,
    stage: { deck, edge, truss, screens, lights },
    bounds: { x0: x - B, x1: x + B, z0: z - A, z1: z + A, top: crown + 0.3 },
    x,
    z,
    level,
  };
}

export type ArenaLayout = ReturnType<typeof layoutArena>;

/** The Arena as the world lays it out: at `ARENA_AT`, its floor just above the ground under it, as drawn. */
export function worldArena(): ArenaLayout {
  const { z } = ARENA_AT;
  const x = valleyCentre(z) + ARENA_AT.fromCentreLine;
  // The highest ground under the oval: at its middle, halfway out, its rim.
  let high = valleyHeight(x, z);
  for (let i = 0; i < ROUND; i++) {
    const t = (2 * Math.PI * i) / ROUND;
    for (const r of [0.5, 1]) {
      high = Math.max(
        high,
        valleyHeight(x + r * ARENA.wide * Math.cos(t), z + r * ARENA.long * Math.sin(t)),
      );
    }
  }
  // A unit over it: the terrain's facets, about 7 across, rise a little
  // above the ground between their corners near the rim.
  return layoutArena({ x, z, level: high + 1 });
}
