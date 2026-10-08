// No Three.js here: the director is made with the world host, before the
// first paint. The paths the world hands it do the maths.
import { LIT_SITES } from "./lit-sites";
import type { Place } from "./world-places";
import type { FlightPath, Pose } from "./world/flight";
import {
  FLIGHT_START_RIG,
  SETTLED_RIG,
  TRANSIT_MAX_SECONDS,
  type FlightRig,
} from "./world/rigs";
import type { Route } from "./world/route";
import type { Departure, Destination, Transit } from "./world/transit";

/**
 * What the world hands the director each time it lays a view out: the paths
 * the camera can take for that layout, and the Transit maths, which ship with
 * the world so they are ready whenever the paths are.
 */
export type CameraPaths = {
  /** The Opening's path and the scroll route; null until home's headline is measured. */
  opening: FlightPath | null;
  route: Route | null;
  /** The Outpost's pose, for the screen's shape. */
  outpost: Pose;
  /** The Outpost's stop on the route. */
  outpostStop: number;
  /** The court's pose, for the screen's shape: off the route, beside its stop. */
  court: Pose;
  /** The court's stop on the route (Juice Bros' Lit site). */
  courtStop: number;
  transit(route: Route, departure: Departure, to: Destination): Transit;
};

/** How brightly the world's lights burn in a frame. */
export type CameraLights = {
  /** The name plate's arrival: its beams' brightness, and their sweep's offset. */
  beams: number;
  sweep: number;
  /** Each Lit site's light, as a share of a beacon's full intensity. */
  sites: number[];
  /**
   * The court's look (its floodlights up, the fog violet, the rally ball),
   * 0 to 1: full at the court, blended in through a Transit there and out
   * through one leaving it, and none anywhere else.
   */
  court: number;
};

/**
 * Where the camera leans, toward the pointer: -1 to 1 each way from the
 * screen's centre (x to the right, y down). The world eases after it, so it
 * may change at once.
 */
export type CameraLean = { x: number; y: number };

/**
 * What the world draws in a frame: null leaves the camera, or the lights, as
 * they are. The lean turns the pose a little, toward the pointer.
 */
export type CameraFrame = {
  pose: Pose | null;
  lights: CameraLights | null;
  lean: CameraLean;
};

const UPRIGHT: CameraLean = { x: 0, y: 0 };

/**
 * How long the camera waits, at most, on its destination page (and its
 * paths) before landing without them, in ms: a slow network never strands
 * the camera.
 */
const ARRIVAL_LIMIT = 4000;

/**
 * How far home's scroll may have moved the destination, in route stops,
 * before a Transit landing there goes on to meet it.
 */
const CHASE = 0.02;

/**
 * A Lit site's light, as a share of a beacon's: how dim the sites further
 * down the valley wait, and how much brighter each burns once its panel is in.
 */
const SITE_LIGHT = { waiting: 0.35, lit: 0.9 };

/** A Transit under way. */
type Trip = {
  to: Place;
  /** Where it left from. */
  departure: Departure;
  /** The camera as it left, held there until the Transit is planned. */
  held: Pose;
  /** How far the court's look was in as it left (see CameraLights). */
  look: number;
  /** The path, once its route (and its stop on it) is known. */
  transit: Transit | null;
  /** The route stop it lands at. */
  stop: number;
  /** When the Transit started, and when the navigation did, in ms. */
  start: number;
  since: number;
};

type Planned = Trip & { transit: Transit };

const smoothstep = (f: number) => f * f * (3 - 2 * f);

const copyOf = ({ position, quaternion }: Pose): Pose => ({
  position: position.clone(),
  quaternion: quaternion.clone(),
});

/**
 * The Camera director: the one place that decides where the world's camera
 * is, and how the world is lit, frame by frame, as it hands over between the
 * Opening, the scroll route, a Transit, the court and the Outpost. The
 * camera never jumps: at a handoff it holds where it is until the next
 * driver reports.
 *
 * Every driver reports to it, and none of them reads another's state: the
 * Opening's timeline its values and its landing, the scroll route its stop,
 * navigation the Transits, the world host the place on screen, the world the
 * paths each layout measures. Time is passed in (performance.now()'s ms); it
 * keeps no loop of its own.
 */
