import { Color } from "three";
import { seededRandom } from "./noise";
import { palette } from "./palette";
import type { Box, Outline, Ring, Solid, Stroke } from "./skyline";
import { arenaFrame, ARENA_SITE, valleyHeight } from "./terrain";

/**
 * The Arena, a K-pop concert arena built from light, as solids, rings,
 * strokes, boxes and points of light (unit tested without WebGL): a
 * horseshoe of tiers seated in the valley's right wall beside Victoria
 * Harbour (where `ARENA_SITE` in ./terrain puts it and cuts its seat), its
 * stage closing the open end, a canopy over its seats, and the rest of it
 * standing out over the shore on braces raked back into the hillside, as
 * Stark's house stands out over Malibu Point. Its axis is aimed at Hong
 * Kong, so from inside the city stands behind the stage. The Encore's frame
 * and the Hobby route's last stop.
 *
 * It is laid out in its own frame: `lx` across, `lz` along its axis (-lz
 * toward Hong Kong, the stage's end), heights over its floor.
 */

/**
 * The horseshoe, in world units: the crowd's floor an oval `floor` across
 * its middle, stretched down the axis as far as the footprint is (./terrain);
 * `tiers` steps each `rise` high, filling the footprint out to its edge
 * (the last unit a parapet); the open end's `gap`, in radians, centred on
 * the stage; and `runs` straight runs round each tier.
 */
export const ARENA = {
  floor: 19,
  tiers: 13,
  rise: 1.45,
  gap: (2 * Math.PI) / 3,
  runs: 24,
} as const;

/** How far the footprint is stretched down the axis. */
export const STRETCH = ARENA_SITE.long / ARENA_SITE.wide;

/** How deep each tier is, filling the footprint to a unit inside its edge. */
const TIER = (ARENA_SITE.wide - 1 - ARENA.floor) / ARENA.tiers;

/** Where the tiers run: from `from` round the closed curve to `to` (0 is the curve's end of the axis). */
export const TIERS_SPAN = {
  from: Math.PI + ARENA.gap / 2,
  to: 3 * Math.PI - ARENA.gap / 2,
} as const;

/**
 * The canopy over the seats: from `inside` in from the tiers' outer edge out
 * to `beyond` past it, `lift` over the top tier, `thick` deep, on `posts`.
 */
const CANOPY = { inside: 9, beyond: 2, lift: 5, thick: 0.6, posts: 13 } as const;

/**
 * The stage, across the open end, in world units: its deck's front `front`
 * in from the floor's end, `width` across, `depth` deep and `deck` high; the
 * truss `truss` over the floor; the LED wall behind, and a screen either
 * side; the runway `runway` long out into the crowd, to a round B-stage.
 */
export const STAGE = {
  front: 10,
  width: 30,
  depth: 10,
  deck: 1.6,
  truss: 12.6,
  wall: { w: 18.6, h: 8.1, lift: 1, back: 9.5 },
  side: { across: 12.6, w: 3.9, h: 6.6, lift: 1, back: 8.8 },
  runway: { length: 10, width: 3, h: 1.4 },
  bStage: { r: 4, h: 1.4 },
} as const;

/** How far under the floor the underside hangs. */
export const UNDERSIDE = 2.2;

/**
 * The braces: where the rim stands out past the slope by more than
 * `clear`, every `every`th of `around` places round it, a brace rakes back
 * toward the middle to the hillside `reach` below the underside (or, with no
 * rock that close, down to the ground `fallback` of the way in), `thick`
 * across.
 */
const BRACES = {
  around: 36,
  every: 3,
  clear: 5,
  reach: 16,
  fallback: 0.3,
  thick: 2.6,
} as const;

/** Lightsticks in the stands: about one every `spacing` along each tier. */
const SEATS = { spacing: 2.6, size: 0.9 } as const;

/** The colours of the crowd's lightsticks. */
const STICKS = [palette.ink, palette.ink, palette.violet, palette.magenta, palette.cyan];

