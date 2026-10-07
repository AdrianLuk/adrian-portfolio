import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Pose } from "./flight";
import { CAMERA } from "./pose";
import { createRoute, outpostPose } from "./route";
import { layoutStructures, type Box } from "./structures";
import { corridorHalfWidth, valleyCentre, valleyHeight } from "./terrain";
import {
  OUTPOST_STOP,
  SETTLED_STOP,
  TRANSIT_MAX_SECONDS,
  transitPath,
  type Transit,
} from "./transit";

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

const layouts = {
  "desktop, one line lower left": { ...settledLayout(21, -18, 7), aspect: 1.6 },
  "desktop, low camera": { ...settledLayout(11.75, -18, 7), aspect: 1.6 },
  "phone, stacked": { ...settledLayout(16, -3, 9), aspect: 0.46 },
};

function expectSamePose(a: Pose, b: Pose) {
  expect(a.position.distanceTo(b.position)).toBeLessThan(1e-6);
  expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(1e-6);
}

/** Poses down a whole transit, in `steps` even steps of time. */
function along(transit: Transit, steps = 400) {
  return Array.from({ length: steps + 1 }, (_, i) => transit.poseAt(i / steps));
}

/**
 * The most the camera may move in one of `along`'s steps: the whole route
 * (about 1,100 units) at a fair pace, so a jump to the end shows.
 */
const STEP_LIMIT = 12;

/** The most the camera may turn in one of `along`'s steps. */
const TURN_LIMIT = (3 * Math.PI) / 180;

/** The poses move only `way` the valley, never jumping or snapping round. */
function expectSmooth(poses: Pose[], way: "up" | "down") {
  for (let i = 1; i < poses.length; i++) {
    const [a, b] = [poses[i - 1], poses[i]];
    if (way === "down")
      expect(b.position.z).toBeLessThanOrEqual(a.position.z + 1e-6);
    else expect(b.position.z).toBeGreaterThanOrEqual(a.position.z - 1e-6);
    expect(a.position.distanceTo(b.position)).toBeLessThan(STEP_LIMIT);
    expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(TURN_LIMIT);
  }
}

/** True if `p` is within `margin` of the box (as in structures.test.ts). */
function near(p: Vector3, b: Box, margin: number) {
  return (
    Math.abs(p.x - b.x) < b.w / 2 + margin &&
    Math.abs(p.y - b.y) < b.h / 2 + margin &&
    Math.abs(p.z - b.z) < b.d / 2 + margin
  );
}

const { buildings, darkBuildings, masts, landmarks, skyline } =
  layoutStructures();
const towers = [
  ...buildings,
  ...darkBuildings,
  ...masts,
  ...landmarks.parts,
  ...skyline.bounds,
];

/** Every pose clears each tower by 3 and the ground by 8, as the route does. */
function expectClear(poses: Pose[]) {
  for (const { position: p } of poses) {
    expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(8);
    expect(Math.abs(p.x - valleyCentre(p.z))).toBeLessThan(
      corridorHalfWidth(p.z),
    );
    const met = towers.find((tower) => near(p, tower, 3));
    expect(met, `a tower near ${p.toArray().map(Math.round)}`).toBeUndefined();
  }
}

for (const [name, { settled, plateCentre, aspect }] of Object.entries(
  layouts,
)) {
  describe(`a transit, ${name}`, () => {
    const route = createRoute(settled, plateCentre, aspect);

    it("home to the Outpost leaves from the settled view and lands on the Outpost pose", () => {
      const transit = transitPath(route, settled, OUTPOST_STOP);
      expectSamePose(transit.poseAt(0), settled);
      expectSamePose(transit.poseAt(1), outpostPose(aspect));
    });

    it("home to the Outpost runs down the valley, over the plate, without a jump", () => {
      const poses = along(transitPath(route, settled, OUTPOST_STOP));
      expectSmooth(poses, "down");
      for (const { position: p } of poses) {
        if (Math.abs(p.z - plateCentre.z) < 15) {
          expect(p.y).toBeGreaterThan(plateCentre.y + 15);
        }
      }
    });

    it("home to the Outpost never meets a tower, a landmark, the skyline or the ground", () => {
      expectClear(along(transitPath(route, settled, OUTPOST_STOP)));
    });

    it("the Outpost to home leaves from the Outpost pose and lands on the settled view", () => {
      const transit = transitPath(route, outpostPose(aspect), SETTLED_STOP);
      expectSamePose(transit.poseAt(0), outpostPose(aspect));
      expectSamePose(transit.poseAt(1), settled);
    });

    it("the Outpost to home runs back up the valley, clear of everything, without a jump", () => {
      const poses = along(
        transitPath(route, outpostPose(aspect), SETTLED_STOP),
      );
      expectSmooth(poses, "up");
      expectClear(poses);
    });

    it("leaves from partway along the scroll route, joining it where the camera is", () => {
      for (const at of [0.5, 1, 2.37, 4]) {
        const departure = route.poseAt(at);
        const transit = transitPath(route, departure, OUTPOST_STOP);
        expectSamePose(transit.poseAt(0), departure);
        expectSamePose(transit.poseAt(1), outpostPose(aspect));
        const poses = along(transit);
        expectSmooth(poses, "down");
        expectClear(poses);
      }
    });

    it("leaves from a camera off the route without a jump, then joins it", () => {
      const { position, quaternion } = route.poseAt(2.5);
      const departure = {
        position: position.clone().add(new Vector3(6, 3, 0)),
        quaternion: new Quaternion()
          .setFromAxisAngle(new Vector3(0, 1, 0), (12 * Math.PI) / 180)
          .multiply(quaternion),
      };
      for (const to of [SETTLED_STOP, OUTPOST_STOP]) {
        const transit = transitPath(route, departure, to);
        expectSamePose(transit.poseAt(0), departure);
        expectSamePose(transit.poseAt(1), route.poseAt(to));
        const poses = along(transit);
        expectSmooth(poses, to === SETTLED_STOP ? "up" : "down");
        expectClear(poses);
      }
    });

    it("takes longer the further it flies, and never longer than the cap", () => {
      const durations = [0, 2, 4, 4.9].map(
        (at) => transitPath(route, route.poseAt(at), OUTPOST_STOP).duration,
      );
      for (let i = 1; i < durations.length; i++) {
        expect(durations[i]).toBeLessThan(durations[i - 1]);
      }
      expect(durations[durations.length - 1]).toBeGreaterThan(0);
      const back = transitPath(route, outpostPose(aspect), SETTLED_STOP);
      for (const duration of [...durations, back.duration]) {
        expect(duration).toBeLessThanOrEqual(TRANSIT_MAX_SECONDS);
      }
      // The whole route, either way, is well under the opening's 10.5s.
      expect(TRANSIT_MAX_SECONDS).toBeLessThanOrEqual(3);
    });

    it("turns back mid-flight from exactly where the camera is", () => {
      const out = transitPath(route, settled, OUTPOST_STOP);
      for (const t of [0.05, 0.3, 0.6, 0.95]) {
        const departure = out.poseAt(t);
        const back = transitPath(route, departure, SETTLED_STOP);
        expectSamePose(back.poseAt(0), departure);
        expectSamePose(back.poseAt(1), settled);
        const poses = along(back);
        expectSmooth(poses, "up");
        expectClear(poses);
      }
    });
  });
}
