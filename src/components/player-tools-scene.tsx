"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { PINNED_MEDIA } from "./active-tool";
import { afterFirstPaint } from "./after-first-paint";

type Scene = { kill(): void };

/**
 * The Player tools scene's motion island. The page lays the scene out (the
 * copy, and the stage pinned beside it by CSS where it fits, from the first
 * paint); this only switches the stage between tools as the reader goes. It
 * runs while the pinned layout applies and stops when it no longer does (a
 * resize across the breakpoint, or motion turned off), leaving the stacked
 * list as the server drew it.
 */
export function PlayerToolsScene({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const media = window.matchMedia(PINNED_MEDIA);
    let scene: Scene | null = null;
    let loading = false;
    let cancelled = false;

    async function sync() {
      if (!media.matches) {
        scene?.kill();
        scene = null;
        root!.removeAttribute("data-scene");
        return;
      }
      if (scene || loading) return;
      loading = true;
      let createPlayerToolsMotion;
      try {
        ({ createPlayerToolsMotion } = await import("./player-tools-motion"));
      } catch {
        // A stale chunk after a deploy, say: the stage stays on the first tool.
        return;
      } finally {
        loading = false;
      }
      if (cancelled || scene || !media.matches) return;
      scene = createPlayerToolsMotion(root!);
      root!.setAttribute("data-scene", "pinned");
    }

    // GSAP loads after the first paint, as it does on the home page.
    const cancelStart = afterFirstPaint(() => {
      sync();
      media.addEventListener("change", sync);
    });
    return () => {
      cancelled = true;
      cancelStart();
      media.removeEventListener("change", sync);
      scene?.kill();
      root.removeAttribute("data-scene");
    };
  }, []);

  return (
    <div ref={ref} data-player-tools className={className}>
      {children}
    </div>
  );
}
