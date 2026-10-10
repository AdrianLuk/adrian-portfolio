// The router loads this before the first paint, so nothing heavy comes up
// front: the Transit's maths ship with the world, which the director asks.
import { REDUCED_MOTION } from "./reduced-motion";
import { worldHost, type WorldHost } from "./world-host";
import { transitBetween, transitTo, type PlaceView } from "./world-places";
import { TRANSIT_MAX_SECONDS } from "./world/rigs";

/** What the Transits need of the world host. */
type TransitHost = Pick<
  WorldHost,
  "director" | "subscribe" | "state" | "intent" | "live" | "holdWeather"
>;

/**
 * Transits between Places (home, the court of the Juice Bros Case study and
 * /rally, the Resume page's Skyline), and between the court's two views: the
 * camera flying from one to another. A
 * navigation between two of them hands the camera to the Camera
 * director's Transit the moment it starts (the click, or Back and Forward):
 * the camera flies from wherever it is to the destination page's pose, while
 * the page itself arrives under it at once. While the camera flies, the
 * world's root carries `data-transit` (the destination). For
 * TRANSIT_MAX_SECONDS at most from the navigation's start, and no longer
 * than the camera takes to land, it carries `data-arriving` (the
 * destination) too, which holds the destination's copy back (unseen, and out
 * of reach of focus) so it can arrive with the camera. Under reduced motion,
 * without a drawn world, or between any other pages, nothing flies.
 */
export function createWorldTransits(host: TransitHost) {
  const { director } = host;
  /** True from a Transit's start until it lands: the world is marked, its weather held. */
  let underway = false;
  let frame = 0;
  let holding: ReturnType<typeof setTimeout> | undefined;
  /** Who waits for the camera to land (see `landed`). */
  const waiting = new Set<() => void>();

  const reduced = () => window.matchMedia(REDUCED_MOTION).matches;

  /** The view of the page the router last committed to, if it has one. */
  function committed(): PlaceView | null {
    const intent = host.intent();
    return intent === "none" ? null : intent;
  }

  function mark(name: string, to: PlaceView | null) {
    const root = document.querySelector("[data-world-root]");
    if (to) root?.setAttribute(name, to);
    else root?.removeAttribute(name);
  }

  /** Holds `to`'s copy back, for the cap at most. */
  function hold(to: PlaceView) {
    clearTimeout(holding);
    mark("data-arriving", to);
    holding = setTimeout(release, TRANSIT_MAX_SECONDS * 1000);
  }

  /** Lets the copy in. */
  function release() {
    clearTimeout(holding);
    mark("data-arriving", null);
  }

  /** Lands: the camera goes back to the page's own view, in its weather. */
  function land() {
    release();
    cancelAnimationFrame(frame);
    if (!underway) return;
    underway = false;
    for (const resolve of waiting) resolve();
    waiting.clear();
    director.arrive();
    host.holdWeather(false);
    // A page that commits late lands the camera in the very view transition
    // it commits in, before that starts animating: the mark that turns its
    // crossfade off (see globals.css) stays until it is over, unless another
    // Transit has taken the mark meanwhile.
    const committing = (
      document as { activeViewTransition?: ViewTransition | null }
    ).activeViewTransition;
    if (!committing) return mark("data-transit", null);
    committing.finished
      .catch(() => {})
      .then(() => {
        if (!underway) mark("data-transit", null);
      });
  }

  /**
   * Moves the Transit on, frame by frame, until the director lands it: the
   * only thing that does (the world's frames only read where it is), so it
   * plans after a page's commit and keeps going between pages.
   */
  function tick() {
    director.advance(performance.now());
    if (director.flying()) frame = requestAnimationFrame(tick);
    else land();
  }

  // A lost GPU context, or no world: a Transit lands at once.
  const onState = () => {
    if (host.state() !== "drawn") land();
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
     * or calls off a Transit. True when the navigation is a Transit (it then
     * doesn't carry CROSSFADE_TRANSITION_TYPE).
     */
    navigate(url: string) {
      const flying = director.flying();
      const to = flying ? transitTo(url) : transitBetween(committed(), url);
      // On to where the camera is already flying (an anchor there, say).
      if (flying && to === flying) return true;
      if (
        !to ||
        reduced() ||
        !host.live() ||
        host.state() !== "drawn" ||
        !director.fly(to, performance.now())
      ) {
        land();
        return false;
      }
      cancelAnimationFrame(frame);
      underway = true;
      host.holdWeather(true);
      mark("data-transit", to);
      hold(to);
      frame = requestAnimationFrame(tick);
      return true;
    },

    /**
     * Resolves once no Transit is under way: at once, or as the camera lands
     * (or the Transit is called off). A page's heavy work waits on it, so
     * the Transit doesn't stutter.
     */
    landed() {
      return new Promise<void>((resolve) => {
        if (underway) waiting.add(resolve);
        else resolve();
      });
    },

    /** Lands any Transit under way and stops listening for good. */
    dispose() {
      land();
      unsubscribe();
      preference?.removeEventListener("change", onPreference);
    },
  };
}

let transits: ReturnType<typeof createWorldTransits> | null = null;

/** The visit's Transits, through its one world. */
export function worldTransits() {
  transits ??= createWorldTransits(worldHost());
  return transits;
}
