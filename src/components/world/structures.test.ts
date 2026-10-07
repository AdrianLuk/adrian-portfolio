import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createFlightPath } from "./flight";
import { SETTLED_RIG, type FlightRig } from "./rigs";
import { FOG_DENSITY } from "./palette";
import { CAMERA, settledYaw } from "./pose";
import { createRoute, ROUTE_STOPS, SITES } from "./route";
import { HERO_SIGHT, layoutStructures, type Box } from "./structures";
import { corridorHalfWidth, valleyCentre, valleyHeight } from "./terrain";

/** Settled poses like the real layouts' (as in flight.test.ts). */
function settledLayout(
  height: number,
  plateX: number,
  centreHeight: number,
  yaw = 0,
) {
  const quaternion = new Quaternion().setFromEuler(
    new Euler(-CAMERA.pitch, -yaw, 0, "YXZ"),
  );
  const position = new Vector3(0, height, 0);
  const { pitch, plateDepth } = CAMERA;
  const plateY =
    (centreHeight - height + plateDepth * Math.sin(pitch)) / Math.cos(pitch);
  const plateCentre = new Vector3(plateX, plateY, -plateDepth)
    .applyQuaternion(quaternion)
    .add(position);
  return { settled: { position, quaternion }, plateCentre };
}

const layouts = {
  "desktop, one line lower left": { ...settledLayout(21, -18, 7), aspect: 1.6 },
  "desktop, low camera": { ...settledLayout(11.75, -18, 7), aspect: 1.6 },
  "phone, stacked": {
    ...settledLayout(16, -3, 9, settledYaw(0.46)),
    aspect: 0.46,
  },
};

/** Rig states down the whole flight, as the timeline plays them. */
function along(steps = 200): FlightRig[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const turn = Math.max(0, t * 2 - 1);
    return {
      ...SETTLED_RIG,
      flight: Math.min(1, t * 2),
      turn,
      settle: Math.max(0, (turn - 0.4) / 0.6),
    };
  });
}

/** True if `p` is within `margin` of the box. */
function near(p: Vector3, b: Box, margin: number) {
  return (
    Math.abs(p.x - b.x) < b.w / 2 + margin &&
    Math.abs(p.y - b.y) < b.h / 2 + margin &&
    Math.abs(p.z - b.z) < b.d / 2 + margin
  );
}

/** True if the segment from `a` to `b` passes through the box. */
function crosses(a: Vector3, b: Vector3, box: Box) {
  let t0 = 0;
  let t1 = 1;
  for (const [axis, size] of [
    ["x", box.w],
    ["y", box.h],
    ["z", box.d],
  ] as const) {
    const d = b[axis] - a[axis];
    const lo = box[axis] - size / 2 - a[axis];
    const hi = box[axis] + size / 2 - a[axis];
    if (Math.abs(d) < 1e-9) {
      if (lo > 0 || hi < 0) return false;
      continue;
    }
    const [n, f] = d > 0 ? [lo / d, hi / d] : [hi / d, lo / d];
    t0 = Math.max(t0, n);
    t1 = Math.min(t1, f);
    if (t0 > t1) return false;
  }
  return true;
}

const {
  buildings: lit,
  darkBuildings,
  district,
  masts,
  landmarks,
  skyline,
} = layoutStructures();
const buildings = [...lit, ...darkBuildings];
const towers = [...buildings, ...masts, ...landmarks.parts, ...skyline.bounds];
const { cnTower } = skyline;

