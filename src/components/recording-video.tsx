import type { Ref } from "react";
import type { Recording as RecordingContent } from "@/content/site";

/**
 * A recording's video element, silent and looping, on its poster until played.
 * Presentational only: what plays it, and whether it has controls, is up to
 * whoever shows it (the Case study's Recording, or the Player tools' stage).
 */
export function RecordingVideo({
  recording,
  controls = false,
  className,
  ref,
}: {
  recording: RecordingContent;
  controls?: boolean;
  className?: string;
  ref?: Ref<HTMLVideoElement>;
}) {
  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      controls={controls}
      preload="none"
      poster={recording.poster}
      aria-label={recording.label}
      width={recording.width}
      height={recording.height}
      className={className}
      // The Player tools scene may turn the controls off before hydration.
      suppressHydrationWarning
    >
      {recording.sources.map((source) => (
        <source key={source.src} src={source.src} type={source.type} />
      ))}
    </video>
  );
}
