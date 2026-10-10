import type { Metadata } from "next";
import Link from "next/link";
import { PanelCorners } from "@/components/highlight-panel";
import { HomeRunDerby } from "@/components/home-run-derby";
import { PlaceWorld } from "@/components/place-world";
import { WorldStill } from "@/components/world-backdrop";
import { derby, shareCards } from "@/content/site";
import { shareMetadata } from "../share";
import { overPlace, textLink } from "../styles";
import { torontoWeather } from "../toronto-weather";

// Rebuilt at most hourly, for the Diamond's weather (WEATHER_REVALIDATE):
// segment config must be a literal.
export const revalidate = 3600;

export const metadata: Metadata = shareMetadata(shareCards.derby);

const HINT_ID = "derby-hint";

/**
 * The Home Run Derby: ten pitches from Curvebot, played in the world at the
 * Diamond, seen from behind home plate (in Toronto's weather). The
 * Diamond's still paints first, under the heading and the controls hint,
 * which are plain text; the game's own UI is the client component, which
 * draws the game into the world once it's live.
 */
export default async function DerbyPage() {
  return (
    <article
      aria-labelledby="derby-heading"
      className="relative isolate mx-auto max-w-3xl px-4 py-12 sm:px-6"
    >
      <PlaceWorld claim={{ kind: "derby", weather: await torontoWeather() }}>
        <WorldStill name="diamond" />
      </PlaceWorld>
      <HomeRunDerby
        copy={derby.game}
        describedBy={HINT_ID}
        corners={<PanelCorners className="border-cyan" />}
        intro={
          <header className={overPlace.diamond}>
            <PanelCorners className="border-cyan" />
            <p className="font-display text-sm tracking-[0.3em] text-cyan uppercase [font-stretch:75%]">
              {derby.eyebrow}
            </p>
            <h2
              id="derby-heading"
              className="mt-3 font-display text-4xl sm:text-5xl font-extrabold uppercase [font-stretch:140%]"
            >
              {derby.heading}
            </h2>
            <div id={HINT_ID} className="mt-4 space-y-1 text-ink/85">
              <p>{derby.hint.timing}</p>
              <p>{derby.hint.keys}</p>
              <p>{derby.hint.touch}</p>
            </div>
          </header>
        }
        outro={
          <p className="inline-block rounded-sm bg-dusk/80 px-4 py-2">
            <Link href={derby.rallyLink.href} className={textLink}>
              {derby.rallyLink.label}
            </Link>
          </p>
        }
      />
    </article>
  );
}
