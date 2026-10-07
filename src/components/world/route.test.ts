import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { highlights } from "../../content/site";
import type { Pose } from "./flight";
import { CAMERA } from "./pose";
import {
  createRoute,
  OUTPOST,
  outpostPose,
  ROUTE_STOPS,
  SITES,
} from "./route";
import { corridorHalfWidth, valleyCentre, valleyHeight } from "./terrain";

/** Settled poses like the real layouts' (as in flight.test.ts). */
function settledLayout(height: number, plateX: number, centreHeight: number) {
  const quaternion = new Quaternion().setFromEuler(
    new Euler(-CAMERA.pitch, 0, 0, "YXZ"),
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

/** Where `point` lands on screen for a camera at `pose`, in NDC. */
function onScreen(pose: Pose, point: Vector3, aspect: number) {
  const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld();
  return point.clone().project(camera);
}

/** True if nothing of the terrain stands between `from` and `to`. */
function clearView(from: Vector3, to: Vector3) {
  for (let k = 1; k < 60; k++) {
    const q = from.clone().lerp(to, k / 60);
    if (q.y <= valleyHeight(q.x, q.z)) return false;
  }
  return true;
}

const layouts = {
  "desktop, one line lower left": { ...settledLayout(21, -18, 7), aspect: 1.6 },
  "phone, stacked": { ...settledLayout(16, -3, 9), aspect: 0.46 },
};

describe("the lit sites", () => {
  it("stand for the Highlights, one each, in their order", () => {
    expect(SITES.map((s) => s.highlight)).toEqual(highlights.map((h) => h.id));
  });
});

describe("the scroll route", () => {
  for (const [name, { settled, plateCentre, aspect }] of Object.entries(
    layouts,
  )) {
    describe(name, () => {
      const route = createRoute(settled, plateCentre, aspect);

      it("starts exactly on the settled pose", () => {
        const pose = route.poseAt(0);
        expect(pose.position.distanceTo(settled.position)).toBeLessThan(1e-6);
        expect(pose.quaternion.angleTo(settled.quaternion)).toBeLessThan(1e-6);
      });

      it("frames each lit site at its stop, in view on its own side, in order", () => {
        SITES.forEach((site, i) => {
          const pose = route.poseAt(i + 1);
          const { x, y, z } = onScreen(pose, site.position, aspect);
          expect(z, "in front of the camera").toBeLessThan(1);
          expect(Math.sign(x)).toBe(site.side);
          expect(Math.abs(x)).toBeGreaterThan(0.1);
          expect(Math.abs(x)).toBeLessThan(0.7);
          expect(Math.abs(y)).toBeLessThan(0.6);
          // Nearer than the next site, which waits further down the valley.
          const d = pose.position.distanceTo(site.position);
          expect(d).toBeLessThan(140);
          if (i + 1 < SITES.length) {
            expect(d).toBeLessThan(
              pose.position.distanceTo(SITES[i + 1].position),
            );
          }
          expect(clearView(pose.position, site.position)).toBe(true);
        });
      });

      /** Poses every hundredth of a stop, the whole way. */
      const poses = Array.from({ length: (ROUTE_STOPS - 1) * 100 + 1 }, (_, i) =>
        route.poseAt(i / 100),
      );

      it("clears the ground and the plate, and stays in the valley", () => {
        for (const { position: p } of poses) {
          expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(8);
          expect(Math.abs(p.x - valleyCentre(p.z))).toBeLessThan(
            corridorHalfWidth(p.z),
          );
          if (Math.abs(p.z - plateCentre.z) < 15) {
            expect(p.y).toBeGreaterThan(plateCentre.y + 15);
          }
        }
      });

      it("only ever moves on down the valley", () => {
        for (let i = 1; i < poses.length; i++) {
          expect(poses[i].position.z).toBeLessThanOrEqual(
            poses[i - 1].position.z + 1e-6,
          );
        }
        expect(poses.at(-1)!.position.z).toBeLessThan(SITES.at(-1)!.position.z);
      });

      it("flies each leg at an even speed and turns without a jolt", () => {
        for (let leg = 0; leg < ROUTE_STOPS - 1; leg++) {
          const steps = poses.slice(leg * 100, leg * 100 + 101);
          const moved = steps
            .slice(1)
            .map((p, i) => p.position.distanceTo(steps[i].position));
          const mean = moved.reduce((a, b) => a + b) / moved.length;
          for (const m of moved) expect(Math.abs(m - mean)).toBeLessThan(mean * 0.15);
          for (let i = 1; i < steps.length; i++) {
            const turned = steps[i].quaternion.angleTo(steps[i - 1].quaternion);
            expect(turned).toBeLessThan((1.5 * Math.PI) / 180);
          }
        }
      });

      it("ends at the Outpost, framed right of the contact copy", () => {
        const pose = route.poseAt(ROUTE_STOPS - 1);
        const { x, y, z } = onScreen(pose, OUTPOST, aspect);
        expect(z).toBeLessThan(1);
        expect(x).toBeGreaterThan(0.1);
        expect(x).toBeLessThan(0.7);
        expect(Math.abs(y)).toBeLessThan(0.6);
        expect(clearView(pose.position, OUTPOST)).toBe(true);
      });

      it("ends on the Outpost's own pose, which needs no route to find", () => {
        const end = route.poseAt(ROUTE_STOPS - 1);
        const pose = outpostPose(aspect);
        expect(pose.position.distanceTo(end.position)).toBeLessThan(1e-6);
        expect(pose.quaternion.angleTo(end.quaternion)).toBeLessThan(1e-6);
      });
    });
  }
});
