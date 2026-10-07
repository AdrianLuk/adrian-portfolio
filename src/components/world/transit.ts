import { Quaternion } from "three";
import type { Pose } from "./flight";
import { TRANSIT_MAX_SECONDS } from "./rigs";
import { ROUTE_STOPS, type Route } from "./route";

/**
 * A transit, as pure maths: the camera's flight between home and the Resume
 * page. Unit tested without WebGL.
 *
 * It runs along the scroll route at an accelerated, eased pace: down the
 * valley to the Outpost, or back up it to the settled view. The camera joins
 * the route at its own depth (the route only ever moves on down the valley),
 * so a transit can leave from anywhere along it: the settled view, beside a
 * lit site, partway between, or partway through another transit.
 */

/** The route's first stop, the settled view over the name plate. */
export const SETTLED_STOP = 0;

/** The route's last stop, the Outpost, where the Resume page stands. */
export const OUTPOST_STOP = ROUTE_STOPS - 1;

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
 * eases onto it.
 */
const JOIN = 0.4;

/** A transit from `departure` along `route` to the stop `to`. */
export function transitPath(route: Route, departure: Pose, to: number) {
  const samples = measure(route);
  const fromStop = stopAtDepth(route, samples, departure.position.z);
  const fromLength = lookup(samples, "stop", fromStop, "length");
  const toLength = lookup(samples, "stop", to, "length");

  // How far the camera stands off the route where it joins it, and how far
  // round it looks, both eased out as the transit gets going.
  const join = route.poseAt(fromStop);
  const offset = departure.position.clone().sub(join.position);
  const turn = departure.quaternion
    .clone()
    .multiply(join.quaternion.clone().invert());
  const straight = new Quaternion();

  const distance = Math.abs(toLength - fromLength) + offset.length();

  return {
    /** Seconds the transit takes: longer the further it flies, up to the cap. */
    duration:
      distance === 0
        ? 0
        : Math.min(
            TRANSIT_MAX_SECONDS,
            TRANSIT_PACE.start + distance / TRANSIT_PACE.speed,
          ),

    /** The camera a fraction `t` (0 to 1) of the way through the transit. */
    poseAt(t: number): Pose {
      if (t <= 0) {
        return {
          position: departure.position.clone(),
          quaternion: departure.quaternion.clone(),
        };
      }
      if (t >= 1) return route.poseAt(to);
      const length = fromLength + (toLength - fromLength) * ease(t);
      const { position, quaternion } = route.poseAt(
        lookup(samples, "length", length, "stop"),
      );
      const off = 1 - ease(Math.min(1, t / JOIN));
      return {
        position: position.addScaledVector(offset, off),
        quaternion: straight.clone().slerp(turn, off).multiply(quaternion),
      };
    },
  };
}

export type Transit = ReturnType<typeof transitPath>;
