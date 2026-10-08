"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { afterFirstPaint } from "./after-first-paint";
import { useWorldState } from "./use-world-state";
import { worldHost } from "./world-host";
import { parseWeather, type Weather } from "./world/weather";

/**
 * The world seen from the court, Juice Bros' Lit site, held fixed behind the
 * Case study for the whole visit, in Toronto's weather (only what lies on
 * the ground: nothing falls at the court). `children` is the court still:
 * the first paint, and what stays without WebGL or while the GPU context is
 * lost. On a direct load the Three.js scene loads after the first paint and
 * fades in over it once its first frame has rendered; arriving from another
 * Place, the world is already live, and the camera flies there (a Transit,
 * world-transits.ts). Once there the camera holds still, low behind the
 * baseline; with motion allowed the floodlit court's ball rallies, and under
 * reduced motion it is one still frame, following the preference if it
 * changes.
 */
export function CourtWorld({
  weather,
  children,
}: {
  weather: Weather;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The weather the page arrived with: the world takes it once the page
  // claims it.
  const weatherRef = useRef(weather);
  const host = worldHost();
  const state = useWorldState();

  // Before the page paints, so a page arriving into a live world never shows
  // a frame without it (the still bare under a transit).
  useLayoutEffect(() => {
    const pageCanvas = canvasRef.current;
    if (!pageCanvas) return;
    // The world's canvas, standing in this page's own from now on.
    const canvas = host.attach(pageCanvas, {
      kind: "court",
      // ?weather=snow|rain|clear previews a condition. Read here, not on the
      // server, so the page itself stays static.
      weather:
        parseWeather(
          new URLSearchParams(window.location.search).get("weather"),
        ) ?? weatherRef.current,
    });

    const resize = new ResizeObserver(() => host.world()?.layout());
    resize.observe(canvas);

    // Three.js is the page's heaviest code: it never holds up the first paint.
    const cancelStart = afterFirstPaint(() => host.start());

    return () => {
      cancelStart();
      resize.disconnect();
      // The world stays, parked, for the next page that wants it.
      host.detach(pageCanvas);
    };
  }, [host]);

  // After the still, so it draws over it; both sit at the back of the page's
  // stacking context. Never dimmed: the copy reads over the world as it is.
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
