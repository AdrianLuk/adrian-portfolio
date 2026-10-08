import { Quaternion } from "three";
import type { FlightPath, Pose } from "./flight";
import { TRANSIT_MAX_SECONDS } from "./rigs";
import { COURT_SITE, ROUTE_STOPS, type Route } from "./route";

/**
 * A transit, as pure maths: the camera's flight between two Places (home,
 * the court, the Outpost). Unit tested without WebGL.
 *
 * It runs along the scroll route at an accelerated, eased pace: down the
 * valley, or back up it. The camera joins the route at its own depth (the
 * route only ever moves on down the valley), so a transit can leave from
 * anywhere along it: the settled view, beside a lit site, partway between,
 * the court, or partway through another transit. It ends on one of the
 * route's stops, or on a pose off the route beside one (the court's), easing
 * off the route onto it as it lands.
 */

/** The route's first stop, the settled view over the name plate. */
export const SETTLED_STOP = 0;

/** The route's last stop, the Outpost, where the Resume page stands. */
export const OUTPOST_STOP = ROUTE_STOPS - 1;

/**
 * The route's stop at the court, Juice Bros' Lit site. The court's own pose
 * stands off the route just past it; a transit there lands on the pose.
 */
export const COURT_STOP = COURT_SITE + 1;

/** The longest a transit ever takes (plain data, for the router's bundle). */
export { TRANSIT_MAX_SECONDS };

/**
 * A transit's pace: a moment to get going, then this many world units a
 * second. The whole route (about 1,100 units) takes about 2.4s.
 */
const TRANSIT_PACE = { start: 0.8, speed: 700 };

/** Stops between the samples a transit measures the route by. */
const SAMPLE = 0.02;

/** A sampled route: the stop, depth and distance flown at each sample. */
type Samples = { stop: number; z: number; length: number }[];

/** Each route's samples, measured once however many transits fly it. */
const measured = new WeakMap<Route, Samples>();

/** Measures the route, sample by sample, from its first stop. */
function measure(route: Route): Samples {
  const known = measured.get(route);
  if (known) return known;
  const samples: Samples = [];
  const count = Math.round((ROUTE_STOPS - 1) / SAMPLE);
  let length = 0;
  let last = route.poseAt(0).position;
  for (let i = 0; i <= count; i++) {
    const stop = i * SAMPLE;
    const { position } = route.poseAt(stop);
    length += position.distanceTo(last);
    last = position;
    samples.push({ stop, z: position.z, length });
  }
  measured.set(route, samples);
  return samples;
}

/**
 * Linear lookup in the samples: the value of `out` where `key` is `value`.
 * `key` must be monotonic along the samples; out-of-range values clamp.
 */
function lookup(
  samples: Samples,
  key: "stop" | "z" | "length",
  value: number,
  out: "stop" | "length",
) {
  const rising = samples[samples.length - 1][key] > samples[0][key];
  const before = (s: Samples[number]) =>
    rising ? s[key] <= value : s[key] >= value;
  if (!before(samples[0])) return samples[0][out];
  let lo = 0;
  let hi = samples.length - 1;
  if (before(samples[hi])) return samples[hi][out];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (before(samples[mid])) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const f = b[key] === a[key] ? 0 : (value - a[key]) / (b[key] - a[key]);
  return a[out] + (b[out] - a[out]) * f;
}

/** Slow out, fast through the middle, slow in. */
function ease(t: number) {
  return t * t * (3 - 2 * t);
}

/**
 * The stop at which the route passes depth `z`, found to within a hair of
 * the samples' guess; clamped to the route's ends.
 */
