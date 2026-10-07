// The router loads this before the first paint, so nothing heavy comes up
// front: the transit's maths (and Three.js) load once the world is drawn.
import { scrolledStop } from "./home-panels";
import { REDUCED_MOTION } from "./reduced-motion";
import { worldHost, type WorldHost } from "./world-host";
import { placeOf, transitBetween, type Place } from "./world-places";
import type { Pose } from "./world/flight";
import { TRANSIT_MAX_SECONDS, type FlightRig } from "./world/rigs";
import type { Departure, Transit } from "./world/transit";

/**
 * How long the camera waits, at most, on its destination page (and the
 * transit's maths) before landing without them, in ms: a slow network never
 * strands the camera. The copy never waits this long: it is held back for
 * TRANSIT_MAX_SECONDS at most, whatever the camera does.
 */
const ARRIVAL_LIMIT = 4000;

/**
 * How far home's scroll may have moved the destination, in route stops,
 * before a transit landing there goes on to meet it.
 */
const CHASE = 0.02;

/** A transit under way. */
type Trip = {
  to: Place;
  /** Where it left from. */
  departure: Departure;
  /** The camera as it left, held there until the transit is planned. */
  held: Pose;
  /** The path, once its route (and its stop on it) is known. */
  transit: Transit | null;
  /** The route stop it lands at. */
  stop: number;
  /** When the transit started, and when the navigation did, in ms. */
  start: number;
  since: number;
  frame: number;
};

/** True once the opening has run out, or never ran: the camera is free. */
const openingOver = (rig: FlightRig) =>
  rig.flight >= 1 && rig.turn >= 1 && rig.settle >= 1;

const copyOf = ({ position, quaternion }: Pose): Pose => ({
  position: position.clone(),
  quaternion: quaternion.clone(),
});

/**
 * Transits between home and the Resume page: the camera flying from one to
 * the other. A navigation between them hands the world's camera to a
 * transit the moment it starts (the click, or Back and Forward): the camera
 * flies from wherever it is to the destination page's pose, while the page
 * itself arrives under it at once. While the camera flies, the world's root
 * carries `data-transit` (the destination). For TRANSIT_MAX_SECONDS at most
 * from the navigation's start, and no longer than the camera takes to land,
 * it carries `data-arriving` (the destination) too, which holds the
 * destination's copy back (unseen, and out of reach of focus) so it can
 * arrive with the camera. Under reduced motion, without a drawn world, or
 * between any other pages, nothing flies.
 */
