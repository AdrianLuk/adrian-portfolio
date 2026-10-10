import { Quaternion } from "three";
import type { FlightPath, Pose } from "./flight";
import { TRANSIT_MAX_SECONDS } from "./rigs";
import { COURT_SITE, ROUTE_STOPS, type Route } from "./route";

/**
 * A transit, as pure maths: the camera's flight between two Places (home,
 * the court, the Skyline, the Diamond). Unit tested without WebGL.
 *
 * It runs along the scroll route at an accelerated, eased pace: down the
 * valley, or back up it. The camera joins the route at its own depth (the
 * route only ever moves on down the valley), so a transit can leave from
 * anywhere along it: the settled view, beside a lit site, partway between,
 * the court, the Skyline, or partway through another transit. It ends on
 * one of the route's stops, or on a pose off the route (the court's, the
 * Skyline's), easing off the route onto it as it lands.
 */

/** The route's first stop, the settled view over the name plate. */
export const SETTLED_STOP = 0;

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
 * How much of the route a camera that left from off it travels while it eases
 * onto it (or, landing off the route, while it eases off it): JOIN_REACH
 * world units, or JOIN_SPREAD of how far it stands off the route if that is
 * further. Towers stand a little way up the valley from the court, off the
 * route on its side, so the camera keeps to the route until it is past them;
 * the Skyline stands far across the harbour, so the camera leaves the route
 * at the harbour's mouth and sweeps across the water to it. Either way the
 * sweep takes its share of the trip at the route's own pace, never a dash.
 */
const JOIN_REACH = 50;
const JOIN_SPREAD = 0.5;

/**
 * World units of the trip, per radian, that panning onto the route's view
 * (or off it, onto a pose's) takes at least: a big turn, as the Skyline's
 * across the harbour, slows its leg to a medium-speed pan. It adds time, never
 * route: the camera still leaves the route where JOIN_REACH says.
 */
const TURN_REACH = 400;

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
 * court or the Skyline, partway through another transit), or a point in the opening
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
 * (the court's, the Skyline's), which it eases onto from where the route
 * passes its depth.
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

  // How far the camera stands off the route where it joins it, eased out as
  // the transit gets going; likewise how far off it a pose it lands on
  // stands, eased in as it lands.
  const offset = departure.position
    .clone()
    .sub(route.poseAt(fromStop).position);
  const leave = route.poseAt(toStop);
  const end = typeof to === "number" ? leave : to;
  const landing = end.position.clone().sub(leave.position);

  // The trip in three legs, each as long as the way it flies: leaving (easing
  // onto the route from the departure, over `joinRoute` of it), along the
  // route, and landing (easing off it onto the pose, over `landRoute` of it).
  // A turn sets a floor on its leg's length, so it is never a whip round.
  const routeLength = Math.abs(toLength - fromLength);
  const way = Math.sign(toLength - fromLength);
  /** The route's own view `travelled` units along it from the departure. */
  const viewAt = (travelled: number) =>
    route.poseAt(lookup(samples, "length", fromLength + way * travelled, "stop"))
      .quaternion;
  /** The route a leg travels, for how far off it the leg's end stands. */
  const reach = (off: number) => Math.max(JOIN_REACH, JOIN_SPREAD * off);
  let joinRoute = reach(offset.length());
  let landRoute = reach(landing.length());
  // The route's glance turns at a scroll's pace, far too quick at a
  // Transit's: one landing in its leg (the Derby's view, beside the Diamond)
  // leaves the route at the leg's first stop, and one leaving from it joins
  // the route there, so the camera pans once, never through the glance.
  const glance = route.glanceAfter;
  if (glance !== null) {
    const legStart = lookup(samples, "stop", glance, "length");
    const inLeg = (stop: number) => stop > glance && stop < glance + 1;
    if (inLeg(toStop)) landRoute = Math.max(landRoute, toLength - legStart);
    if (inLeg(fromStop)) joinRoute = Math.max(joinRoute, fromLength - legStart);
  }
  if (joinRoute + landRoute > routeLength) {
    const fit = routeLength / (joinRoute + landRoute);
    joinRoute *= fit;
    landRoute *= fit;
  }
  // The leaving leg pans from the departure's view to the route's where it
  // joins it, and the landing leg from the route's where it leaves it to the
  // pose's: each one clean pan, whatever the route's own view does meanwhile.
  const joined = viewAt(joinRoute);
  const left = viewAt(routeLength - landRoute);
  const leaving = Math.max(
    joinRoute + offset.length(),
    TURN_REACH * departure.quaternion.angleTo(joined),
  );
  const landingLeg = Math.max(
    landRoute + landing.length(),
    TURN_REACH * left.angleTo(end.quaternion),
  );
  const cruise = routeLength - joinRoute - landRoute;
  const distance = leaving + cruise + landingLeg;

  /**
   * How far along the `travel` units of route it covers a leg `leg` long
   * has got, `u` (0 to 1) of the way from its off-route end: slowly there,
   * and at the route's own pace where it meets the route, so the camera never
   * lurches as the leg hands over.
   */
  function legPace(u: number, travel: number, leg: number) {
    if (travel <= 1e-9) return 0;
    return travel * u ** Math.max(1, leg / travel);
  }

  /** The camera a fraction `f` (0 to 1) of the way along the distance. */
  function along(f: number): Pose {
    if (f <= 0) return copyOf(departure);
    if (f >= 1) return copyOf(end);
    const d = f * distance;
    let travelled: number;
    let off = 0;
    let on = 0;
    let view: Quaternion | null = null;
    if (d < leaving) {
      const u = d / leaving;
      travelled = legPace(u, joinRoute, leaving);
      off = 1 - ease(u);
      view = departure.quaternion.clone().slerp(joined, ease(u));
    } else if (d < leaving + cruise) {
      travelled = joinRoute + (d - leaving);
    } else {
      const u = Math.min(1, (d - leaving - cruise) / landingLeg);
      travelled = routeLength - legPace(1 - u, landRoute, landingLeg);
      on = ease(u);
      view = left.clone().slerp(end.quaternion, on);
    }
    const { position, quaternion } = route.poseAt(
      lookup(samples, "length", fromLength + way * travelled, "stop"),
    );
    return {
      position: position
        .addScaledVector(offset, off)
        .addScaledVector(landing, on),
      quaternion: view ?? quaternion,
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

/**
 * A transit between two views of one Place (the court's: courtside, the
 * Juice Bros Case study's, and behind the player's baseline, /rally's): the
 * camera moves straight from one to the other round the court, turning as
 * it goes, without taking the route, at the route's pace; a big turn slows
 * it to a medium-speed pan.
 */
export function transitWithin(departure: Pose, to: Pose) {
  const distance = Math.max(
    departure.position.distanceTo(to.position),
    TURN_REACH * departure.quaternion.angleTo(to.quaternion),
  );

  /** The camera a fraction `f` (0 to 1) of the way along the distance. */
  function along(f: number): Pose {
    if (f <= 0) return copyOf(departure);
    if (f >= 1) return copyOf(to);
    return {
      position: departure.position.clone().lerp(to.position, f),
      quaternion: departure.quaternion.clone().slerp(to.quaternion, f),
    };
  }

  return {
    duration: durationFor(distance),
    distance,
    along,
    poseAt(t: number): Pose {
      return t <= 0 ? copyOf(departure) : along(ease(Math.min(1, t)));
    },
    departureAt(t: number): Departure {
      return { pose: this.poseAt(t) };
    },
  };
}

export type Transit = Pick<
  ReturnType<typeof transitPath>,
  "duration" | "poseAt" | "departureAt"
>;
