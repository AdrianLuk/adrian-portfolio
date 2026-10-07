"use client";

import { useEffect, useRef } from "react";
import type { Recording as RecordingContent } from "@/content/site";
import { REDUCED_MOTION } from "./reduced-motion";
import { RecordingVideo } from "./recording-video";

/**
 * A silent screen recording. It plays on its own only while it is on screen
 * and the visitor allows motion; under prefers-reduced-motion it stays on its
 * poster frame, and the native controls let anyone start or pause it. With
 * scripting off it is also just the poster plus controls.
 *
 * Inside the Player tools scene while it is pinned, the stage shows the
 * recording instead, with a Pause/Play button in its tool's copy: this one is
 * then out of sight, so it stays paused with its controls off, and the
 * keyboard never stops on it unseen.
 */
export function Recording({ recording }: { recording: RecordingContent }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia(REDUCED_MOTION);
    const scene = video.closest<HTMLElement>("[data-player-tools]");
    let onScreen = false;

    const sync = () => {
      const offStage = scene?.hasAttribute("data-scene") ?? false;
      video.controls = !offStage;
      if (onScreen && !reduced.matches && !offStage) {
        video.play().catch(() => {});
      } else video.pause();
    };
    sync();
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    reduced.addEventListener("change", sync);
    const pinning = new MutationObserver(sync);
    if (scene) {
      pinning.observe(scene, { attributeFilter: ["data-scene"] });
    }
    return () => {
      observer.disconnect();
      pinning.disconnect();
      reduced.removeEventListener("change", sync);
    };
  }, []);

  return (
    <RecordingVideo
      ref={ref}
      recording={recording}
      controls
      className="h-auto w-full rounded-xl border border-fog bg-dusk"
    />
  );
}
