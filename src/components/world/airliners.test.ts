import { InstancedMesh, type ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { AIRLINERS, airlinerAt, airlinerBox, createAirliners, strobeOn } from "./airliners";
import { keepClear, landsIn, onScreen, SCREENS, SHAPES, settledView, type Shape } from "./clearance";
import type { Pose } from "./flight";
import { FOG_DENSITY } from "./palette";
import { CAMERA } from "./pose";
import { courtPose, ROUTE_STOPS, skylineView } from "./route";
import { layoutStructures, type Box } from "./structures";
import { groundUnder } from "./terrain";

/** Every shape, phone first (as SCREENS lists them). */
const SHAPE_NAMES = Object.keys(SCREENS) as Shape[];

/** Each plane over one pass of its route, every `step` seconds, while it shows. */
function pass(i: number, step = 0.5) {
  const plane = AIRLINERS[i];
  const seconds = plane.from.distanceTo(plane.to) / plane.speed;
  const out: number[] = [];
  for (let t = 0; t < seconds; t += step) {
    if (airlinerAt(plane, t).show > 0) out.push(t);
  }
  return out;
}

describe("the Airliners keep clear", () => {
  for (const shape of SHAPE_NAMES) {
    it(`never land on the name plate or a Landmark at its stop (${shape})`, () => {
      const areas = keepClear(shape);
      AIRLINERS.forEach((plane, i) => {
        for (const t of pass(i)) {
          const box = airlinerBox(plane, t);
          const hit = areas.find((a) => landsIn(box, a));
          expect(hit?.name, `plane ${i} at ${t}s`).toBeUndefined();
        }
      });
    });
  }
});

describe("the Airliners' routes", () => {
  const { buildings, masts, landmarks, skyline, hongKong } = layoutStructures();
  const solids: Box[] = [
    ...buildings,
    ...masts,
    ...landmarks.bounds,
    landmarks.diamond,
    ...skyline.bounds,
    ...skyline.towers,
    ...skyline.darkTowers,
    ...hongKong.bounds,
    ...hongKong.towers,
    ...hongKong.darkTowers,
  ];
  const meet = (a: Box, b: Box) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 &&
    Math.abs(a.z - b.z) < (a.d + b.d) / 2;

  AIRLINERS.forEach((plane, i) => {
    it(`keep plane ${i} 70 to 135 up, clear of the terrain and every tower`, () => {
      for (const t of pass(i)) {
        const box = airlinerBox(plane, t);
        const { y } = airlinerAt(plane, t).position;
        expect(y).toBeGreaterThanOrEqual(70);
        expect(y).toBeLessThanOrEqual(135);
        // Wings and all, well over the hills under it.
        const { high } = groundUnder(box.x, box.z, box.w, box.d);
        expect(box.y - box.h / 2 - high, `plane ${i} at ${t}s`).toBeGreaterThan(10);
        expect(solids.find((s) => meet(box, s)), `plane ${i} at ${t}s`).toBeUndefined();
      }
    });
  });
});

/** The fog over a point seen from `from`, as the shaders' `fogAmount` (./palette). */
function fogAt(from: Vector3, p: Vector3) {
  const d = from.distanceTo(p);
  const far = 1 - Math.exp(-((d * FOG_DENSITY) ** 2));
  const ground = Math.exp(-Math.max(p.y, 0) * 0.07) * (1 - Math.exp(-d * 0.004));
  return Math.min(1, far + ground * 0.5);
}

/** True if, at some point on its route, a plane is in the frame and clear of the fog. */
function seen(i: number, poses: readonly Pose[], aspect: number, fovY: number) {
  return pass(i).some((t) => {
    const { position, show } = airlinerAt(AIRLINERS[i], t);
    return show > 0.5 && poses.some((pose) => {
      const at = onScreen(pose, aspect, position, fovY);
      return (
        at !== null &&
        Math.abs(at.x0) < 0.95 &&
        Math.abs(at.y0) < 0.95 &&
        fogAt(pose.position, position) < 0.9
      );
    });
  });
}

describe("the Airliners are seen", () => {
  for (const shape of SHAPE_NAMES) {
    const aspect = SHAPES[shape];
    const { route } = settledView(shape);
    const home = Array.from({ length: (ROUTE_STOPS - 1) * 10 + 1 }, (_, k) => route.poseAt(k / 10));
    const skyline = skylineView(aspect);

    AIRLINERS.forEach((_, i) => {
      it(`plane ${i} from home's route, the court and the Skyline (${shape})`, () => {
        expect(seen(i, home, aspect, CAMERA.fovY), "home's route").toBe(true);
        expect(seen(i, [courtPose(aspect)], aspect, CAMERA.fovY), "the court").toBe(true);
        expect(seen(i, [skyline.pose], aspect, skyline.fovY), "the Skyline").toBe(true);
      });
    });
  }
});

describe("the Airliners' lights", () => {
  AIRLINERS.forEach((plane, i) => {
    it(`plane ${i}'s strobes flash, and never more than 3 times a second`, () => {
      // Flashes begun over ten seconds, a millisecond at a time.
      let flashes = 0;
      for (let ms = 1; ms < 10_000; ms++) {
        if (strobeOn(plane, ms / 1000) && !strobeOn(plane, (ms - 1) / 1000)) flashes++;
      }
      expect(flashes).toBeGreaterThanOrEqual(7);
      expect(flashes).toBeLessThanOrEqual(30);
    });
  });
});

describe("the Airliners' draw", () => {
  it("is one instanced draw of all three, timed by the traffic's clock alone", () => {
    const shared = { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uTraffic: { value: 0 } };
    const mesh = createAirliners(shared);
    expect(mesh).toBeInstanceOf(InstancedMesh);
    expect(mesh.count).toBe(AIRLINERS.length);
    const { uniforms } = mesh.material as ShaderMaterial;
    expect(uniforms.uTraffic).toBe(shared.uTraffic);
    expect(Object.values(uniforms)).not.toContain(shared.uTime);
  });
});
