import type { Metadata } from "next";
import Link from "next/link";
import { RallyGame } from "@/components/rally-game";
import { WorldBackdrop } from "@/components/world-backdrop";
import { rally, shareCards } from "@/content/site";
import { shareMetadata } from "../share";
import { textLink } from "../styles";

export const metadata: Metadata = shareMetadata(shareCards.play);

const HINT_ID = "rally-hint";

/**
 * The Rally game: a short pickleball game against an AI on the Juice Bros
 * court. The heading and the controls hint are plain text that paints before
 * the court's Three.js loads; the game's own UI is the client component.
 */
export default function PlayPage() {
  return (
    <article
      aria-labelledby="play-heading"
      className="relative isolate mx-auto max-w-3xl px-4 py-12 sm:px-6"
    >
      <WorldBackdrop />
      <header>
        <p className="font-display text-sm tracking-[0.3em] text-violet uppercase [font-stretch:75%]">
          {rally.eyebrow}
        </p>
        <h2
          id="play-heading"
          className="mt-3 font-display text-5xl font-extrabold uppercase [font-stretch:140%]"
        >
          {rally.heading}
        </h2>
        <div id={HINT_ID} className="mt-4 space-y-1 text-ink/85">
          <p>{rally.hint.swing}</p>
          <p>{rally.hint.keys}</p>
          <p>{rally.hint.touch}</p>
        </div>
      </header>

      <div className="mt-8">
        <RallyGame copy={rally.game} describedBy={HINT_ID} />
      </div>

      <p className="mt-8">
        <Link href={rally.caseStudyLink.href} className={textLink}>
          {rally.caseStudyLink.label}
        </Link>
      </p>
    </article>
  );
}
