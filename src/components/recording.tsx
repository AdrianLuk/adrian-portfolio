"use client";

import { useEffect, useRef } from "react";
import type { Recording as RecordingContent } from "@/content/site";
import { REDUCED_MOTION } from "./reduced-motion";

/**
 * A silent screen recording. It plays on its own only while it is on screen
 * and the visitor allows motion; under prefers-reduced-motion it stays on its
 * poster frame, and the native controls let anyone start or pause it. With
 * scripting off it is also just the poster plus controls.
 */
export function Recording({ recording }: { recording: RecordingContent }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia(REDUCED_MOTION);
    let onScreen = false;

    const sync = () => {
      if (onScreen && !reduced.matches) video.play().catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    reduced.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", sync);
    };
  }, []);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      controls
      preload="none"
      poster={recording.poster}
      aria-label={recording.label}
      width={recording.width}
      height={recording.height}
      className="h-auto w-full rounded-xl border border-fog bg-dusk"
    >
      {recording.sources.map((source) => (
        <source key={source.src} src={source.src} type={source.type} />
      ))}
    </video>
  );
}
