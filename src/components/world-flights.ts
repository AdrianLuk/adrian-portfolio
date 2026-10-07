// Plain data and types only: this loads with the router, before the first
// paint. The transit's maths (and Three.js) load once the world is live.
import { highlightAnchor } from "@/content/site";
import { routeAnchors, stopAt } from "./route-anchors";
import { worldHost, type WorldHost } from "./world-host";
import type { Pose } from "./world/flight";
import {
  SITE_PLAN,
  TRANSIT_MAX_SECONDS,
  type FlightRig,
} from "./world/rigs";
import type { Transit } from "./world/transit";

/**
 * Where a camera flight lands: the hero's settled view (home), or the Outpost
 * (the Resume page).
 */
export type Destination = "hero" | "outpost";

/**
 * The transition type a navigation that flies carries: the layout's
 * crossfade is off for it, so the world's flight is the transition.
 */
export const FLIGHT_TRANSITION = "world-flight";

/** The place each page has in the world, if any. */
function placeOf(path: string): Destination | null {
  if (path === "/") return "hero";
  if (path === "/resume") return "outpost";
  return null;
}

/** A URL's page: its path, without a trailing slash, query or anchor. */
function pageOf(url: string) {
  const { pathname } = new URL(url, "http://localhost");
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

/**
 * Where a navigation from `from` to `to` (paths or URLs) flies the camera:
 * between home and the Resume page, either way, and nowhere else. Moving
 * within a page never flies, nor does any page with no place in the world.
 */
export function flightBetween(from: string, to: string): Destination | null {
  const leaving = placeOf(pageOf(from));
  const arriving = placeOf(pageOf(to));
  return leaving && arriving && leaving !== arriving ? arriving : null;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * How long a flight waits, at most, on its destination page (and the
 * transit's maths) before landing without them, in ms: a slow network never
 * strands the camera.
 */
const ARRIVAL_LIMIT = 4000;

/**
 * How far home's scroll may have moved the destination, in route stops,
 * before a landing flight goes on to meet it.
 */
const CHASE = 0.02;

type Flight = {
  to: Destination;
  /** Where the camera left from. */
  departure: Pose;
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

/**
 * The scroll route's stop for the page as it stands now: where home's own
 * scroll (the top, or an anchor) puts the camera.
 */
function homeStop() {
  const panels = SITE_PLAN.map((site) =>
    document.getElementById(highlightAnchor(site.highlight)),
  ).filter((el) => el !== null);
  const viewport = window.innerHeight;
  const anchors = routeAnchors({
    viewport,
    maxScroll: Math.max(
      0,
      document.documentElement.scrollHeight - viewport,
    ),
    panels: panels.map((el) => ({
      top: el.getBoundingClientRect().top + window.scrollY,
      height: el.offsetHeight,
    })),
  });
  return stopAt(window.scrollY, anchors);
}

/**
 * Camera flights between home and the Resume page. A navigation between them
 * hands the world's camera to a transit the moment it starts (the click, or
 * Back and Forward): the camera flies from wherever it is to the destination
 * page's pose, while the page itself arrives under it at once. While it
 * flies, the world's root carries `data-transit` (the destination), which
 * holds the new page's copy back until the camera lands. Under reduced
 * motion, without a drawn world, or between any other pages, nothing flies.
 */
export function createWorldFlights(host: WorldHost) {
  /** The page the router is on, or on its way to. */
  let current = typeof window === "undefined" ? "/" : window.location.href;
  let flight: Flight | null = null;
  let maths: typeof import("./world/transit") | null = null;
  let loading = false;

  function loadMaths() {
    if (maths || loading) return;
    loading = true;
    import("./world/transit").then(
      (module) => {
        maths = module;
      },
      () => {
        // A stale chunk after a deploy, say: flights land without flying.
        loading = false;
      },
    );
  }

  const reduced = () => window.matchMedia(REDUCED_MOTION).matches;

  function setStage(to: Destination | null) {
    const root = document.querySelector("[data-world-root]");
    if (to) root?.setAttribute("data-transit", to);
    else root?.removeAttribute("data-transit");
  }

  /** Where the camera is in `f` now. */
  function poseIn(f: Flight): Pose {
    if (!f.transit) {
      return {
        position: f.departure.position.clone(),
        quaternion: f.departure.quaternion.clone(),
      };
    }
    const ms = f.transit.duration * 1000;
    return f.transit.poseAt(ms > 0 ? (performance.now() - f.start) / ms : 1);
  }

  /**
   * Plans the transit once its route is known: at once down to the Outpost;
   * home only once its page is in and scrolled, where its scroll says.
   */
  function plan(f: Flight, departure = f.departure) {
    const route = host.scrollRoute();
    if (!maths || !route) return;
    if (f.to === "hero" && host.intent() !== "hero") return;
    f.departure = departure;
    f.stop = f.to === "outpost" ? maths.OUTPOST_STOP : homeStop();
    f.transit = maths.transitPath(route, departure, f.stop);
    f.start = performance.now();
  }

  /** Lands: the camera goes back to the page's own view, in its weather. */
  function land() {
    if (!flight) return;
    cancelAnimationFrame(flight.frame);
    flight = null;
    host.steer(null);
    host.holdWeather(false);
    setStage(null);
  }

  function tick() {
    const f = flight;
    if (!f) return;
    if (!f.transit) plan(f);
    const now = performance.now();
    if (f.transit && now - f.start >= f.transit.duration * 1000) {
      if (host.intent() === f.to) {
        // Home's scroll moved on meanwhile: fly on to meet it.
        if (f.to === "hero" && Math.abs(homeStop() - f.stop) > CHASE) {
          plan(f, poseIn(f));
        } else {
          land();
          return;
        }
      }
    }
    if (now - f.since > ARRIVAL_LIMIT + TRANSIT_MAX_SECONDS * 1000) {
      land();
      return;
    }
    f.frame = requestAnimationFrame(tick);
  }

  if (typeof window !== "undefined") {
    // The world drawn: its transit's maths load, ready for the first flight.
    // A lost GPU context, or no world: a flight lands at once.
    host.subscribe(() => {
      if (host.state() === "drawn") loadMaths();
      else land();
    });
    // Motion reduced mid-flight: the camera is at its destination at once.
    window
      .matchMedia(REDUCED_MOTION)
      .addEventListener("change", () => land());
  }

  return {
    /**
     * The router is navigating to `url`: starts, retargets or calls off a
     * flight. True when the navigation flies (it then carries
     * FLIGHT_TRANSITION).
     */
    navigate(url: string) {
      const from = current;
      current = url;
      // Within a page (an anchor on home, say): any flight carries on.
      if (pageOf(from) === pageOf(url)) return false;
      const to = flightBetween(from, url);
      if (!to || reduced() || !host.live() || host.state() !== "drawn") {
        land();
        return false;
      }
      // Never from inside the opening (behind the plate, down the canyon):
      // a flight leaves from the settled view it would have landed on.
      const departure = flight
        ? poseIn(flight)
        : !openingOver(host.rig) && host.intent() === "hero"
          ? host.settledPose()
          : host.cameraPose();
      if (!departure) {
        land();
        return false;
      }
      loadMaths();
      if (flight) cancelAnimationFrame(flight.frame);
      const next: Flight = {
        to,
        departure,
        transit: null,
        stop: 0,
        start: 0,
        since: performance.now(),
        frame: 0,
      };
      flight = next;
      plan(next);
      host.holdWeather(true);
      host.steer(() => poseIn(next));
      setStage(to);
      next.frame = requestAnimationFrame(tick);
      return true;
    },
    /** Where the flight under way lands; null when none is. */
    transit: (): Destination | null => flight?.to ?? null,
  };
}

let flights: ReturnType<typeof createWorldFlights> | null = null;

/** The visit's camera flights, over its one world. */
export function worldFlights() {
  flights ??= createWorldFlights(worldHost());
  return flights;
}
