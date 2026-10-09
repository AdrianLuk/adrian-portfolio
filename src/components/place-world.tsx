"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { afterFirstPaint } from "./after-first-paint";
import { useWorldState } from "./use-world-state";
import { worldHost, type WorldClaim } from "./world-host";
import { previewWeather } from "./world/weather";

/** A claim on the world from a page whose camera holds still. */
export type StillClaim = Exclude<WorldClaim, { kind: "hero" }>;

/**
 * A Place's world on a page whose camera holds still there, held fixed
 * behind the page: the court for the Juice Bros Case study, the Skyline for
 * the Resume page, each in Toronto's weather, though only what lies on the
 * ground (nothing falls there). `children` is the page's still of the world:
 * the first paint, and what stays without WebGL or while the GPU context is
 * lost.
 *
 * On a direct load the Three.js scene loads after the first paint and fades
 * in over the still once its first frame has rendered; arriving from another
 * Place, the world is already live, and the camera flies there (a Transit,
 * world-transits.ts). Once there the camera holds still; with motion allowed
 * the scene moves round it (motes, lights, windows, and at the court the
 * rally ball), and under reduced motion it is one still frame, following the
 * preference if it changes.
 */
export function PlaceWorld({
  claim,
  children,
}: {
  claim: StillClaim;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The claim the page arrived with (its weather): the world takes it once
  // the page claims it.
  const claimRef = useRef(claim);
  const host = worldHost();
  const state = useWorldState();

  // Before the page paints, so a page arriving into a live world never shows
  // a frame without it (the still bare under a Transit).
  useLayoutEffect(() => {
    const pageCanvas = canvasRef.current;
    if (!pageCanvas) return;
    const arrived = claimRef.current;
    // The world's canvas, standing in this page's own from now on.
    const canvas = host.attach(
      pageCanvas,
      // ?weather=snow|rain|clear previews a condition.
      { ...arrived, weather: previewWeather(arrived.weather) },
    );

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
  // stacking context.
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
