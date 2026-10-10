import { Box3, PerspectiveCamera, Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  DIAMOND,
  DIAMOND_AT,
  diamondFootprint,
  layoutDiamond,
} from "./diamond";
import { FOG_DENSITY, palette } from "./palette";
import { CAMERA } from "./pose";
import type { Pose } from "./flight";
import { nominalRoute } from "./nominal-route";
import {
  courtPose,
  DIAMOND_GLANCE,
  hongKongPose,
  playView,
  ROUTE_STOPS,
  SITES,
  skylinePose,
} from "./route";
import type { Solid } from "./skyline";
import { layoutStructures, type Box } from "./structures";
import {
  groundUnder,
  valleyCentre,
  valleyHeight,
  VICTORIA_HARBOUR,
  waterAt,
} from "./terrain";
import { transitPath, transitWithin } from "./transit";

const scale = 0.2;
const home = { x: -30, z: -860 };
/** The plinth's centre, half the foul lines' square from home plate. */
const half = (DIAMOND.foulLine * scale) / 2;
const diamond = layoutDiamond({
  x: home.x - half,
  z: home.z - half,
  side: -1,
  level: 1,
  scale,
  color: palette.cyan,
});

/** The pieces whose centre lies at (x, z), on the diamond's level. */
const at = (x: number, z: number) =>
  diamond.bases.filter(
    (b) => Math.abs(b.x - x) < 1e-6 && Math.abs(b.z - z) < 1e-6,
  );

