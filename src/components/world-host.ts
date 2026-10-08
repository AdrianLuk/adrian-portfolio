// No Three.js up front: it loads after the first paint, and only on a route
// that wants the world.
import { createCameraDirector } from "./camera-director";
import { scrolledStop } from "./home-panels";
import { REDUCED_MOTION } from "./reduced-motion";
import type { Place } from "./world-places";
import type { Measurement, World, WorldView } from "./world/scene";
import type { Weather } from "./world/weather";

/**
 * data-world, the canvas:
 * pending: not drawn yet, or its GPU context lost and awaiting restore.
 * drawn: rendered and showing (on home, the plate stands in for the DOM
 *   headline).
 * unavailable: no WebGL; the DOM headline, or the still backdrop, stays.
 */
export type WorldState = "pending" | "drawn" | "unavailable";

/**
 * What the page on screen wants from the world: home the hero (the opening,
 * the settled view, the scroll route), the Juice Bros Case study the court
 * (the camera still, in Toronto's weather), the Resume page the Outpost (the
 * camera still, the sky clear), any other page nothing (its still backdrop
 * stands in, and the world is parked, drawing nothing).
 */
export type WorldIntent = Place | "none";

/**
 * A page's claim on the world: the view it wants, and its weather. The hero
 * measures its headline against the world's canvas.
 */
export type WorldClaim =
  | {
      kind: "hero";
      weather: Weather;
      measure: (canvas: HTMLCanvasElement) => Measurement;
    }
  | { kind: "court"; weather: Weather }
  | { kind: "outpost" };

function viewFor(
  claim: WorldClaim | null,
  canvas: HTMLCanvasElement,
): WorldView | null {
  if (!claim) return null;
  if (claim.kind === "hero") {
    return { kind: "hero", measure: () => claim.measure(canvas) };
  }
  return { kind: claim.kind };
}

/**
 * Home and the court stand in Toronto's weather; the Outpost stands clear:
 * the Resume page has no weather of its own.
 */
const weatherFor = (claim: WorldClaim | null): Weather =>
  claim?.kind === "hero" || claim?.kind === "court" ? claim.weather : "clear";

/**
 * The one world, across every route: one canvas and one compiled scene,
 * kept for the whole visit (client navigation included), which each page
 * that wants it claims in turn.
 *
 * A page claims it by rendering a canvas of its own where the world should
 * stand (so its server HTML has one) and handing it to `attach`. The first
 * canvas attached becomes the world's; any later page's is swapped for it,
 * in place, with its classes, so the world keeps its GPU context and its
 * compiled shaders. `detach` parks the world when the page goes.
 */
export function createWorldHost() {
  /**
   * Where the camera is, from the first paint: the pages report to it
   * before the world has loaded, and the world asks it every frame.
   */
  const director = createCameraDirector({ homeStop: scrolledStop });

  let canvas: HTMLCanvasElement | null = null;
  /** The canvas of the page that holds the world now. */
  let slot: HTMLCanvasElement | null = null;
  let claim: WorldClaim | null = null;
  let world: World | null = null;
  let building: Promise<World | null> | null = null;
  let state: WorldState = "pending";
  const listeners = new Set<() => void>();
  /** Stops the world following the reduced-motion preference. */
  let unfollow: (() => void) | null = null;
  let disposed = false;

  function setState(next: WorldState) {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  /** True while a transit holds the weather it left in until it lands. */
  let weatherHeld = false;

  /** Shows the claim's view, in its weather (unless a transit holds it). */
  function show() {
    if (!world || !canvas) return;
    if (!weatherHeld) world.setWeather(weatherFor(claim));
    world.setView(viewFor(claim, canvas));
  }

  async function build(): Promise<World | null> {
    const target = canvas;
    if (!target) return null;
    const reduced = window.matchMedia(REDUCED_MOTION);
    const motion = !reduced.matches;
    const opened = claim;
    try {
      const [{ createWorld }] = await Promise.all([
        import("./world/scene"),
        document.fonts.ready,
      ]);
      const created = await createWorld(target, {
        motion,
        weather: weatherFor(opened),
        director,
        view: viewFor(opened, target),
        onFrame: () => setState("drawn"),
        onLost: () => setState("pending"),
      });
      if (disposed) {
        created?.dispose();
        return null;
      }
      if (!created) {
        setState("unavailable");
        return null;
      }
      world = created;
      // The page, or the preference, changed while the shaders compiled.
      if (claim !== opened) show();
      if (motion !== !reduced.matches) world.setMotion(!reduced.matches);
      const follow = () => world?.setMotion(!reduced.matches);
      reduced.addEventListener("change", follow);
      unfollow = () => reduced.removeEventListener("change", follow);
      return world;
    } catch {
      // A stale chunk after a deploy, say: the page's fallback stays.
      setState("unavailable");
      return null;
    }
  }

  return {
    director,

    /** For useSyncExternalStore: the world's state, and its changes. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    state: () => state,

    /** What the page on screen wants from the world. */
    intent: (): WorldIntent => claim?.kind ?? "none",

    /**
     * True once the world is built: a page arriving now joins it as it is
     * (home lands settled, without the opening) rather than starting it.
     */
    live: () => world !== null,

    /** The world, once built; null before, or without WebGL. */
    world: () => world,

    /**
     * Claims the world for the page whose canvas is `pageCanvas`, and
     * returns the world's canvas, now standing in its place.
     */
    attach(pageCanvas: HTMLCanvasElement, next: WorldClaim) {
      if (!canvas) canvas = pageCanvas;
      else if (canvas !== pageCanvas && pageCanvas.isConnected) {
        canvas.className = pageCanvas.className;
        pageCanvas.replaceWith(canvas);
      }
      slot = pageCanvas;
      claim = next;
      director.show(next.kind);
      show();
      return canvas;
    },

    /** The page whose canvas is `pageCanvas` has gone: parks the world. */
    detach(pageCanvas: HTMLCanvasElement) {
      if (slot !== pageCanvas) return;
      slot = null;
      claim = null;
      director.show(null);
      world?.setView(null);
    },

    /**
     * Builds the world on the attached canvas, once: every later call gets
     * the same world. Null without WebGL.
     */
    start() {
      building ??= build();
      return building;
    },

    /**
     * Holds the weather as it is while the camera flies, however the pages
     * change under it; released, the world takes the page's own (clear at
     * the Outpost, Toronto's at home and at the court), as the camera lands.
     */
    holdWeather(hold: boolean) {
      weatherHeld = hold;
      if (!hold && claim) world?.setWeather(weatherFor(claim));
    },

    /**
     * Tears the world down: its GPU context, its scene and every listener.
     * The visit's own host lives as long as the page; tests start afresh.
     */
    dispose() {
      disposed = true;
      unfollow?.();
      unfollow = null;
      world?.dispose();
      world = null;
      listeners.clear();
      canvas = slot = null;
      claim = null;
    },
  };
}

export type WorldHost = ReturnType<typeof createWorldHost>;

let host: WorldHost | null = null;

/** The visit's one world host. */
export function worldHost() {
  host ??= createWorldHost();
  return host;
}

/** Whether a page mounting now joins a live world (never on the server). */
export const joinsLiveWorld = () =>
  typeof window !== "undefined" && worldHost().live();
