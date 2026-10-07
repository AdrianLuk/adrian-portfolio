import {
  CatmullRomCurve3,
  CubicBezierCurve3,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { FLIGHT_TIMING, type FlightRig } from "./rigs";
import { smoothstep } from "./noise";
import { valleyCentre, valleyHeight } from "./terrain";

/**
 * The opening flight, as pure maths: where the camera is and which way it
 * looks for a given state of the rig the GSAP timeline drives. Unit tested
 * without WebGL.
 *
 * The camera opens high on the canyon's right shoulder and pans across it,
 * sliding sideways and dropping onto the canyon's line, then comes down the
 * canyon behind the settled viewpoint (+z), the plate dead centre ahead the
 * whole way, banking through each bend; near the
 * plate it swings round from about 40 degrees off the final view (the turn-in,
 * from the left, the side the canyon comes in on, so the view barely swings
 * out first) and settles exactly on the settled pose.
 */

export type Pose = { position: Vector3; quaternion: Quaternion };

/** How far round the turn-in starts from the final view, in radians. */
export const TURN_IN = (40 * Math.PI) / 180;

/** The arc's radius at the start of the turn-in, about the plate's centre. */
const TURN_RADIUS = 125;

/** The run-in's Bezier handles, as a fraction of the distance they span. */
const RUN_IN_HANDLE = { exit: 0.3, entry: 0.55 };

/**
 * The opening pan, a steady right-hand arc onto the canyon's line: how far
 * round it starts (radians, heading off to the left of the canyon), how far
 * above the cruise height, and the straight it leaves before the canyon's
 * mouth, so the bank levels out before the run-in leans the other way. Its
 * radius sets the flight's length.
 */
const PAN = { swing: (70 * Math.PI) / 180, lift: 35, straight: 40 };

/** World units between the points the path's spline passes through. */
const SPACING = 10;

/** Height above the canyon floor the flight comes in at. */
const CRUISE_HEIGHT = 22;

/** The greatest bank, in radians, and how hard the camera leans into a turn. */
const MAX_BANK = 0.32;
const BANK_PER_CURVATURE = 60;

/** World units past the pan's end over which the bank eases in. */
const BANK_IN = 80;

const UP = new Vector3(0, 1, 0);

/**
 * The point on the turn-in arc a fraction `s` of the way round (0 = start).
 * It closes in on the plate first and swings round last, so the camera enters
 * the arc heading at the plate and leaves it moving across its face.
 */
function arcPoint(centre: Vector3, end: Vector3, s: number) {
  const dx = end.x - centre.x;
  const dz = end.z - centre.z;
  const finalAngle = Math.atan2(dx, dz);
  const finalRadius = Math.hypot(dx, dz);
  // Mostly quadratic, with enough linear in each that the camera never stalls
  // (nor the spline through these points overshoots) at either end.
  const swing = 0.8 * s * s + 0.2 * s;
  const close = 0.7 * (1 - (1 - s) * (1 - s)) + 0.3 * s;
  // From the left of the final view (seen from the plate, a smaller bearing).
  const a = finalAngle - TURN_IN * (1 - swing);
  const r = TURN_RADIUS + (finalRadius - TURN_RADIUS) * close;
  return new Vector3(centre.x + r * Math.sin(a), 0, centre.z + r * Math.cos(a));
}

function buildCurve(settled: Pose, plateCentre: Vector3, radius: number) {
  const end = settled.position;
  const arcStart = arcPoint(plateCentre, end, 0);

  // Every section is sampled densely and evenly, so the spline through them
  // follows the planned route instead of adding corners of its own.
  const points: Vector3[] = [];
  const cruise = (x: number, z: number, height: number) =>
    new Vector3(x, valleyHeight(x, z) + height, z);

  const canyonEnd = 200;
  const exit = new Vector3(valleyCentre(canyonEnd), 0, canyonEnd);
  const exitHeading = new Vector3(
    valleyCentre(canyonEnd - 10) - valleyCentre(canyonEnd + 10),
    0,
    -20,
  ).normalize();

  // The opening pan: from high on the canyon's right shoulder, sliding left
  // across it and dropping, curving onto its line; then a short straight to
  // its mouth. Heights are over the canyon's floor, not the shoulder's bumps.
  const ahead = exitHeading;
  const toLeft = new Vector3(ahead.z, 0, -ahead.x);
  const join = exit.clone().addScaledVector(ahead, -PAN.straight);
  const centre = join.clone().addScaledVector(toLeft, -radius);
  const panSteps = Math.max(2, Math.round((radius * PAN.swing) / SPACING));
  const floored = (x: number, z: number, lift: number) =>
    new Vector3(x, valleyHeight(valleyCentre(z), z) + CRUISE_HEIGHT + lift, z);
  for (let i = 0; i < panSteps; i++) {
    const s = i / panSteps;
    // The heading, swung back left the rest of the way round.
    const back = PAN.swing * (1 - s);
    const heading = ahead
      .clone()
      .multiplyScalar(Math.cos(back))
      .addScaledVector(toLeft, Math.sin(back));
    const p = centre
      .clone()
      .addScaledVector(new Vector3(heading.z, 0, -heading.x), radius);
    points.push(floored(p.x, p.z, PAN.lift * (1 - smoothstep(0, 1, s))));
  }
  const straightSteps = Math.round(PAN.straight / SPACING);
  for (let i = 0; i < straightSteps; i++) {
    const p = join.clone().lerp(exit, i / straightSteps);
    points.push(floored(p.x, p.z, 0));
  }

  // Out of the canyon along its own heading and down the valley's left side,
  // banking right at the end onto the line the arc opens on (it opens heading
  // across the plate).
  const opening = arcPoint(plateCentre, end, 0.02).sub(arcStart).normalize();
  const handle = exit.distanceTo(arcStart);
  const runIn = new CubicBezierCurve3(
    exit,
    exit.clone().addScaledVector(exitHeading, handle * RUN_IN_HANDLE.exit),
    arcStart.clone().addScaledVector(opening, -handle * RUN_IN_HANDLE.entry),
    arcStart,
  );
  const runInSteps = Math.round(runIn.getLength() / SPACING);
  const spaced = runIn.getSpacedPoints(runInSteps);
  for (let i = 0; i < runInSteps; i++) {
    const height = CRUISE_HEIGHT * (1 - (0.25 * i) / runInSteps);
    points.push(cruise(spaced[i].x, spaced[i].z, height));
  }

  // Round the arc, descending to the settled height.
  const arcSteps = 12;
  const arcFrom = points.length;
  const startHeight =
    valleyHeight(arcStart.x, arcStart.z) + CRUISE_HEIGHT * 0.75;
  for (let i = 0; i < arcSteps; i++) {
    const s = i / arcSteps;
    const p = arcPoint(plateCentre, end, s);
    p.y = startHeight + (end.y - startHeight) * s * s * (3 - 2 * s);
    points.push(p);
  }
  points.push(end.clone());

  const curve = new CatmullRomCurve3(points, false, "centripetal");
  curve.arcLengthDivisions = points.length * 12;
  // Arc length to the turn-in's first point: CatmullRom passes through point i
  // at t = i / (n - 1), so pick divisions that land on it exactly.
  const perSegment = 12;
  const lengths = curve.getLengths((points.length - 1) * perSegment);
  const total = lengths[lengths.length - 1];
  const toTurn = lengths[arcFrom * perSegment];
  return {
    curve,
    total,
    toTurn,
    panLength: radius * PAN.swing,
    panEnd: lengths[panSteps * perSegment],
  };
}

/**
 * Builds the path for one layout. The pan's arc is widened or tightened so
 * the flight's constant speed meets the turn's opening speed (power2.out
 * starts at twice its average) with no lurch at the join.
 */
export function createFlightPath(settled: Pose, plateCentre: Vector3) {
  let radius = 100;
  let built = buildCurve(settled, plateCentre, radius);
  for (let i = 0; i < 6; i++) {
    const turnLength = built.total - built.toTurn;
    const wanted = (2 * turnLength * FLIGHT_TIMING.flight) / FLIGHT_TIMING.turn;
    // The pan's length grows in proportion to its radius.
    radius *= 1 + (wanted - built.toTurn) / built.panLength;
    built = buildCurve(settled, plateCentre, radius);
  }
  const { curve, total, toTurn, panEnd } = built;
  const turnStart = toTurn / total;

  const look = new Matrix4();
  const roll = new Quaternion();
  const forward = new Vector3(0, 0, -1);

  /**
   * Signed turn rate of the horizontal heading, radians per world unit (+ is
   * left), averaged over about 60 units so the bank rolls in and out smoothly.
   */
  function curvature(u: number) {
    const du = 30 / total;
    const a = Math.max(0, u - du);
    const b = Math.min(1, u + du);
    if (b <= a) return 0;
    const ta = curve.getTangentAt(a);
    const tb = curve.getTangentAt(b);
    const turn = Math.atan2(
      ta.z * tb.x - ta.x * tb.z,
      ta.x * tb.x + ta.z * tb.z,
    );
    return turn / ((b - a) * total);
  }

  return {
    /** Fraction of the path's length where the turn-in begins. */
    turnStart,

    /** Path fraction (0 to 1) for the rig's flight and turn. */
    travel(rig: Pick<FlightRig, "flight" | "turn">) {
      return turnStart * rig.flight + (1 - turnStart) * rig.turn;
    },

    poseAt(rig: Pick<FlightRig, "flight" | "turn" | "settle">): Pose {
      if (rig.settle >= 1 && this.travel(rig) >= 1) {
        return {
          position: settled.position.clone(),
          quaternion: settled.quaternion.clone(),
        };
      }
      const u = Math.min(1, Math.max(0, this.travel(rig)));
      const position = curve.getPointAt(u);

      // Looking straight at the plate, leaning into the turn.
      look.lookAt(position, plateCentre, UP);
      const quaternion = new Quaternion().setFromRotationMatrix(look);
      // Soft-limited, so the hardest turn leans in without pinning at the limit.
      // Level through the pan (a pan, not a plane), easing in after it.
      const bank =
        MAX_BANK *
        Math.tanh((curvature(u) * BANK_PER_CURVATURE) / MAX_BANK) *
        smoothstep(panEnd, panEnd + BANK_IN, u * total);
      quaternion.multiply(roll.setFromAxisAngle(forward, -bank));

      const settle = Math.min(1, Math.max(0, rig.settle));
      quaternion.slerp(settled.quaternion, settle);
      if (settle === 1) quaternion.copy(settled.quaternion);
      return { position, quaternion };
    },
  };
}

export type FlightPath = ReturnType<typeof createFlightPath>;