describe("the baseball diamond", () => {
  const base = DIAMOND.base * scale;

  it("sets its bases 90 feet apart round a square, home plate at the corner nearest home's end of the valley", () => {
    expect(DIAMOND.base).toBe(90);
    // Home plate at the corner (its own test below), first base down the
    // valley, second, third toward the wall.
    expect(diamond.home).toEqual(home);
    expect(at(home.x, home.z - base)).toHaveLength(1);
    expect(at(home.x - base, home.z - base)).toHaveLength(1);
    expect(at(home.x - base, home.z)).toHaveLength(1);
    expect(diamond.bases).toHaveLength(3);
  });

  it("chalks its base paths and runs its foul lines on past first and third to the poles", () => {
    const reach = DIAMOND.foulLine * scale;
    expect(DIAMOND.foulLine).toBeGreaterThan(DIAMOND.base * 1.5);
    /** True if a line of light covers the point (x, z). */
    const chalked = (x: number, z: number) =>
      diamond.lines.some(
        (b) =>
          Math.abs(x - b.x) <= b.w / 2 + 1e-6 &&
          Math.abs(z - b.z) <= b.d / 2 + 1e-6,
      );
    for (let t = 0; t <= 1; t += 0.05) {
      // Home to first, first to second, second to third, third to home.
      expect(chalked(home.x, home.z - t * base)).toBe(true);
      expect(chalked(home.x - t * base, home.z - base)).toBe(true);
      expect(chalked(home.x - base, home.z - base + t * base)).toBe(true);
      expect(chalked(home.x - base + t * base, home.z)).toBe(true);
      // The foul lines, the whole way out.
      expect(chalked(home.x, home.z - t * reach)).toBe(true);
      expect(chalked(home.x - t * reach, home.z)).toBe(true);
    }
    const poles = diamond.poles.map((p) => [p.x, p.z]);
    expect(poles).toEqual(
      expect.arrayContaining([
        [home.x, home.z - reach],
        [home.x - reach, home.z],
      ]),
    );
  });

  it("stands its foul poles tall, over the field", () => {
    for (const pole of diamond.poles) {
      expect(pole.y + pole.h / 2 - diamond.level).toBeCloseTo(
        DIAMOND.poleHeight * scale,
      );
      expect(pole.w).toBeLessThan(1);
    }
  });

  it("raises the mound 60 feet 6 inches out from home, toward second", () => {
    const { mound } = diamond;
    const out = Math.hypot(mound.x - home.x, mound.z - home.z);
    expect(out).toBeCloseTo(60.5 * scale);
    // On the line from home to second.
    expect(mound.x - home.x).toBeCloseTo(mound.z - home.z);
    expect(mound.x).toBeLessThan(home.x);
  });

  it("is a major league park: 330 feet down the lines, 400 to centre field, so the infield is a small square in a big outfield", () => {
    expect(DIAMOND.foulLine).toBe(330);
    expect(DIAMOND.centreField).toBe(400);
    // Second base is under a third of the way out to the centre field fence.
    expect((DIAMOND.base * Math.SQRT2) / DIAMOND.centreField).toBeLessThan(0.33);
  });

  it("chalks its lines and raises its mound to life, near enough: lines 6 inches wide, the mound 10 inches high", () => {
    const [firstLine] = diamond.lines;
    expect(Math.min(firstLine.w, firstLine.d) / scale).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(diamond.mound.h / scale).toBeCloseTo(10 / 12);
  });

  it("raises the mound as a low hill, above the field and ringed in light", () => {
    const { mound } = diamond;
    expect(mound.shape).toBe("frustum");
    expect(mound.rBottom).toBeCloseTo(DIAMOND.moundRadius * scale);
    expect(mound.rTop).toBeLessThan(mound.rBottom);
    expect(mound.y + mound.h).toBeGreaterThan(diamond.level);
    expect(
      diamond.rings.some(
        (r) => r.x === mound.x && r.z === mound.z && r.r > mound.rBottom,
      ),
    ).toBe(true);
  });

  /** A sheet's outline, back in world x, z. */
  const outline = (s: Solid) =>
    (s.sections?.[1].outline ?? []).map(([x, z]) => [s.x + x, s.z + z]);
  /** A sheet's outline but for home plate's corner: its rim. */
  const rim = (s: Solid) =>
    outline(s).filter(
      ([x, z]) => Math.abs(x - home.x) > 1e-6 || Math.abs(z - home.z) > 1e-6,
    );

  it("bows its fence out from pole to pole, deepest in centre field", () => {
    const reach = DIAMOND.foulLine * scale;
    const fence = rim(diamond.outfield);
    const far = (p: number[]) => Math.hypot(p[0] - home.x, p[1] - home.z);
    const near = (x: number, z: number) =>
      fence.some(
        (p) => Math.abs(p[0] - x) < 1e-6 && Math.abs(p[1] - z) < 1e-6,
      );
    expect(near(home.x, home.z - reach)).toBe(true);
    expect(near(home.x - reach, home.z)).toBe(true);
    expect(Math.max(...fence.map(far))).toBeCloseTo(
      DIAMOND.centreField * scale,
    );
    // A curve: every point out past the line joining the poles, bar the poles.
    for (const p of fence) {
      expect(home.x - p[0] + (home.z - p[1])).toBeGreaterThan(reach - 1e-6);
    }
    expect(fence.length).toBeGreaterThan(10);
  });

  it("lays the infield's dirt in an arc behind the bases, inside the fence", () => {
    const skin = rim(diamond.skin);
    const back = (p: number[]) => (home.x - p[0] + (home.z - p[1])) / Math.SQRT2;
    // Out past second base on the line from home, short of the fence.
    expect(Math.max(...skin.map(back))).toBeGreaterThan(base * Math.SQRT2);
    expect(Math.max(...skin.map(back))).toBeLessThan(
      DIAMOND.centreField * scale,
    );
    expect(diamond.skin.y + diamond.skin.h).toBeLessThan(diamond.surfaces[0].y);
  });

  it("makes home plate a pentagon, its point at the lines' corner, set apart from the square bases", () => {
    const plate = outline(diamond.plate);
    expect(plate).toHaveLength(5);
    expect(
      plate.some(
        ([x, z]) => Math.abs(x - home.x) < 1e-6 && Math.abs(z - home.z) < 1e-6,
      ),
    ).toBe(true);
    for (const [x, z] of plate) {
      expect(x).toBeLessThanOrEqual(home.x + 1e-6);
      expect(z).toBeLessThanOrEqual(home.z + 1e-6);
    }
  });

  it("draws its bases and home plate life-size: bases 15 inches square, the plate 17 inches across its front and 12 along each edge to its point", () => {
    for (const b of diamond.bases) {
      expect(b.w / scale).toBeCloseTo(15 / 12);
      expect(b.d / scale).toBeCloseTo(15 / 12);
    }
    const plate = outline(diamond.plate);
    const edges = plate.map(([x, z], i) => {
      const [nx, nz] = plate[(i + 1) % plate.length];
      return Math.hypot(nx - x, nz - z) / scale;
    });
    expect(Math.max(...edges)).toBeCloseTo(17 / 12, 2);
    expect(edges.filter((e) => Math.abs(e - 1) < 0.01)).toHaveLength(2);
    // A slab, as are its outline's light and the bases: inches thick, not feet.
    const [bottom, top] = diamond.plate.sections!;
    expect((top.h - bottom.h) / scale).toBeLessThan(0.25);
    const rim = diamond.rings.find((r) => r.outline?.length === 5)!;
    expect(rim.h / scale).toBeLessThan(0.25);
    for (const b of diamond.bases) expect(b.h / scale).toBeLessThan(0.25);
  });

  it("rings it with a stadium: a deck of seats in the outfield beyond the fence, light towers behind, foul ground open and nothing behind home", () => {
    const { stands } = diamond;
    const top = (b: Box) => b.y + b.h / 2;
    const far = (p: number[]) => Math.hypot(p[0] - home.x, p[1] - home.z);
    const angle = (p: number[]) => Math.atan2(p[1] - home.z, p[0] - home.x);
    const fence = rim(diamond.outfield);
    const fenceAt = (p: number[]) =>
      far(
        fence.reduce((a, b) =>
          Math.abs(angle(b) - angle(p)) < Math.abs(angle(a) - angle(p)) ? b : a,
        ),
      );
    // The outfield's seats: many steps, every one beyond the fence, rising
    // to a deck over the foul poles.
    expect(stands.bleachers.length).toBeGreaterThanOrEqual(60);
    for (const seat of stands.bleachers) {
      for (const p of outline(seat)) expect(far(p)).toBeGreaterThan(fenceAt(p));
    }
    const deck = Math.max(...stands.bleachers.map((b) => b.y + b.h));
    expect(deck - diamond.level).toBeGreaterThan(DIAMOND.poleHeight * scale);
    // Foul ground and behind home left open: every stand beyond the fence,
    // none behind home.
    for (const b of stands.bodies) {
      expect(far([b.x, b.z])).toBeGreaterThan(fenceAt([b.x, b.z]));
      expect(b.x - b.w / 2 > home.x && b.z - b.d / 2 > home.z).toBe(false);
    }
    // Three to six light towers, beyond the fence, their lamps over the poles.
    expect(stands.lamps.length).toBeGreaterThanOrEqual(3);
    expect(stands.lamps.length).toBeLessThanOrEqual(6);
    for (const lamp of stands.lamps) {
      expect(far([lamp.x, lamp.z])).toBeGreaterThan(fenceAt([lamp.x, lamp.z]));
      expect(lamp.y).toBeGreaterThan(diamond.level + DIAMOND.poleHeight * scale);
    }
    // Its bounds take in all of it.
    const { bounds } = diamond;
    for (const b of [...stands.bodies, ...stands.lamps]) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(bounds.x0 - 1e-6);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(bounds.x1 + 1e-6);
      expect(b.z - b.d / 2).toBeGreaterThanOrEqual(bounds.z0 - 1e-6);
      expect(b.z + b.d / 2).toBeLessThanOrEqual(bounds.z1 + 1e-6);
      expect(top(b)).toBeLessThanOrEqual(bounds.top);
    }
  });

  it("lies on a level plinth above the ground under it", () => {
    for (const b of [...diamond.lines, ...diamond.surfaces, ...diamond.bases]) {
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(diamond.level - 1e-6);
    }
    expect(diamond.plinth.y + diamond.plinth.h / 2).toBeCloseTo(diamond.level);
  });
});

