import { InstancedMesh, Matrix4, type ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { layoutArena } from "./arena";
import {
  keepClear,
  landsIn,
  onScreen,
  SCREENS,
  settledView,
  type Shape,
} from "./clearance";
import type { Pose } from "./flight";
import {
  createFerries,
  ferryAt,
  ferryBounds,
  ferryCycle,
  ferryFootprint,
  FERRIES,
} from "./ferries";
import { createHarbour, MAX_REFLECTED, reflectedLights } from "./harbour";
import { layoutHongKong } from "./hong-kong";
import { STILL_TIME } from "./shared";
import { layoutSkyline } from "./skyline";
import { ROUTE_STOPS, skylineView } from "./route";
import {
  HARBOUR,
  valleyCentre,
  valleyHeight,
  VICTORIA_HARBOUR,
  waterAt,
} from "./terrain";

/** Each ferry's whereabouts every half second through its round trip. */
const voyage = (ferry: (typeof FERRIES)[number]) =>
  Array.from({ length: Math.ceil(ferryCycle(ferry) / 0.5) + 1 }, (_, i) => i * 0.5);

describe("the ferries' crossings", () => {
  it("puts two on each harbour", () => {
    expect(FERRIES.filter((f) => f.harbour === HARBOUR)).toHaveLength(2);
    expect(FERRIES.filter((f) => f.harbour !== HARBOUR)).toHaveLength(2);
  });

  it("keeps the whole hull on the water, all the way across", () => {
    for (const ferry of FERRIES) {
      for (const t of voyage(ferry)) {
        for (const [x, z] of ferryFootprint(ferry, t)) {
          expect(waterAt(x, z), `${x.toFixed(1)}, ${z.toFixed(1)}`).toBeGreaterThan(0);
          expect(valleyHeight(x, z)).toBeLessThan(ferry.harbour.level);
        }
      }
    }
  });

  it("keeps clear of the bridge of light over the Harbour, on the path's centre line", () => {
    // The bridge: 8 wide along the centre line, from z -430 to -586.
    for (const ferry of FERRIES.filter((f) => f.harbour === HARBOUR)) {
      for (const t of voyage(ferry)) {
        for (const [x, z] of ferryFootprint(ferry, t)) {
          if (z > -430 || z < -586) continue;
          expect(Math.abs(x - valleyCentre(z))).toBeGreaterThan(4 + 2);
        }
      }
    }
  });

  it("keeps clear of the Arena's braces on Victoria Harbour's right shore", () => {
    const { braces } = layoutArena();
    for (const ferry of FERRIES) {
      for (const t of voyage(ferry)) {
        for (const [x, z] of ferryFootprint(ferry, t)) {
          for (const brace of braces) {
            expect(Math.hypot(x - brace.x, z - brace.z)).toBeGreaterThan(10);
          }
        }
      }
    }
  });

  it("rests at each pier, then crosses at about 4 a second", () => {
    const ferry = FERRIES[0];
    const at = (t: number) => ferryAt(ferry, t);
    const cycle = ferryCycle(ferry);
    // Find a moment it is resting: it doesn't move for 6 seconds.
    const rests = voyage(ferry).filter(
      (t) => Math.hypot(at(t).x - at(t + 5.9).x, at(t).z - at(t + 5.9).z) < 1e-6,
    );
    expect(rests.length).toBeGreaterThan(0);
    // Back where it started after one round trip.
    expect(at(cycle).x).toBeCloseTo(at(0).x);
    expect(at(cycle).z).toBeCloseTo(at(0).z);
    // A crossing's length over its time, at about 4 a second.
    const [a, b] = ferry.ends;
    const span = Math.hypot(a.x - b.x, a.z - b.z);
    expect(span / (cycle / 2 - 6)).toBeCloseTo(4, 5);
  });
});

/**
 * True if the ferry's middle is in the frame at `pose`, near enough to read
 * through the fog.
 */
function seen(pose: Pose, aspect: number, fovY: number | undefined, at: Vector3) {
  const rect = onScreen(pose, aspect, at, fovY);
  return (
    rect !== null &&
    Math.abs(rect.x0) < 1 &&
    Math.abs(rect.y0) < 1 &&
    pose.position.distanceTo(at) < 400
  );
}

const middle = (ferry: (typeof FERRIES)[number], t: number) => {
  const b = ferryBounds(ferry, t);
  return new Vector3(b.x, b.y, b.z);
};

describe("the ferries on every screen, phone first", () => {
  for (const shape of Object.keys(SCREENS) as Shape[]) {
    it(`never land on the name plate or a Landmark at its stop (${shape})`, () => {
      const areas = keepClear(shape);
      for (const ferry of FERRIES) {
        for (const t of voyage(ferry)) {
          const box = ferryBounds(ferry, t);
          for (const area of areas) {
            expect(
              landsIn(box, area),
              `${area.name} at stop ${area.stop}, t ${t}, ferry from z ${ferry.b[1]}`,
            ).toBe(false);
          }
        }
      }
    });

    it(`are seen from home's route, and Toronto's from the Skyline (${shape})`, () => {
      const { route, aspect } = settledView(shape);
      const skyline = skylineView(aspect);
      for (const ferry of FERRIES) {
        const times = voyage(ferry);
        // Along the whole route, a quarter of a leg at a time.
        const stops = Array.from({ length: 4 * (ROUTE_STOPS - 1) + 1 }, (_, s) =>
          route.poseAt(s / 4),
        );
        expect(
          stops.some((pose) =>
            times.some((t) => seen(pose, aspect, undefined, middle(ferry, t))),
          ),
        ).toBe(true);
        if (ferry.harbour !== HARBOUR) continue;
        expect(
          times.some((t) => seen(skyline.pose, aspect, skyline.fovY, middle(ferry, t))),
        ).toBe(true);
      }
    });
  }
});

describe("the ferries' draw", () => {
  const shared = {
    uTime: { value: STILL_TIME },
    uPixelRatio: { value: 1 },
    uTraffic: { value: STILL_TIME },
  };
  const landmarks = reflectedLights(layoutSkyline());
  const waters = [
    createHarbour(shared, HARBOUR, landmarks),
    createHarbour(shared, VICTORIA_HARBOUR, layoutHongKong().reflected),
  ];
  const lights = (k: number) =>
    (waters[k].material as ShaderMaterial).uniforms.uLights.value as Vector3[];
  const ferries = createFerries(shared, waters);
  const hull = (i: number) => {
    const m = new Matrix4();
    ferries.mesh.getMatrixAt(i, m);
    return new Vector3().setFromMatrixPosition(m);
  };

  it("is one instanced draw, lights and all", () => {
    expect(ferries.mesh).toBeInstanceOf(InstancedMesh);
    expect(ferries.mesh.count).toBeGreaterThanOrEqual(FERRIES.length * 5);
    expect(ferries.mesh.instanceColor).not.toBeNull();
  });

  it("moves only with the traffic's clock, and stands still while it holds", () => {
    const first = FERRIES[0];
    const crossingAt = 7; // past the first rest, mid-crossing for some
    shared.uTraffic.value = STILL_TIME;
    ferries.update();
    const still = hull(0);
    ferries.update();
    expect(hull(0).distanceTo(still)).toBe(0);
    // Somewhere in its round trip, it's elsewhere.
    const elsewhere = Array.from({ length: 40 }, (_, i) => STILL_TIME + crossingAt * i).some((t) => {
      shared.uTraffic.value = t;
      ferries.update();
      return hull(0).distanceTo(still) > 1;
    });
    expect(elsewhere).toBe(true);
    const { x, z } = ferryAt(first, shared.uTraffic.value);
    expect(hull(0).x).toBeCloseTo(x);
    expect(hull(0).z).toBeCloseTo(z);
  });

  it("streaks each ferry's light across its own harbour's water, past the Landmarks' lights", () => {
    shared.uTraffic.value = 30;
    ferries.update();
    const before = landmarks.map((l) => new Vector3(l.x, l.y, l.z));
    expect(lights(0).slice(0, MAX_REFLECTED)).toEqual(before);
    FERRIES.forEach((ferry, k) => {
      const water = ferry.harbour === HARBOUR ? 0 : 1;
      const slot = MAX_REFLECTED + (k % 2);
      const { x, z } = ferryAt(ferry, 30);
      expect(lights(water)[slot].x).toBeCloseTo(x);
      expect(lights(water)[slot].z).toBeCloseTo(z);
      expect(lights(water)[slot].y).toBeGreaterThan(ferry.harbour.level);
    });
  });
});
