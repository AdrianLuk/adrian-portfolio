"use client";

import type { gsap } from "gsap";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ScrollRoute } from "./scroll-route";
import { highlightAnchor } from "@/content/site";
// Plain data only: Three.js and GSAP load after the first paint.
import {
  FLIGHT_START_RIG,
  routeRig,
  SETTLED_RIG,
  SITE_PLAN,
  type FlightRig,
} from "./world/rigs";
import type { CreditPlacement, Measurement, World } from "./world/scene";
import { parseWeather, type Weather } from "./world/weather";

/**
 * data-state, the opening:
 * loading: server HTML, before any script, until the fly-in's timeline has
 *   loaded. With motion allowed it already looks like the flight's start (the
 *   `opening` variant), so the settled frame never shows first; without
 *   scripts it is the still hero, headline and captions.
 * flight: the fly-in is playing; the credits appear in the scene in turn.
 * settled: the fly-in finished, or was skipped.
 * reduced: prefers-reduced-motion. It never flies: the settled frame, with
 *   the credits as static captions.
 */
export type HeroState = "loading" | "flight" | "settled" | "reduced";

/**
 * data-world, the canvas:
 * pending: not drawn yet, or its GPU context lost and awaiting restore.
 * drawn: rendered and showing (the plate stands in for the DOM headline).
 * unavailable: no WebGL; the DOM headline stays.
 */
export type WorldState = "pending" | "drawn" | "unavailable";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
/** On the server the preference is unknown: the hero is "loading". */
const unknownMotion = () => null;

/** Room kept between a credit card and the hero's edges, in CSS pixels. */
const EDGE = 24;

/**
 * Canvas-relative boxes of each headline word, from the text itself, as they
 * stand with the page at the top (where the camera is settled): a canvas held
 * fixed behind the page stays put as the headline scrolls away.
 */
function measure(canvas: HTMLCanvasElement, root: HTMLElement): Measurement {
  const host = canvas.getBoundingClientRect();
  const scrolled =
    getComputedStyle(canvas).position === "fixed" ? window.scrollY : 0;
  const range = document.createRange();
  const words = Array.from(
    root.querySelectorAll<HTMLElement>("[data-plate-word]"),
    (el) => {
      range.selectNodeContents(el);
      const box = range.getBoundingClientRect();
      return {
        text: (el.textContent ?? "").toUpperCase(),
        rect: {
          left: box.left - host.left,
          top: box.top + scrolled - host.top,
          width: box.width,
          height: box.height,
        },
      };
    },
  );
  return { width: host.width, height: host.height, words };
}

/**
 * Where title card `index` stands, in normalised device coordinates: round
 * the frame, clear of the plate flying in dead centre (corner to corner on a
 * wide screen, above and below it on a narrow one).
 */
function creditSpot(index: number, aspect: number) {
  if (aspect < 0.9) return { x: 0, y: index % 2 === 0 ? 0.5 : -0.5 };
  const spots = [
    { x: -0.42, y: -0.42 },
    { x: 0.42, y: 0.42 },
    { x: -0.42, y: 0.42 },
    { x: 0.42, y: -0.42 },
  ];
  return spots[index % spots.length];
}