const { buildings, masts, landmarks, skyline, hongKong } = layoutStructures();
const diamondBox = landmarks.diamond;

/** The landmark at the Lit site for `highlight`. */
const landmarkOf = (highlight: string) =>
  landmarks.bounds[SITES.findIndex((s) => s.highlight === highlight)];

describe("the Diamond in the world", () => {
  it("stands in the valley past BT Cup's stadium bowl, short of Victoria Harbour", () => {
    const bowl = landmarkOf("bt-cup");
    expect(diamondBox.z + diamondBox.d / 2).toBeLessThan(bowl.z - bowl.d / 2);
    expect(diamondBox.z - diamondBox.d / 2).toBeGreaterThan(
      VICTORIA_HARBOUR.near,
    );
  });

  it("is set back off the route's line and its runway lights (14 either side), toward one wall, on ground level enough for its plinth", () => {
    const side = Math.sign(diamondBox.x - valleyCentre(diamondBox.z));
    for (const u of [-1, 1]) {
      for (const v of [-1, 1]) {
        const x = diamondBox.x + (u * diamondBox.w) / 2;
        const z = diamondBox.z + (v * diamondBox.d) / 2;
        expect(side * (x - valleyCentre(z))).toBeGreaterThan(16);
        expect(waterAt(x, z)).toBe(0);
      }
    }
    // The plinth under the diamond; the stands may step up the wall.
    const { low, high } = groundUnder(
      valleyCentre(DIAMOND_AT.z) + DIAMOND_AT.fromCentreLine,
      DIAMOND_AT.z,
      diamondFootprint(DIAMOND_AT.scale).w,
      diamondFootprint(DIAMOND_AT.scale).d,
    );
    expect(high - low).toBeLessThan(3);
  });

  it("stands well inland, 10 or more clear of Victoria Harbour's water all round", () => {
    const x0 = diamondBox.x - diamondBox.w / 2;
    const x1 = diamondBox.x + diamondBox.w / 2;
    const z0 = diamondBox.z - diamondBox.d / 2;
    const z1 = diamondBox.z + diamondBox.d / 2;
    for (let z = z0 - 10; z <= z1 + 10; z += 0.5) {
      for (let x = x0 - 10; x <= x1 + 10; x += 0.5) {
        const dx = Math.max(x0 - x, 0, x - x1);
        const dz = Math.max(z0 - z, 0, z - z1);
        if (Math.hypot(dx, dz) < 10) expect(waterAt(x, z)).toBe(0);
      }
    }
  });

  it("keeps clear of every tower, Landmark, the skyline and Hong Kong", () => {
    const overlaps = (a: Box, b: Box) =>
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
      Math.abs(a.z - b.z) < (a.d + b.d) / 2;
    for (const other of [
      ...buildings,
      ...masts,
      ...landmarks.bounds,
      ...skyline.bounds,
      ...hongKong.bounds,
    ]) {
      expect(overlaps(diamondBox, other)).toBe(false);
    }
  });
});