describe("the city", () => {
  it("ends in a district on the valley floor, clear of the walls' slopes", () => {
    for (const b of district) {
      const off = Math.abs(b.x - valleyCentre(b.z)) + b.w / 2;
      expect(off).toBeLessThan(corridorHalfWidth(b.z));
    }
  });

  it("is lost in the fog past the hero's sight", () => {
    const fog = 1 - Math.exp(-((HERO_SIGHT * FOG_DENSITY) ** 2));
    expect(fog).toBeGreaterThanOrEqual(0.99);
  });

  it("is topped by the CN Tower: no building stands taller from its foot", () => {
    const height = cnTower.tip - cnTower.foot;
    for (const b of [
      ...buildings,
      ...landmarks.bounds,
      ...skyline.towers,
      ...skyline.darkTowers,
    ]) {
      expect(b.h).toBeLessThan(height);
    }
  });

  it("raises a landmark at each lit site, not a mast", () => {
    expect(landmarks.bounds).toHaveLength(SITES.length);
    for (const site of SITES) {
      const { x, z } = site.position;
      for (const mast of masts) {
        expect(Math.hypot(mast.x - x, mast.z - z)).toBeGreaterThan(10);
      }
    }
  });

  it("keeps every landmark clear of the city, the gates and the skyline", () => {
    const overlaps = (a: Box, b: Box) =>
      Math.abs(a.x - b.x) < (a.w + b.w) / 2 &&
      Math.abs(a.y - b.y) < (a.h + b.h) / 2 &&
      Math.abs(a.z - b.z) < (a.d + b.d) / 2;
    for (const landmark of landmarks.bounds) {
      for (const other of [...buildings, ...masts, ...skyline.bounds]) {
        expect(overlaps(landmark, other)).toBe(false);
      }
    }
  });

  it("carries each site's light at the top of its landmark", () => {
    SITES.forEach((site, i) => {
      const b = landmarks.bounds[i];
      const light = site.position;
      expect(Math.abs(light.x - b.x)).toBeLessThan(b.w / 2);
      expect(Math.abs(light.z - b.z)).toBeLessThan(b.d / 2);
      const top = b.y + b.h / 2;
      expect(light.y, site.highlight).toBeGreaterThan(top - 4);
      expect(light.y, site.highlight).toBeLessThan(top + 2);
    });
  });

  for (const [name, { settled, plateCentre, aspect }] of Object.entries(
    layouts,
  )) {
    describe(name, () => {
      const eye = settled.position;

      it("keeps the mountains above it: the ridge behind crests over every building in sight", () => {
        const elevation = (y: number, d: number) => Math.atan2(y - eye.y, d);
        const inSight = (b: Box) =>
          b.z < eye.z - 100 &&
          Math.hypot(b.x - eye.x, b.z - eye.z) < HERO_SIGHT;
        for (const b of [...buildings, ...landmarks.parts].filter(inSight)) {
          const dx = b.x - eye.x;
          const dz = b.z - eye.z;
          const distance = Math.hypot(dx, dz);
          let crest = -Infinity;
          for (let d = distance + 10; d < 1600; d += 4) {
            const x = eye.x + (dx / distance) * d;
            const z = eye.z + (dz / distance) * d;
            crest = Math.max(crest, elevation(valleyHeight(x, z), d));
          }
          const top = elevation(b.y + b.h / 2, distance - b.d / 2);
          expect(top, `building at z ${b.z.toFixed(0)}`).toBeLessThan(crest);
        }
      });

      it("shows the CN Tower whole from the hero, pod and tip in frame under the nav", () => {
        const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
        camera.position.copy(settled.position);
        camera.quaternion.copy(settled.quaternion);
        camera.updateMatrixWorld();
        for (const y of [cnTower.pod, cnTower.tip]) {
          const ndc = new Vector3(cnTower.x, y, cnTower.z).project(camera);
          expect(Math.abs(ndc.x)).toBeLessThan(0.9);
          expect(ndc.y).toBeGreaterThan(-0.2);
          // The nav bar covers about the top 6% of the screen.
          expect(ndc.y).toBeLessThan(0.85);
        }
      });

      it("shows the first lit site's shield whole, inside the frame's sides", () => {
        const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
        camera.position.copy(settled.position);
        camera.quaternion.copy(settled.quaternion);
        camera.updateMatrixWorld();
        const { x, z } = SITES[0].position;
        const shield = landmarks.bounds.find(
          (b) => Math.abs(b.x - x) < 1 && Math.abs(b.z - z) < 1,
        )!;
        for (const dx of [-1, 1]) {
          for (const dz of [-1, 1]) {
            const ndc = new Vector3(
              shield.x + (dx * shield.w) / 2,
              shield.y,
              shield.z + (dz * shield.d) / 2,
            ).project(camera);
            expect(Math.abs(ndc.x)).toBeLessThan(0.95);
          }
        }
      });

      it("sees the CN Tower's pod over every ridge and building between", () => {
        const pod = new Vector3(cnTower.x, cnTower.pod, cnTower.z);
        for (let k = 1; k < 200; k++) {
          const q = eye.clone().lerp(pod, k / 200);
          expect(q.y).toBeGreaterThan(valleyHeight(q.x, q.z));
        }
        for (const b of [
          ...buildings,
          ...landmarks.parts,
          ...skyline.towers,
          ...skyline.darkTowers,
        ]) {
          expect(crosses(eye, pod, b)).toBe(false);
        }
      });

      it("sees the first lit site, the beacon, down the street past every building", () => {
        for (const b of buildings) {
          expect(crosses(eye, SITES[0].position, b)).toBe(false);
        }
      });

      it("never meets the opening flight, which sees the plate past it the whole way", () => {
        const path = createFlightPath(settled, plateCentre);
        for (const rig of along()) {
          const { position } = path.poseAt(rig);
          for (const tower of towers) {
            expect(near(position, tower, 3)).toBe(false);
            expect(crosses(position, plateCentre, tower)).toBe(false);
          }
        }
      });

      it("never meets the scroll route", () => {
        const route = createRoute(settled, plateCentre, aspect);
        for (let s = 0; s <= ROUTE_STOPS - 1; s += 0.01) {
          const { position } = route.poseAt(s);
          for (const tower of towers) {
            expect(near(position, tower, 3)).toBe(false);
          }
        }
      });
    });
  }
});