/**
 * The Encore's crowd on the floor: a lightstick about every `spacing` each
 * way, held `held` over the floor, kept `clear` off the stage, runway and
 * B-stage; filling from the stage back, each a little out of turn (`jitter`).
 */
const CROWD = { spacing: 1.5, held: 1.3, size: 0.75, clear: 0.9, jitter: 0.15 } as const;

/**
 * The Encore's light beams, from the truss's front frame up into the night:
 * `count` of them `length` long, `radius` wide at the top, fanned across
 * `fan` radians, leaning `tilt` off upright (alternately more and less).
 */
const BEAMS = { count: 6, length: 110, radius: 4.5, fan: 1.6, tilt: [0.35, 0.55] } as const;

/**
 * A beam of light: a cone from `from` (its apex, on the truss) `length` up
 * to `top`, `radius` across there, leaning `tilt` off upright toward
 * `heading` (in the Arena's frame, radians from +lz toward +lx); the show
 * sweeps it about that, out of step with the others by `phase`.
 */
export type Beam = {
  from: readonly [number, number, number];
  top: readonly [number, number, number];
  length: number;
  radius: number;
  heading: number;
  tilt: number;
  phase: number;
  color: Color;
};

/** An outline turned to run anticlockwise, as a loft's walls and cap face out and up. */
function anticlockwise(outline: Outline): Outline {
  const area = outline.reduce((sum, [x0, z0], i) => {
    const [x1, z1] = outline[(i + 1) % outline.length];
    return sum + x0 * z1 - x1 * z0;
  }, 0);
  return area < 0 ? [...outline].reverse() : outline;
}

/** The Arena's frame: its middle, its turn, and the way between its frame and the world's. */
export function arenaAxes() {
  const { x, z, ax, az } = arenaFrame();
  // Turned so the frame's -lz points along the axis, at Hong Kong.
  const turn = Math.atan2(-ax, -az);
  const sin = Math.sin(turn);
  const cos = Math.cos(turn);
  return {
    x,
    z,
    turn,
    level: ARENA_SITE.level,
    /** World (x, z) of the frame's (lx, lz). */
    toWorld: (lx: number, lz: number) =>
      [x + lx * cos + lz * sin, z - lx * sin + lz * cos] as const,
    /** The frame's (lx, lz) of world (x, z). */
    toLocal: (wx: number, wz: number) =>
      [(wx - x) * cos - (wz - z) * sin, (wx - x) * sin + (wz - z) * cos] as const,
    /** A direction in the frame, in the world's plan. */
    facing: (lx: number, lz: number) =>
      [lx * cos + lz * sin, -lx * sin + lz * cos] as const,
  };
}

/** The point at angle `a` (0 toward the curve's end) on the oval `r` across, in the frame. */
export const onOval = (a: number, r: number) =>
  [Math.sin(a) * r, Math.cos(a) * r * STRETCH] as const;

