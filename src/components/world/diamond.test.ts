import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DIAMOND, layoutDiamond } from "./diamond";
import { FOG_DENSITY, palette } from "./palette";
import { CAMERA } from "./pose";
import type { Pose } from "./flight";
import { nominalRoute } from "./nominal-route";
import {
  courtPose,
  hongKongPose,
  playView,
  ROUTE_STOPS,
  SITES,
  skylinePose,
} from "./route";
import { layoutStructures, type Box } from "./structures";
import { groundUnder, valleyCentre, valleyHeight, waterAt } from "./terrain";
import { transitPath, transitWithin } from "./transit";

const scale = 0.2;
const home = { x: -30, z: -860 };
const diamond = layoutDiamond({
  ...home,
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

  it("sets its bases 90 feet apart round a square, home plate nearest home's end of the valley", () => {
    expect(DIAMOND.base).toBe(90);
    // Home, first base down the valley, second, third toward the wall.
    expect(at(home.x, home.z)).toHaveLength(1);
    expect(at(home.x, home.z - base)).toHaveLength(1);
    expect(at(home.x - base, home.z - base)).toHaveLength(1);
    expect(at(home.x - base, home.z)).toHaveLength(1);
    expect(diamond.bases).toHaveLength(4);
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
      expect(pole.y + pole.h / 2 - diamond.top).toBeCloseTo(
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

  it("lies on a level plinth above the ground under it", () => {
    for (const b of [...diamond.lines, ...diamond.surfaces, ...diamond.bases]) {
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(diamond.top - 1e-6);
    }
    expect(diamond.plinth.y + diamond.plinth.h / 2).toBeCloseTo(diamond.top);
  });
});

const { buildings, masts, landmarks, skyline, hongKong } = layoutStructures();
const field = landmarks.diamond;

/** The landmark at the Lit site for `highlight`. */
const landmarkOf = (highlight: string) =>
  landmarks.bounds[SITES.findIndex((s) => s.highlight === highlight)];

describe("the Diamond in the world", () => {
  it("stands in the valley between Juice Bros' court and BT Cup's stadium bowl", () => {
    const court = landmarkOf("juice-bros");
    const bowl = landmarkOf("bt-cup");
    expect(field.z + field.d / 2).toBeLessThan(court.z - court.d / 2);
    expect(field.z - field.d / 2).toBeGreaterThan(bowl.z + bowl.d / 2);
  });

  it("is set back off the route's line and its runway lights (14 either side), toward the wall, on ground level enough for its plinth", () => {
    for (const u of [-1, 1]) {
      for (const v of [-1, 1]) {
        const x = field.x + (u * field.w) / 2;
        const z = field.z + (v * field.d) / 2;
        expect(valleyCentre(z) - x).toBeGreaterThan(16);
        expect(waterAt(x, z)).toBe(0);
      }
    }
    const { low, high } = groundUnder(field.x, field.z, field.w, field.d);
    expect(high - low).toBeLessThan(3);
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
      expect(overlaps(field, other)).toBe(false);
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
          expect(near(position, field, 3), `at stop ${s.toFixed(2)}`).toBe(
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
          expect(near(position, field, 3)).toBe(false);
        }
        for (const trip of transits) {
          for (let t = 0; t <= 1; t += 1 / 200) {
            expect(near(trip.poseAt(t).position, field, 3)).toBe(false);
          }
        }
      });
    });
  }
});

/** The middle of the Diamond's field, on the ground. */
const middle = new Vector3(field.x, valleyHeight(field.x, field.z), field.z);

/**
 * Where the Diamond's middle lands on the screen of a camera at `pose`, in
 * NDC, how far off it is, and whether it shows: in the frame and not lost in
 * the fog (nine tenths of it, or more, gone).
 */
function sighting(pose: Pose, aspect: number) {
  const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld();
  const { x, y, z } = middle.clone().project(camera);
  const distance = pose.position.distanceTo(middle);
  const fog = 1 - Math.exp(-((distance * FOG_DENSITY) ** 2));
  const inFrame = z < 1 && Math.abs(x) < 1 && Math.abs(y) < 1;
  return { x, distance, fog, shows: inFrame && fog < 0.9 };
}

describe("home's scroll route and the Diamond", () => {
  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const route = nominalRoute(aspect);

      it("never frames it: at no stop is it centred, or where the stop frames its Lit site", () => {
        for (let stop = 0; stop < ROUTE_STOPS; stop++) {
          const pose = route.poseAt(stop);
          const seen = sighting(pose, aspect);
          if (!seen.shows) continue;
          const site = SITES[stop - 1];
          // The settled view and Hong Kong's frame nothing beside their own.
          expect(site, `in view at stop ${stop}`).toBeDefined();
          expect(Math.abs(seen.x), `at stop ${stop}`).toBeGreaterThan(0.2);
          // Across the frame from the site, behind its panel on a wide
          // screen, and further off than the site.
          expect(Math.sign(seen.x), `at stop ${stop}`).toBe(-site.side);
          expect(seen.distance).toBeGreaterThan(
            pose.position.distanceTo(site.position),
          );
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
