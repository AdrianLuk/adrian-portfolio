"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Measurement, World } from "./world/scene";

/**
 * loading: server HTML, the world still on its way, or its GPU context lost
 *   and awaiting restore (the DOM headline shows).
 * settled: the settled frame has rendered and the world keeps living.
 * reduced: prefers-reduced-motion; the settled frame, rendered once, no loop.
 * unavailable: no WebGL; the DOM headline stays.
 */
export type HeroState = "loading" | "settled" | "reduced" | "unavailable";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

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
 * The hero's root and its world. The Three.js scene loads only after first
 * paint, so the server-rendered headline is what paints (and is the LCP); the
 * canvas then fades in behind it with the plate standing exactly where the
 * headline's display echo sits.
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
  const [state, setState] = useState<HeroState>("loading");

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reduced = window.matchMedia(REDUCED_MOTION);
    const settledState = () => (reduced.matches ? "reduced" : "settled");
    let world: World | null = null;
    let cancelled = false;

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
          measure: () => measure(canvas, root),
          onFrame: () => {
            if (!cancelled) setState(settledState());
          },
          onLost: () => setState("loading"),
        });
        if (cancelled) {
          created?.dispose();
          return;
        }
        world = created;
        if (!world) setState("unavailable");
      } catch {
        // A stale chunk after a deploy, say: the DOM headline stays.
        if (!cancelled) setState("unavailable");
      }
    }

    const resize = new ResizeObserver(() => world?.layout());
    resize.observe(root);
    const echo = root.querySelector("[data-plate-echo]");
    if (echo) resize.observe(echo);

    const onPreference = () => {
      if (!world) return;
      world.setMotion(!reduced.matches);
      setState(settledState());
    };
    reduced.addEventListener("change", onPreference);

    // A frame callback runs just before the next paint; the task it queues runs after it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(start, 0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize.disconnect();
      reduced.removeEventListener("change", onPreference);
      world?.dispose();
    };
  }, []);

  return (
    <section
      ref={rootRef}
      aria-label={label}
      data-state={state}
      className={`group relative isolate overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0 [mask-image:linear-gradient(to_bottom,black_72%,transparent)] group-data-[state=reduced]:opacity-100 group-data-[state=settled]:opacity-100 motion-safe:transition-opacity motion-safe:duration-1000"
      />
      {children}
    </section>
  );
}