export function createWorldTransits(host: WorldHost) {
  let trip: Trip | null = null;
  let maths: typeof import("./world/transit") | null = null;
  let loading = false;
  let holding: ReturnType<typeof setTimeout> | undefined;

  function loadMaths() {
    if (maths || loading) return;
    loading = true;
    import("./world/transit").then(
      (module) => {
        maths = module;
      },
      () => {
        // A stale chunk after a deploy, say: transits land without flying.
        loading = false;
      },
    );
  }

  const reduced = () => window.matchMedia(REDUCED_MOTION).matches;

  /** The place of the page the router last committed to, if it has one. */
  function committed(): Place | null {
    const intent = host.intent();
    return intent === "none" ? null : intent;
  }

  function mark(name: string, to: Place | null) {
    const root = document.querySelector("[data-world-root]");
    if (to) root?.setAttribute(name, to);
    else root?.removeAttribute(name);
  }

  /** Holds `to`'s copy back, for the cap at most. */
  function hold(to: Place) {
    clearTimeout(holding);
    mark("data-arriving", to);
    holding = setTimeout(release, TRANSIT_MAX_SECONDS * 1000);
  }

  /** Lets the copy in. */
  function release() {
    clearTimeout(holding);
    mark("data-arriving", null);
  }

  /** How far through its transit `t` is, 0 to 1. */
  function progress(t: Trip & { transit: Transit }) {
    const ms = t.transit.duration * 1000;
    return ms > 0 ? Math.min(1, (performance.now() - t.start) / ms) : 1;
  }

  /** Where the camera is in `t` now. */
  function poseIn(t: Trip): Pose {
    return t.transit
      ? t.transit.poseAt(progress(t as Trip & { transit: Transit }))
      : copyOf(t.held);
  }

  /**
   * Plans the transit once its route is known: at once down to the Outpost;
   * home only once its page is in and scrolled, where its scroll says.
   */
  function plan(t: Trip) {
    const route = host.scrollRoute();
    if (!maths || !route) return;
    if (t.to === "hero" && host.intent() !== "hero") return;
    t.stop = t.to === "outpost" ? maths.OUTPOST_STOP : scrolledStop();
    t.transit = maths.transit(route, t.departure, t.stop);
    t.start = performance.now();
  }

  /** Lands: the camera goes back to the page's own view, in its weather. */
  function land() {
    release();
    if (!trip) return;
    cancelAnimationFrame(trip.frame);
    trip = null;
    host.steer(null);
    host.holdWeather(false);
    mark("data-transit", null);
  }

  function tick() {
    const t = trip;
    if (!t) return;
    if (!t.transit) plan(t);
    const now = performance.now();
    if (t.transit && now - t.start >= t.transit.duration * 1000) {
      if (host.intent() === t.to) {
        // Home's scroll moved on meanwhile: fly on to meet it.
        if (t.to === "hero" && Math.abs(scrolledStop() - t.stop) > CHASE) {
          t.held = poseIn(t);
          t.departure = { pose: t.held };
          plan(t);
        } else {
          land();
          return;
        }
      }
    }
    if (now - t.since > ARRIVAL_LIMIT + TRANSIT_MAX_SECONDS * 1000) {
      land();
      return;
    }
    t.frame = requestAnimationFrame(tick);
  }

  /**
   * Where a transit leaving now leaves from: where the camera is in the
   * transit under way, or in the opening (which it finishes first, never
   * cutting across the canyon), or wherever else it stands.
   */
  function departure(): Pick<Trip, "departure" | "held"> | null {
    if (trip) {
      const { transit } = trip;
      return transit
        ? {
            held: poseIn(trip),
            departure: transit.departureAt(
              progress(trip as Trip & { transit: Transit }),
            ),
          }
        : { held: copyOf(trip.held), departure: trip.departure };
    }
    const opening = host.openingPath();
    if (opening && host.intent() === "hero" && !openingOver(host.rig)) {
      const travel = opening.travel(host.rig);
      const { settle } = host.rig;
      return {
        held: opening.poseAlong(travel, settle),
        departure: { opening, travel, settle },
      };
    }
    const pose = host.cameraPose();
    return pose && { held: pose, departure: { pose } };
  }

  const onState = () => {
    // The world drawn: its transit's maths load, ready for the first flight.
    // A lost GPU context, or no world: a transit lands at once.
    if (host.state() === "drawn") loadMaths();
    else land();
  };
  // Motion reduced mid-flight: the camera is at its destination at once.
  const onPreference = () => land();
  const unsubscribe = host.subscribe(onState);
  const preference =
    typeof window === "undefined" ? null : window.matchMedia(REDUCED_MOTION);
  preference?.addEventListener("change", onPreference);

  return {
    /**
     * The router is navigating to `url`: starts, retargets, carries on with
     * or calls off a transit. True when the navigation is a transit (it then
     * carries TRANSIT_TRANSITION_TYPE).
     */
    navigate(url: string) {
      const to = trip ? placeOf(url) : transitBetween(committed(), url);
      // On to where the camera is already flying (an anchor there, say).
      if (trip && to === trip.to) return true;
      if (!to || reduced() || !host.live() || host.state() !== "drawn") {
        land();
        return false;
      }
      const from = departure();
      if (!from) {
        land();
        return false;
      }
      loadMaths();
      if (trip) cancelAnimationFrame(trip.frame);
      const next: Trip = {
        to,
        ...from,
        transit: null,
        stop: 0,
        start: 0,
        since: performance.now(),
        frame: 0,
      };
      trip = next;
      plan(next);
      host.holdWeather(true);
      host.steer(() => poseIn(next));
      mark("data-transit", to);
      hold(to);
      next.frame = requestAnimationFrame(tick);
      return true;
    },

    /** Lands any transit under way and stops listening for good. */
    dispose() {
      land();
      unsubscribe();
      preference?.removeEventListener("change", onPreference);
    },
  };
}

let transits: ReturnType<typeof createWorldTransits> | null = null;

/** The visit's transits, through its one world. */
export function worldTransits() {
  transits ??= createWorldTransits(worldHost());
  return transits;
}
