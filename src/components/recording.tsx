"use client";

import { useEffect, useRef } from "react";
import type { Recording as RecordingContent } from "@/content/site";

/**
 * A silent screen recording. It plays on its own only while it is on screen
 * and the visitor allows motion; under prefers-reduced-motion it stays on its
 * poster frame, and the native controls let anyone start or pause it. With
 * scripting off it is also just the poster plus controls.
 *
 * `hiddenWhen` is a media query under which the page shows the recording
 * elsewhere (the Player tools' stage) and keeps this one out of sight: it then
 * stays paused, its controls off, so the keyboard never stops on it unseen.
 */
export function Recording({
  recording,
  hiddenWhen,
}: {
  recording: RecordingContent;
  hiddenWhen?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hidden = hiddenWhen ? window.matchMedia(hiddenWhen) : null;
    let onScreen = false;

    const sync = () => {
      const away = hidden?.matches ?? false;
      video.controls = !away;
      if (onScreen && !reduced.matches && !away) video.play().catch(() => {});
      else video.pause();
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
    hidden?.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", sync);
      hidden?.removeEventListener("change", sync);
    };
  }, [hiddenWhen]);

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
