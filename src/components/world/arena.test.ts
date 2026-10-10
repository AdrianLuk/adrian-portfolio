import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  ARENA,
  inTiers,
  layoutArena,
  STAGE,
  STRETCH,
  tierEdge,
  tierTop,
  TIERS_SPAN,
  UNDERSIDE,
} from "./arena";
import type { Pose } from "./flight";
import { HONG_KONG_CENTRE } from "./hong-kong";
import { nominalRoute } from "./nominal-route";
import { FOG_DENSITY } from "./palette";
import { CAMERA } from "./pose";
import {
  arenaView,
  arenaWayIn,
  courtPose,
  hongKongPose,
  playView,
  ROUTE_STOPS,
  SITES,
  skylinePose,
} from "./route";
import type { Box } from "./skyline";
import { layoutStructures } from "./structures";
import {
  ARENA_SITE,
  heightBeforeArena,
  surfaceHeight,
  valleyCentre,
  valleyHeight,
  waterAt,
} from "./terrain";
import { transitPath, transitWithin } from "./transit";

const arena = layoutArena();
const { level } = arena;
const { buildings, masts, landmarks, skyline, hongKong } = layoutStructures();
const arenaBox = landmarks.arena;

/** A point in the Arena's frame: across (lx), along its axis (lz), its radius on the oval and its angle. */
function framed(x: number, z: number) {
  const [lx, lz] = arena.toLocal(x, z);
  return { lx, lz, r: Math.hypot(lx, lz / STRETCH), a: Math.atan2(lx, lz / STRETCH) };
}

/** Every screen shape the court's poses are tested for, phone first. */
const shapes = {
  phone: 0.46,
  "narrow phone": 0.4,
  "tablet, portrait": 0.75,
  square: 1,
  "tablet, landscape": 1.33,
  desktop: 1.6,
  ultrawide: 2.4,
};

describe("the Arena", () => {
  it("is a horseshoe longer down its axis than across: tiers round its closed curve, the open end left to the stage", () => {
    expect(STRETCH).toBeGreaterThan(1.2);
    const span = TIERS_SPAN.to - TIERS_SPAN.from;
    expect(span).toBeLessThan(2 * Math.PI - 1);
    expect(inTiers(0)).toBe(true);
    expect(inTiers(Math.PI)).toBe(false);
    // Every tier's every corner in the span, from the floor's edge out to the footprint's.
    for (const tier of arena.tiers) {
      for (const [lx, lz] of tier.sections![0].outline) {
        const r = Math.hypot(lx, lz / STRETCH);
        expect(r).toBeGreaterThanOrEqual(ARENA.floor - 1e-6);
        expect(r).toBeLessThanOrEqual(ARENA_SITE.wide + 1e-6);
        expect(inTiers(Math.atan2(lx, lz / STRETCH))).toBe(true);
      }
    }
    // Stepping up row by row, a stadium's worth of them.
    expect(ARENA.tiers).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < ARENA.tiers; i++) {
      expect(tierTop(i)).toBeGreaterThan(tierTop(i - 1));
      expect(tierEdge(i)).toBeGreaterThan(tierEdge(i - 1));
    }
    expect(arena.seats.length).toBeGreaterThan(500);
  });

  it("closes the open end with a stage facing up the axis: a deck, an LED wall on the axis, a truss over it, a runway out to a B-stage", () => {
    const { deck, runway, screen, truss, front } = arena.stage;
    // The deck across the open end, on the floor's end of the axis.
    expect(front).toBeLessThan(0);
    expect(front).toBeGreaterThan(-ARENA.floor * STRETCH);
    expect(deck.sections![1].h).toBeCloseTo(STAGE.deck);
    // The LED wall's middle on the axis, behind the deck's front, facing up the axis.
    const mid = [(screen.from[0] + screen.to[0]) / 2, (screen.from[2] + screen.to[2]) / 2];
    const { lx, lz } = framed(mid[0], mid[1]);
    expect(Math.abs(lx)).toBeLessThan(1e-6);
    expect(lz).toBeLessThan(front);
    const [fx, fz] = screen.facing;
    const toCurve = arena.facing(0, 1);
    expect(fx * toCurve[0] + fz * toCurve[1]).toBeCloseTo(1);
    // The truss stands over the deck, higher than the wall's top.
    expect(Math.max(...truss.map((s) => Math.max(s.from[1], s.to[1])))).toBeGreaterThan(
      screen.from[1] + screen.width / 2,
    );
    // The runway runs from the deck's front out into the crowd, to the B-stage.
    const run = runway.sections![0].outline.map(([, z]) => z);
    expect(Math.min(...run)).toBeCloseTo(front);
    const b = framed(arena.stage.bStage.x, arena.stage.bStage.z);
    expect(b.lz).toBeGreaterThan(Math.max(...run));
    expect(b.r).toBeLessThan(ARENA.floor);
  });

  it("covers its seats with a canopy, leaving the floor open to the sky", () => {
    const { inner } = arena.canopyEdges;
    expect(inner).toBeGreaterThan(ARENA.floor + 5);
    for (const sheet of arena.canopy) {
      expect(sheet.y).toBeGreaterThan(level + tierTop(ARENA.tiers - 1));
      for (const [lx, lz] of sheet.sections![0].outline) {
        expect(Math.hypot(lx, lz / STRETCH)).toBeGreaterThanOrEqual(inner - 1e-6);
      }
    }
    expect(arena.posts).toHaveLength(13);
  });

  it("stands out over the shore on braces: each rising from the hillside or the ground below to the underside's rim", () => {
    expect(arena.braces.length).toBeGreaterThanOrEqual(3);
    for (const brace of arena.braces) {
      const [foot, head] = brace.sections!;
      const footGround = valleyHeight(brace.x, brace.z);
      // Its foot sunk into the ground under it, its head at the underside.
      expect(brace.y).toBeLessThanOrEqual(footGround);
      expect(brace.y + head.h).toBeCloseTo(level - UNDERSIDE);
      // The head out at the rim, standing well clear of the slope under it.
      const [hx, hz] = head.outline
        .reduce(([sx, sz], [x, z]) => [sx + x / 4, sz + z / 4], [0, 0])
        .map((v, k) => v + (k === 0 ? brace.x : brace.z));
      expect(valleyHeight(hx, hz)).toBeLessThan(level - UNDERSIDE - 4);
      expect(foot.outline).toHaveLength(4);
    }
  });
});