export function createCameraDirector({
  homeStop,
}: {
  /** Where home's own scroll puts the camera, before the scroll route reports. */
  homeStop: () => number;
}) {
  let paths: CameraPaths | null = null;
  let shown: Place | null = null;
  let opening: FlightRig = { ...FLIGHT_START_RIG };
  let landed = false;
  /** True while the scroll route is reporting its stop. */
  let scrolling = false;
  let routeStop = 0;
  const lit = LIT_SITES.map(() => 0);
  let trip: Trip | null = null;
  /** The last pose drawn, for a Transit leaving before the paths are in. */
  let last: Pose | null = null;
  /** Where the pointer is on screen; null while it is off it, or not a mouse's. */
  let pointer: CameraLean | null = null;

  /** Home's paths, once measured. */
  const homePaths = () =>
    paths?.opening && paths.route
      ? { opening: paths.opening, route: paths.route }
      : null;

  /** The place's own camera, without a Transit; null if not yet known. */
  function viewPose(): Pose | null {
    if (shown === "outpost") return paths?.outpost ?? null;
    if (shown === "court") return paths?.court ?? null;
    const home = shown === "hero" && homePaths();
    if (!home) return null;
    return landed
      ? home.route.poseAt(routeStop)
      : home.opening.poseAt(opening);
  }

  /** How far through its Transit `t` is at `now`, 0 to 1. */
  function progress(t: Planned, now: number) {
    const ms = t.transit.duration * 1000;
    return ms > 0 ? Math.min(1, (now - t.start) / ms) : 1;
  }

  function poseIn(t: Trip, now: number): Pose {
    return t.transit
      ? t.transit.poseAt(progress(t as Planned, now))
      : copyOf(t.held);
  }

  /**
   * Plans the Transit once its route is known: at once to the court or the
   * Outpost, whose poses need no page; home only once its page is in (and
   * its own paths measured), where its scroll says.
   */
  function plan(t: Trip, now: number) {
    const route = paths?.route;
    if (!paths || !route) return;
    if (t.to === "hero" && (shown !== "hero" || !homePaths())) return;
    let to: Destination;
    if (t.to === "court") {
      t.stop = paths.courtStop;
      to = paths.court;
    } else {
      // Where the page is, not where its scroll route has eased to so far.
      t.stop = t.to === "outpost" ? paths.outpostStop : homeStop();
      to = t.stop;
    }
    t.transit = paths.transit(route, t.departure, to);
    t.start = now;
  }

  /**
   * Where a Transit leaving now leaves from: where the camera is in the
   * Transit under way, or in the Opening (which it finishes first, never
   * cutting across the canyon), or wherever else it stands.
   */
  function departure(now: number): Pick<Trip, "departure" | "held"> | null {
    if (trip) {
      return trip.transit
        ? {
            held: poseIn(trip, now),
            departure: trip.transit.departureAt(
              progress(trip as Planned, now),
            ),
          }
        : { held: copyOf(trip.held), departure: trip.departure };
    }
    const home = shown === "hero" && !landed && homePaths();
    if (home) {
      const travel = home.opening.travel(opening);
      const { settle } = opening;
      return {
        held: home.opening.poseAlong(travel, settle),
        departure: { opening: home.opening, travel, settle },
      };
    }
    const pose = viewPose() ?? last;
    return pose && { held: copyOf(pose), departure: { pose: copyOf(pose) } };
  }

  /** Ends the Transit: home holds the stop it landed at until the scroll route reports. */
  function land() {
    const t = trip;
    trip = null;
    if (t?.transit && t.to === "hero" && !scrolling) routeStop = t.stop;
  }

  /** Moves a Transit on to `now`: plans it, chases home's scroll, lands it. */
  function advance(now: number) {
    const t = trip;
    if (!t) return;
    if (!t.transit) plan(t, now);
    if (
      t.transit &&
      shown === t.to &&
      now - t.start >= t.transit.duration * 1000
    ) {
      if (t.to === "hero" && Math.abs(homeStop() - t.stop) > CHASE) {
        // Home's scroll moved on meanwhile: fly on to meet it.
        t.held = poseIn(t, now);
        t.look = courtLook(now);
        t.departure = { pose: t.held };
        plan(t, now);
      } else if (
        t.to === "hero" &&
        scrolling &&
        Math.abs(routeStop - t.stop) > CHASE
      ) {
        // The scroll route is still easing there: hold until it arrives.
      } else {
        land();
        return;
      }
    }
    if (now - t.since > ARRIVAL_LIMIT + TRANSIT_MAX_SECONDS * 1000) land();
  }

  /**
   * Home's camera leans toward the pointer once the Opening has landed, and
   * only then: never through the Opening, a Transit, at the court or at the
   * Outpost, whose cameras stand still.
   */
  function lean(): CameraLean {
    return pointer && shown === "hero" && landed && !trip ? pointer : UPRIGHT;
  }

  /**
   * How far the court's look is in at `now`, 0 to 1: through a Transit, from
   * where it was as the camera left to where the destination wants it, eased
   * along with the camera; otherwise full at the court and out elsewhere.
   */
  function courtLook(now: number): number {
    if (!trip) return shown === "court" ? 1 : 0;
    if (!trip.transit) return trip.look;
    const to = trip.to === "court" ? 1 : 0;
    const f = smoothstep(progress(trip as Planned, now));
    return trip.look + (to - trip.look) * f;
  }

  /**
   * Home lights its plate's arrival and its sites as the Opening and the
   * scroll route say. Elsewhere the plate is out of sight and the sites dark,
   * and only the court's look changes.
   */
  function lights(now: number): CameraLights | null {
    const court = courtLook(now);
    if (shown === "hero" && homePaths()) {
      const { beams, sweep, beacon } = opening;
      return {
        beams,
        sweep,
        sites: LIT_SITES.map((_, i) => {
          // The first is the scroll cue, lit by the arrival; the rest wait dim.
          const waiting = i === 0 ? beacon : beacon * SITE_LIGHT.waiting;
          return waiting + SITE_LIGHT.lit * lit[i];
        }),
        court,
      };
    }
    if (!paths || (!shown && !trip)) return null;
    return { beams: 0, sweep: 0, sites: LIT_SITES.map(() => 0), court };
  }

  return {
    // From the world and its host.

    /** The world has laid a view out: the paths for that layout. */
    layout(next: CameraPaths) {
      paths = next;
    },
    /** The place the world shows now (null: none, parked). */
    show(place: Place | null) {
      shown = place;
    },

    // From the Opening.

    /** The Opening starts afresh, far down the canyon. */
    openingStarts() {
      opening = { ...FLIGHT_START_RIG };
      landed = false;
    },
    /** Where the Opening's timeline has got to. */
    openingAt(values: Readonly<FlightRig>) {
      if (!landed) opening = { ...values };
    },
    /**
     * The Opening has landed (run out, skipped, or never run under reduced
     * motion or on rejoining a live world): the scroll route has the camera.
     */
    openingLands() {
      landed = true;
      opening = { ...SETTLED_RIG };
    },

    // From the scroll route.

    /** The stop home's scroll puts the camera at, and how lit each site is. */
    scrolled(stop: number, sites: readonly number[]) {
      scrolling = true;
      routeStop = stop;
      lit.forEach((_, i) => (lit[i] = sites[i] ?? 0));
    },
    /** The scroll route has stopped: back to the settled view, the sites dark. */
    scrollStopped() {
      scrolling = false;
      routeStop = 0;
      lit.fill(0);
    },
    /**
     * The route stop the camera stands at, or is landing at in a Transit
     * home (where the page is, until the Transit is planned): where a scroll
     * route starting now picks the camera up.
     */
    stop: () =>
      trip?.to === "hero"
        ? trip.transit
          ? trip.stop
          : homeStop()
        : routeStop,

    // From the pointer.

    /** Where the pointer is on screen (see CameraLean); null once it has left. */
    pointerAt(at: CameraLean | null) {
      pointer = at && {
        x: Math.min(1, Math.max(-1, at.x)),
        y: Math.min(1, Math.max(-1, at.y)),
      };
    },

    // From navigation.

    /**
     * Starts a Transit to `to`, or turns the one under way round, from
     * wherever the camera is. False if the camera has nowhere to leave from.
     */
    fly(to: Place, now: number) {
      const from = departure(now);
      if (!from) return false;
      const look = courtLook(now);
      trip = { to, ...from, look, transit: null, stop: 0, start: 0, since: now };
      plan(trip, now);
      return true;
    },
    /** Lands any Transit under way at once. */
    arrive: land,
    /** Where the Transit under way is flying; null once it has landed. */
    flying: (): Place | null => trip?.to ?? null,
    /** Moves a Transit on to `now`: plans it, chases home's scroll, lands it. */
    advance,

    // To the world.

    /**
     * Where the camera is at `now`, and how the world is lit. Only reads: a
     * Transit moves on by `advance`, from navigation's own frame loop, so a
     * frame drawn mid-commit (as a page claims the world, before Back has
     * restored its scroll) never plans one.
     */
    frame(now: number): CameraFrame {
      const pose = trip ? poseIn(trip, now) : viewPose();
      if (pose) last = pose;
      return { pose, lights: lights(now), lean: lean() };
    },
  };
}

export type CameraDirector = ReturnType<typeof createCameraDirector>;
