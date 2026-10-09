import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { courtFootprint } from "./court";
import type { Pose } from "./flight";
import { CAMERA } from "./pose";
import {
  CN_TOWER_TOP,
  courtPose,
  createRoute,
  OUTPOST,
  outpostPose,
  PLAY_FRAME,
  playView,
  ROUTE_STOPS,
  SITES,
  skylineView,
} from "./route";
import { layoutStructures, type Box } from "./structures";
import {
  corridorHalfWidth,
  HARBOUR,
  harbourWater,
  onFloor,
  valleyCentre,
  valleyHeight,
} from "./terrain";

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
function onScreen(
  pose: Pose,
  point: Vector3,
  aspect: number,
  fovY: number = CAMERA.fovY,
) {
  const camera = new PerspectiveCamera(fovY, aspect, 0.5, 2600);
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

describe("the scroll route past the second site", () => {
  it("is the same for every layout of the same shape, so a nominal layout can stand in for home's", () => {
    for (const aspect of [1.6, 0.46]) {
      const a = settledLayout(21, -18, 7);
      const b = settledLayout(11.75, -3, 9);
      const one = createRoute(a.settled, a.plateCentre, aspect);
      const other = createRoute(b.settled, b.plateCentre, aspect);
      for (let stop = 2; stop <= ROUTE_STOPS - 1; stop += 0.05) {
        const [p, q] = [one.poseAt(stop), other.poseAt(stop)];
        expect(p.position.distanceTo(q.position)).toBeLessThan(1e-3);
        expect(p.quaternion.angleTo(q.quaternion)).toBeLessThan(1e-6);
      }
    }
  });
});

/** True if `p` is within `margin` of the box (as in structures.test.ts). */
function near(p: Vector3, b: Box, margin: number) {
  return (
    Math.abs(p.x - b.x) < b.w / 2 + margin &&
    Math.abs(p.y - b.y) < b.h / 2 + margin &&
    Math.abs(p.z - b.z) < b.d / 2 + margin
  );
}

describe("the court pose", () => {
  const { buildings, darkBuildings, masts, landmarks, skyline } =
    layoutStructures();
  const towers = [
    ...buildings,
    ...darkBuildings,
    ...masts,
    ...landmarks.parts,
    ...skyline.bounds,
  ];

  /** The court (Lit site 3), on the valley floor, and its plinth's corners. */
  const site = SITES.find((s) => s.highlight === "juice-bros")!.position;
  const floor = valleyHeight(site.x, site.z);
  const net = new Vector3(site.x, floor, site.z);
  const { w, d } = courtFootprint(0.8);
  const corner = (u: number, v: number) =>
    new Vector3(site.x + (u * w) / 2, floor, site.z + (v * d) / 2);
  const nearLine = site.z + d / 2;

  const shapes = {
    "ultrawide": 2.4,
    "desktop": 1.6,
    "tablet, landscape": 1.33,
    "square": 1,
    "tablet, portrait": 0.75,
    "phone": 0.46,
  };

  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const pose = courtPose(aspect);
      const p = pose.position;

      it("stands low, just behind the court's near baseline, looking down the valley at it", () => {
        expect(p.z).toBeGreaterThan(nearLine);
        expect(p.z - nearLine).toBeLessThan(70);
        // Lower than any of the scroll route's stops (16 above the floor).
        expect(p.y - valleyHeight(p.x, p.z)).toBeLessThan(12);
        const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
        expect(forward.z).toBeLessThan(-0.9);
      });

      it("clears the ground by 2 and every tower, Landmark part and the skyline by 3, inside the valley", () => {
        expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(2);
        expect(Math.abs(p.x - valleyCentre(p.z))).toBeLessThan(
          corridorHalfWidth(p.z) - 1,
        );
        const met = towers.find((tower) => near(p, tower, 3));
        expect(met, "a tower within 3").toBeUndefined();
      });

      it("frames the court in the lower third, centred under the copy", () => {
        const centre = onScreen(pose, net, aspect);
        expect(centre.z, "in front of the camera").toBeLessThan(1);
        expect(Math.abs(centre.x)).toBeLessThan(0.15);
        expect(centre.y).toBeLessThan(-1 / 3);
        expect(centre.y).toBeGreaterThan(-0.9);
        // The far baseline lies whole in the lower third.
        for (const u of [-1, 1]) {
          const far = onScreen(pose, corner(u, -1), aspect);
          expect(Math.abs(far.x)).toBeLessThan(1);
          expect(far.y).toBeLessThan(-1 / 3);
          expect(far.y).toBeGreaterThan(-1);
        }
        // So does the near baseline: whole on a wide screen, its middle on a
        // narrow one, where the court runs off the frame's sides.
        const nearCorners = [corner(-1, 1), corner(1, 1)].map((c) =>
          onScreen(pose, c, aspect),
        );
        for (const c of nearCorners) {
          expect(c.y).toBeGreaterThan(-1);
          expect(c.y).toBeLessThan(-1 / 3);
          if (aspect >= 1) expect(Math.abs(c.x)).toBeLessThan(1);
        }
      });

      it("sees the whole court, with nothing of the terrain in the way", () => {
        for (const point of [
          net,
          corner(-1, -1),
          corner(1, -1),
          corner(-1, 1),
          corner(1, 1),
        ]) {
          expect(clearView(p, point.clone().setY(floor + 1))).toBe(true);
        }
      });

      it("stands upright, not rolled", () => {
        const right = new Vector3(1, 0, 0).applyQuaternion(pose.quaternion);
        expect(Math.abs(right.y)).toBeLessThan(1e-9);
      });
    });
  }
});

