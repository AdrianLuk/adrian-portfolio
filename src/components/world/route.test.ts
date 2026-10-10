import { Euler, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createGame,
  PITCH_TIME,
  startGame,
  step,
  WINDOW,
} from "../derby/rules";
import { homeRunFlight, type Point } from "../derby/swing";
import { courtFootprint } from "./court";
import type { Pose } from "./flight";
import { CAMERA } from "./pose";
import {
  BATTER,
  CN_TOWER_TOP,
  courtPose,
  createRoute,
  DERBY_FRAME,
  derbyView,
  fieldPoint,
  HONG_KONG,
  HOME_RUN_FRAME,
  homeRunView,
  hongKongPose,
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
  surfaceHeight,
  valleyCentre,
  valleyHeight,
  VICTORIA_HARBOUR,
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

      it("clears the ground, the water and the plate, and stays in the valley", () => {
        for (const { position: p } of poses) {
          expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(8);
          expect(p.y - surfaceHeight(p.x, p.z)).toBeGreaterThan(8);
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

      it("ends looking at Hong Kong: right of the contact copy on a wide screen, centred on a narrow one", () => {
        const pose = route.poseAt(ROUTE_STOPS - 1);
        const { x, y, z } = onScreen(pose, HONG_KONG, aspect);
        expect(z).toBeLessThan(1);
        if (aspect >= 1) {
          expect(x).toBeGreaterThan(0.3);
          expect(x).toBeLessThan(0.6);
        } else {
          expect(Math.abs(x)).toBeLessThan(1e-6);
        }
        expect(Math.abs(y)).toBeLessThan(0.3);
        expect(clearView(pose.position, HONG_KONG)).toBe(true);
      });

      it("ends on Hong Kong's own pose, which needs no route to find", () => {
        const end = route.poseAt(ROUTE_STOPS - 1);
        const pose = hongKongPose(aspect);
        expect(pose.position.distanceTo(end.position)).toBeLessThan(1e-6);
        expect(pose.quaternion.angleTo(end.quaternion)).toBeLessThan(1e-6);
      });
    });
  }
});

