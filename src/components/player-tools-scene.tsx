"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { afterFirstPaint } from "./after-first-paint";
import { PINNED_MEDIA } from "./player-tools-pinning";

type Scene = { kill(): void };

/**
 * The Player tools scene's motion island. The scene pins (its layout is CSS)
 * only while its root carries `data-scene`: the page's early script sets it
 * to "pending" before the first paint, this island takes it over ("loading")
 * and marks it "pinned" once the motion runs. If the motion's code fails to
 * load, or the layout stops applying (a resize across the breakpoint, motion
 * turned off), it drops the mark and the scene is the stacked list again.
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

    // Taken over: the early script's fallback no longer applies.
    if (root.getAttribute("data-scene") === "pending") {
      root.setAttribute("data-scene", "loading");
    }

    function unpin() {
      scene?.kill();
      scene = null;
      root!.removeAttribute("data-scene");
    }

    async function sync() {
      if (!media.matches) return unpin();
      if (scene || loading) return;
      loading = true;
      let createPlayerToolsMotion;
      try {
        ({ createPlayerToolsMotion } = await import("./player-tools-motion"));
      } catch {
        // A stale chunk after a deploy, say: the stacked list.
        if (!cancelled) unpin();
        return;
      } finally {
        loading = false;
      }
      if (cancelled || scene || !media.matches) return;
      // Laid out first, so the motion measures the pinned layout.
      root!.setAttribute("data-scene", "pinned");
      scene = createPlayerToolsMotion(root!);
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
      unpin();
    };
  }, []);

  return (
    // The early script may have marked the root before hydration.
    <div
      ref={ref}
      data-player-tools
      className={className}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
