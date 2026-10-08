import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Pose } from "./flight";
import { nominalRoute } from "./nominal-route";
import { CAMERA, settledYaw } from "./pose";
import { createRoute, ROUTE_STOPS } from "./route";

/** A settled view as home's layout finds it (as in route.test.ts). */
function homeLayout(height: number, plateX: number, aspect: number) {
  const quaternion = new Quaternion().setFromEuler(
    new Euler(-CAMERA.pitch, -settledYaw(aspect), 0, "YXZ"),
  );
  const settled: Pose = { position: new Vector3(0, height, 0), quaternion };
  const plateCentre = new Vector3(plateX, 0, -CAMERA.plateDepth)
    .applyQuaternion(quaternion)
    .add(settled.position);
  return createRoute(settled, plateCentre, aspect);
}

describe("the nominal route, for a visit that never showed home", () => {
  for (const [name, aspect] of [
    ["desktop", 1.6],
    ["phone", 0.46],
  ] as const) {
    it(`is home's own route from the second site on, ${name}`, () => {
      const nominal = nominalRoute(aspect);
      for (const home of [
        homeLayout(21, -18, aspect),
        homeLayout(11.75, -3, aspect),
      ]) {
        for (let stop = 2; stop <= ROUTE_STOPS - 1; stop += 0.05) {
          const [p, q] = [nominal.poseAt(stop), home.poseAt(stop)];
          expect(p.position.distanceTo(q.position)).toBeLessThan(1e-3);
          expect(p.quaternion.angleTo(q.quaternion)).toBeLessThan(1e-6);
        }
      }
    });
  }

  it("is built once for each shape of screen", () => {
    expect(nominalRoute(1.6)).toBe(nominalRoute(1.6));
    expect(nominalRoute(1.6)).not.toBe(nominalRoute(0.46));
  });
});
