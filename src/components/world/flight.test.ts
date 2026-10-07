import { Euler, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createFlightPath } from "./flight";
import { CAMERA } from "./pose";
import { FLIGHT_TIMING, SETTLED_RIG, type FlightRig } from "./rigs";
import {
  corridorHalfWidth,
  valleyCentre,
  valleyHeight,
  WORLD_BACK,
} from "./terrain";

/**
 * Settled poses like the real layouts': the camera on the centre line, pitched
 * down the valley, the plate's centre `plateDepth` ahead in camera space and
 * standing `centreHeight` above the floor (the words stand on the ground).
 */
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

/**
 * Rig states down the whole flight, as the timeline plays them: the flight,
 * then the turn, with the settle over its last stretch.
 */
function along(steps = 120): FlightRig[] {
  const rigs: FlightRig[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const flight = Math.min(1, t * 2);
    const turn = Math.max(0, t * 2 - 1);
    rigs.push({
      ...SETTLED_RIG,
      flight,
      turn,
      settle: Math.max(0, (turn - 0.4) / 0.6),
    });
  }
  return rigs;
}

const degrees = (radians: number) => (radians * 180) / Math.PI;

/** The horizontal heading through b, and its turn rate per unit (+ = left). */
function turning(a: Vector3, b: Vector3, c: Vector3) {
  const h1 = b.clone().sub(a).setY(0);
  const h2 = c.clone().sub(b).setY(0);
  const step = (h1.length() + h2.length()) / 2;
  h1.normalize();
  h2.normalize();
  const turn = Math.atan2(h1.z * h2.x - h1.x * h2.z, h1.dot(h2));
  return { curvature: turn / step, heading: h1 };
}

const layouts = {
  "desktop, one line lower left": settledLayout(21, -18, 7),
  "phone, stacked": settledLayout(16, -3, 9),
};

