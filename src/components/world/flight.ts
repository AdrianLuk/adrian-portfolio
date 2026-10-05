import {
  CatmullRomCurve3,
  CubicBezierCurve3,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { FLIGHT_TIMING, type FlightRig } from "./rigs";
import { valleyCentre, valleyHeight } from "./terrain";

/**
 * The opening flight, as pure maths: where the camera is and which way it
 * looks for a given state of the rig the GSAP timeline drives. Unit tested
 * without WebGL.
 *
 * The camera comes down the canyon behind the settled viewpoint (+z), the
 * plate dead centre ahead the whole way, banking through each bend; near the
 * plate it swings round from about 40 degrees off the final view (the turn-in,
 * from the left, the side the canyon comes in on, so the view barely swings
 * out first) and settles exactly on the settled pose.
 */

export type Pose = { position: Vector3; quaternion: Quaternion };

export {
  FLIGHT_START_RIG,
  FLIGHT_TIMING,
  SETTLED_RIG,
  type FlightRig,
} from "./rigs";

/** How far round the turn-in starts from the final view, in radians. */
export const TURN_IN = (40 * Math.PI) / 180;

/** The arc's radius at the start of the turn-in, about the plate's centre. */
const TURN_RADIUS = 125;

/** The run-in's Bezier handles, as a fraction of the distance they span. */
const RUN_IN_HANDLE = { exit: 0.3, entry: 0.55 };

/** World units between the points the path's spline passes through. */
const SPACING = 10;

/** Height above the canyon floor the flight comes in at. */
const CRUISE_HEIGHT = 22;

/** The greatest bank, in radians, and how hard the camera leans into a turn. */
const MAX_BANK = 0.32;
const BANK_PER_CURVATURE = 60;

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

function buildCurve(settled: Pose, plateCentre: Vector3, startZ: number) {
  const end = settled.position;
  const arcStart = arcPoint(plateCentre, end, 0);

  // Every section is sampled densely and evenly, so the spline through them
  // follows the planned route instead of adding corners of its own.
  const points: Vector3[] = [];
  const cruise = (x: number, z: number, height: number) =>
    new Vector3(x, valleyHeight(x, z) + height, z);

  // Down the canyon's centre line, towards the open valley.
  const canyonEnd = 200;
  for (let z = startZ; z > canyonEnd + 1; z -= SPACING) {
    points.push(cruise(valleyCentre(z), z, CRUISE_HEIGHT));
  }

  // Out of the canyon along its own heading and down the valley's left side,
  // banking right at the end onto the line the arc opens on (it opens heading
  // across the plate).
  const exit = new Vector3(valleyCentre(canyonEnd), 0, canyonEnd);
  const exitHeading = new Vector3(
    valleyCentre(canyonEnd - 10) - valleyCentre(canyonEnd + 10),
    0,
    -20,
  ).normalize();
  const opening = arcPoint(plateCentre, end, 0.02)
    .sub(arcStart)
    .normalize();
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
  return { curve, total, toTurn };
}

/**
 * Builds the path for one layout. The canyon run is lengthened or shortened
 * so the flight's constant speed meets the turn's opening speed (power2.out
 * starts at twice its average) with no lurch at the join.
 */
export function createFlightPath(settled: Pose, plateCentre: Vector3) {
  let startZ = 600;
  let built = buildCurve(settled, plateCentre, startZ);
  for (let i = 0; i < 4; i++) {
    const turnLength = built.total - built.toTurn;
    const wanted = (2 * turnLength * FLIGHT_TIMING.flight) / FLIGHT_TIMING.turn;
    startZ += wanted - built.toTurn;
    built = buildCurve(settled, plateCentre, startZ);
  }
  const { curve, total, toTurn } = built;
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
      const bank =
        MAX_BANK * Math.tanh((curvature(u) * BANK_PER_CURVATURE) / MAX_BANK);
      quaternion.multiply(roll.setFromAxisAngle(forward, -bank));

      const settle = Math.min(1, Math.max(0, rig.settle));
      quaternion.slerp(settled.quaternion, settle);
      if (settle === 1) quaternion.copy(settled.quaternion);
      return { position, quaternion };
    },
  };
}

export type FlightPath = ReturnType<typeof createFlightPath>;