describe("the closing view", () => {
  const { hongKong } = layoutStructures();

  const shapes = {
    "phone, 390 by 844": 390 / 844,
    "phone, 360 by 640": 360 / 640,
    "desktop": 1.6,
  };

  for (const [name, aspect] of Object.entries(shapes)) {
    describe(name, () => {
      const pose = hongKongPose(aspect);
      const p = pose.position;

      it("stands at the route's last stop, on Tsim Sha Tsui's shore, over land", () => {
        expect(p.z).toBe(-1050);
        expect(p.z).toBeGreaterThan(VICTORIA_HARBOUR.near);
        expect(p.y - surfaceHeight(p.x, p.z)).toBeGreaterThan(8);
      });

      it("stands every landmark whole in the frame, its base to its tip", () => {
        expect(hongKong.landmarks).toHaveLength(5);
        for (const { name: landmark, x, z, foot, tip } of hongKong.landmarks) {
          for (const y of [foot, tip]) {
            const at = onScreen(pose, new Vector3(x, y, z), aspect);
            expect(at.z, `${landmark} in front of the camera`).toBeLessThan(1);
            expect(Math.abs(at.x), `${landmark} across`).toBeLessThan(0.95);
            // Under the nav bar, which covers about the top 6% of the screen.
            expect(at.y, `${landmark} up`).toBeLessThan(0.85);
            expect(at.y, `${landmark} up`).toBeGreaterThan(-0.95);
          }
          expect(clearView(p, new Vector3(x, foot + 2, z)), landmark).toBe(true);
          expect(clearView(p, new Vector3(x, tip, z)), landmark).toBe(true);
        }
      });

      it("stands the city in the upper half, Victoria Harbour across the lower", () => {
        for (const { x, z, foot } of hongKong.landmarks) {
          // Each landmark's foot a little below the frame's middle at most.
          expect(onScreen(pose, new Vector3(x, foot, z), aspect).y).toBeGreaterThan(-0.25);
        }
        // The frame's lower half looks down onto the water, wherever the
        // closing view's copy stands: across a narrow screen, and on the
        // left of a wide one.
        const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
        const camera = new PerspectiveCamera(CAMERA.fovY, aspect, 0.5, 2600);
        camera.position.copy(p);
        camera.quaternion.copy(pose.quaternion);
        camera.updateMatrixWorld();
        for (const ndcX of aspect >= 1 ? [-0.75, -0.35, 0] : [-0.9, 0, 0.9]) {
          for (const ndcY of [-0.95, -0.7, -0.5]) {
            const ray = new Vector3(ndcX, ndcY, 0.5)
              .unproject(camera)
              .sub(p)
              .normalize();
            const t = (VICTORIA_HARBOUR.level - p.y) / ray.y;
            const hit = p.clone().addScaledVector(ray, t);
            const at = `at ${ndcX}, ${ndcY}`;
            expect(t, `the ray ${at} meets the water ahead`).toBeGreaterThan(0);
            expect(harbourWater(hit.x, hit.z, VICTORIA_HARBOUR), at).toBe(1);
          }
        }
        expect(forward.y).toBeGreaterThan(-0.05);
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
  const { buildings, masts, landmarks, skyline } =
    layoutStructures();
  const towers = [
    ...buildings,
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

describe("the Rally game's view of the court, /rally's", () => {
  const { buildings, masts, landmarks, skyline } =
    layoutStructures();
  const towers = [
    ...buildings,
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

/**
 * The Diamond's field, and everything a camera over it must clear: every
 * tower, Landmark part, the skyline and Hong Kong. The Diamond's own parts
 * count where they stand up off the field (its poles, light towers and
 * lamps); its plinth, chalk and lofted seats' boxes (drawn at home plate,
 * with no footprint) don't.
 */
function atTheDiamond() {
  const { buildings, masts, landmarks, skyline, hongKong } =
    layoutStructures();
  const { field, diamond } = landmarks;
  /** Inside the Diamond's stadium, in plan. */
  const atDiamond = (b: Box) =>
    Math.abs(b.x - diamond.x) <= diamond.w / 2 &&
    Math.abs(b.z - diamond.z) <= diamond.d / 2;
  const towers = [
    ...buildings,
    ...masts,
    ...skyline.bounds,
    ...hongKong.bounds,
    ...landmarks.parts.filter(
      (b) => !atDiamond(b) || (b.w > 0 && b.y + b.h / 2 > field.level + 1),
    ),
  ];
  /** A point on the field, in the Derby's feet from home plate: -z out to centre field, +x toward first base's side of the frame. */
  const feet = (x: number, y: number, z: number) => fieldPoint(field, x, y, z);
  return { field, towers, feet };
}

/** The screen shapes the Derby's views are proven on. */
const DERBY_SHAPES = {
  "ultrawide": 2.4,
  "desktop": 1.6,
  "tablet, landscape": 1.33,
  "square": 1,
  "tablet, portrait": 0.75,
  "phone": 0.46,
  "phone, 412 by 915": 412 / 915,
  "narrow phone": 0.4,
};

describe("the Home Run Derby's batter's view of the Diamond", () => {
  const { field, towers, feet } = atTheDiamond();
  const home = feet(0, 0, 0);
  const centreField = feet(0, 0, -100);

  it("lays the field's feet on the Diamond: second base 127 feet out toward centre field, the mound between", () => {
    const second = feet(0, 0, -90 * Math.SQRT2);
    const out = new Vector3().subVectors(second, home);
    expect(out.length() / field.scale).toBeCloseTo(90 * Math.SQRT2);
    // Down the valley and away from its centre line, as the diamond runs.
    expect(out.z).toBeLessThan(0);
    expect(Math.sign(out.x)).toBe(field.side);
    expect(Math.abs(out.x)).toBeCloseTo(Math.abs(out.z));
  });

  for (const [name, aspect] of Object.entries(DERBY_SHAPES)) {
    describe(name, () => {
      const { pose, fovY } = derbyView(aspect, field);
      const p = pose.position;

      it("stands at a batter's eye behind the catcher, on the line out to centre field, looking out along it", () => {
        const back = new Vector3().subVectors(p, home).setY(0);
        const out = new Vector3().subVectors(centreField, home).setY(0);
        expect(back.angleTo(out.clone().negate())).toBeLessThan(1e-6);
        // In the field's feet: close enough that the life-size batter and bat read.
        expect(back.length() / field.scale).toBeLessThan(40);
        expect((p.y - field.level) / field.scale).toBeGreaterThan(6);
        expect((p.y - field.level) / field.scale).toBeLessThan(15);
        const forward = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
        expect(forward.clone().setY(0).angleTo(out)).toBeLessThan(1e-6);
        expect(forward.y).toBeLessThan(0);
      });

      it("clears the ground by 6 feet, and every tower, Landmark part, the skyline and Hong Kong by 3", () => {
        expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(6 * field.scale);
        const met = towers.find((tower) => near(p, tower, 3));
        expect(met, "a tower within 3").toBeUndefined();
      });

      it("holds home plate, Curvebot on the mound and centre field's fence in frame", () => {
        expect(fovY).toBeGreaterThanOrEqual(DERBY_FRAME.fovY);
        expect(fovY).toBeLessThanOrEqual(DERBY_FRAME.fovMax);
        for (const [x, y, z] of DERBY_FRAME.points) {
          const at = onScreen(pose, feet(x, y, z), aspect, fovY);
          expect(at.z, "in front of the camera").toBeLessThan(1);
          expect(Math.abs(at.x)).toBeLessThanOrEqual(DERBY_FRAME.edge + 1e-9);
          expect(Math.abs(at.y)).toBeLessThanOrEqual(DERBY_FRAME.edge + 1e-9);
        }
      });

      it("sees all of it, with nothing of the terrain in the way", () => {
        for (const [x, y, z] of DERBY_FRAME.points) {
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

describe("the Home Run Derby's wide shot of a home run", () => {
  const { field, towers, feet } = atTheDiamond();
  /** Where Curvebot lets the pitch go, near enough: the mound's top. */
  const release = { x: 0, y: 17, z: -55 };
  /** Every home run the rules hit: swung early to late across the window, on each kind of pitch. */
  const flights = [1, 2, 3].flatMap((seed) =>
    Array.from(
      { length: 21 },
      (_, i) => 0.98 * WINDOW.homeRun * (i / 10 - 1),
    ).map((error) => {
      let game = startGame(createGame({ seed }));
      while (game.phase !== "pitch") game = step(game, 1 / 60);
      game = step(game, PITCH_TIME[game.pitch] + error - game.clock, {
        swing: true,
      });
      return homeRunFlight(game, release)!.points;
    }),
  );
  /**
   * What the shot must hold of a flight: all of it, off the bat, over the
   * top and down in the seats (on screen its highest point isn't its peak:
   * the climb, nearer the camera, stands higher).
   */
  const held = (points: Point[]) => [
    ...points,
    // And the batter in the box who hit it, left of the plate.
    ...BATTER.map(([x, y, z]) => ({ x, y, z })),
  ];

  it("covers home runs pulled to left, to centre and pushed to right, short and long", () => {
    const landings = flights.map((points) => points.at(-1)!);
    const angles = landings.map((p) => Math.atan2(p.x, -p.z));
    expect(Math.min(...angles)).toBeLessThan(-0.3);
    expect(Math.max(...angles)).toBeGreaterThan(0.3);
    const carries = landings.map((p) => Math.hypot(p.x, p.z));
    expect(Math.max(...carries) - Math.min(...carries)).toBeGreaterThan(60);
  });

  for (const [name, aspect] of Object.entries(DERBY_SHAPES)) {
    describe(name, () => {
      const shots = flights.map((points) => ({
        points,
        ...homeRunView(aspect, field, points),
      }));

      it("holds the batter and the whole flight, off the bat, over the top and down in the seats, in front of the camera", () => {
        for (const { points, pose, fovY } of shots) {
          expect(fovY).toBeLessThanOrEqual(HOME_RUN_FRAME.fovMax);
          for (const { x, y, z } of held(points)) {
            const at = onScreen(pose, feet(x, y, z), aspect, fovY);
            expect(at.z, "in front of the camera").toBeLessThan(1);
            expect(Math.abs(at.x)).toBeLessThanOrEqual(
              HOME_RUN_FRAME.edge + 1e-9,
            );
            expect(Math.abs(at.y)).toBeLessThanOrEqual(
              HOME_RUN_FRAME.edge + 1e-9,
            );
          }
        }
      });

      it("fills the frame evenly: what it holds is centred, edge to edge one way or the other", () => {
        for (const { points, pose, fovY } of shots) {
          const seen = held(points).map(({ x, y, z }) =>
            onScreen(pose, feet(x, y, z), aspect, fovY),
          );
          for (const axis of ["x", "y"] as const) {
            const low = Math.min(...seen.map((s) => s[axis]));
            const high = Math.max(...seen.map((s) => s[axis]));
            expect(Math.abs(low + high), `centred across ${axis}`).toBeLessThan(
              0.1,
            );
          }
          const spread = (axis: "x" | "y") =>
            Math.max(...seen.map((s) => Math.abs(s[axis])));
          expect(Math.max(spread("x"), spread("y"))).toBeGreaterThan(
            HOME_RUN_FRAME.edge - 0.05,
          );
        }
      });

      it("stands raised behind home plate, below the flight's peak (so its arc reads), upright, looking out the way the ball goes", () => {
        const home = feet(0, 0, 0);
        for (const { points, pose } of shots) {
          const p = pose.position;
          const height = (p.y - field.level) / field.scale;
          expect(height).toBeGreaterThan(15);
          // Well under the peak: the ball climbs over the camera's eye line and drops back into the seats.
          const peak = Math.max(...points.map((point) => point.y));
          expect(height).toBeLessThan(peak - 30);
          const landing = points.at(-1)!;
          const out = new Vector3()
            .subVectors(feet(landing.x, 0, landing.z), home)
            .setY(0);
          const back = new Vector3().subVectors(p, home).setY(0);
          expect(back.angleTo(out)).toBeGreaterThan(Math.PI / 2);
          const forward = new Vector3(0, 0, -1).applyQuaternion(
            pose.quaternion,
          );
          expect(forward.clone().setY(0).angleTo(out)).toBeLessThan(
            Math.PI / 6,
          );
          const right = new Vector3(1, 0, 0).applyQuaternion(pose.quaternion);
          expect(Math.abs(right.y)).toBeLessThan(1e-9);
        }
      });

      it("clears the ground by 6 feet, and every tower, Landmark part, the skyline and Hong Kong by 3", () => {
        for (const { pose } of shots) {
          const p = pose.position;
          expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(6 * field.scale);
          const met = towers.find((tower) => near(p, tower, 3));
          expect(met, "a tower within 3").toBeUndefined();
        }
      });

      it("sees the whole flight, with nothing of the terrain in the way", () => {
        for (const { points, pose } of shots) {
          for (const { x, y, z } of held(points)) {
            expect(clearView(pose.position, feet(x, Math.max(y, 1), z))).toBe(
              true,
            );
          }
        }
      });
    });
  }
});

describe("the Skyline pose", () => {
  const { buildings, masts, landmarks, skyline } =
    layoutStructures();
  const towers = [
    ...buildings,
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
        expect(harbourWater(p.x, p.z, HARBOUR)).toBe(0);
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
        expect(harbourWater(mid.x, mid.z, HARBOUR)).toBe(1);
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
