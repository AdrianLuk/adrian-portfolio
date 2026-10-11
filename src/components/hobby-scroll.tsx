"use client";

import { useEffect } from "react";
import { about } from "@/content/site";
import { afterFirstPaint } from "./after-first-paint";
import { HOBBY_SCROLL_ROUTE } from "./lit-sites";
import { prefersReducedMotion, subscribeToMotion } from "./reduced-motion";
import type { ScrollRoute } from "./scroll-route";
import { worldHost } from "./world-host";

/** The About page's panels in the Hobby route's order, one per stop after the first. */
const PANELS = [about.pickleball.id, about.baseball.id, about.kpop.id];

/**
 * The About page's Hobby route: with motion allowed, scrolling carries the
 * camera from the court to the Diamond and into the Arena, each panel
 * lighting as it enters, on the scroll route engine home's route runs on.
 * GSAP loads after the first paint. Under reduced motion it never runs (or
 * stops), and the camera holds the route's first stop.
 */
export function HobbyScroll() {
  useEffect(() => {
    const host = worldHost();
    let route: ScrollRoute | null = null;
    let loading = false;
    let cancelled = false;

    async function start() {
      if (route || loading) return;
      loading = true;
      let createScrollRoute;
      try {
        ({ createScrollRoute } = await import("./scroll-route"));
      } catch {
        // A stale chunk after a deploy, say: the camera holds its first stop.
        return;
      } finally {
        loading = false;
      }
      if (cancelled || route || prefersReducedMotion()) return;
      const panels = PANELS.map((id) => document.getElementById(id));
      if (panels.some((panel) => !panel)) {
        console.error("A Hobby route panel is missing: the route won't start");
        return;
      }
      route = createScrollRoute({
        director: host.director,
        panels: panels as HTMLElement[],
        route: HOBBY_SCROLL_ROUTE,
        locateSite: () => host.world()?.placeSite ?? null,
      });
    }

    function stop() {
      route?.kill();
      route = null;
    }

    const follow = () => (prefersReducedMotion() ? stop() : start());
    const unsubscribe = subscribeToMotion(follow);
    const cancelStart = afterFirstPaint(follow);
    return () => {
      cancelled = true;
      cancelStart();
      unsubscribe();
      stop();
    };
  }, []);

  return null;
}