/** Every screen shape the court's poses are tested for. */
const shapes = {
  ultrawide: 2.4,
  desktop: 1.6,
  "tablet, landscape": 1.33,
  square: 1,
  "tablet, portrait": 0.75,
  phone: 0.46,
  "narrow phone": 0.4,
};

/** True if `p` is within `margin` of the box (as in structures.test.ts). */
function near(p: Pose["position"], b: Box, margin: number) {
  return (
    Math.abs(p.x - b.x) < b.w / 2 + margin &&
    Math.abs(p.y - b.y) < b.h / 2 + margin &&
    Math.abs(p.z - b.z) < b.d / 2 + margin
  );
}

describe("the camera, past the Diamond", () => {
  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const route = nominalRoute(aspect);
      const court = courtPose(aspect);
      const play = playView(aspect, landmarks.court).pose;
      const skyline = skylinePose(aspect);
      const places = [court, play, skyline, hongKongPose(aspect)];

      it("keeps 3 clear of it all along home's scroll route", () => {
        for (let s = 0; s <= ROUTE_STOPS - 1; s += 0.01) {
          const { position } = route.poseAt(s);
          expect(near(position, diamondBox, 3), `at stop ${s.toFixed(2)}`).toBe(
            false,
          );
        }
      });

      it("keeps 3 clear of it at every Place and through every Transit", () => {
        const stops = Array.from({ length: ROUTE_STOPS }, (_, i) => i);
        const transits = [
          transitWithin(court, play),
          transitWithin(play, court),
          ...[...stops, court, skyline].flatMap((from) =>
            [...stops, court, skyline].map((to) =>
              transitPath(
                route,
                typeof from === "number" ? route.poseAt(from) : from,
                to,
              ),
            ),
          ),
        ];
        for (const { position } of places) {
          expect(near(position, diamondBox, 3)).toBe(false);
        }
        for (const trip of transits) {
          for (let t = 0; t <= 1; t += 1 / 200) {
            expect(near(trip.poseAt(t).position, diamondBox, 3)).toBe(false);
          }
        }
      });
    });
  }
});

/** The Diamond's middle, on the ground. */
const middle = new Vector3(
  diamondBox.x,
  valleyHeight(diamondBox.x, diamondBox.z),
  diamondBox.z,
);

