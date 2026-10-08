import { contact } from "@/content/site";
import { PanelCorners } from "./highlight-panel";

const { portrait } = contact;
const largest = portrait.stills[portrait.stills.length - 1];

/**
 * Adrian's photo on a holographic panel, in the Highlights' language: dusk
 * glass, cyan corner brackets and a cyan glow, with faint scan lines over the
 * picture. Nothing about it moves. The stills are graded and sized once by
 * scripts/portrait.mjs, so a plain img serves them: next/image would resize
 * them again, at its own widths. Its width and height reserve the box before
 * it loads.
 */
export function ContactPortrait({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative w-fit rounded-sm bg-dusk/80 p-2 shadow-2xl shadow-cyan/15 ${className}`}
    >
      <PanelCorners className="border-cyan" />
      <div className="relative overflow-hidden rounded-xs ring-1 ring-cyan/20">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed stills, as above */}
        <img
          src={portrait.stills[1].src}
          srcSet={portrait.stills.map((s) => `${s.src} ${s.width}w`).join(", ")}
          sizes="(min-width: 48rem) 13rem, 10rem"
          width={largest.width}
          height={(largest.width * portrait.height) / portrait.width}
          alt={portrait.alt}
          loading="lazy"
          decoding="async"
          className="block h-auto w-40 md:w-52"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0_3px,color-mix(in_srgb,var(--color-cyan)_5%,transparent)_3px_4px)]"
        />
      </div>
    </div>
  );
}