describe("the flight path", () => {
  for (const [name, { settled, plateCentre }] of Object.entries(layouts)) {
    describe(name, () => {
      const path = createFlightPath(settled, plateCentre);

      it("ends exactly on the settled pose", () => {
        const pose = path.poseAt(SETTLED_RIG);
        expect(pose.position.distanceTo(settled.position)).toBeLessThan(1e-6);
        expect(pose.quaternion.angleTo(settled.quaternion)).toBeLessThan(1e-6);
      });

      it("starts inside the world, with terrain behind the camera", () => {
        const start = path.poseAt({ flight: 0, turn: 0, settle: 0 });
        expect(start.position.z).toBeLessThan(WORLD_BACK - 60);
      });

      it("stays well above the ground and below the ridges the whole way", () => {
        for (const rig of along()) {
          const { position: p } = path.poseAt(rig);
          expect(p.y - valleyHeight(p.x, p.z)).toBeGreaterThan(6);
          // The walls rise over the 70 units past the floor's edge.
          expect(Math.abs(p.x - valleyCentre(p.z))).toBeLessThan(
            corridorHalfWidth(p.z) + 45,
          );
        }
      });

      it("sees the plate the whole way, over every ridge between", () => {
        for (const rig of along()) {
          const { position: p } = path.poseAt(rig);
          for (let k = 1; k < 40; k++) {
            const q = p.clone().lerp(plateCentre, k / 40);
            expect(q.y).toBeGreaterThan(valleyHeight(q.x, q.z));
          }
        }
      });

      it("holds the plate dead centre until it settles into the framing", () => {
        for (const rig of along()) {
          if (rig.settle > 0) continue;
          const { position, quaternion } = path.poseAt(rig);
          const ahead = new Vector3(0, 0, -1).applyQuaternion(quaternion);
          const toPlate = plateCentre.clone().sub(position).normalize();
          expect(ahead.angleTo(toPlate)).toBeLessThan(1e-4);
        }
      });

      it("closes on the plate the whole way, so it grows", () => {
        let last = Infinity;
        for (const rig of along()) {
          const d = path.poseAt(rig).position.distanceTo(plateCentre);
          expect(d).toBeLessThanOrEqual(last + 1e-6);
          last = d;
        }
      });

      /** The camera's bearing from the plate, against the final view's. */
      const offFinal = (rig: Pick<FlightRig, "flight" | "turn">) => {
        const bearing = (p: Vector3) =>
          Math.atan2(p.x - plateCentre.x, p.z - plateCentre.z);
        const { position } = path.poseAt({ ...rig, settle: 0 });
        return bearing(position) - bearing(settled.position);
      };

      it("turns in from about 40 degrees off the final view, closing to 0", () => {
        expect(degrees(Math.abs(offFinal({ flight: 1, turn: 0 })))).toBeCloseTo(
          40,
          0,
        );
        let last = Infinity;
        for (let turn = 0; turn <= 1.0001; turn += 0.05) {
          const now = Math.abs(offFinal({ flight: 1, turn }));
          expect(now).toBeLessThanOrEqual(last + 1e-6);
          last = now;
        }
        expect(last).toBeLessThan(1e-6);
      });

      it("opens on a pan: sliding sideways across the view and dropping", () => {
        const at = (flight: number) =>
          path.poseAt({ flight, turn: 0, settle: 0 });
        const start = at(0);
        const moved = at(0.1).position.sub(start.position);
        const right = new Vector3(1, 0, 0).applyQuaternion(start.quaternion);
        const ahead = new Vector3(0, 0, -1).applyQuaternion(start.quaternion);
        expect(Math.abs(moved.dot(right))).toBeGreaterThan(
          1.2 * Math.abs(moved.dot(ahead)),
        );
        expect(moved.y).toBeLessThan(-5);
      });

      it("pans level, then rolls into the bends no faster than 65 degrees a second", () => {
        // The camera's roll, its up against the world's about its forward axis.
        const rollAt = (seconds: number) => {
          const { quaternion } = path.poseAt({
            flight: seconds / FLIGHT_TIMING.flight,
            turn: 0,
            settle: 0,
          });
          const ahead = new Vector3(0, 0, -1).applyQuaternion(quaternion);
          const up = new Vector3(0, 1, 0).applyQuaternion(quaternion);
          const right = ahead.cross(new Vector3(0, 1, 0)).normalize();
          return degrees(Math.asin(up.dot(right)));
        };
        expect(Math.abs(rollAt(0))).toBeLessThan(0.5);
        expect(Math.abs(rollAt(1))).toBeLessThan(0.5);
        const step = 0.02;
        for (let t = step; t <= FLIGHT_TIMING.flight; t += step) {
          expect(Math.abs(rollAt(t) - rollAt(t - step)) / step).toBeLessThan(
            65,
          );
        }
      });

      it("swings the view through no more than 45 degrees before the turn-in", () => {
        // The camera always looks at the plate, so the view turns as the
        // camera's bearing from it changes: most of it in the opening pan.
        let swung = 0;
        let last = offFinal({ flight: 0, turn: 0 });
        for (let flight = 0.01; flight <= 1.0001; flight += 0.01) {
          const now = offFinal({ flight, turn: 0 });
          swung += Math.abs(now - last);
          last = now;
        }
        expect(degrees(swung)).toBeLessThan(45);
      });

      it("cruises at no more than 88 units a second, so the credits read", () => {
        let length = 0;
        let last = path.poseAt({ flight: 0, turn: 0, settle: 0 }).position;
        for (let flight = 0.01; flight <= 1.0001; flight += 0.01) {
          const now = path.poseAt({ flight, turn: 0, settle: 0 }).position;
          length += now.distanceTo(last);
          last = now;
        }
        expect(length / FLIGHT_TIMING.flight).toBeLessThan(88);
      });

      it("banks into every turn, left and right, and levels out to settle", () => {
        const rigs = along(200).filter((r) => r.settle === 0);
        const banks: number[] = [];
        for (let i = 1; i < rigs.length - 1; i++) {
          const before = path.poseAt(rigs[i - 1]).position;
          const pose = path.poseAt(rigs[i]);
          const after = path.poseAt(rigs[i + 1]).position;
          const { curvature, heading } = turning(before, pose.position, after);
          const left = new Vector3(heading.z, 0, -heading.x);
          const lean = new Vector3(0, 1, 0)
            .applyQuaternion(pose.quaternion)
            .dot(left);
          // Any turn tighter than a 250-unit radius.
          if (Math.abs(curvature) > 1 / 250) {
            if (Math.sign(lean) !== Math.sign(curvature))
              console.log(
                "MISMATCH",
                i,
                rigs[i].flight.toFixed(3),
                rigs[i].turn.toFixed(3),
                (1 / curvature).toFixed(0),
                lean.toFixed(3),
                pose.position.toArray().map(Math.round),
              );
            expect(Math.sign(lean)).toBe(Math.sign(curvature));
          }
          banks.push(Math.asin(lean));
        }
        expect(degrees(Math.max(...banks))).toBeGreaterThan(10);
        expect(degrees(Math.min(...banks))).toBeLessThan(-6);
        expect(degrees(Math.max(...banks.map(Math.abs)))).toBeLessThan(35);
      });

      it("flies it like a plane: no turn tighter than a 24-unit radius", () => {
        const rigs = along(200);
        for (let i = 1; i < rigs.length - 1; i++) {
          const [a, b, c] = [rigs[i - 1], rigs[i], rigs[i + 1]].map(
            (r) => path.poseAt(r).position,
          );
          if (a.distanceTo(c) < 1) continue; // at rest
          expect(Math.abs(turning(a, b, c).curvature)).toBeLessThan(1 / 24);
        }
      });
    });
  }
});