/** Moves an element, by transform only (so nothing reflows), to a point. */
function moveTo(el: HTMLElement, root: HTMLElement, at: CreditPlacement) {
  // Never larger than fits across the hero.
  const scale = Math.min(
    at.scale,
    (root.clientWidth - 2 * EDGE) / el.offsetWidth,
  );
  // offsetLeft/Top are the layout position, untouched by transforms.
  const width = el.offsetWidth * scale;
  const height = el.offsetHeight * scale;
  const x = Math.min(
    Math.max(at.x, width / 2 + EDGE),
    root.clientWidth - width / 2 - EDGE,
  );
  const y = Math.min(
    Math.max(at.y, height / 2 + EDGE),
    root.clientHeight - height / 2 - EDGE,
  );
  const dx = x - (el.offsetLeft + el.offsetWidth / 2);
  const dy = y - (el.offsetTop + el.offsetHeight / 2);
  el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/**
 * The hero's root, its world and its opening. With motion allowed, the hero
 * holds its copy back from the first paint, and the fly-in plays: a GSAP timeline (loaded only then) drives the camera down the canyon
 * to the name plate while the credits appear one at a time, and the hero copy
 * lands once it settles. The Three.js scene loads after first paint and joins
 * the flight wherever the timeline has got to.
 */
export function HeroWorld({
  label,
  weather,
  className = "",
  children,
}: {
  label: string;
  /** Toronto's weather, as the server last saw it. */
  weather: Weather;
  className?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The world is built once, with the weather the page arrived with.
  const weatherRef = useRef(weather);
  const reducedMotion = useSyncExternalStore(
    subscribeToMotion,
    prefersReducedMotion,
    unknownMotion,
  );
  /** True once the flight's timeline is running. */
  const [started, setStarted] = useState(false);
  /** True once the flight has run out, been skipped, or been called off. */
  const [landed, setLanded] = useState(false);
  const [worldState, setWorldState] = useState<WorldState>("pending");
  const state: HeroState =
    reducedMotion === null
      ? "loading"
      : reducedMotion
        ? "reduced"
        : landed
          ? "settled"
          : started
            ? "flight"
            : "loading";

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reduced = window.matchMedia(REDUCED_MOTION);
    const cards = Array.from(
      root.querySelectorAll<HTMLElement>("[data-credit-card]"),
    );
    const action = root.querySelector<HTMLElement>("[data-hero-action]");

    // The world reads this on every frame; the timeline animates it in place.
    // With motion allowed it starts where the flight does, so a world that
    // draws before the timeline has loaded never shows the settled frame first.
    const rig: FlightRig = {
      ...(reduced.matches ? SETTLED_RIG : FLIGHT_START_RIG),
    };
    // The scroll route's state, which the world also reads on every frame.
    const route = routeRig();
    let world: World | null = null;
    let timeline: gsap.core.Timeline | null = null;
    let scrollRoute: ScrollRoute | null = null;
    /** True from asking for the scroll route until it is stopped. */
    let routing = false;
    let flying = false;
    /** True once the hero has landed, for good: the flight never replays. */
    let hasLanded = false;
    let cancelled = false;

    function placeCredits() {
      if (!flying || !root) return;
      const aspect = root.clientWidth / Math.max(1, root.clientHeight);
      cards.forEach((el, i) => {
        if (!(parseFloat(el.style.opacity) > 0)) return;
        const spot = creditSpot(i, aspect);
        // Set flush to the side of the frame it stands on.
        el.style.textAlign =
          spot.x < 0 ? "left" : spot.x > 0 ? "right" : "center";
        const at = world?.placeCredit(i, spot) ?? {
          x: ((spot.x + 1) / 2) * root.clientWidth,
          y: ((1 - spot.y) / 2) * root.clientHeight,
          scale: 1,
        };
        moveTo(el, root, at);
      });
    }

    function clearCredits() {
      for (const el of cards) {
        el?.style.removeProperty("opacity");
        el?.style.removeProperty("transform");
      }
    }

    /** Lands on the settled pose, whether the flight ran out or was skipped. */
    function land() {
      hasLanded = true;
      flying = false;
      Object.assign(rig, SETTLED_RIG);
      setLanded(true);
      if (!reduced.matches) startRoute();
    }

    /** Once landed, with motion allowed, scrolling carries the camera on. */
    async function startRoute() {
      if (routing) return;
      routing = true;
      let createScrollRoute;
      try {
        ({ createScrollRoute } = await import("./scroll-route"));
      } catch {
        // A stale chunk after a deploy, say: the camera stays settled.
        routing = false;
        return;
      }
      // Called off meanwhile, or already started by a call that loaded first.
      if (cancelled || !routing || scrollRoute) return;
      scrollRoute = createScrollRoute({
        route,
        // Each site's own panel, by its Highlight.
        panels: SITE_PLAN.map((site) =>
          document.getElementById(highlightAnchor(site.highlight)),
        ).filter((el) => el !== null),
        locateSite: () => world?.placeSite ?? null,
      });
    }

    function stopRoute() {
      routing = false;
      scrollRoute?.kill();
      scrollRoute = null;
    }

    async function fly() {
      flying = true;
      let createFlightTimeline;
      try {
        ({ createFlightTimeline } = await import("./flight-timeline"));
      } catch {
        // A stale chunk after a deploy, say: land without the flight.
        if (!cancelled) land();
        return;
      }
      if (cancelled || !flying) return;
      timeline = createFlightTimeline({
        rig,
        credits: cards,
        onUpdate: placeCredits,
        onComplete: land,
      });
      // The opening starts with its timeline, not before it has loaded.
      setStarted(true);
      placeCredits();
    }

    function endFlight() {
      if (!flying) return;
      if (timeline) timeline.progress(1);
      else land();
    }

    function skipFlight() {
      if (!flying) return;
      // The Skip control fades with the credits: hand focus on to the action.
      action?.focus();
      endFlight();
    }

    const onClick = (event: MouseEvent) => {
      if ((event.target as Element).closest("[data-credit-skip] button")) {
        skipFlight();
      }
    };
    root.addEventListener("click", onClick);

    async function start() {
      if (!root || !canvas) return;
      try {
        const [{ createWorld }] = await Promise.all([
          import("./world/scene"),
          document.fonts.ready,
        ]);
        if (cancelled) return;
        const created = await createWorld(canvas, {
          motion: !reduced.matches,
          // ?weather=snow|rain|clear previews a condition. Read here, not on
          // the server, so the page itself stays static.
          weather:
            parseWeather(
              new URLSearchParams(window.location.search).get("weather"),
            ) ?? weatherRef.current,
          rig,
          route,
          measure: () => measure(canvas, root),
          onFrame: () => {
            if (!cancelled) setWorldState("drawn");
          },
          onLost: () => setWorldState("pending"),
        });
        if (cancelled) {
          created?.dispose();
          return;
        }
        world = created;
        if (!world) unavailable();
      } catch {
        // A stale chunk after a deploy, say: the DOM headline stays.
        if (!cancelled) unavailable();
      }
    }

    /** No world to fly through: end the flight so the headline shows. */
    function unavailable() {
      setWorldState("unavailable");
      endFlight();
    }

    const resize = new ResizeObserver(() => {
      world?.layout();
      placeCredits();
    });
    resize.observe(root);
    // The canvas too: it fills the hero, or the viewport once it is held
    // behind the whole page.
    resize.observe(canvas);
    const echo = root.querySelector("[data-plate-echo]");
    if (echo) resize.observe(echo);

    // Any change of preference calls the flight off for good: reducing motion
    // mid-flight lands at once, and allowing it again brings the settled frame
    // alive rather than replaying the opening. Reducing it stops the scroll
    // route too, back to the settled frame.
    const onPreference = () => {
      timeline?.kill();
      // Back to static captions, should motion now be reduced.
      clearCredits();
      if (reduced.matches) stopRoute();
      land();
      world?.setMotion(!reduced.matches);
    };
    reduced.addEventListener("change", onPreference);

    // A frame callback runs just before the next paint; the task it queues
    // runs after it. Both the flight's timeline and the world load from there,
    // so neither library holds up the first paint. A preference changed in
    // the meantime has already landed the hero: then there's no flight.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (!reduced.matches && !hasLanded) fly();
        start();
      }, 0);
    });

    return () => {
      cancelled = true;
      flying = false;
      timeline?.kill();
      stopRoute();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize.disconnect();
      root.removeEventListener("click", onClick);
      reduced.removeEventListener("change", onPreference);
      world?.dispose();
    };
  }, []);

  // The canvas fills the hero and fades into the page below it, until the
  // camera flies: then it is held fixed behind the whole page (the page sets
  // the stacking context it sits at the back of), and the scroll carries the
  // camera on. Under reduced motion it stays the hero's still frame.
  return (
    <section
      ref={rootRef}
      aria-label={label}
      data-state={state}
      data-world={worldState}
      className={`group relative overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0 [mask-image:linear-gradient(to_bottom,black_88%,transparent)] opening:fixed opening:h-lvh opening:[mask-image:none] group-data-[state=settled]:fixed group-data-[state=settled]:h-lvh group-data-[state=settled]:[mask-image:none] group-data-[world=drawn]:opacity-100 motion-safe:transition-opacity motion-safe:duration-1000"
      />
      {children}
    </section>
  );
}