/** A camera at `pose`, for a screen of this shape. */
function cameraAt(pose: Pose, aspect: number) {
  const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * Where the Diamond's middle lands on the screen of a camera at `pose`, in
 * NDC, how far off it is, and whether it shows: in the frame and not lost in
 * the fog (nine tenths of it, or more, gone).
 */
function sighting(pose: Pose, aspect: number) {
  const { x, y, z } = middle.clone().project(cameraAt(pose, aspect));
  const distance = pose.position.distanceTo(middle);
  const fog = 1 - Math.exp(-((distance * FOG_DENSITY) ** 2));
  const inFrame = z < 1 && Math.abs(x) < 1 && Math.abs(y) < 1;
  return { x, distance, fog, shows: inFrame && fog < 0.9 };
}

/** The screen rectangle (NDC) a box covers, from its corners in front of the camera. */
function onScreen(pose: Pose, aspect: number, b: Box) {
  const camera = cameraAt(pose, aspect);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const u of [-1, 1]) {
    for (const v of [-1, 1]) {
      for (const w of [-1, 1]) {
        const p = new Vector3(
          b.x + (u * b.w) / 2,
          b.y + (v * b.h) / 2,
          b.z + (w * b.d) / 2,
        ).project(camera);
        if (p.z >= 1) continue;
        xs.push(p.x);
        ys.push(p.y);
      }
    }
  }
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  };
}

/** The Diamond as the landmarks lay it out, and its infield's points. */
const built = (() => {
  const { z, fromCentreLine, scale: s } = DIAMOND_AT;
  const x = valleyCentre(z) + fromCentreLine;
  const foot = diamondFootprint(s);
  const level = groundUnder(x, z, foot.w, foot.d).high + 0.3;
  const side = Math.sign(fromCentreLine) as 1 | -1;
  return layoutDiamond({ x, z, side, level, scale: s, color: palette.cyan });
})();
/** World x, y, z on the built Diamond's field, `a` down one foul line and `c` along the other. */
const fromHome = (a: number, c: number) => {
  const side = Math.sign(DIAMOND_AT.fromCentreLine);
  return [built.home.x + side * c, built.level + 0.1, built.home.z - a] as const;
};
/** Every corner of the built stadium above the field's level. */
const stadiumPoints = [
  ...[...built.stands.bodies, ...built.stands.lamps].flatMap((b) => {
    const top = b.y + b.h / 2;
    const bottom = Math.max(b.y - b.h / 2, built.level);
    return [-1, 1].flatMap((u) =>
      [-1, 1].flatMap((v) =>
        [bottom, top].map(
          (y) => new Vector3(b.x + (u * b.w) / 2, y, b.z + (v * b.d) / 2),
        ),
      ),
    );
  }),
  ...built.stands.bleachers.flatMap((seat) =>
    (seat.sections?.[1].outline ?? []).flatMap(([x, z]) => [
      new Vector3(seat.x + x, built.level, seat.z + z),
      new Vector3(seat.x + x, seat.y + seat.h, seat.z + z),
    ]),
  ),
  ...[-1, 1].flatMap((u) =>
    [-1, 1].map(
      (v) =>
        new Vector3(
          built.plinth.x + (u * built.plinth.w) / 2,
          built.level,
          built.plinth.z + (v * built.plinth.d) / 2,
        ),
    ),
  ),
];
const reach = DIAMOND.foulLine * DIAMOND_AT.scale;
const bag = DIAMOND.base * DIAMOND_AT.scale;
const infield: [number, number][] = [
  [0, 0],
  [bag, 0],
  [bag, bag],
  [0, bag],
  [(DIAMOND.mound * DIAMOND_AT.scale) / Math.SQRT2, (DIAMOND.mound * DIAMOND_AT.scale) / Math.SQRT2],
  ...[0.25, 0.5, 0.75, 1].flatMap((t): [number, number][] => [
    [t * reach, 0],
    [0, t * reach],
  ]),
];

/** The stops that frame the court and the bowl, where it may show behind. */
const courtStop = SITES.findIndex((s) => s.highlight === "juice-bros") + 1;
const bowlStop = SITES.findIndex((s) => s.highlight === "bt-cup") + 1;

