import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createFlightPath, type Pose } from "./flight";
import { CAMERA } from "./pose";
import { SETTLED_RIG, type FlightRig } from "./rigs";
import { courtPose, createRoute, SITES, skylinePose } from "./route";
import { layoutStructures, type Box } from "./structures";
import { harbourWater, onFloor, surfaceHeight, valleyCentre } from "./terrain";
import {
  COURT_STOP,
  SETTLED_STOP,
  TRANSIT_MAX_SECONDS,
  transit,
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

/**
 * The fastest the camera may pan landing at, or leaving, the Skyline, in
 * degrees a second: a medium-speed turn, slower than the route's own swings
 * between its Lit sites (about 200).
 */
const PAN_LIMIT = 150;

/** The most the camera may turn in one of `along`'s steps. */
const TURN_LIMIT = (3 * Math.PI) / 180;

/** Which way along the valley a transit from `from` to `to` runs. */
const wayBetween = (from: Pose, to: Pose) =>
  from.position.z > to.position.z ? "down" : "up";

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

/**
 * The relaxed rule for the last metres into a low pose (the court's, the
 * Skyline's): within LANDING_REACH world units of it, the camera need only
 * clear the ground by the pose's own margin, 2, not the route's 8.
 */
const LANDING_REACH = 60;
const LANDING_GROUND = 2;

/**
 * Every pose clears each tower by 3 and stays in the valley, as the route
 * does, and clears the ground by 8 (by 2 within LANDING_REACH of any of
 * `landings`, the low poses it leaves or lands on).
 */
function expectClear(poses: Pose[], ...landings: Pose[]) {
  for (const { position: p } of poses) {
    const low = landings.some(
      (landing) => p.distanceTo(landing.position) < LANDING_REACH,
    )
      ? LANDING_GROUND
      : 8;
    // Over the harbour, above its water.
    expect(p.y - surfaceHeight(p.x, p.z)).toBeGreaterThan(low);
    expect(onFloor(p.x, p.z), "over the valley's floor or the bay").toBe(true);
    const met = towers.find((tower) => near(p, tower, 3));
    expect(met, `a tower near ${p.toArray().map(Math.round)}`).toBeUndefined();
  }
}

for (const [name, { settled, plateCentre, aspect }] of Object.entries(
  layouts,
)) {
  describe(`a transit, ${name}`, () => {
    const route = createRoute(settled, plateCentre, aspect);
    /** The Skyline's pose, where the Resume page stands. */
    const skylineView = skylinePose(aspect);

    it("home to the Skyline leaves from the settled view and lands on the Skyline pose", () => {
      const transit = transitPath(route, settled, skylineView);
      expectSamePose(transit.poseAt(0), settled);
      expectSamePose(transit.poseAt(1), skylineView);
    });

    it("home to the Skyline runs down the valley, over the plate, without a jump", () => {
      const poses = along(transitPath(route, settled, skylineView));
      expectSmooth(poses, "down");
      for (const { position: p } of poses) {
        if (Math.abs(p.z - plateCentre.z) < 15) {
          expect(p.y).toBeGreaterThan(plateCentre.y + 15);
        }
      }
    });

    it("home to the Skyline never meets a tower, a landmark, the skyline or the ground", () => {
      expectClear(along(transitPath(route, settled, skylineView)), skylineView);
    });

    it("home ↔ Skyline sweeps across the harbour, leaving the route's line only over its water", () => {
      for (const trip of [
        transitPath(route, settled, skylineView),
        transitPath(route, skylineView, SETTLED_STOP),
      ]) {
        for (const { position: p } of along(trip)) {
          if (Math.abs(p.x - valleyCentre(p.z)) < 20) continue;
          const ashore = p.distanceTo(skylineView.position) < LANDING_REACH;
          expect(ashore || harbourWater(p.x, p.z) > 0).toBe(true);
        }
      }
    });

    it("home ↔ Skyline turns at a medium-speed pan, never a whip round", () => {
      for (const trip of [
        transitPath(route, settled, skylineView),
        transitPath(route, skylineView, SETTLED_STOP),
      ]) {
        const poses = along(trip);
        const step = trip.duration / (poses.length - 1);
        // Away from the route's own swings between its Lit sites: within the
        // pan's reach of the Skyline.
        for (let i = 1; i < poses.length; i++) {
          const p = poses[i].position;
          if (p.distanceTo(skylineView.position) > 200) continue;
          const degrees =
            (poses[i].quaternion.angleTo(poses[i - 1].quaternion) * 180) /
            Math.PI;
          expect(degrees / step).toBeLessThan(PAN_LIMIT);
        }
      }
    });

    it("the Skyline to home leaves from the Skyline pose and lands on the settled view", () => {
      const transit = transitPath(route, skylineView, SETTLED_STOP);
      expectSamePose(transit.poseAt(0), skylineView);
      expectSamePose(transit.poseAt(1), settled);
    });

    it("the Skyline to home runs back up the valley, clear of everything, without a jump", () => {
      const poses = along(
        transitPath(route, skylineView, SETTLED_STOP),
      );
      expectSmooth(poses, "up");
      expectClear(poses, skylineView);
    });

    it("leaves from partway along the scroll route, joining it where the camera is", () => {
      for (const at of [0.5, 1, 2.37, 4]) {
        const departure = route.poseAt(at);
        const transit = transitPath(route, departure, skylineView);
        expectSamePose(transit.poseAt(0), departure);
        expectSamePose(transit.poseAt(1), skylineView);
        const poses = along(transit);
        // From past the harbour, back up the valley to it.
        expectSmooth(poses, wayBetween(departure, skylineView));
        expectClear(poses, skylineView);
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
      for (const to of [SETTLED_STOP, skylineView]) {
        const transit = transitPath(route, departure, to);
        expectSamePose(transit.poseAt(0), departure);
        expectSamePose(
          transit.poseAt(1),
          to === SETTLED_STOP ? settled : skylineView,
        );
        const poses = along(transit);
        expectSmooth(
          poses,
          wayBetween(departure, to === SETTLED_STOP ? settled : skylineView),
        );
        expectClear(poses, skylineView);
      }
    });

    it("home ↔ Skyline, joining or leaving the route within its reach (as every Transit does), still leaves from the camera, lands exactly, runs smooth and keeps under the cap", () => {
      // Off the route by a little or a lot, at home's end or the Skyline's,
      // and partway through a Transit turned round.
      const { position, quaternion } = route.poseAt(2.5);
      const offRoute = (shift: Vector3, degrees: number): Pose => ({
        position: position.clone().add(shift),
        quaternion: new Quaternion()
          .setFromAxisAngle(new Vector3(0, 1, 0), (degrees * Math.PI) / 180)
          .multiply(quaternion),
      });
      const out = transitPath(route, settled, skylineView);
      const back = transitPath(route, skylineView, SETTLED_STOP);
      const departures = [
        settled,
        skylineView,
        offRoute(new Vector3(6, 3, 0), 12),
        offRoute(new Vector3(-8, 5, 0), -15),
        out.poseAt(0.3),
        back.poseAt(0.6),
      ];
      for (const departure of departures) {
        for (const to of [SETTLED_STOP, skylineView]) {
          const trip = transitPath(route, departure, to);
          const landing = to === SETTLED_STOP ? settled : skylineView;
          if (departure.position.distanceTo(landing.position) < 1e-6) continue;
          expectSamePose(trip.poseAt(0), departure);
          expectSamePose(trip.poseAt(1), landing);
          expect(trip.duration).toBeGreaterThan(0);
          expect(trip.duration).toBeLessThanOrEqual(TRANSIT_MAX_SECONDS);
          const poses = along(trip);
          expectSmooth(poses, wayBetween(departure, landing));
          expectClear(poses, skylineView);
        }
      }
    });

    it("takes longer the further it flies, and never longer than the cap", () => {
      const durations = [0, 0.5, 1].map(
        (at) => transitPath(route, route.poseAt(at), skylineView).duration,
      );
      for (let i = 1; i < durations.length; i++) {
        expect(durations[i]).toBeLessThan(durations[i - 1]);
      }
      expect(durations[durations.length - 1]).toBeGreaterThan(0);
      const back = transitPath(route, skylineView, SETTLED_STOP);
      for (const duration of [...durations, back.duration]) {
        expect(duration).toBeLessThanOrEqual(TRANSIT_MAX_SECONDS);
      }
      // The whole route, either way, is well under the opening's length.
      expect(TRANSIT_MAX_SECONDS).toBeLessThanOrEqual(3);
    });

    describe("leaving while the opening still plays", () => {
      const opening = createFlightPath(settled, plateCentre);
      /** The opening's path itself, finely, to tell whether a pose is on it. */
      const openingPoints = Array.from({ length: 4001 }, (_, i) =>
        opening.poseAlong(i / 4000, 0).position,
      );
      const onOpening = (p: Vector3) =>
        Math.min(...openingPoints.map((q) => q.distanceTo(p))) < 1;

      /** Rig states through the opening, as its timeline plays them. */
      const moments: Record<string, FlightRig> = {
        "in the pan": { ...SETTLED_RIG, flight: 0.15, turn: 0, settle: 0 },
        "in the swoop": { ...SETTLED_RIG, flight: 0.7, turn: 0, settle: 0 },
        "in the turn-in": { ...SETTLED_RIG, flight: 1, turn: 0.6, settle: 0 },
        "settling": { ...SETTLED_RIG, flight: 1, turn: 0.95, settle: 0.5 },
      };

      for (const [when, rig] of Object.entries(moments)) {
        it(`${when}: leaves from the camera's live pose and finishes the opening's own path, without a jump, before the valley`, () => {
          const departure = {
            opening,
            travel: opening.travel(rig),
            settle: rig.settle,
          };
          const trip = transit(route, departure, skylineView);
          expectSamePose(trip.poseAt(0), opening.poseAt(rig));
          expectSamePose(trip.poseAt(1), skylineView);
          expect(trip.duration).toBeGreaterThan(0);
          expect(trip.duration).toBeLessThanOrEqual(TRANSIT_MAX_SECONDS);

          const poses = along(trip, 1000);
          for (let i = 1; i < poses.length; i++) {
            const [a, b] = [poses[i - 1], poses[i]];
            expect(a.position.distanceTo(b.position)).toBeLessThan(STEP_LIMIT);
            expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(TURN_LIMIT);
          }
          // Through the settled view, on the opening's path until there,
          // then down the scroll route, clear of everything.
          const distances = poses.map((p) =>
            p.position.distanceTo(settled.position),
          );
          const through = distances.indexOf(Math.min(...distances));
          expect(distances[through]).toBeLessThan(STEP_LIMIT);
          for (const { position } of poses.slice(0, through)) {
            expect(onOpening(position)).toBe(true);
          }
          expectClear(poses.slice(through + 1), skylineView);
        });
      }

      it("turns back home from partway through the opening's path along that path", () => {
        const rig = moments["in the swoop"];
        const out = transit(
          route,
          { opening, travel: opening.travel(rig), settle: rig.settle },
          skylineView,
        );
        const t = 0.1;
        const back = transit(route, out.departureAt(t), SETTLED_STOP);
        expectSamePose(back.poseAt(0), out.poseAt(t));
        expectSamePose(back.poseAt(1), settled);
        for (const { position } of along(back, 200)) {
          expect(onOpening(position)).toBe(true);
        }
      });
    });

    it("turns back mid-flight from exactly where the camera is", () => {
      const out = transitPath(route, settled, skylineView);
      for (const t of [0.05, 0.3, 0.6, 0.95]) {
        const departure = out.poseAt(t);
        const back = transitPath(route, departure, SETTLED_STOP);
        expectSamePose(back.poseAt(0), departure);
        expectSamePose(back.poseAt(1), settled);
        const poses = along(back);
        expectSmooth(poses, "up");
        expectClear(poses, skylineView);
      }
    });

    describe("to and from the court", () => {
      const court = courtPose(aspect);
      const toCourt = (departure: Pose) =>
        transitPath(route, departure, court);

      it("lands just past the route's stop at the court's Lit site, Juice Bros", () => {
        expect(SITES[COURT_STOP - 1].highlight).toBe("juice-bros");
        const z = court.position.z;
        expect(z).toBeLessThan(route.poseAt(COURT_STOP).position.z);
        expect(z).toBeGreaterThan(route.poseAt(COURT_STOP + 0.5).position.z);
      });

      it("home to the court leaves from the settled view and lands exactly on the court pose", () => {
        const trip = toCourt(settled);
        expectSamePose(trip.poseAt(0), settled);
        expectSamePose(trip.poseAt(1), court);
      });

      it("home to the court runs down the valley, over the plate, clear of everything, without a jump", () => {
        const poses = along(toCourt(settled));
        expectSmooth(poses, "down");
        expectClear(poses, court, skylineView);
        for (const { position: p } of poses) {
          if (Math.abs(p.z - plateCentre.z) < 15) {
            expect(p.y).toBeGreaterThan(plateCentre.y + 15);
          }
        }
      });

      it("the court to home leaves from the court pose, runs back up the valley and lands on the settled view", () => {
        const trip = transitPath(route, court, SETTLED_STOP);
        expectSamePose(trip.poseAt(0), court);
        expectSamePose(trip.poseAt(1), settled);
        const poses = along(trip);
        expectSmooth(poses, "up");
        expectClear(poses, court, skylineView);
      });

      it("the court to the Skyline turns round, a little way back up the valley, and lands on the Skyline pose", () => {
        const trip = transitPath(route, court, skylineView);
        expectSamePose(trip.poseAt(0), court);
        expectSamePose(trip.poseAt(1), skylineView);
        const poses = along(trip);
        expectSmooth(poses, "up");
        expectClear(poses, court, skylineView);
      });

      it("the Skyline to the court turns round, a little way on down the valley, and lands exactly on the court pose", () => {
        const trip = toCourt(skylineView);
        expectSamePose(trip.poseAt(0), skylineView);
        expectSamePose(trip.poseAt(1), court);
        const poses = along(trip);
        expectSmooth(poses, "down");
        expectClear(poses, court, skylineView);
      });

      it("leaves for the court from anywhere along the scroll route", () => {
        for (const at of [0.5, 1, 2.37, 3, 4, 4.9]) {
          const departure = route.poseAt(at);
          const trip = toCourt(departure);
          expectSamePose(trip.poseAt(0), departure);
          expectSamePose(trip.poseAt(1), court);
          expect(trip.duration).toBeGreaterThan(0);
          const poses = along(trip);
          expectSmooth(poses, at < COURT_STOP + 0.5 ? "down" : "up");
          expectClear(poses, court, skylineView);
        }
      });

      it("turns round mid-flight, either way, from exactly where the camera is", () => {
        const trips = [
          { out: toCourt(settled), back: SETTLED_STOP, way: "up" },
          {
            out: transitPath(route, court, SETTLED_STOP),
            back: COURT_STOP,
            way: "down",
          },
          {
            out: transitPath(route, court, skylineView),
            back: COURT_STOP,
            way: "down",
          },
        ] as const;
        for (const { out, back, way } of trips) {
          for (const t of [0.05, 0.3, 0.6, 0.95]) {
            const departure = out.poseAt(t);
            const trip = transitPath(
              route,
              departure,
              back === COURT_STOP ? court : back,
            );
            expectSamePose(trip.poseAt(0), departure);
            expectSamePose(
              trip.poseAt(1),
              back === COURT_STOP ? court : settled,
            );
            const poses = along(trip);
            expectSmooth(poses, way);
            expectClear(poses, court, skylineView);
          }
        }
      });

      it("leaves for the court while the opening still plays, finishing it first, without a jump", () => {
        const opening = createFlightPath(settled, plateCentre);
        for (const rig of [
          { ...SETTLED_RIG, flight: 0.15, turn: 0, settle: 0 },
          { ...SETTLED_RIG, flight: 1, turn: 0.95, settle: 0.5 },
        ]) {
          const trip = transit(
            route,
            { opening, travel: opening.travel(rig), settle: rig.settle },
            court,
          );
          expectSamePose(trip.poseAt(0), opening.poseAt(rig));
          expectSamePose(trip.poseAt(1), court);
          expect(trip.duration).toBeLessThanOrEqual(TRANSIT_MAX_SECONDS);
          const poses = along(trip, 1000);
          for (let i = 1; i < poses.length; i++) {
            const [a, b] = [poses[i - 1], poses[i]];
            expect(a.position.distanceTo(b.position)).toBeLessThan(STEP_LIMIT);
            expect(a.quaternion.angleTo(b.quaternion)).toBeLessThan(TURN_LIMIT);
          }
        }
      });

      it("takes time to land even from the court's own stop, and never longer than the cap", () => {
        expect(toCourt(route.poseAt(COURT_STOP)).duration).toBeGreaterThan(0);
        for (const trip of [
          toCourt(settled),
          toCourt(skylineView),
          transitPath(route, court, SETTLED_STOP),
          transitPath(route, court, skylineView),
        ]) {
          expect(trip.duration).toBeGreaterThan(0);
          expect(trip.duration).toBeLessThanOrEqual(TRANSIT_MAX_SECONDS);
        }
      });
    });
  });
}
