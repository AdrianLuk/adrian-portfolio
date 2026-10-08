import Link from "next/link";
import {
  highlightAnchor,
  hrefFor,
  linkLabelFor,
  type Highlight,
  type HighlightId,
} from "@/content/site";
import { metaLine, textLink } from "@/app/styles";
import { litSite, type LitSite } from "./lit-sites";

/**
 * Each panel's accent is its Lit site's light, and glows brighter once the
 * scroll route has lit the site. Ember stays the primary action's alone.
 * Written out in full, so Tailwind finds the classes.
 */
const accents: Record<LitSite["light"], { bracket: string; glow: string }> = {
  cyan: {
    bracket: "border-cyan",
    glow: "shadow-cyan/10 data-lit:shadow-cyan/25",
  },
  violet: {
    bracket: "border-violet",
    glow: "shadow-violet/10 data-lit:shadow-violet/25",
  },
};

/**
 * A Highlight panel's look: its accent, in its Lit site's light, and its
 * wide-screen alignment, opposite its site so the site stands clear (pushed
 * right when the site stands left).
 */
export function panelLook(id: HighlightId) {
  const { light, side } = litSite(id);
  return { ...accents[light], align: side < 0 ? "lg:ml-auto" : "" };
}

const corners = [
  "top-0 left-0 border-t-2 border-l-2",
  "top-0 right-0 border-t-2 border-r-2",
  "bottom-0 left-0 border-b-2 border-l-2",
  "bottom-0 right-0 border-b-2 border-r-2",
];

/** A holographic panel's corner brackets, in `className`'s border colour. */
export function PanelCorners({ className }: { className: string }) {
  return corners.map((corner) => (
    <span
      key={corner}
      aria-hidden="true"
      className={`pointer-events-none absolute size-5 ${className} ${corner}`}
    />
  ));
}

/**
 * A holographic panel standing at one site: the verified text, its key numbers
 * and the link on. A server component, so it reads fully with scripting off.
 * It is focusable (tabindex -1) only so "See the work" can move focus here.
 * With motion allowed, the scroll route lights its site as it enters (and
 * marks it data-lit), and sets it beside the site as the camera passes.
 */
export function HighlightPanel({
  highlight,
  className = "",
}: {
  highlight: Highlight;
  className?: string;
}) {
  const id = highlightAnchor(highlight.id);
  const look = panelLook(highlight.id);
  const { paragraph } = highlight;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      tabIndex={-1}
      className={`relative scroll-mt-20 rounded-sm bg-dusk/80 p-6 shadow-2xl sm:p-8 motion-safe:transition-shadow motion-safe:duration-700 ${look.glow} ${look.align} ${className}`}
    >
      <PanelCorners className={look.bracket} />
      <h3
        id={`${id}-heading`}
        className="font-display text-3xl font-bold [font-stretch:120%]"
      >
        {highlight.title}
      </h3>
      <p className={`mt-1 ${metaLine}`}>{highlight.byline}</p>

      {typeof paragraph === "string" ? (
        <p className="mt-4 leading-relaxed text-ink/90">{paragraph}</p>
      ) : (
        <ul className="mt-4 space-y-3 leading-relaxed text-ink/90">
          {paragraph.map((line) => (
            <li
              key={line}
              className="border-l-2 border-cyan/40 pl-4"
            >
              {line}
            </li>
          ))}
        </ul>
      )}

      {highlight.keyNumbers.length > 0 && (
        <ul aria-label="Key numbers" className="mt-6 flex flex-wrap gap-8">
          {highlight.keyNumbers.map((n) => (
            <li key={n.label} className="flex flex-col">
              <span className="font-display text-4xl font-extrabold text-cyan [font-stretch:130%]">
                {n.value}
              </span>
              <span className="text-sm text-ink/80">{n.label}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6">
        <Link href={hrefFor(highlight.link)} className={textLink}>
          {linkLabelFor(highlight)}
        </Link>
      </p>
      {highlight.secondLink && (
        <p className="mt-3">
          {/* Not prefetched: that would load the Rally game's code on home. */}
          <Link
            href={highlight.secondLink.href}
            prefetch={false}
            className={textLink}
          >
            {highlight.secondLink.label}
          </Link>
        </p>
      )}
    </section>
  );
}