function stopAtDepth(route: Route, samples: Samples, z: number) {
  const guess = lookup(samples, "z", z, "stop");
  let lo = Math.max(0, guess - SAMPLE);
  let hi = Math.min(ROUTE_STOPS - 1, guess + SAMPLE);
  if (route.poseAt(lo).position.z < z) return lo;
  if (route.poseAt(hi).position.z > z) return hi;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (route.poseAt(mid).position.z >= z) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The fraction of a transit over which a camera that left from off the route
 * eases onto it (or, landing off the route, eases off it), and the most world
 * units that may take. Towers stand a little way up the valley from the
 * court, off the route on its side, so the camera keeps to the route until
 * it is past them.
 */
const JOIN = 0.4;
const JOIN_REACH = 50;

/** Seconds a transit flying `distance` world units takes, up to the cap. */
function durationFor(distance: number) {
  return distance === 0
    ? 0
    : Math.min(
        TRANSIT_MAX_SECONDS,
        TRANSIT_PACE.start + distance / TRANSIT_PACE.speed,
      );
}

const copyOf = ({ position, quaternion }: Pose): Pose => ({
  position: position.clone(),
  quaternion: quaternion.clone(),
});

/**
 * Where a transit leaves from: a camera's pose (on the scroll route, at the
 * Outpost, partway through another transit), or a point in the opening
 * flight, which the transit finishes before it takes the route (the opening
 * runs down the canyon behind the plate, where the route can't reach).
 */
export type Departure =
  | { pose: Pose }
  | {
      opening: FlightPath;
      /** How far along the opening's path, 0 to 1 (`FlightPath.travel`). */
      travel: number;
      /** How far round to the settled framing, 0 to 1 (the rig's `settle`). */
      settle: number;
    };

/**
 * Where a transit lands: one of the route's stops, or a pose off the route
 * (the court's), which it eases onto from where the route passes its depth.
 */
export type Arrival = number | Pose;

/** A transit from `departure` to `to`. */
export function transit(route: Route, departure: Departure, to: Arrival) {
  return "pose" in departure
    ? transitPath(route, departure.pose, to)
    : fromOpening(route, departure, to);
}

/**
 * A transit that leaves from inside the opening: it finishes the opening's
 * own path, quickened, to the settled view, and flies on from there along
 * the route without stopping, the whole trip eased as one and within the cap.
 */
function fromOpening(
  route: Route,
  { opening, travel, settle }: Extract<Departure, { opening: FlightPath }>,
  to: Arrival,
) {
  const from = Math.min(1, Math.max(0, travel));
  /** World units of the opening still to fly. */
  const lead = (1 - from) * opening.length;
  const rest = transitPath(route, opening.poseAlong(1, 1), to);
  const distance = lead + rest.distance;
  // The camera swings round to the settled framing over the turn-in (from
  // where it is, if it is already in it).
  const settling = Math.max(from, opening.turnStart);

  /** The opening `d` world units on from the departure. */
  function inOpening(d: number) {
    const u = Math.min(1, from + d / opening.length);
    const s =
      u <= settling || settling >= 1
        ? settle
        : settle + (1 - settle) * ((u - settling) / (1 - settling));
    return { u, s: d >= lead ? 1 : s };
  }

  /** The transit a fraction `f` of the way along its distance. */
  function at(f: number) {
    return Math.min(1, Math.max(0, f)) * distance;
  }

  return {
    duration: durationFor(distance),
    distance,
    poseAt(t: number): Pose {
      if (t <= 0) return opening.poseAlong(from, settle);
      if (t >= 1) return rest.along(1);
      const d = at(ease(t));
      if (d < lead) {
        const { u, s } = inOpening(d);
        return opening.poseAlong(u, s);
      }
      return rest.along((d - lead) / Math.max(rest.distance, 1e-9));
    },
    /** Where a transit leaving `t` of the way through this one leaves from. */
    departureAt(t: number): Departure {
      const d = at(ease(Math.min(1, Math.max(0, t))));
      if (d < lead) {
        const { u, s } = inOpening(d);
        return { opening, travel: u, settle: s };
      }
      return { pose: this.poseAt(t) };
    },
  };
}

/** A transit from the pose `departure` along `route` to `to`. */
export function transitPath(route: Route, departure: Pose, to: Arrival) {
  const samples = measure(route);
  const fromStop = stopAtDepth(route, samples, departure.position.z);
  const toStop =
    typeof to === "number" ? to : stopAtDepth(route, samples, to.position.z);
  const fromLength = lookup(samples, "stop", fromStop, "length");
  const toLength = lookup(samples, "stop", toStop, "length");

  // How far the camera stands off the route where it joins it, and how far
  // round it looks, both eased out as the transit gets going.
  const join = route.poseAt(fromStop);
  const offset = departure.position.clone().sub(join.position);
  const turn = departure.quaternion
    .clone()
    .multiply(join.quaternion.clone().invert());
  const straight = new Quaternion();

  // Likewise how far off the route a pose it lands on stands, and how far
  // round it looks, both eased in as the transit lands.
  const leave = route.poseAt(toStop);
  const end = typeof to === "number" ? leave : to;
  const landing = end.position.clone().sub(leave.position);
  const landingTurn = end.quaternion
    .clone()
    .multiply(leave.quaternion.clone().invert());

  const distance =
    Math.abs(toLength - fromLength) + offset.length() + landing.length();
  const joining = Math.min(JOIN, JOIN_REACH / Math.max(distance, 1e-9));

  /** The camera a fraction `f` (0 to 1) of the way along the distance. */
  function along(f: number): Pose {
    if (f <= 0) return copyOf(departure);
    if (f >= 1) return copyOf(end);
    const length = fromLength + (toLength - fromLength) * f;
    const { position, quaternion } = route.poseAt(
      lookup(samples, "length", length, "stop"),
    );
    const off = 1 - ease(Math.min(1, f / joining));
    const on = ease(Math.max(0, (f - (1 - joining)) / joining));
    return {
      position: position
        .addScaledVector(offset, off)
        .addScaledVector(landing, on),
      quaternion: straight
        .clone()
        .slerp(landingTurn, on)
        .multiply(straight.clone().slerp(turn, off))
        .multiply(quaternion),
    };
  }

  return {
    /** Seconds the transit takes: longer the further it flies, up to the cap. */
    duration: durationFor(distance),
    /** World units it flies. */
    distance,
    along,

    /** The camera a fraction `t` (0 to 1) of the way through the transit. */
    poseAt(t: number): Pose {
      return t <= 0 ? copyOf(departure) : along(ease(Math.min(1, t)));
    },

    /** Where a transit leaving `t` of the way through this one leaves from. */
    departureAt(t: number): Departure {
      return { pose: this.poseAt(t) };
    },
  };
}

export type Transit = Pick<
  ReturnType<typeof transitPath>,
  "duration" | "poseAt" | "departureAt"
>;
