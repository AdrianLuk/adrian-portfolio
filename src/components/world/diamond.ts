import { Color } from "three";
import { palette } from "./palette";
import type { Box, Outline, Ring, Solid } from "./skyline";
import { valleyCentre } from "./terrain";

/**
 * The Diamond, a baseball stadium built from light, as boxes, rings and
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

/**
 * Where the Diamond stands: past BT Cup's bowl, right of the valley's centre
 * line (the bowl stands left), its stadium 16 off the line at its nearest
 * (the runway's lights are 14 off) and over 10 short of Victoria Harbour's
 * water, `fromCentreLine` its plinth's centre's offset. The floor narrows
 * here, so it is drawn small: the most whose stadium keeps off the court on
 * the court stop's screen and fits a phone's frame when home's route turns
 * to frame it, between the bowl and the closing view.
 */
export const DIAMOND_AT = { z: -1033, fromCentreLine: 32, scale: 0.072 };

/**
 * The stadium round the diamond, in feet. Its seats stand in the outfield,
 * as Dodger Stadium's pavilions and Wrigley's bleachers do, and over them a
 * deck, as Rogers Centre's and Fenway's Monster seats rise: past a `gap`
 * beyond the fence, `tiers` steps round it from pole to pole, each `tier`
 * deep and `rise` higher than the last, the steps from `deck` on lifted
 * `deckRise` more; built in `segments` straight runs round the curve, and
 * reaching no further than `cut` outside the foul lines. Foul ground is
 * left open, so from behind home both lines and the infield read clear to
 * the poles. Light towers `height` tall, behind the outfield's seats.
 */
const OUTFIELD_SEATS = {
  gap: 8,
  tier: 10,
  rise: 6,
  tiers: 8,
  deck: 4,
  deckRise: 14,
  segments: 12,
  cut: 25,
} as const;
const LIGHT_TOWER = { height: 160 } as const;

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
  /** The plinth's centre; home plate is its corner nearest home's end and the route's line, a lip in. */
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
 * The diamond, its foul lines square to the valley: home plate at the
 * plinth's corner nearest home's end and the route's line, one line down
 * the valley from it and the other across toward the wall, so from the
 * route the view is the broadcast one, from behind home out to centre
 * field. A dark plinth under the park; the outfield in
 * faint light out to a curved fence of light from pole to pole; the
 * infield's dirt an arc of violet behind the bases, round its grass; the
 * lines and bases in bright light, home plate a pentagon; the mound a low
 * violet hill in a ring of light; and the foul poles standing at the
 * lines' ends. Round it, a stadium: a bowl of seats beyond the fence from
 * pole to pole, a deck over its upper steps, each step's edge a row of
 * light; and light towers with banks of lamps behind the outfield. `bounds`
 * is the whole of it.
 */