describe("the Arena in the world", () => {
  it("stands in the valley's right wall past the Diamond, beside Victoria Harbour, away from BT Cup's bowl", () => {
    const { x, z } = arena;
    expect(x - valleyCentre(z)).toBeGreaterThan(36);
    const { diamond } = landmarks;
    expect(z).toBeLessThan(diamond.z - diamond.d / 2);
    // Within reach of the harbour's water: some of it within 30 of the footprint.
    let near = Infinity;
    for (let wz = z - 120; wz <= z + 120; wz += 2) {
      for (let wx = x - 120; wx <= x + 120; wx += 2) {
        if (waterAt(wx, wz) === 0) continue;
        const { r } = framed(wx, wz);
        near = Math.min(near, r - ARENA_SITE.wide);
      }
    }
    expect(near).toBeLessThan(30);
    const bowl = landmarks.bounds[SITES.findIndex((s) => s.highlight === "bt-cup")];
    expect(Math.hypot(bowl.x - x, bowl.z - z)).toBeGreaterThan(150);
  });

  it("is aimed at Hong Kong: its axis, from the curve to the stage, points at the city's middle", () => {
    const [toStageX, toStageZ] = arena.facing(0, -1);
    const dx = HONG_KONG_CENTRE.x - arena.x;
    const dz = HONG_KONG_CENTRE.z - arena.z;
    const cos = (toStageX * dx + toStageZ * dz) / Math.hypot(dx, dz);
    expect(cos).toBeCloseTo(1);
  });

  it("sits in its seat: the ground under its floor and tiers cut below the underside", () => {
    for (let r = 0; r <= ARENA_SITE.wide; r += 2) {
      for (let a = 0; a < 2 * Math.PI; a += 0.1) {
        if (r > ARENA.floor && !inTiers(a)) continue;
        const [x, z] = arena.toWorld(Math.sin(a) * r, Math.cos(a) * r * STRETCH);
        expect(valleyHeight(x, z), `at ${r}, ${a}`).toBeLessThan(level);
      }
    }
  });

  it("clears the ground under its overhang and past its open end, so the braces stand clear", () => {
    // Under the front half's rim, the ground falls well below the underside.
    for (let a = Math.PI / 2 + 0.2; a < (3 * Math.PI) / 2 - 0.2; a += 0.1) {
      const r = inTiers(a) ? ARENA_SITE.wide : ARENA.floor;
      const [x, z] = arena.toWorld(Math.sin(a) * r, Math.cos(a) * r * STRETCH);
      expect(valleyHeight(x, z), `at ${a}`).toBeLessThan(level - UNDERSIDE - 8);
    }
  });

  it("moves no other ground: under every tower, Landmark and Hong Kong's buildings, the ground is as it was", () => {
    const others = [
      ...buildings,
      ...masts,
      ...landmarks.bounds,
      landmarks.diamond,
      ...skyline.bounds,
      ...hongKong.bounds,
    ];
    for (const b of others) {
      for (const u of [-0.5, 0, 0.5]) {
        for (const v of [-0.5, 0, 0.5]) {
          const x = b.x + u * b.w;
          const z = b.z + v * b.d;
          expect(valleyHeight(x, z)).toBe(heightBeforeArena(x, z));
        }
      }
    }
  });

  it("keeps clear of every tower, Landmark, the Diamond, the skyline and Hong Kong", () => {
    const overlaps = (a: Box, b: Box) =>
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
    for (const other of [
      ...buildings,
      ...masts,
      ...landmarks.bounds,
      landmarks.diamond,
      ...skyline.bounds,
      ...hongKong.bounds,
    ]) {
      expect(overlaps(arenaBox, other)).toBe(false);
    }
  });

  it("is built into the world's light: its tiers among the landmarks' solids, its stage among their strokes", () => {
    expect(landmarks.solids).toEqual(expect.arrayContaining(arena.tiers));
    expect(landmarks.strokes).toEqual(expect.arrayContaining(arena.strokes));
    expect(landmarks.rings).toEqual(expect.arrayContaining(arena.rings));
  });
});

