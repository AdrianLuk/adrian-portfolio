"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WorldState } from "./hero-world";
import type { View } from "./world/scene";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Runs `run` once the page's first contentful paint is in, in a task of its
 * own after the next frame. Fonts that may block for a moment can leave the
 * first frame or two with nothing contentful in them, so the frame alone
 * isn't enough. Returns a canceller.
 */
function afterFirstPaint(run: () => void) {
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: PerformanceObserver | undefined;
  const next = () => {
    frame = requestAnimationFrame(() => {
      timer = setTimeout(run, 0);
    });
  };
  const painted = () =>
    performance.getEntriesByName("first-contentful-paint").length > 0;
  if (
    painted() ||
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes?.includes("paint")
  ) {
    next();
  } else {
    observer = new PerformanceObserver(() => {
      if (!painted()) return;
      observer?.disconnect();
      next();
    });
    observer.observe({ type: "paint" });
  }
  return () => {
    observer?.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}

/**
 * The world seen from the outpost, where the home page's scroll route ends,
 * held fixed behind the page. `children` is the still backdrop: the first
 * paint, and what stays without WebGL or while the GPU context is lost. The
 * Three.js scene loads after the first paint and fades in over it once its
 * first frame has rendered. The camera never moves; with motion allowed the
 * scene does (motes, lights, windows), and under reduced motion it is one
 * still frame, following the preference if it changes.
 */
export function OutpostWorld({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<WorldState>("pending");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia(REDUCED_MOTION);
    let view: View | null = null;
    let cancelled = false;

    async function start() {
      if (!canvas) return;
      const motion = !reduced.matches;
      try {
        const { createOutpostView } = await import("./world/scene");
        if (cancelled) return;
        const created = await createOutpostView(canvas, {
          motion,
          onFrame: () => {
            if (!cancelled) setState("drawn");
          },
          onLost: () => setState("pending"),
        });
        if (cancelled) {
          created?.dispose();
          return;
        }
        view = created;
        if (!view) setState("unavailable");
        // The preference changed while the shaders compiled.
        else if (motion !== !reduced.matches) view.setMotion(!reduced.matches);
      } catch {
        // A stale chunk after a deploy, say: the still backdrop stays.
        if (!cancelled) setState("unavailable");
      }
    }

    const resize = new ResizeObserver(() => view?.layout());
    resize.observe(canvas);

    const onPreference = () => view?.setMotion(!reduced.matches);
    reduced.addEventListener("change", onPreference);

    // Three.js is the page's heaviest code: it never holds up the first paint.
    const cancelStart = afterFirstPaint(start);

    return () => {
      cancelled = true;
      cancelStart();
      resize.disconnect();
      reduced.removeEventListener("change", onPreference);
      view?.dispose();
    };
  }, []);

  // After the backdrop, so it draws over it; both sit at the back of the
  // page's stacking context.
  return (
    <div data-world={state} className="group contents">
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh w-full opacity-0 group-data-[world=drawn]:opacity-100 motion-safe:transition-opacity motion-safe:duration-1000"
      />
    </div>
  );
}