export function layoutDiamond(options: DiamondOptions) {
  const { level, scale, color, side } = options;
  const B = DIAMOND.base * scale;
  const F = DIAMOND.foulLine * scale;
  // Home plate, at the plinth's corner nearest home and the route.
  const hx = options.x - (side * F) / 2;
  const hz = options.z + F / 2;
  /** World x, z off home plate of the point `a` down the valley's foul line and `c` along the other. */
  const off = (a: number, c: number) => [side * c, -a] as const;
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
  const sheet = (
    points: readonly (readonly [number, number])[],
    top: number,
    c: Color,
    wash: number,
    bottom = 0,
  ): Solid => {
    let outline: Outline = points.map(([a, c]) => off(a, c));
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
        { h: bottom, outline },
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
  const wall = (
    points: readonly (readonly [number, number])[],
    h: number,
    c: Color,
    y = h / 2,
  ): Ring => {
    const there = points.map(([a, cc]) => off(a, cc));
    const back = [...there].reverse().map(([x, z]) => {
      // A hair inward, toward home, so the loop has two faces.
      const r = Math.hypot(x, z);
      return [x * (1 - 0.06 / r), z * (1 - 0.06 / r)] as const;
    });
    return { x: hx, y: level + y, z: hz, r: 0, h, color: c, outline: [...there, ...back] };
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
      outline: pentagon.map(([a, c]) => off(a, c)),
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

  // The stadium. Every corner it reaches, in (a, c), for its bounds.
  const reaches: (readonly [number, number])[] = [];
  const foot = -PLINTH_DEPTH;
  const bodies: Box[] = [];
  /** A box over `a0` to `a1` and `c0` to `c1`, from `y0` to `y1` above the level. */
  const block = (
    a0: number,
    a1: number,
    c0: number,
    c1: number,
    y0: number,
    y1: number,
    c: Color,
  ): Box => {
    reaches.push([a0, c0], [a1, c1]);
    const [x, z] = at((a0 + a1) / 2, (c0 + c1) / 2);
    const h = y1 - y0;
    return { x, y: level + (y0 + y1) / 2, z, w: c1 - c0, h, d: a1 - a0, color: c };
  };

  // The outfield's seats, round the fence's circle from pole to pole, in
  // straight runs, kept within `cut` of the foul lines.
  const seats = OUTFIELD_SEATS;
  const cut = -seats.cut * scale;
  const inside = ([a, c]: readonly [number, number]) =>
    [Math.max(a, cut), Math.max(c, cut)] as const;
  const bleachers: Solid[] = [];
  const turn0 = Math.atan2(-k, F - k);
  const turn1 = Math.atan2(F - k, -k);
  const benchRows: Ring[] = [];
  const stepTop = (i: number) =>
    ((i + 1) * seats.rise + (i >= seats.deck ? seats.deckRise : 0)) * scale;
  const round = (r: number) =>
    arc(k, k, r, turn0, turn1)
      .filter((_, j) => j % (24 / seats.segments) === 0)
      .map(inside);
  for (let i = 0; i < seats.tiers; i++) {
    const r0 = fenceR + (seats.gap + i * seats.tier) * scale;
    const r1 = r0 + seats.tier * scale;
    const top = stepTop(i);
    const inner = round(r0);
    const outer = round(r1);
    for (let j = 0; j < seats.segments; j++) {
      const quad = [inner[j], inner[j + 1], outer[j + 1], outer[j]];
      reaches.push(...quad);
      bleachers.push(sheet(quad, top, color, 0.12, foot));
    }
    benchRows.push(wall(inner, 0.1, chalk, top + 0.05));
    if (i === seats.tiers - 1) benchRows.push(wall(outer, 0.1, chalk, top + 0.05));
  }
  const rim = fenceR + (seats.gap + seats.tiers * seats.tier) * scale;

  // Light towers, rising behind the outfield's seats.
  const towerTop = LIGHT_TOWER.height * scale;
  const towerAt = [0.06, 0.36, 0.64, 0.94].map((t) => {
    const turn = turn0 + (turn1 - turn0) * t;
    const r = rim + 0.8;
    return inside([k + r * Math.cos(turn), k + r * Math.sin(turn)]);
  });
  const lamps: Box[] = [];
  const lights: { x: number; y: number; z: number }[] = [];
  for (const [a, c] of towerAt) {
    bodies.push(block(a - 0.25, a + 0.25, c - 0.25, c + 0.25, foot, towerTop, color));
    lamps.push(
      block(a - 0.9, a + 0.9, c - 0.9, c + 0.9, towerTop, towerTop + 0.7, palette.ink),
    );
    const [x, z] = at(a, c);
    lights.push({ x, y: level + towerTop + 1, z });
  }

  const xs = reaches.map(([a, c]) => at(a, c)[0]);
  const zs = reaches.map(([a, c]) => at(a, c)[1]);
  const bounds = {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
    top: level + towerTop + 1.5,
  };

  return {
    plinth,
    home: { x: hx, z: hz },
    bounds,
    stands: { bodies, lamps, lights, bleachers, benchRows },
    surfaces,
    lines,
    bases,
    solids: [outfield, skin, plate, mound, ...bleachers],
    outfield,
    skin,
    plate,
    mound,
    rubber,
    rings: [...rings, ...benchRows],
    poles,
    level,
  };
}

/** The middle of the Diamond's stadium, in plan: where home's route looks to frame it. */
export function diamondMiddle() {
  const { z, fromCentreLine, scale } = DIAMOND_AT;
  const { bounds } = layoutDiamond({
    x: valleyCentre(z) + fromCentreLine,
    z,
    side: Math.sign(fromCentreLine) as 1 | -1,
    level: 0,
    scale,
    color: palette.cyan,
  });
  return { x: (bounds.x0 + bounds.x1) / 2, z: (bounds.z0 + bounds.z1) / 2 };
}