/** True if angle `a` falls in the tiers' span. */
export function inTiers(a: number) {
  const span = TIERS_SPAN.to - TIERS_SPAN.from;
  const t = (((a - TIERS_SPAN.from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return t <= span;
}

/** The top of tier `i` (from 0, the front row), over the floor. */
export const tierTop = (i: number) => (i + 1) * ARENA.rise;

/** Where tier `i` starts, across the oval: the floor's edge for the front row. */
export const tierEdge = (i: number) => ARENA.floor + i * TIER;

export function layoutArena() {
  const axes = arenaAxes();
  const { x: cx, z: cz, turn, level, toWorld, facing } = axes;
  const random = seededRandom(0xa7e4a);
  const { violet, magenta, cyan, ink } = palette;

  /** A solid over `outline` in the frame, from `bottom` to `top` over the floor. */
  const prism = (
    outline: Outline,
    bottom: number,
    top: number,
    color: Color,
    wash: number,
  ): Solid => {
    const ring = anticlockwise(outline);
    return {
      shape: "loft",
      x: cx,
      y: level + bottom,
      z: cz,
      rTop: 0,
      rBottom: 0,
      h: top - bottom,
      segments: ring.length,
      color,
      wash,
      turn,
      sections: [
        { h: 0, outline: ring },
        { h: top - bottom, outline: ring },
      ],
    };
  };
  /** A thin sheet over `outline` in the frame, `at` over the floor, facing down: an underside. */
  const ceiling = (outline: Outline, at: number, color: Color): Solid => {
    const ring = [...anticlockwise(outline)].reverse();
    return {
      shape: "loft",
      x: cx,
      y: level + at,
      z: cz,
      rTop: 0,
      rBottom: 0,
      h: 0.05,
      segments: ring.length,
      color,
      wash: 0,
      turn,
      sections: [
        { h: 0.05, outline: ring },
        { h: 0, outline: ring },
      ],
    };
  };
  /** A line of light along `points` in the frame, `y` over the floor: a ring round a thin loop. */
  const line = (
    points: readonly (readonly [number, number])[],
    y: number,
    h: number,
    color: Color,
  ): Ring => {
    const there = points.map(([lx, lz]) => {
      const [wx, wz] = toWorld(lx, lz);
      return [wx - cx, wz - cz] as const;
    });
    const back = [...there].reverse().map(([x, z]) => {
      // A hair in toward the middle, so the loop has two faces.
      const r = Math.hypot(x, z) || 1;
      return [x * (1 - 0.06 / r), z * (1 - 0.06 / r)] as const;
    });
    return { x: cx, y: level + y, z: cz, r: 0, h, color, outline: [...there, ...back] };
  };
  /** A stroke from `from` to `to` (lx, height, lz) in the frame, `width` across, facing `face` in the frame. */
  const stroke = (
    from: readonly [number, number, number],
    to: readonly [number, number, number],
    width: number,
    face: readonly [number, number],
    color: Color,
  ): Stroke => {
    const [ax, az] = toWorld(from[0], from[2]);
    const [bx, bz] = toWorld(to[0], to[2]);
    return {
      from: [ax, level + from[1], az],
      to: [bx, level + to[1], bz],
      width,
      facing: facing(face[0], face[1]),
      color,
    };
  };
  /** Points round the oval `r` across, from angle a0 to a1. */
  const arc = (r: number, a0: number, a1: number, steps = 48) =>
    Array.from({ length: steps + 1 }, (_, i) => onOval(a0 + ((a1 - a0) * i) / steps, r));

  const { from: a0, to: a1 } = TIERS_SPAN;
  const outer = ARENA_SITE.wide;
  const runAngle = (j: number) => a0 + ((a1 - a0) * j) / ARENA.runs;
  /** The quad of run `j` between ovals r0 and r1 across. */
  const run = (j: number, r0: number, r1: number): Outline => [
    onOval(runAngle(j), r0),
    onOval(runAngle(j + 1), r0),
    onOval(runAngle(j + 1), r1),
    onOval(runAngle(j), r1),
  ];

  // The crowd's floor, and the underside under it and the tiers.
  const floorOval = arc(ARENA.floor, 0, 2 * Math.PI, 48).slice(0, -1);
  const floor = prism(floorOval, -0.05, 0, violet, 0.25);
  const underside: Solid[] = [ceiling(floorOval, -UNDERSIDE, palette.night)];
  for (let j = 0; j < ARENA.runs; j++) {
    underside.push(ceiling(run(j, ARENA.floor, outer), -UNDERSIDE, palette.night));
  }

  // The tiers: a stepped prism per run of each tier, from the underside up.
  const tiers: Solid[] = [];
  for (let i = 0; i < ARENA.tiers; i++) {
    const r1 = i === ARENA.tiers - 1 ? outer : tierEdge(i + 1);
    for (let j = 0; j < ARENA.runs; j++) {
      tiers.push(prism(run(j, tierEdge(i), r1), -UNDERSIDE, tierTop(i), violet, 0.12));
    }
  }
  const top = tierTop(ARENA.tiers - 1);
  const rings: Ring[] = [
    // The front row's lip and the top rim, lit.
    line(arc(ARENA.floor, a0, a1), tierTop(0) + 0.05, 0.25, violet),
    line(arc(outer, a0, a1), top + 0.1, 0.35, violet),
    // The underside's edge, following the U: round the tiers, across the open end.
    line(
      [...arc(outer, a0, a1), ...arc(ARENA.floor, a1, a0 + 2 * Math.PI).slice(1)],
      -UNDERSIDE,
      0.5,
      cyan,
    ),
  ];

  // Lightsticks in the stands, along each tier.
  const seats: { x: number; y: number; z: number; color: Color; size: number; seed: number }[] = [];
  for (let i = 0; i < ARENA.tiers; i++) {
    const r = tierEdge(i) + TIER / 2;
    const length = ((a1 - a0) * r * (1 + STRETCH)) / 2;
    const count = Math.round(length / SEATS.spacing);
    for (let k = 0; k < count; k++) {
      const [lx, lz] = onOval(a0 + (a1 - a0) * random(), r);
      const [wx, wz] = toWorld(lx, lz);
      seats.push({
        x: wx,
        y: level + tierTop(i) + 0.7,
        z: wz,
        color: STICKS[Math.floor(random() * STICKS.length)],
        size: SEATS.size,
        seed: random(),
      });
    }
  }

  // The canopy over the seats, on posts behind the top tier, its inner edge lit.
  const inner = outer - CANOPY.inside;
  const edge = outer + CANOPY.beyond;
  const canopyY = top + CANOPY.lift;
  const canopy = Array.from({ length: ARENA.runs }, (_, j) =>
    prism(run(j, inner, edge), canopyY, canopyY + CANOPY.thick, palette.dusk, 0),
  );
  rings.push(line(arc(inner, a0, a1), canopyY - 0.1, 0.4, cyan));
  for (const a of [a0, a1]) {
    rings.push(line([onOval(a, inner), onOval(a, edge)], canopyY - 0.1, 0.4, cyan));
  }
  const posts: Box[] = Array.from({ length: CANOPY.posts }, (_, i) => {
    const [lx, lz] = onOval(a0 + ((a1 - a0) * i) / (CANOPY.posts - 1), outer - 0.4);
    const [wx, wz] = toWorld(lx, lz);
    return {
      x: wx,
      y: level + (top + canopyY) / 2,
      z: wz,
      w: 0.7,
      h: canopyY - top,
      d: 0.7,
      color: palette.dusk,
    };
  });

  // The stage, across the open end, facing up the axis.
  const s = STAGE;
  const front = -ARENA.floor * STRETCH + s.front;
  const half = s.width / 2;
  const rect = (x0: number, x1: number, z0: number, z1: number): Outline => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const deck = prism(rect(-half, half, front - s.depth, front), 0, s.deck, palette.night, 0);
  const runway = prism(
    rect(-s.runway.width / 2, s.runway.width / 2, front, front + s.runway.length),
    0,
    s.runway.h,
    palette.night,
    0,
  );
  const [bx, bz] = toWorld(0, front + s.runway.length + s.bStage.r - 1);
  const bStage: Solid = {
    shape: "frustum",
    x: bx,
    y: level,
    z: bz,
    rTop: s.bStage.r,
    rBottom: s.bStage.r,
    h: s.bStage.h,
    segments: 32,
    color: palette.night,
    wash: 0,
  };
  rings.push({
    x: bx,
    y: level + s.bStage.h + 0.05,
    z: bz,
    r: s.bStage.r + 0.05,
    h: 0.25,
    color: magenta,
  });
  const up = [0, 1] as const;
  const across = [1, 0] as const;
  const screen = stroke(
    [-s.wall.w / 2, s.deck + s.wall.lift + s.wall.h / 2, front - s.wall.back],
    [s.wall.w / 2, s.deck + s.wall.lift + s.wall.h / 2, front - s.wall.back],
    s.wall.h,
    up,
    magenta,
  );
  const strokes: Stroke[] = [
    screen,
    // The deck's lit front edge, and the runway's sides.
    stroke([-half, s.deck, front], [half, s.deck, front], 0.25, up, ink),
    ...[-1, 1].map((side) =>
      stroke(
        [(side * s.runway.width) / 2, s.runway.h, front],
        [(side * s.runway.width) / 2, s.runway.h, front + s.runway.length],
        0.2,
        [side, 0],
        magenta,
      ),
    ),
    // A screen either side of the LED wall.
    ...[-1, 1].map((side) =>
      stroke(
        [side * s.side.across - s.side.w / 2, s.deck + s.side.lift + s.side.h / 2, front - s.side.back],
        [side * s.side.across + s.side.w / 2, s.deck + s.side.lift + s.side.h / 2, front - s.side.back],
        s.side.h,
        up,
        violet,
      ),
    ),
  ];
  // The truss: two frames across the deck, joined over its sides.
  const frames = [front - 1, front - s.depth + 1];
  const truss: Stroke[] = [];
  for (const fz of frames) {
    for (const side of [-1, 1]) {
      truss.push(stroke([side * half, s.deck, fz], [side * half, s.truss, fz], 0.5, up, ink));
    }
    truss.push(stroke([-half, s.truss, fz], [half, s.truss, fz], 0.5, up, ink));
  }
  for (const side of [-1, 1]) {
    truss.push(
      stroke([side * half, s.truss, frames[0]], [side * half, s.truss, frames[1]], 0.5, across, ink),
    );
  }
  strokes.push(...truss);
  const lamps = Array.from({ length: 8 }, (_, i) => {
    const [wx, wz] = toWorld(-half + 2 + (i * (s.width - 4)) / 7, frames[0]);
    return { x: wx, y: level + s.truss - 0.6, z: wz };
  });

  // The Encore's crowd, filling the floor from the stage back.
  const bStageAt = [0, front + s.runway.length + s.bStage.r - 1] as const;
  const back = ARENA.floor * STRETCH;
  const crowd: { x: number; y: number; z: number; color: Color; size: number; seed: number }[] = [];
  for (let lz = front + CROWD.clear; lz < back; lz += CROWD.spacing) {
    for (let lx = -ARENA.floor; lx < ARENA.floor; lx += CROWD.spacing) {
      const jx = lx + (random() - 0.5) * CROWD.spacing * 0.6;
      const jz = lz + (random() - 0.5) * CROWD.spacing * 0.6;
      const order = random();
      const pick = random();
      if (Math.hypot(jx, jz / STRETCH) > ARENA.floor - CROWD.clear) continue;
      if (jz < front + CROWD.clear) continue;
      if (Math.abs(jx) < s.runway.width / 2 + CROWD.clear && jz < front + s.runway.length) continue;
      if (Math.hypot(jx - bStageAt[0], jz - bStageAt[1]) < s.bStage.r + CROWD.clear) continue;
      const [wx, wz] = toWorld(jx, jz);
      const depth = (jz - front) / (back - front);
      crowd.push({
        x: wx,
        y: level + CROWD.held,
        z: wz,
        color: STICKS[Math.floor(pick * STICKS.length)],
        size: CROWD.size,
        seed: Math.min(1, Math.max(0, depth * (1 - CROWD.jitter) + order * CROWD.jitter)),
      });
    }
  }

  // The Encore's beams, from the truss's front frame into the night.
  const beamColors = [cyan, violet, magenta];
  const beams: Beam[] = Array.from({ length: BEAMS.count }, (_, i) => {
    const u = i / (BEAMS.count - 1);
    const [ax, az] = toWorld(-half + 1 + u * (s.width - 2), frames[0]);
    // Fanned out across the stage, leaning back from the crowd, toward the city.
    const heading = Math.PI + (u - 0.5) * BEAMS.fan;
    const tilt = BEAMS.tilt[i % 2];
    const [dx, dz] = facing(Math.sin(tilt) * Math.sin(heading), Math.sin(tilt) * Math.cos(heading));
    const from = [ax, level + s.truss, az] as const;
    return {
      from,
      top: [
        ax + dx * BEAMS.length,
        from[1] + Math.cos(tilt) * BEAMS.length,
        az + dz * BEAMS.length,
      ] as const,
      length: BEAMS.length,
      radius: BEAMS.radius,
      heading,
      tilt,
      phase: u * Math.PI * 2,
      color: beamColors[i % beamColors.length],
    };
  });

  // The braces, where the U stands out over the slope.
  const braces: Solid[] = [];
  const braceLights: { x: number; y: number; z: number }[] = [];
  const underY = level - UNDERSIDE;
  let standing = 0;
  for (let i = 0; i < BRACES.around; i++) {
    const a = (i / BRACES.around) * 2 * Math.PI;
    const [lx, lz] = onOval(a, (inTiers(a) ? outer : ARENA.floor) * 0.97);
    const [tx, tz] = toWorld(lx, lz);
    if (valleyHeight(tx, tz) > underY - BRACES.clear) continue;
    if (standing++ % BRACES.every !== 0) continue;
    // Back toward the middle, to the hillside within reach; else down to the ground.
    let foot: [number, number, number] | null = null;
    for (let k = 0.04; k <= 1; k += 0.02) {
      const fx = tx + (cx - tx) * k;
      const fz = tz + (cz - tz) * k;
      const h = valleyHeight(fx, fz);
      if (h >= underY - BRACES.reach) {
        foot = [fx, Math.max(h, underY - BRACES.reach), fz];
        break;
      }
    }
    if (!foot) {
      const fx = tx + (cx - tx) * BRACES.fallback;
      const fz = tz + (cz - tz) * BRACES.fallback;
      foot = [fx, valleyHeight(fx, fz), fz];
    }
    // From a unit into the rock, so it reads as braced into the face.
    const [fx, fy, fz] = foot;
    const base = fy - 1;
    const t = BRACES.thick / 2;
    const square = (ox: number, oz: number): Outline =>
      anticlockwise([
        [ox - t, oz - t],
        [ox + t, oz - t],
        [ox + t, oz + t],
        [ox - t, oz + t],
      ]);
    braces.push({
      shape: "loft",
      x: fx,
      y: base,
      z: fz,
      rTop: 0,
      rBottom: 0,
      h: underY - base,
      segments: 4,
      color: palette.dusk.clone().lerp(violet, 0.2),
      wash: 0.05,
      sections: [
        { h: 0, outline: square(0, 0) },
        { h: underY - base, outline: square(tx - fx, tz - fz) },
      ],
    });
    // A line of light up its outer side, and a lamp where it meets the underside.
    const away = Math.hypot(tx - cx, tz - cz);
    const [ux, uz] = [(tx - cx) / away, (tz - cz) / away];
    const o = t + 0.1;
    strokes.push({
      from: [fx + ux * o, base, fz + uz * o],
      to: [tx + ux * o, underY, tz + uz * o],
      width: 0.3,
      facing: [ux, uz],
      color: cyan,
    });
    braceLights.push({ x: tx + ux * o, y: underY - 0.5, z: tz + uz * o });
  }

  // Its bounds in plan, the canopy's reach round the footprint.
  const reach = arc(edge, 0, 2 * Math.PI, 72).map(([lx, lz]) => toWorld(lx, lz));
  const xs = reach.map(([x]) => x);
  const zs = reach.map(([, z]) => z);
  const bounds = {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    z0: Math.min(...zs),
    z1: Math.max(...zs),
    top: level + canopyY + CANOPY.thick,
  };

  return {
    ...axes,
    floor,
    tiers,
    underside,
    canopy,
    posts,
    canopyY,
    canopyEdges: { inner, edge },
    stage: { deck, runway, bStage, front, lamps, screen, truss },
    braces,
    braceLights,
    seats,
    crowd,
    beams,
    rings,
    strokes,
    solids: [floor, ...tiers, ...underside, ...canopy, deck, runway, bStage, ...braces],
    bounds,
  };
}

export type ArenaLayout = ReturnType<typeof layoutArena>;