describe("home's scroll route and the Diamond", () => {
  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const route = nominalRoute(aspect);

      it("shows it at the court and bowl stops only down the valley beyond the stop's Landmark, never over it on the screen", () => {
        for (const stop of [courtStop, bowlStop]) {
          const pose = route.poseAt(stop);
          const seen = sighting(pose, aspect);
          if (!seen.shows) continue;
          const site = SITES[stop - 1];
          expect(seen.distance).toBeGreaterThan(
            pose.position.distanceTo(site.position),
          );
          const field = onScreen(pose, aspect, diamondBox);
          const landmark = onScreen(pose, aspect, landmarks.bounds[stop - 1]);
          const apart =
            field.x0 >= landmark.x1 ||
            field.x1 <= landmark.x0 ||
            field.y0 >= landmark.y1 ||
            field.y1 <= landmark.y0;
          expect(apart, `at stop ${stop}`).toBe(true);
        }
      });

      it("never frames it at any other stop: it is out of frame, lost in the fog, or out at the frame's edge away from the stop's Lit site", () => {
        for (let stop = 0; stop < ROUTE_STOPS; stop++) {
          if (stop === courtStop || stop === bowlStop) continue;
          const pose = route.poseAt(stop);
          const seen = sighting(pose, aspect);
          if (!seen.shows || seen.fog > 0.5) continue;
          const site = SITES[stop - 1];
          // The settled view and Hong Kong's frame nothing beside their own.
          expect(site, `in view at stop ${stop}`).toBeDefined();
          // Past where a narrow screen frames the site itself (0.2 to 0.3).
          expect(Math.abs(seen.x), `at stop ${stop}`).toBeGreaterThanOrEqual(
            0.45,
          );
          // Across the frame from the site, behind its panel on a wide
          // screen, and further off than the site.
          expect(Math.sign(seen.x), `at stop ${stop}`).toBe(-site.side);
          expect(seen.distance).toBeGreaterThan(
            pose.position.distanceTo(site.position),
          );
        }
      });
      it("turns to frame it between the bowl and Hong Kong: the whole stadium in frame near the middle, clear of the fog, nothing standing in front of it", () => {
        const { at, until } = DIAMOND_GLANCE[aspect >= 1 ? "wide" : "narrow"];
        for (const f of [at, (at + until) / 2, until]) {
          const pose = route.poseAt(bowlStop + f);
          const seen = sighting(pose, aspect);
          expect(seen.shows).toBe(true);
          expect(Math.abs(seen.x)).toBeLessThan(0.25);
          expect(seen.fog).toBeLessThan(0.3);
          // The stadium, every stand, seat, lamp and the field, all in frame.
          const camera = cameraAt(pose, aspect);
          for (const point of stadiumPoints) {
            const { x, y, z } = point.clone().project(camera);
            expect(z).toBeLessThan(1);
            expect(Math.abs(x)).toBeLessThan(1);
            expect(Math.abs(y)).toBeLessThan(1);
          }
          // Home plate, the bases, the mound and both foul lines out to the
          // poles, in plain view: no stand stands in front of them.
          for (const [a, c] of infield) {
            const point = new Vector3(...fromHome(a, c));
            const far = pose.position.distanceTo(point);
            const ray = new Ray(
              pose.position.clone(),
              point.clone().sub(pose.position).normalize(),
            );
            for (const b of [...built.stands.bodies, ...built.stands.lamps]) {
              const box = new Box3(
                new Vector3(b.x - b.w / 2, b.y - b.h / 2, b.z - b.d / 2),
                new Vector3(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2),
              );
              const hit = ray.intersectBox(box, new Vector3());
              expect(hit && pose.position.distanceTo(hit) < far).toBeFalsy();
            }
          }
          // No tower or Landmark between the camera and its middle or its
          // corners at the field's level.
          for (const [u, v] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const point = new Vector3(
              diamondBox.x + (u * diamondBox.w) / 2,
              diamondBox.y +
                diamondBox.h / 2 -
                DIAMOND.poleHeight * DIAMOND_AT.scale +
                0.5,
              diamondBox.z + (v * diamondBox.d) / 2,
            );
            const far = pose.position.distanceTo(point);
            const ray = new Ray(
              pose.position.clone(),
              point.clone().sub(pose.position).normalize(),
            );
            for (const b of [...buildings, ...masts, ...landmarks.bounds]) {
              const box = new Box3(
                new Vector3(b.x - b.w / 2, b.y - b.h / 2, b.z - b.d / 2),
                new Vector3(b.x + b.w / 2, b.y + b.h / 2, b.z + b.d / 2),
              );
              const hit = ray.intersectBox(box, new Vector3());
              expect(hit && pose.position.distanceTo(hit) < far).toBeFalsy();
            }
          }
        }
      });

      it("glimpses it in passing, between stops", () => {
        const glimpses = Array.from(
          { length: (ROUTE_STOPS - 1) * 100 },
          (_, i) => sighting(route.poseAt(i / 100), aspect),
        ).filter((seen) => seen.shows && seen.fog < 0.5);
        expect(glimpses.length).toBeGreaterThan(5);
      });
    });
  }
});
