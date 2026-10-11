import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  cameraAt,
  keepClear,
  type KeepClear,
  landsIn,
  onScreen,
  SCREENS,
  settledView,
  type Shape,
} from "./clearance";
import { layoutHongKong } from "./hong-kong";
import { layoutLandmarks } from "./landmarks";
import { palette } from "./palette";
import { courtPose, SITES, skylineView } from "./route";
import {
  ROGERS_CENTRE,
  ROGERS_CENTRE_RADIUS,
  ROGERS_CENTRE_STRAIGHT,
} from "./skyline";
import { layoutStructures, type Box } from "./structures";
import {
  CAR,
  COVERED,
  CYCLE,
  layoutLine,
  PORTALS,
  streetcarSections,
  type Section,
} from "./streetcars";
import { valleyCentre } from "./terrain";

const SHAPES = Object.keys(SCREENS) as Shape[];

/**
 * A box round a section and its roof pods, square to the world. (The
 * pantograph's shoe runs on the wire, which is checked on its own.)
 */
function sectionBox(s: Section): Box {
  const c = Math.abs(Math.cos(s.yaw));
  const n = Math.abs(Math.sin(s.yaw));
  const bottom = s.y - CAR.height / 2;
  const top = bottom + CAR.height + 0.4;
  return {
    x: s.x,
    y: (bottom + top) / 2,
    z: s.z,
    w: CAR.width * c + s.length * n,
    h: top - bottom,
    d: CAR.width * n + s.length * c,
    color: palette.ink,
  };
}

/** Every shown section over a whole cycle, a second apart. */
const SAMPLES = Array.from({ length: Math.ceil(CYCLE) }, (_, t) =>
  streetcarSections(t).filter((s) => s.shown),
);
const CARS = SAMPLES.flat().map((s) => ({
  name: `car at z ${s.z.toFixed(0)}`,
  box: sectionBox(s),
}));

const line = layoutLine();
const asBox = (b: Box3): Box => {
  const c = b.getCenter(new Vector3());
  const size = b.getSize(new Vector3());
  return {
    x: c.x,
    y: c.y,
    z: c.z,
    w: size.x,
    h: size.y,
    d: size.z,
    color: palette.ink,
  };
};
const LINE = [
  ...line.parts.map((p) => {
    p.geometry.computeBoundingBox();
    const box = asBox(p.geometry.boundingBox!);
    return { name: `${p.name} at z ${box.z.toFixed(0)}`, box };
  }),
  ...line.wire.map((p) => ({ name: `wire at z ${p.z.toFixed(0)}`, box: p })),
];
const EVERYTHING = [...CARS, ...LINE];

/** The nearest a point or box comes to `eye`. */
function nearest(b: Box | Vector3, eye: Vector3) {
  if (b instanceof Vector3) return b.distanceTo(eye);
  const gap = (k: "x" | "y" | "z", size: number) =>
    Math.max(0, Math.abs(eye[k] - b[k]) - size / 2);
  return Math.hypot(gap("x", b.w), gap("y", b.h), gap("z", b.d));
}

/** Each Landmark's box, by the name keepClear gives it. */
const LANDMARK_BOXES = (() => {
  const landmarks = layoutLandmarks();
  const hongKong = layoutHongKong();
  return new Map<string, Box>([
    ...SITES.map((s, i) => [s.highlight, landmarks.bounds[i]] as const),
    ["Diamond", landmarks.diamond],
    ...hongKong.landmarks.map((l, i) => [l.name, hongKong.bounds[i]] as const),
  ]);
})();

/** The farthest a box reaches from `eye`. */
function farthest(b: Box, eye: Vector3) {
  const reach = (k: "x" | "y" | "z", size: number) =>
    Math.abs(eye[k] - b[k]) + size / 2;
  return Math.hypot(reach("x", b.w), reach("y", b.h), reach("z", b.d));
}

type Point = readonly [number, number];

/** Landmarks round in plan, their box's corners empty: BT Cup's bowl. */
const ROUND = new Set(["bt-cup"]);

/**
 * A box's (or a point's) corners in front of the camera at the area's pose,
 * on the screen; for a round box, points round the circle inside it.
 */