describe("the Rally game's view of the court, /play's", () => {
  const { buildings, darkBuildings, masts, landmarks, skyline } =
    layoutStructures();
  const towers = [
    ...buildings,
    ...darkBuildings,
    ...masts,
    ...landmarks.parts,
    ...skyline.bounds,
  ];
  const { court } = landmarks;
  /** A point on the court, in the game's feet from where the net crosses its centre line. */
  const feet = (x: number, y: number, z: number) =>
    new Vector3(
      court.x + x * court.scale,
      court.level + y * court.scale,
      court.z + z * court.scale,
    );
  /** The player's baseline, nearer home. */
  const baseline = feet(0, 0, 22);

  const shapes = {
    "ultrawide": 2.4,
    "desktop": 1.6,
    "tablet, landscape": 1.33,
    "square": 1,
    "tablet, portrait": 0.75,
    "phone": 0.46,
    "narrow phone": 0.4,
  };

  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const { pose, fovY } = playView(aspect, court);
      const p = pose.position;

      it("stands raised behind the player's baseline, on the court's centre line, looking down the court", () => {
        expect(p.z).toBeGreaterThan(baseline.z);
        expect(p.x).toBeCloseTo(court.x);
        expect(p.y - court.level).toBeGreaterThan(10);
        const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
        expect(forward.x).toBeCloseTo(0);
        expect(forward.z).toBeLessThan(-0.5);
        expect(forward.y).toBeLessThan(0);
      });

      it("clears the ground by 2 and every tower, Landmark part and the skyline by 3", () => {
        expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(2);
        const met = towers.find((tower) => near(p, tower, 3));
        expect(met, "a tower within 3").toBeUndefined();
      });

      it("holds the whole court and the ball's height over the far baseline in frame, as the game's camera did", () => {
        expect(fovY).toBeGreaterThanOrEqual(PLAY_FRAME.fovY);
        expect(fovY).toBeLessThanOrEqual(PLAY_FRAME.fovMax);
        for (const [x, y, z] of PLAY_FRAME.points) {
          const at = onScreen(pose, feet(x, y, z), aspect, fovY);
          expect(at.z, "in front of the camera").toBeLessThan(1);
          expect(Math.abs(at.x)).toBeLessThanOrEqual(PLAY_FRAME.edge + 1e-9);
          expect(Math.abs(at.y)).toBeLessThanOrEqual(PLAY_FRAME.edge + 1e-9);
        }
      });

      it("sees the whole court and the ball over it, with nothing of the terrain in the way", () => {
        for (const [x, y, z] of PLAY_FRAME.points) {
          expect(clearView(p, feet(x, Math.max(y, 1), z))).toBe(true);
        }
      });

      it("stands upright, not rolled", () => {
        const right = new Vector3(1, 0, 0).applyQuaternion(pose.quaternion);
        expect(Math.abs(right.y)).toBeLessThan(1e-9);
      });
    });
  }
});

