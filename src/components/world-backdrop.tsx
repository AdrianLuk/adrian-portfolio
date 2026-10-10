import type { CSSProperties, ReactNode } from "react";
import {
  arenaStills,
  courtStills,
  diamondStills,
  skylineStills,
  srcSet,
  valleyStills,
  type StillName,
} from "@/content/site";

const STILLS = {
  valley: valleyStills,
  court: courtStills,
  skyline: skylineStills,
  arena: arenaStills,
  diamond: diamondStills,
} as const;

/** A small seeded generator (mulberry32), so every render scatters the same. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The drifting motes: magenta, as in the world, with the odd cyan one. */
const MOTES = (() => {
  const random = seeded(9);
  return Array.from({ length: 28 }, (_, i) => ({
    key: i,
    cyan: i % 5 === 0,
    style: {
      left: `${(random() * 100).toFixed(2)}%`,
      top: `${(random() * 100).toFixed(2)}%`,
      "--mote-size": `${(2 + random() * 2.5).toFixed(1)}px`,
      "--mote-dx": `${(random() * 80 - 40).toFixed(0)}px`,
      "--mote-dy": `${(-30 - random() * 70).toFixed(0)}px`,
      "--mote-time": `${(14 + random() * 16).toFixed(1)}s`,
      "--mote-delay": `${(-random() * 30).toFixed(1)}s`,
    } as CSSProperties,
  }));
})();

/**
 * A still of the world, held fixed behind the page and covering the screen
 * (or, by `className`, placed otherwise): the landscape frame, or the
 * portrait one on a portrait screen. Its parent sets the stacking context it
 * sits at the back of, over the body's sky. `children` lie over the still.
 */
export function WorldStill({
  name,
  parallax,
  className = "fixed inset-x-0 top-0 h-lvh",
  lazy,
  children,
}: {
  /** Which still, and its data-backdrop. */
  name: StillName;
  /** Opts into leaning toward the pointer (see globals.css): the 404 alone. */
  parallax?: boolean;
  /** Where it stands: fixed over the screen by default. */
  className?: string;
  /** Loads only once near the screen (and never while hidden): for a still far down a page. */
  lazy?: boolean;
  children?: ReactNode;
}) {
  const stills = STILLS[name];
  return (
    <div
      aria-hidden="true"
      data-backdrop={name}
      data-parallax={parallax || undefined}
      className={`pointer-events-none -z-10 overflow-hidden ${className}`}
    >
      <picture>
        <source
          media="(orientation: portrait)"
          srcSet={srcSet(stills.portrait)}
          sizes="100vw"
        />
        {/* Art-directed stills at fixed widths, drawn once by
          scripts/share-stills.mjs: next/image would only resize them again. */}
        <img
          src={stills.landscape[1].src}
          srcSet={srcSet(stills.landscape)}
          sizes="100vw"
          alt=""
          decoding="async"
          loading={lazy ? "lazy" : undefined}
          className="size-full object-cover"
        />
      </picture>
      {children}
    </div>
  );
}

/**
 * The quieter night behind every route but home and the court: a still of
 * the valley, dimmed so the page reads over it, with motes drifting across
 * (none under reduced motion, where the still stands alone).
 */
export function WorldBackdrop({ parallax }: { parallax?: boolean }) {
  return (
    <WorldStill name="valley" parallax={parallax}>
      <div className="absolute inset-0 bg-linear-to-b from-night/80 via-night/70 to-night/85" />
      <div className="absolute inset-0 motion-reduce:hidden">
        {MOTES.map((mote) => (
          <span
            key={mote.key}
            className={`mote ${mote.cyan ? "bg-cyan text-cyan" : "bg-magenta text-magenta"}`}
            style={mote.style}
          />
        ))}
      </div>
    </WorldStill>
  );
}
