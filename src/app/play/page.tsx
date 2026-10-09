import type { Metadata } from "next";
import Link from "next/link";
import { CourtStill } from "@/components/court-still";
import { PanelCorners } from "@/components/highlight-panel";
import { PlaceWorld } from "@/components/place-world";
import { RallyGame } from "@/components/rally-game";
import { rally, shareCards } from "@/content/site";
import { shareMetadata } from "../share";
import { overPlace, textLink } from "../styles";
import { torontoWeather } from "../toronto-weather";

// Rebuilt at most hourly, for the court's weather (WEATHER_REVALIDATE):
// segment config must be a literal.
export const revalidate = 3600;

export const metadata: Metadata = shareMetadata(shareCards.play);

const HINT_ID = "rally-hint";

/**
 * The Rally game: a short pickleball game against an AI, played in the
 * world on the Juice Bros court, seen from behind the player's baseline (in
 * Toronto's weather). The court's still paints first, under the heading
 * and the controls hint, which are plain text; the game's own UI is the
 * client component, which draws the game into the world once it's live.
 */
export default async function PlayPage() {
  return (
    <article
      aria-labelledby="play-heading"
      className="relative isolate mx-auto max-w-3xl px-4 py-12 sm:px-6"
    >
      <PlaceWorld claim={{ kind: "play", weather: await torontoWeather() }}>
        <CourtStill />
      </PlaceWorld>
      <RallyGame
        copy={rally.game}
        describedBy={HINT_ID}
        corners={<PanelCorners className="border-violet" />}
        intro={
          <header className={overPlace.court}>
            <PanelCorners className="border-violet" />
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
        }
        outro={
          <p className="inline-block rounded-sm bg-dusk/80 px-4 py-2">
            <Link href={rally.caseStudyLink.href} className={textLink}>
              {rally.caseStudyLink.label}
            </Link>
          </p>
        }
      />
    </article>
  );
}
