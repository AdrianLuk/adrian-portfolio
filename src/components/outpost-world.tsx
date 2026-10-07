"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { afterFirstPaint } from "./after-first-paint";
import { worldHost, type WorldState } from "./world-host";

const serverWorldState = (): WorldState => "pending";

/**
 * The world seen from the outpost, where the home page's scroll route ends,
 * held fixed behind the page. `children` is the still backdrop: the first
 * paint, and what stays without WebGL or while the GPU context is lost. On a
 * direct load the Three.js scene loads after the first paint and fades in
 * over it once its first frame has rendered; arriving from home, the world
 * is already live and simply turns to the Outpost. The camera never moves;
 * with motion allowed the scene does (motes, lights, windows), and under
 * reduced motion it is one still frame, following the preference if it
 * changes.
 */
export function OutpostWorld({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const host = worldHost();
  const state = useSyncExternalStore(
    host.subscribe,
    host.state,
    serverWorldState,
  );

  useEffect(() => {
    const pageCanvas = canvasRef.current;
    if (!pageCanvas) return;
    // The world's canvas, standing in this page's own from now on.
    const canvas = host.attach(pageCanvas, { kind: "outpost" });

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
