import type { Metadata } from "next";
import Link from "next/link";
import { PanelCorners } from "@/components/highlight-panel";
import { PlaceWorld } from "@/components/place-world";
import { ShootoutGame } from "@/components/shootout-game";
import { WorldStill } from "@/components/world-backdrop";
import { shareCards, shootout } from "@/content/site";
import { shareMetadata } from "../share";
import { overPlace, pillButton } from "../styles";
import { torontoWeather } from "../toronto-weather";

// Rebuilt at most hourly, for the Arena's weather (WEATHER_REVALIDATE):
// segment config must be a literal.
export const revalidate = 3600;

export const metadata: Metadata = shareMetadata(shareCards.shootout);

const HINT_ID = "shootout-hint";

/**
 * The Shootout: training bots popping up round Victoria Harbour, shot from
 * the Arena's stage roof, played in the world (in Toronto's weather). The
 * stage roof's still paints first, under the heading and the controls hint,
 * which are plain text, and stays without WebGL; the game's own UI is the
 * client component, which draws the game into the world once it's live.
 */
export default async function ShootoutPage() {
  return (
    <article
      aria-labelledby="shootout-heading"
      className="relative isolate mx-auto max-w-3xl px-4 py-12 sm:px-6"
    >
      <PlaceWorld claim={{ kind: "shootout", weather: await torontoWeather() }}>
        <WorldStill name="shootout" />
      </PlaceWorld>
      <ShootoutGame
        copy={shootout.game}
        describedBy={HINT_ID}
        corners={<PanelCorners className="border-violet" />}
        intro={
          <header className={overPlace.arena}>
            <PanelCorners className="border-violet" />
            <p className="font-display text-sm tracking-[0.3em] text-cyan uppercase [font-stretch:75%]">
              {shootout.eyebrow}
            </p>
            <h1
              id="shootout-heading"
              className="mt-3 font-display text-4xl font-extrabold uppercase [font-stretch:140%] sm:text-5xl"
            >
              {shootout.heading}
            </h1>
            <div id={HINT_ID} className="mt-4 space-y-1 text-ink/85">
              <p>{shootout.hint.aim}</p>
              <p>{shootout.hint.keys}</p>
              <p>{shootout.hint.touch}</p>
            </div>
          </header>
        }
        outro={
          <Link href={shootout.aboutLink.href} className={pillButton.violet}>
            {shootout.aboutLink.label}
          </Link>
        }
      />
    </article>
  );
}
