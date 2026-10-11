"use client";

import { encore } from "@/content/site";
import { sectionLabel } from "@/app/styles";
import { useEffect, useRef, useState } from "react";
import { earnAchievement } from "./achievements";
import { TicketWall } from "./ticket-wall";
import { useWorldState } from "./use-world-state";
import { WorldStill } from "./world-backdrop";
import { worldHost } from "./world-host";

/**
 * The Encore: home's short stretch past the closing bookend. Reaching it
 * (its top past the screen's middle) earns Encore! and lights the ticket
 * wall, one ticket after another (at once under reduced motion); the scroll
 * route meanwhile takes the camera into the Arena, whose show the director
 * switches on. "One more song" fills the Arena's floor again and relights
 * the wall. The wall is a plain list of text, there from the first paint:
 * nothing waits on the light. Where the world isn't live behind the page
 * (without WebGL, or under reduced motion) a still of the Arena stands in.
 */
export function Encore() {
  const ref = useRef<HTMLElement>(null);
  const [reached, setReached] = useState(false);
  /** Bumped by each "One more song", so the wall's light replays. */
  const [song, setSong] = useState(0);
  const world = useWorldState();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setReached(true);
        earnAchievement("encore");
      },
      { rootMargin: "0px 0px -50% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function oneMoreSong() {
    setSong((n) => n + 1);
    worldHost().director.replayEncore(performance.now());
  }

  return (
    <section
      ref={ref}
      id={encore.id}
      aria-labelledby="encore-heading"
      data-reached={reached || undefined}
      data-live={world === "drawn" || undefined}
      className="group relative isolate flex min-h-svh flex-col justify-end"
    >
      {/* Shown unless the live world stands behind the page. */}
      <WorldStill
        name="arena"
        lazy
        className="absolute inset-0 group-data-live:motion-safe:hidden"
      />
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
        <h2 id="encore-heading" className={sectionLabel}>
          {encore.heading}
        </h2>
        <p className="mt-3 text-lg text-ink/90 [text-shadow:0_1px_14px_var(--color-night)]">
          {encore.lead}
        </p>
        <TicketWall key={song} className="mt-4" />
        {/* Nothing moves under reduced motion, so there is nothing to replay. */}
        <p className="mt-4 motion-reduce:hidden">
          <button
            type="button"
            onClick={oneMoreSong}
            className="cursor-pointer rounded-full border border-cyan/60 bg-night/70 px-5 py-2 font-display font-bold tracking-wide text-cyan uppercase [font-stretch:110%] hover:border-cyan"
          >
            {encore.replay}
          </button>
        </p>
      </div>
    </section>
  );
}