function outline(
  target: Box | Vector3,
  area: KeepClear,
  round = false,
): Point[] {
  const camera = cameraAt(area.pose, area.aspect);
  const corners =
    target instanceof Vector3
      ? [target.clone()]
      : round
        ? Array.from({ length: 48 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const v = i < 24 ? -1 : 1;
            return new Vector3(
              target.x + (Math.cos(a) * target.w) / 2,
              target.y + (v * target.h) / 2,
              target.z + (Math.sin(a) * target.d) / 2,
            );
          })
        : [-1, 1].flatMap((u) =>
            [-1, 1].flatMap((v) =>
              [-1, 1].map(
                (w) =>
                  new Vector3(
                    target.x + (u * target.w) / 2,
                    target.y + (v * target.h) / 2,
                    target.z + (w * target.d) / 2,
                  ),
              ),
            ),
          );
  return corners
    .map((p) => p.project(camera))
    .filter((p) => p.z < 1)
    .map((p) => [p.x, p.y] as const);
}

/** True if two sets of screen points' convex hulls overlap: no axis separates them. */
function overlap(a: Point[], b: Point[]) {
  if (a.length === 0 || b.length === 0) return false;
  // Every line through two points' normal: the hulls' edges' among them.
  const axes = (ps: Point[]) =>
    ps.flatMap((p, i) =>
      ps.slice(i + 1).map((q) => [q[1] - p[1], p[0] - q[0]] as const),
    );
  return [...axes(a), ...axes(b), [1, 0] as const, [0, 1] as const].every(
    ([nx, ny]) => {
      const sa = a.map(([x, y]) => x * nx + y * ny);
      const sb = b.map(([x, y]) => x * nx + y * ny);
      return (
        Math.max(...sa) > Math.min(...sb) && Math.max(...sb) > Math.min(...sa)
      );
    },
  );
}

/**
 * True if `target` covers the Landmark the area frames: nearer than the
 * Landmark's far side, and over the Landmark's own outline on the screen,
 * not just the rectangle round it.
 */
function covers(target: Box | Vector3, area: KeepClear) {
  const landmark = LANDMARK_BOXES.get(area.name)!;
  const eye = area.pose.position;
  return (
    landsIn(target, area) &&
    nearest(target, eye) < farthest(landmark, eye) &&
    overlap(
      outline(target, area),
      outline(landmark, area, ROUND.has(area.name)),
    )
  );
}

describe("the Streetcars and their line keep clear", () => {
  for (const shape of SHAPES) {
    it(`of the name plate, and don't cover a Landmark at its stop (${shape})`, () => {
      const hits = keepClear(shape).flatMap((area) =>
        // Behind a Landmark is fine; anywhere on the plate isn't.
        EVERYTHING.filter((o) =>
          area.stop === 0 ? landsIn(o.box, area) : covers(o.box, area),
        ).map((o) => `${o.name} on ${area.name}`),
      );
      expect([...new Set(hits)]).toEqual([]);
    });
  }

  it("of the Diamond's stadium, by 16 or more", () => {
    const d = layoutLandmarks().diamond;
    const gap = (b: Box | Vector3) => {
      const box = b instanceof Vector3 ? { x: b.x, z: b.z, w: 0, d: 0 } : b;
      const dx = Math.max(0, Math.abs(box.x - d.x) - (box.w + d.w) / 2);
      const dz = Math.max(0, Math.abs(box.z - d.z) - (box.d + d.d) / 2);
      return Math.hypot(dx, dz);
    };
    const close = EVERYTHING.filter((o) => gap(o.box) < 16).map((o) => o.name);
    expect([...new Set(close)]).toEqual([]);
  });

  it("of every tower and Landmark", () => {
    const { buildings, masts, skyline, hongKong, landmarks } =
      layoutStructures();
    // The Rogers Centre is round, its box's corners empty: it's checked as a circle.
    const dome = ROGERS_CENTRE_RADIUS + ROGERS_CENTRE_STRAIGHT;
    const isDome = (b: Box) =>
      b.x === ROGERS_CENTRE.x && b.z === ROGERS_CENTRE.z;
    const solids = [
      ...buildings,
      ...masts,
      ...skyline.bounds.filter((b) => !isDome(b)),
      ...hongKong.bounds,
      ...landmarks.bounds,
      landmarks.diamond,
      landmarks.arena,
    ];
    const meets = (a: Box | Vector3, b: Box) => {
      const box = a instanceof Vector3 ? { ...a, w: 0, h: 0, d: 0 } : a;
      return (["x", "y", "z"] as const).every(
        (k, i) =>
          Math.abs(box[k] - b[k]) <
          ([box.w, box.h, box.d][i] + [b.w, b.h, b.d][i]) / 2,
      );
    };
    const clips = EVERYTHING.flatMap((o) =>
      solids
        .filter((s) => meets(o.box, s))
        .map(
          (s) => `${o.name} in the box at ${s.x.toFixed(0)}, ${s.z.toFixed(0)}`,
        ),
    );
    expect([...new Set(clips)]).toEqual([]);
    expect(skyline.bounds.filter(isDome)).toHaveLength(1);
    const inDome = EVERYTHING.filter((o) => {
      const b = o.box instanceof Vector3 ? { ...o.box, w: 0, d: 0 } : o.box;
      const dx = Math.max(0, Math.abs(b.x - ROGERS_CENTRE.x) - b.w / 2);
      const dz = Math.max(0, Math.abs(b.z - ROGERS_CENTRE.z) - b.d / 2);
      return Math.hypot(dx, dz) < dome;
    }).map((o) => o.name);
    expect(inDome).toEqual([]);
  });
});

