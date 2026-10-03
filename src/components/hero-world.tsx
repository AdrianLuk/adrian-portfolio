"use client";

import type { gsap } from "gsap";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  FLIGHT_START_RIG,
  SETTLED_RIG,
  type FlightRig,
} from "./world/flight";
import type { CreditPlacement, Measurement, World } from "./world/scene";

/**
 * data-state, the opening:
 * loading: server HTML, before any script (static headline and captions),
 *   until the fly-in's timeline has loaded.
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
const EDGE = 16;

/**
 * How much larger a credit card stands in the scene than its caption, so it
 * reads at a glance mid-flight. By transform, so nothing reflows.
 */
const CREDIT_SIZE = { wide: 1.6, narrow: 1.35 } as const;

/** The card's backdrop reaches this far past the text on each side. */
const CARD_INSET = 12;

/** Canvas-relative boxes of each headline word, from the text itself. */
function measure(canvas: HTMLCanvasElement, root: HTMLElement): Measurement {
  const host = canvas.getBoundingClientRect();
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
          top: box.top - host.top,
          width: box.width,
          height: box.height,
        },
      };
    },
  );
  return { width: host.width, height: host.height, words };
}

/**
 * Where credit `index` appears, in normalised device coordinates: below the
 * plate (which flies in dead centre), alternating sides, or centred on a
 * narrow screen.
 */
function creditSpot(index: number, aspect: number) {
  if (aspect < 0.9) return { x: 0, y: index % 2 === 0 ? -0.22 : -0.44 };
  return { x: index % 2 === 0 ? -0.32 : 0.32, y: -0.26 };
}

/** Moves an element, by transform only (so nothing reflows), to a point. */
function moveTo(el: HTMLElement, root: HTMLElement, at: CreditPlacement) {
  // Never larger than fits across the hero, backdrop and all.
  const scale = Math.min(
    at.scale,
    (root.clientWidth - 2 * EDGE) / (el.offsetWidth + 2 * CARD_INSET),
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
 * The hero's root, its world and its opening. The server-rendered headline is
 * what paints first (and is the LCP); then, with motion allowed, the fly-in
 * plays: a GSAP timeline (loaded only then) drives the camera down the canyon
 * to the name plate while the credits appear one at a time, and the hero copy
 * lands once it settles. The Three.js scene loads after first paint and joins
 * the flight wherever the timeline has got to.
 */
export function HeroWorld({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const lines = Array.from(
      root.querySelectorAll<HTMLElement>("[data-credit]"),
    );
    const skip = root.querySelector<HTMLElement>("[data-credit-skip]");
    const action = root.querySelector<HTMLElement>("[data-hero-action]");

    // The world reads this on every frame; the timeline animates it in place.
    // With motion allowed it starts where the flight does, so a world that
    // draws before the timeline has loaded never shows the settled frame first.
    const rig: FlightRig = {
      ...(reduced.matches ? SETTLED_RIG : FLIGHT_START_RIG),
    };
    let world: World | null = null;
    let timeline: gsap.core.Timeline | null = null;
    let flying = false;
    let cancelled = false;

    function placeCredits() {
      if (!flying || !root) return;
      const aspect = root.clientWidth / Math.max(1, root.clientHeight);
      const size = aspect < 0.9 ? CREDIT_SIZE.narrow : CREDIT_SIZE.wide;
      lines.forEach((el, i) => {
        if (!(parseFloat(el.style.opacity) > 0)) return;
        const spot = creditSpot(i, aspect);
        const at = world?.placeCredit(i, spot) ?? {
          x: ((spot.x + 1) / 2) * root.clientWidth,
          y: ((1 - spot.y) / 2) * root.clientHeight,
          scale: 1,
        };
        moveTo(el, root, { ...at, scale: at.scale * size });
      });
      // Skip waits at the bottom of the hero, clear of the plate.
      if (skip) {
        moveTo(skip, root, {
          x: skip.offsetLeft + skip.offsetWidth / 2,
          y: root.clientHeight,
          scale: 1,
        });
      }
    }

    function clearCredits() {
      for (const el of [...lines, skip]) {
        el?.style.removeProperty("opacity");
        el?.style.removeProperty("transform");
      }
    }

    /** Lands on the settled pose, whether the flight ran out or was skipped. */
    function land() {
      flying = false;
      Object.assign(rig, SETTLED_RIG);
      setLanded(true);
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
        credits: lines,
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
          rig,
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
    const echo = root.querySelector("[data-plate-echo]");
    if (echo) resize.observe(echo);

    // Any change of preference calls the flight off for good: reducing motion
    // mid-flight lands at once, and allowing it again brings the settled frame
    // alive rather than replaying the opening.
    const onPreference = () => {
      timeline?.kill();
      // Back to static captions, should motion now be reduced.
      clearCredits();
      land();
      world?.setMotion(!reduced.matches);
    };
    reduced.addEventListener("change", onPreference);

    if (!reduced.matches) fly();

    // A frame callback runs just before the next paint; the task it queues runs after it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(start, 0);
    });

    return () => {
      cancelled = true;
      flying = false;
      timeline?.kill();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize.disconnect();
      root.removeEventListener("click", onClick);
      reduced.removeEventListener("change", onPreference);
      world?.dispose();
    };
  }, []);

  return (
    <section
      ref={rootRef}
      aria-label={label}
      data-state={state}
      data-world={worldState}
      className={`group relative isolate overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0 [mask-image:linear-gradient(to_bottom,black_72%,transparent)] group-data-[world=drawn]:opacity-100 motion-safe:transition-opacity motion-safe:duration-1000"
      />
      {children}
    </section>
  );
}