/** True if `p` is within `margin` of the box. */
function near(p: Vector3, b: Box, margin: number) {
  return (
    Math.abs(p.x - b.x) < b.w / 2 + margin &&
    Math.abs(p.y - b.y) < b.h / 2 + margin &&
    Math.abs(p.z - b.z) < b.d / 2 + margin
  );
}

/** A camera at `pose`, for a screen of this shape. */
function cameraAt(pose: Pose, aspect: number, fovY: number = CAMERA.fovY) {
  const camera = new PerspectiveCamera(fovY, aspect, 0.5, 2600);
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld();
  return camera;
}

/** Where `point` lands on the screen of a camera at `pose`, in NDC (z < 1 in front). */
const project = (pose: Pose, aspect: number, point: Vector3, fovY?: number) =>
  point.clone().project(cameraAt(pose, aspect, fovY));

/** The Arena's middle, halfway up its tiers. */
const middle = new Vector3(arena.x, level + tierTop(ARENA.tiers - 1) / 2, arena.z);
/** The top of its canopy over its curve's end. */
const crown = (() => {
  const [x, z] = arena.toWorld(0, ARENA_SITE.long);
  return new Vector3(x, arena.bounds.top, z);
})();

/** True if the ground rises between `from` and `to`, hiding one from the other. */
function hidden(from: Vector3, to: Vector3) {
  for (let t = 0.02; t < 0.98; t += 0.005) {
    const p = from.clone().lerp(to, t);
    if (valleyHeight(p.x, p.z) > p.y) return true;
  }
  return false;
}

/** Points round the Arena's silhouette: its rim, top and foot, its canopy's edge, the stage's truss. */
const silhouette = [
  ...Array.from({ length: 48 }, (_, i) => {
    const a = TIERS_SPAN.from + ((TIERS_SPAN.to - TIERS_SPAN.from) * i) / 47;
    const [x, z] = arena.toWorld(Math.sin(a) * ARENA_SITE.wide, Math.cos(a) * ARENA_SITE.wide * STRETCH);
    return [new Vector3(x, level - UNDERSIDE, z), new Vector3(x, arena.bounds.top, z)];
  }).flat(),
  ...arena.stage.truss.flatMap((s) => [new Vector3(...s.from), new Vector3(...s.to)]),
];

/** The screen rectangle (NDC) the points in front of the camera cover. */
function spread(pose: Pose, aspect: number, points: Vector3[]) {
  const xs: number[] = [];
  for (const point of points) {
    const p = project(pose, aspect, point);
    if (p.z < 1) xs.push(p.x);
  }
  return { x0: Math.min(...xs), x1: Math.max(...xs) };
}