describe("the Streetcars are seen", () => {
  /** True if some car, over the cycle, is on screen within the fog's reach. */
  const seen = (pose: { position: Vector3 }, aspect: number, fovY?: number) =>
    CARS.some(({ box }) => {
      const r = onScreen(
        pose as never,
        aspect,
        new Vector3(box.x, box.y, box.z),
        fovY,
      );
      return (
        r !== null &&
        Math.abs(r.x0) < 1 &&
        Math.abs(r.y0) < 1 &&
        pose.position.distanceTo(new Vector3(box.x, box.y, box.z)) < 300
      );
    });

  for (const shape of SHAPES) {
    const aspect = SCREENS[shape].width / SCREENS[shape].height;
    it(`from home's route, the court and the Skyline (${shape})`, () => {
      const { route } = settledView(shape);
      const along = Array.from({ length: 13 }, (_, i) => route.poseAt(i / 2));
      expect(along.some((p) => seen(p, aspect))).toBe(true);
      expect(seen(courtPose(aspect), aspect)).toBe(true);
      const skyline = skylineView(aspect);
      expect(seen(skyline.pose, aspect, skyline.fovY)).toBe(true);
    });
  }
});

describe("the Streetcars", () => {
  it("are drawn only between the Portals, as far into each as its berm covers", () => {
    const all = Array.from({ length: Math.ceil(CYCLE) }, (_, t) =>
      streetcarSections(t),
    ).flat();
    for (const s of all.filter((s) => s.shown)) {
      expect(s.z).toBeLessThanOrEqual(PORTALS.start + COVERED);
      expect(s.z).toBeGreaterThanOrEqual(PORTALS.end - COVERED);
    }
    // Each goes underground at both ends.
    expect(all.some((s) => !s.shown && s.z > PORTALS.start)).toBe(true);
    expect(all.some((s) => !s.shown && s.z < PORTALS.end)).toBe(true);
  });

  it("bend round the valley's curves, each section on its own", () => {
    // Where the valley turns, a car's sections point different ways.
    const turning = streetcarSections(30).filter((s) => s.car === 0);
    const yaws = turning.map((s) => s.yaw);
    expect(Math.max(...yaws) - Math.min(...yaws)).toBeGreaterThan(0.01);
    // And each stands on its own track, either side of the centre line.
    for (const s of turning) {
      expect(Math.abs(Math.abs(s.x - valleyCentre(s.z)) - 2.2)).toBeLessThan(
        1e-9,
      );
    }
  });

  it("stand still at a given traffic time", () => {
    expect(streetcarSections(11.5)).toEqual(streetcarSections(11.5));
    expect(streetcarSections(11.5)).not.toEqual(streetcarSections(12.5));
  });
});
