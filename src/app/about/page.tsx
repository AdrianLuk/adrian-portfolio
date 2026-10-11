import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HobbyScroll } from "@/components/hobby-scroll";
import {
  accents,
  holoPanel,
  PanelCorners,
  PlayButton,
} from "@/components/highlight-panel";
import { PlaceWorld } from "@/components/place-world";
import { Recording } from "@/components/recording";
import { TicketWall } from "@/components/ticket-wall";
import { WorldStill } from "@/components/world-backdrop";
import { about, shareCards } from "@/content/site";
import { shareMetadata } from "../share";
import { arrivesAtHobby, overPlace, textLink } from "../styles";
import { torontoWeather } from "../toronto-weather";

// Rebuilt at most hourly, for the weather (WEATHER_REVALIDATE): segment
// config must be a literal.
export const revalidate = 3600;

export const metadata: Metadata = shareMetadata(shareCards.about);

/** One section's panel on the Hobby route, in its stop's light, its lines as bullets. */
function HobbyPanel({
  section,
  light,
  children,
  ...rest
}: {
  section: { id: string; heading: string; lines: readonly string[] };
  light: keyof typeof accents;
  children?: ReactNode;
  "data-wall"?: true;
}) {
  const { id, heading, lines } = section;
  const { bracket, glow } = accents[light];
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`${holoPanel} ${glow}`}
      {...rest}
    >
      <PanelCorners className={bracket} />
      <h3
        id={`${id}-heading`}
        className="font-display text-3xl font-bold [font-stretch:120%]"
      >
        {heading}
      </h3>
      <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-ink/90 marker:text-cyan">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {children}
    </section>
  );
}

/**
 * The About page: Adrian outside work, along the Hobby route. Roots first,
 * over the court's approach; then, as the page scrolls, the camera moves to
 * the court beside pickleball's panel, the Diamond beside baseball's, and
 * into the Arena beside K-pop's, the gaming line last. The panels are plain
 * server-rendered copy; the world and its scroll route are the client's.
 */
export default async function AboutPage() {
  const { pickleball, baseball, kpop, gaming } = about;
  return (
    <article
      aria-labelledby="about-heading"
      className="relative isolate mx-auto max-w-6xl px-4 py-12 sm:px-6"
    >
      {/* shortcut: the court's still stands in for the route's first stop
        (the court from up the valley); draw an About still of its own with
        scripts/share-stills.mjs if the difference shows. */}
      <PlaceWorld claim={{ kind: "hobby", weather: await torontoWeather() }}>
        <WorldStill name="court" />
      </PlaceWorld>
      <HobbyScroll />
      <div className={`space-y-[60svh] pb-[40svh] ${arrivesAtHobby}`}>
        <header className={`max-w-3xl ${overPlace.court}`}>
          <PanelCorners className="border-violet" />
          <p className="font-display text-sm tracking-[0.3em] text-cyan uppercase [font-stretch:75%]">
            {about.eyebrow}
          </p>
          <h2
            id="about-heading"
            className="mt-3 font-display text-4xl font-extrabold uppercase [font-stretch:140%] sm:text-5xl"
          >
            {about.heading}
          </h2>
          <p className="mt-4 text-lg text-ink/90">{about.roots}</p>
        </header>

        <HobbyPanel section={pickleball} light="violet">
          <p className="mt-6">
            <PlayButton link={pickleball.play} light="violet" />
          </p>
          <p className="mt-4">
            <Link href={pickleball.caseStudy.href} className={textLink}>
              {pickleball.caseStudy.label}
            </Link>
          </p>
        </HobbyPanel>

        <HobbyPanel section={baseball} light="cyan">
          <div className="mt-6">
            <Recording recording={baseball.clip} />
          </div>
          <p className="mt-4">
            <PlayButton link={baseball.play} light="cyan" />
          </p>
        </HobbyPanel>

        <HobbyPanel section={kpop} light="violet" data-wall>
          <p className="mt-6 text-ink/90">{kpop.wallLead}</p>
          <TicketWall className="mt-3" />
        </HobbyPanel>

        <HobbyPanel section={gaming} light="cyan" />
      </div>
    </article>
  );
}