describe("home's camera and the Arena", () => {
  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const route = nominalRoute(aspect);
      const court = courtPose(aspect);
      const play = playView(aspect, landmarks.court).pose;
      const skyline = skylinePose(aspect);

      it("keeps 3 clear of it all along home's scroll route, at every Place and through every Transit", () => {
        for (let s = 0; s <= ROUTE_STOPS - 1; s += 0.01) {
          expect(near(route.poseAt(s).position, arenaBox, 3), `at stop ${s.toFixed(2)}`).toBe(false);
        }
        const stops = Array.from({ length: ROUTE_STOPS }, (_, i) => i);
        const ends = [...stops, court, skyline];
        const transits = [
          transitWithin(court, play),
          transitWithin(play, court),
          ...ends.flatMap((from) =>
            ends.map((to) =>
              transitPath(route, typeof from === "number" ? route.poseAt(from) : from, to),
            ),
          ),
        ];
        for (const { position } of [court, play, skyline, hongKongPose(aspect)]) {
          expect(near(position, arenaBox, 3)).toBe(false);
        }
        for (const trip of transits) {
          for (let t = 0; t <= 1; t += 1 / 200) {
            expect(near(trip.poseAt(t).position, arenaBox, 3)).toBe(false);
          }
        }
      });

      it("never frames it at a stop: out of frame, behind the valley's walls, or beyond the stop's site, a glimpse in the haze or behind the stop's panel", () => {
        for (let stop = 0; stop < ROUTE_STOPS; stop++) {
          const pose = route.poseAt(stop);
          const { x, y, z } = project(pose, aspect, middle);
          const inFrame = z < 1 && Math.abs(x) < 1 && Math.abs(y) < 1;
          if (!inFrame || (hidden(pose.position, middle) && hidden(pose.position, crown))) continue;
          // The settled view and Hong Kong's frame nothing beside their own.
          const site = SITES[stop - 1];
          expect(site, `in view at stop ${stop}`).toBeDefined();
          const distance = pose.position.distanceTo(middle);
          expect(distance).toBeGreaterThan(pose.position.distanceTo(site.position));
          const fog = 1 - Math.exp(-((distance * FOG_DENSITY) ** 2));
          if (fog >= 0.5) {
            // Half lost in the haze: under a fifth of the frame across, at its
            // edge, or (on a wide screen) all of it behind the stop's panel,
            // which stands opposite the site, short of where the site is framed
            // (0.45 across, ./route).
            const across = spread(pose, aspect, silhouette);
            const reach = site.side > 0 ? across.x1 : -across.x0;
            const glimpse =
              across.x1 - across.x0 < 0.4 ||
              Math.abs(x) >= 0.45 ||
              (aspect >= 1 && reach < 0.37);
            expect(glimpse, `at stop ${stop}: ${JSON.stringify({ x, fog, across })}`).toBe(true);
          } else {
            // Clear of the haze: off the middle, on the panel's side (a
            // wide screen's panel stands opposite its site).
            expect(Math.sign(x), `at stop ${stop}`).toBe(-site.side);
            expect(Math.abs(x), `at stop ${stop}`).toBeGreaterThanOrEqual(0.25);
          }
        }
      });

      it("leaves home's closing view to Hong Kong: none of it in frame", () => {
        const pose = route.poseAt(ROUTE_STOPS - 1);
        for (const point of silhouette) {
          const { x, y, z } = project(pose, aspect, point);
          expect(z < 1 && Math.abs(x) < 1 && Math.abs(y) < 1).toBe(false);
        }
      });
    });
  }
});

/**
 * How far `p` stands clear of the Arena's tiers, floor and canopy (negative
 * if inside them), and whether it is over the Arena at all.
 */
function clearOfArena(p: Vector3) {
  const { r, a } = framed(p.x, p.z);
  const { inner, edge } = arena.canopyEdges;
  let clear = Infinity;
  if (r <= ARENA.floor) clear = p.y - level;
  else if (r <= ARENA_SITE.wide && inTiers(a)) {
    const i = Math.min(ARENA.tiers - 1, Math.floor((r - ARENA.floor) / ((ARENA_SITE.wide - 1 - ARENA.floor) / ARENA.tiers)));
    clear = p.y - (level + tierTop(i));
  }
  if (r >= inner && r <= edge && inTiers(a)) {
    const below = level + arena.canopyY - p.y;
    const above = p.y - (level + arena.canopyY + 0.6);
    clear = Math.min(clear, Math.max(below, above));
  }
  return clear;
}