describe("the Skyline pose", () => {
  const { buildings, darkBuildings, masts, landmarks, skyline } =
    layoutStructures();
  const towers = [
    ...buildings,
    ...darkBuildings,
    ...masts,
    ...landmarks.parts,
    ...skyline.bounds,
  ];
  const { x, z, foot, pod, tip } = skyline.cnTower;

  const shapes = {
    "ultrawide": 2.4,
    "desktop": 1.6,
    "tablet, landscape": 1.33,
    "square": 1,
    "tablet, portrait": 0.75,
    "phone": 0.46,
  };

  it("looks up to the CN Tower's own tip", () => {
    expect(CN_TOWER_TOP.toArray()).toEqual([x, tip, z]);
  });

  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const { pose, fovY } = skylineView(aspect);
      const p = pose.position;
      /** Where `point` lands on the Skyline's screen, at its field of view. */
      const see = (point: Vector3) => onScreen(pose, point, aspect, fovY);
      const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);

      it("stands low on the harbour's far shore, across the water from downtown, looking at it", () => {
        expect(p.z).toBeLessThan(HARBOUR.near);
        expect(p.z).toBeGreaterThan(HARBOUR.far);
        // On land, on the bay's side of the valley.
        expect(harbourWater(p.x, p.z)).toBe(0);
        expect(p.x).toBeLessThan(valleyCentre(p.z) - corridorHalfWidth(p.z));
        // Lower than any of the scroll route's stops (16 above the floor).
        expect(p.y - valleyHeight(p.x, p.z)).toBeLessThan(12);
        // Across the valley, toward downtown's side.
        expect(forward.x).toBeGreaterThan(0.7);
        // Looking up at the tower a little, but not at the sky alone.
        expect(forward.y).toBeGreaterThan(0);
        expect(forward.y).toBeLessThan(0.3);
      });

      it("clears the ground by 2 and every tower, Landmark part and the skyline by 3, on the floor", () => {
        expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(2);
        expect(onFloor(p.x, p.z)).toBe(true);
        const met = towers.find((tower) => near(p, tower, 3));
        expect(met, "a tower within 3").toBeUndefined();
      });

      it("looks across the water: the harbour fills the foot of the frame, below the tower", () => {
        // Halfway to the tower, on the water's surface.
        const mid = p.clone().lerp(new Vector3(x, 0, z), 0.5).setY(HARBOUR.level);
        expect(harbourWater(mid.x, mid.z)).toBe(1);
        const water = see(mid);
        expect(water.y).toBeGreaterThan(-1);
        // The lower quarter on a wide screen; zoomed out on a narrow one, the
        // lower half.
        expect(water.y).toBeLessThan(aspect >= 1 ? -0.5 : 0);
        const shoreline = see(new Vector3(x, HARBOUR.level, z));
        expect(shoreline.y).toBeLessThan(aspect >= 1 ? -0.2 : 0);
      });

      it("frames the CN Tower right of the copy on a wide screen, in the world's own field of view", () => {
        if (aspect < 1) return;
        expect(fovY).toBe(CAMERA.fovY);
        const top = see(CN_TOWER_TOP);
        const shaft = see(new Vector3(x, (foot + pod) / 2, z));
        expect(top.z, "in front of the camera").toBeLessThan(1);
        for (const point of [top, shaft]) {
          // The clear right-hand third.
          expect(point.x).toBeGreaterThan(1 / 3);
          expect(point.x).toBeLessThan(0.7);
        }
      });

      it("stands the Rogers Centre and the CN Tower both in the frame across the water on a narrow screen, zooming out as it must", () => {
        if (aspect >= 1) return;
        expect(fovY).toBeGreaterThanOrEqual(CAMERA.fovY);
        // Not a fisheye.
        expect(fovY).toBeLessThan(70);
        const { rogersCentre: dome } = skyline;
        const reach = dome.r + 4;
        // The dome, its ends and its rim, and the tower's pod and tip.
        for (const point of [
          new Vector3(dome.x, dome.foot + 7, dome.z),
          new Vector3(dome.x - reach, dome.foot + 7, dome.z),
          new Vector3(dome.x + reach, dome.foot + 7, dome.z),
          new Vector3(dome.x, dome.foot + 7, dome.z - reach),
          new Vector3(dome.x, dome.foot + 7, dome.z + reach),
          new Vector3(x, pod, z),
          CN_TOWER_TOP,
        ]) {
          const at = see(point);
          expect(at.z, "in front of the camera").toBeLessThan(1);
          expect(Math.abs(at.x)).toBeLessThan(0.95);
          expect(Math.abs(at.y)).toBeLessThan(0.95);
        }
        // The dome left of the tower, as from the Islands.
        expect(see(new Vector3(dome.x, dome.foot, dome.z)).x).toBeLessThan(
          see(new Vector3(x, foot, z)).x,
        );
      });

      it("keeps the tower's tip in the frame: on a narrow screen, above the Resume page's title", () => {
        const top = see(CN_TOWER_TOP);
        expect(top.y).toBeLessThan(0.9);
        expect(top.y).toBeGreaterThan(aspect >= 1 ? 0.5 : 0.75);
      });

      it("sees the tower from its pod to its tip, with nothing of the terrain in the way", () => {
        for (const y of [pod, (pod + tip) / 2, tip]) {
          expect(clearView(p, new Vector3(x, y, z))).toBe(true);
        }
      });

      it("stands upright, not rolled", () => {
        const right = new Vector3(1, 0, 0).applyQuaternion(pose.quaternion);
        expect(Math.abs(right.y)).toBeLessThan(1e-9);
      });
    });
  }
});
