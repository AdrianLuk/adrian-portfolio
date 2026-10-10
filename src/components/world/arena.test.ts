import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { ARENA, layoutArena, worldArena } from "./arena";
import type { Pose } from "./flight";
import { nominalRoute } from "./nominal-route";
import { FOG_DENSITY } from "./palette";
import { CAMERA } from "./pose";
import {
  arenaPose,
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
import { surfaceHeight, valleyCentre, valleyHeight, waterAt } from "./terrain";
import { transitPath, transitWithin } from "./transit";

const centre = { x: 100, z: -1100, level: 2 };
const arena = layoutArena(centre);
const top = (b: Box) => b.y + b.h / 2;

/** How far out (x, z) lies from the Arena's middle, 1 on its oval. */
const ovalAt = (x: number, z: number) =>
  Math.hypot((x - centre.x) / ARENA.wide, (z - centre.z) / ARENA.long);

describe("the Arena", () => {
  it("is an oval, longer down the valley than across, ringed by a low wall of light", () => {
    expect(ARENA.long).toBeGreaterThan(1.5 * ARENA.wide);
    expect(arena.wall.length).toBeGreaterThanOrEqual(2);
    for (const ring of arena.wall) {
      expect(ring.outline!.length).toBeGreaterThan(24);
      for (const [x, z] of ring.outline!) {
        expect(ovalAt(ring.x + x, ring.z + z)).toBeCloseTo(1, 1);
      }
      expect(ring.y + ring.h / 2).toBeLessThanOrEqual(centre.level + ARENA.wall + 1e-6);
    }
  });

  it("roofs it with ribs of light only: arches across it, each spanning wall to wall over the floor, no panels and no hex cells", () => {
    expect(arena.ribs.length).toBeGreaterThanOrEqual(6);
    for (const rib of arena.ribs) {
      // Every stroke lies across the Arena, in one upright plane.
      const z = rib[0].from[2];
      for (const s of rib) {
        expect(s.facing).toEqual([0, 1]);
        expect(s.from[2]).toBeCloseTo(z);
        expect(s.to[2]).toBeCloseTo(z);
      }
      // From the wall's top on one side, over the middle, to the other.
      const [start, end] = [rib[0].from, rib.at(-1)!.to];
      expect(ovalAt(start[0], z)).toBeCloseTo(1, 2);
      expect(ovalAt(end[0], z)).toBeCloseTo(1, 2);
      expect(Math.sign(start[0] - centre.x)).toBe(-Math.sign(end[0] - centre.x));
      expect(start[1]).toBeCloseTo(centre.level + ARENA.wall);
      const crown = Math.max(...rib.map((s) => s.from[1]));
      expect(crown).toBeGreaterThan(centre.level + ARENA.wall + 2);
    }
    // Nothing solid over the floor: the only solid is the floor itself.
    for (const s of arena.solids) {
      expect(s.y + s.h).toBeLessThanOrEqual(centre.level + 0.1);
    }
  });

  it("raises a stage at its far end, down the valley: a deck, a lit truss and screens, past the last rib", () => {
    const { deck, truss, screens } = arena.stage;
    // In the far quarter of the oval, and inside it.
    for (const b of [deck, ...truss, ...screens]) {
      expect(b.z).toBeLessThan(centre.z - ARENA.long / 2);
      for (const u of [-1, 1]) {
        for (const v of [-1, 1]) {
          expect(ovalAt(b.x + (u * b.w) / 2, b.z + (v * b.d) / 2)).toBeLessThan(1);
        }
      }
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(centre.level - 1e-6);
    }
    expect(truss.length).toBeGreaterThanOrEqual(4);
    expect(screens.length).toBeGreaterThanOrEqual(1);
    // The truss stands over the deck, the screens face up the valley above it.
    expect(Math.max(...truss.map(top))).toBeGreaterThan(top(deck) + 3);
    for (const s of screens) {
      expect(s.w).toBeGreaterThan(s.d * 5);
      expect(s.y - s.h / 2).toBeGreaterThan(top(deck));
    }
    // Open to the sky over the stage: every rib stands short of its deck.
    for (const rib of arena.ribs) {
      expect(rib[0].from[2]).toBeGreaterThan(deck.z + deck.d / 2 + 1);
    }
  });

  it("lays its floor level on a plinth, its bounds taking in the whole of it", () => {
    const { floor, bounds } = arena;
    expect(floor.y + floor.h).toBeCloseTo(centre.level);
    expect(bounds.x1 - bounds.x0).toBeCloseTo(2 * ARENA.wide, 0);
    expect(bounds.z1 - bounds.z0).toBeCloseTo(2 * ARENA.long, 0);
    const crown = Math.max(...arena.ribs.flat().map((s) => s.from[1]));
    expect(bounds.top).toBeGreaterThanOrEqual(crown);
  });
});

const { buildings, masts, landmarks, skyline, hongKong } = layoutStructures();
const arenaBox = landmarks.arena;
const built = worldArena();

describe("the Arena in the world", () => {
  it("stands past the Diamond, down the valley, across the valley from BT Cup's bowl and well away from it", () => {
    const { diamond } = landmarks;
    expect(arenaBox.z + arenaBox.d / 2).toBeLessThan(diamond.z - diamond.d / 2);
    const bowl = landmarks.bounds[SITES.findIndex((s) => s.highlight === "bt-cup")];
    const side = (b: Box) => Math.sign(b.x - valleyCentre(b.z));
    expect(side(arenaBox)).toBe(-side(bowl));
    expect(Math.hypot(arenaBox.x - bowl.x, arenaBox.z - bowl.z)).toBeGreaterThan(100);
  });

  it("stands inland of Victoria Harbour, 4 or more clear of its water, on ground level enough for its plinth", () => {
    const { x0, x1, z0, z1 } = built.bounds;
    for (let z = z0 - 4; z <= z1 + 4; z += 0.5) {
      for (let x = x0 - 4; x <= x1 + 4; x += 0.5) {
        expect(waterAt(x, z), `at ${x}, ${z}`).toBe(0);
      }
    }
    // Over the whole oval, its rim and in.
    const heights: number[] = [];
    for (let r = 0; r <= 1; r += 0.1) {
      for (let t = 0; t < 2 * Math.PI; t += 0.1) {
        const x = arenaBox.x + r * ARENA.wide * Math.cos(t);
        const z = arenaBox.z + r * ARENA.long * Math.sin(t);
        heights.push(valleyHeight(x, z));
      }
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(4);
    expect(built.level).toBeGreaterThan(Math.max(...heights));
  });

  it("keeps clear of every tower, Landmark, the Diamond, the skyline and Hong Kong", () => {
    const overlaps = (a: Box, b: Box) =>
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
      Math.abs(a.z - b.z) < (a.d + b.d) / 2;
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

  it("is built into the world's light: its ribs among the landmarks' strokes, its stage among their parts", () => {
    expect(landmarks.strokes).toEqual(expect.arrayContaining(built.ribs.flat()));
    expect(landmarks.parts).toEqual(
      expect.arrayContaining([built.stage.deck, ...built.stage.truss, ...built.stage.screens]),
    );
  });
});

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

/** True if `p` is within `margin` of the box. */
function near(p: Pose["position"], b: Box, margin: number) {
  return (
    Math.abs(p.x - b.x) < b.w / 2 + margin &&
    Math.abs(p.y - b.y) < b.h / 2 + margin &&
    Math.abs(p.z - b.z) < b.d / 2 + margin
  );
}

/** A camera at `pose`, for a screen of this shape. */
function cameraAt(pose: Pose, aspect: number) {
  const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld();
  return camera;
}

/** Where `point` lands on the screen of a camera at `pose`, in NDC (z < 1 in front). */
const project = (pose: Pose, aspect: number, point: Vector3) =>
  point.clone().project(cameraAt(pose, aspect));

/** The Arena's middle, halfway up its ribs. */
const middle = new Vector3(
  arenaBox.x,
  (built.level + built.bounds.top) / 2,
  arenaBox.z,
);

/** A box's corners. */
const corners = (b: Box) =>
  [-1, 1].flatMap((u) =>
    [-1, 1].flatMap((v) =>
      [-1, 1].map(
        (w) => new Vector3(b.x + (u * b.w) / 2, b.y + (v * b.h) / 2, b.z + (w * b.d) / 2),
      ),
    ),
  );

/** Every point of the Arena's silhouette: its wall's rim, foot to top, its ribs and its stage. */
const silhouette = [
  ...built.wall[0].outline!.flatMap(([x, z]) =>
    [built.level, built.level + ARENA.wall].map(
      (y) => new Vector3(built.wall[0].x + x, y, built.wall[0].z + z),
    ),
  ),
  ...built.ribs.flat().map((s) => new Vector3(...s.from)),
  ...[built.stage.deck, ...built.stage.truss, ...built.stage.screens].flatMap(corners),
];

/** The screen rectangle (NDC) the points in front of the camera cover. */
function spread(pose: Pose, aspect: number, points: Vector3[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of points) {
    const p = project(pose, aspect, point);
    if (p.z >= 1) continue;
    xs.push(p.x);
    ys.push(p.y);
  }
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

/** The top of the Arena's middle rib. */
const crown = middle.clone().setY(built.bounds.top);

/** True if the ground rises between `from` and `to`, hiding one from the other. */
function hidden(from: Vector3, to: Vector3) {
  for (let t = 0.02; t < 0.98; t += 0.005) {
    const p = from.clone().lerp(to, t);
    if (valleyHeight(p.x, p.z) > p.y) return true;
  }
  return false;
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
          const { position } = route.poseAt(s);
          expect(near(position, arenaBox, 3), `at stop ${s.toFixed(2)}`).toBe(false);
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

      it("never frames it at a stop: out of frame, behind the valley's walls, or beyond the stop's site, a glimpse in the haze or across the frame from the site, behind its panel", () => {
        for (let stop = 0; stop < ROUTE_STOPS; stop++) {
          const pose = route.poseAt(stop);
          const { x, y, z } = project(pose, aspect, middle);
          const inFrame = z < 1 && Math.abs(x) < 1 && Math.abs(y) < 1;
          if (!inFrame || hidden(pose.position, crown)) continue;
          // The settled view and Hong Kong's frame nothing beside their own.
          const site = SITES[stop - 1];
          expect(site, `in view at stop ${stop}`).toBeDefined();
          const distance = pose.position.distanceTo(middle);
          expect(distance).toBeGreaterThan(pose.position.distanceTo(site.position));
          const fog = 1 - Math.exp(-((distance * FOG_DENSITY) ** 2));
          if (fog >= 0.5) {
            // Half lost in the haze: under a tenth of the frame across, or at its edge.
            const across = spread(pose, aspect, silhouette);
            const glimpse = across.x1 - across.x0 < 0.2 || Math.abs(x) >= 0.45;
            expect(glimpse, `at stop ${stop}`).toBe(true);
          } else {
            // Clear of the haze: off the middle, on the panel's side (a
            // wide screen's panel stands opposite its site).
            expect(Math.sign(x), `at stop ${stop}`).toBe(-site.side);
            expect(Math.abs(x), `at stop ${stop}`).toBeGreaterThanOrEqual(0.25);
          }
        }
      });

      it("leaves home's closing view to Hong Kong: not a corner of it in frame", () => {
        const pose = route.poseAt(ROUTE_STOPS - 1);
        const { x0, x1, z0, z1, top } = built.bounds;
        for (const px of [x0, x1]) {
          for (const pz of [z0, z1]) {
            for (const py of [built.level, top]) {
              const { x, y, z } = project(pose, aspect, new Vector3(px, py, pz));
              expect(z < 1 && Math.abs(x) < 1 && Math.abs(y) < 1).toBe(false);
            }
          }
        }
      });
    });
  }
});

/** How far out (x, z) lies from the world's Arena's middle, 1 on its oval. */
const inOval = (x: number, z: number) =>
  Math.hypot((x - built.x) / ARENA.wide, (z - built.z) / ARENA.long);

/** How far `p` is from the segment from `a` to `b`. */
function fromSegment(p: Vector3, a: readonly number[], b: readonly number[]) {
  const from = new Vector3(...a);
  const along = new Vector3(...b).sub(from);
  const t = Math.min(1, Math.max(0, p.clone().sub(from).dot(along) / along.lengthSq()));
  return p.distanceTo(from.add(along.multiplyScalar(t)));
}

/** How far `p` is from the nearest of the Arena's ribs. */
const fromRibs = (p: Vector3) =>
  Math.min(...built.ribs.flat().map((s) => fromSegment(p, s.from, s.to)));

const stageParts = [built.stage.deck, built.stage.edge, ...built.stage.truss, ...built.stage.screens];

describe("the Arena's inside pose", () => {
  const pose = arenaPose();
  const { position } = pose;

  it("stands inside, behind the crowd's floor, raised over it", () => {
    expect(inOval(position.x, position.z)).toBeLessThan(0.8);
    expect(position.z).toBeGreaterThan(arenaBox.z);
    expect(position.y - built.level).toBeGreaterThan(2.5);
    expect(position.y - valleyHeight(position.x, position.z)).toBeGreaterThan(2.5);
  });

  it("keeps 3 clear of the ribs and the stage", () => {
    expect(fromRibs(position)).toBeGreaterThan(3);
    for (const b of stageParts) expect(near(position, b, 3)).toBe(false);
  });

  for (const [name, aspect] of Object.entries(shapes)) {
    it(`faces the stage on a ${name}: its main screen in the middle, the whole stage in frame`, () => {
      const main = built.stage.screens[0];
      const { x, y } = project(pose, aspect, new Vector3(main.x, main.y, main.z));
      expect(Math.abs(x)).toBeLessThan(0.05);
      expect(Math.abs(y)).toBeLessThan(0.3);
      for (const point of [built.stage.deck, ...built.stage.truss, ...built.stage.screens].flatMap(corners)) {
        const p = project(pose, aspect, point);
        expect(p.z).toBeLessThan(1);
        expect(Math.abs(p.x)).toBeLessThan(1);
        expect(Math.abs(p.y)).toBeLessThan(1);
      }
    });
  }
});

describe("the way into the Arena from home's route's end", () => {
  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const way = arenaWayIn(aspect);
      const samples = Array.from({ length: 401 }, (_, i) => way.poseAt(i / 400));

      it("leaves from the route's end, Hong Kong's view, and lands on the inside pose, without a jump", () => {
        const end = hongKongPose(aspect);
        expect(samples[0].position.distanceTo(end.position)).toBeCloseTo(0);
        expect(samples[0].quaternion.angleTo(end.quaternion)).toBeCloseTo(0);
        const inside = arenaPose();
        expect(samples.at(-1)!.position.distanceTo(inside.position)).toBeCloseTo(0);
        expect(samples.at(-1)!.quaternion.angleTo(inside.quaternion)).toBeCloseTo(0);
        for (let i = 1; i < samples.length; i++) {
          expect(samples[i].position.distanceTo(samples[i - 1].position)).toBeLessThan(1);
          expect(samples[i].quaternion.angleTo(samples[i - 1].quaternion)).toBeLessThan(0.02);
        }
      });

      it("threads the ribs, a unit or more clear of every one, and comes in over the wall", () => {
        for (const { position } of samples) {
          expect(fromRibs(position)).toBeGreaterThan(1);
          // Within 2 of the oval's wall, over its top.
          const out = inOval(position.x, position.z);
          if (out > 0.85 && out < 1.15) {
            expect(position.y).toBeGreaterThan(built.level + ARENA.wall + 0.5);
          }
        }
      });

      it("keeps 2 clear of the stage, the Diamond, every Landmark and tower, and the ground and water", () => {
        for (const { position } of samples) {
          // The stage is among the Landmarks' parts.
          for (const b of [landmarks.diamond, ...landmarks.parts, ...buildings, ...masts]) {
            expect(near(position, b, 2)).toBe(false);
          }
          expect(position.y - surfaceHeight(position.x, position.z)).toBeGreaterThan(2);
        }
      });
    });
  }
});