/** The stage's truss, deck and screens as one box in the Arena's frame: true if `p` is within `margin` of it. */
function nearStage(p: Vector3, margin: number) {
  const { lx, lz } = framed(p.x, p.z);
  const { front } = arena.stage;
  return (
    Math.abs(lx) < STAGE.width / 2 + 0.3 + margin &&
    lz > front - STAGE.depth - margin &&
    lz < front + margin &&
    p.y < level + STAGE.truss + 0.3 + margin
  );
}

describe("the Arena's inside view", () => {
  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const { pose, fovY } = arenaView(aspect);
      const { position } = pose;

      it("stands up the back tiers behind the crowd, over the seats, under the open sky", () => {
        const { r, a, lz } = framed(position.x, position.z);
        expect(lz).toBeGreaterThan(ARENA.floor * STRETCH * 0.9);
        expect(inTiers(a)).toBe(true);
        expect(r).toBeLessThan(arena.canopyEdges.inner - 3);
        expect(clearOfArena(position)).toBeGreaterThan(3);
        expect(nearStage(position, 3)).toBe(false);
        expect(position.y - valleyHeight(position.x, position.z)).toBeGreaterThan(3);
      });

      it("faces the stage, the LED wall in the middle and the whole stage in frame, with Hong Kong behind it", () => {
        const { screen, truss, deck } = arena.stage;
        const mid = new Vector3(
          (screen.from[0] + screen.to[0]) / 2,
          screen.from[1],
          (screen.from[2] + screen.to[2]) / 2,
        );
        const at = project(pose, aspect, mid, fovY);
        expect(Math.abs(at.x)).toBeLessThan(0.05);
        expect(Math.abs(at.y)).toBeLessThan(0.3);
        const corners = [
          ...truss.flatMap((s) => [new Vector3(...s.from), new Vector3(...s.to)]),
          ...deck.sections![0].outline.map(([lx, lz]) => {
            const [x, z] = arena.toWorld(lx, lz);
            return new Vector3(x, level, z);
          }),
        ];
        for (const point of corners) {
          const p = project(pose, aspect, point, fovY);
          expect(p.z).toBeLessThan(1);
          expect(Math.abs(p.x)).toBeLessThan(1);
          expect(Math.abs(p.y)).toBeLessThan(1);
        }
        // Hong Kong's middle, its towers' height, in frame beyond the stage.
        const city = new Vector3(HONG_KONG_CENTRE.x, 30, HONG_KONG_CENTRE.z);
        const p = project(pose, aspect, city, fovY);
        expect(p.z).toBeLessThan(1);
        expect(Math.abs(p.x)).toBeLessThan(0.3);
        expect(Math.abs(p.y)).toBeLessThan(1);
        expect(position.distanceTo(city)).toBeGreaterThan(position.distanceTo(mid));
      });
    });
  }
});

describe("the way into the Arena from home's route's end", () => {
  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const way = arenaWayIn(aspect);
      const samples = Array.from({ length: 401 }, (_, i) => way.poseAt(i / 400));

      it("leaves from the route's end, Hong Kong's view, and lands on the inside view, without a jump", () => {
        const end = hongKongPose(aspect);
        expect(samples[0].position.distanceTo(end.position)).toBeCloseTo(0);
        expect(samples[0].quaternion.angleTo(end.quaternion)).toBeCloseTo(0);
        const inside = arenaView(aspect).pose;
        expect(samples.at(-1)!.position.distanceTo(inside.position)).toBeCloseTo(0);
        expect(samples.at(-1)!.quaternion.angleTo(inside.quaternion)).toBeCloseTo(0);
        for (let i = 1; i < samples.length; i++) {
          expect(samples[i].position.distanceTo(samples[i - 1].position)).toBeLessThan(1);
          expect(samples[i].quaternion.angleTo(samples[i - 1].quaternion)).toBeLessThan(0.02);
        }
      });

      it("keeps 2 clear of the tiers, the canopy and the stage, coming down into the open middle", () => {
        for (const [i, { position }] of samples.entries()) {
          expect(clearOfArena(position), `at ${i}`).toBeGreaterThan(2);
          expect(nearStage(position, 2), `at ${i}`).toBe(false);
        }
      });

      it("keeps 2 clear of the Diamond, every Landmark and tower, and the ground and water", () => {
        for (const { position } of samples) {
          for (const b of [landmarks.diamond, ...landmarks.parts, ...buildings, ...masts, ...hongKong.bounds]) {
            expect(near(position, b, 2)).toBe(false);
          }
          expect(position.y - surfaceHeight(position.x, position.z)).toBeGreaterThan(2);
        }
      });
    });
  }
});
